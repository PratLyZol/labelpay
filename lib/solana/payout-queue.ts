import { sql } from "@/lib/db/client";
import { bus } from "@/lib/sse/bus";
import { env } from "@/lib/env";
import type { PayoutKind } from "@/lib/db/types";
import { TRUST_PAUSE } from "@/lib/judge/monitor";
import { explorerAddress, explorerTx, fundEscrow, payWorker, releaseEscrow, slashEscrow } from "./treasury";

interface Job {
  payoutId: string;
  worker: string;
  lamports: bigint;
  kind: PayoutKind;
  /** for escrow_release / escrow_slash: the escrow_fund payout rows being settled */
  sourceIds?: string[];
  attempts: number;
}

declare global {
  var __payoutQueue: PayoutQueue | undefined;
  var __escrowSweeper: ReturnType<typeof setInterval> | undefined;
}

/**
 * In-process payout queue. Jobs for the same worker and kind that are waiting at the same time are
 * coalesced into one transaction, which keeps up under load and under devnet RPC rate limits.
 */
class PayoutQueue {
  private jobs: Job[] = [];
  private running = false;
  private backoffMs = 0;

  enqueue(job: Omit<Job, "attempts">) {
    this.jobs.push({ ...job, attempts: 0 });
    void this.run();
  }

  size() {
    return this.jobs.length;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        if (this.backoffMs) await sleep(this.backoffMs);
        const head = this.jobs[0];
        const same = (j: Job) => j.worker === head.worker && j.kind === head.kind;
        const batch = this.jobs.filter(same);
        this.jobs = this.jobs.filter((j) => !same(j));
        await this.process(batch);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(batch: Job[]) {
    const { worker, kind } = batch[0];
    const total = batch.reduce((s, j) => s + j.lamports, 0n);
    const ids = batch.map((j) => j.payoutId);
    const sourceIds = batch.flatMap((j) => j.sourceIds ?? []);
    try {
      let sig: string, topUp = 0n, escrow: string | null = null;
      if (kind === "instant") ({ sig, topUp } = await payWorker(worker, total));
      else if (kind === "escrow_fund") ({ sig, topUp, escrow } = await fundEscrow(worker, total));
      else if (kind === "escrow_release") ({ sig, topUp, escrow } = await releaseEscrow(worker, total));
      else ({ sig, topUp, escrow } = await slashEscrow(worker, total));

      this.backoffMs = 0;
      const status = sig.startsWith("mock") ? "mock" : "confirmed";
      const t = total.toString();
      await sql`UPDATE payouts SET status = ${status}, tx_sig = ${sig}, error = NULL, top_up_lamports = ${topUp.toString()}, escrow_address = ${escrow} WHERE id IN ${sql(ids)}`;
      if (kind === "instant") {
        await sql`UPDATE workers SET lamports_earned = lamports_earned + ${t} WHERE wallet = ${worker}`;
      } else if (kind === "escrow_fund") {
        await sql`UPDATE workers SET escrow_lamports = escrow_lamports + ${t}, escrow_address = ${escrow} WHERE wallet = ${worker}`;
      } else if (kind === "escrow_release") {
        await sql`UPDATE payouts SET released = true, error = NULL WHERE id IN ${sql(sourceIds)}`;
        await sql`UPDATE workers SET escrow_lamports = GREATEST(0, escrow_lamports - ${t}), lamports_released = lamports_released + ${t}, lamports_earned = lamports_earned + ${t} WHERE wallet = ${worker}`;
      } else {
        await sql`UPDATE payouts SET released = true, error = NULL WHERE id IN ${sql(sourceIds)}`;
        await sql`UPDATE workers SET escrow_lamports = GREATEST(0, escrow_lamports - ${t}), lamports_slashed = lamports_slashed + ${t} WHERE wallet = ${worker}`;
      }
      bus.publish({
        type: kind === "instant" ? "payout_confirmed" : kind === "escrow_fund" ? "escrow_funded" : kind === "escrow_release" ? "escrow_released" : "escrow_slashed",
        worker,
        payoutIds: ids,
        lamports: t,
        sig,
        explorer: explorerTx(sig),
        escrow,
        escrowExplorer: escrow && !escrow.startsWith("mock") ? explorerAddress(escrow) : null,
        batched: batch.length,
        mock: status === "mock",
        at: Date.now(),
      });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error(`[payout:${kind}] failed:`, msg);
      const retry = batch.filter((j) => j.attempts < 3).map((j) => ({ ...j, attempts: j.attempts + 1 }));
      const dead = batch.filter((j) => j.attempts >= 3);
      if (/429|rate|Too many/i.test(msg)) this.backoffMs = Math.min(10_000, (this.backoffMs || 1000) * 2);
      else this.backoffMs = 1000;
      if (dead.length) {
        await sql`UPDATE payouts SET status = 'failed', error = ${msg.slice(0, 500)} WHERE id IN ${sql(dead.map((j) => j.payoutId))}`;
        // Put settled-in-flight holds back so a later sweep can retry them.
        const deadSources = dead.flatMap((j) => j.sourceIds ?? []);
        if (deadSources.length) await sql`UPDATE payouts SET released = false, error = NULL WHERE id IN ${sql(deadSources)}`;
        bus.publish({ type: "payout_failed", worker, payoutIds: dead.map((j) => j.payoutId), error: msg.slice(0, 200), at: Date.now() });
      }
      this.jobs.unshift(...retry);
    }
  }
}

export const payoutQueue: PayoutQueue = globalThis.__payoutQueue ?? (globalThis.__payoutQueue = new PayoutQueue());

/* ------------------------------------------------------------------ */
/* Escrow sweeper: releases vested holds, slashes flagged ones.         */
/* ------------------------------------------------------------------ */

export async function sweepEscrow() {
  // Atomically claim due holds so concurrent sweeps (or multiple server processes) never double-settle.
  const claimed = await sql<{ id: string; worker: string; lamports: string; slash_requested: boolean }[]>`
    UPDATE payouts p SET released = true, error = 'settling'
    FROM workers w
    WHERE w.wallet = p.worker
      AND p.kind = 'escrow_fund' AND p.status IN ('confirmed','mock') AND p.released = false
      AND (p.slash_requested OR p.release_at <= now())
    RETURNING p.id::text, p.worker, p.lamports::text, (p.slash_requested OR w.trust_score < ${TRUST_PAUSE}) AS slash_requested`;
  const groups = new Map<string, { total: bigint; ids: string[]; slash: boolean }>();
  for (const r of claimed) {
    const g = groups.get(r.worker) ?? { total: 0n, ids: [], slash: false };
    g.total += BigInt(r.lamports);
    g.ids.push(r.id);
    g.slash = g.slash || r.slash_requested;
    groups.set(r.worker, g);
  }
  for (const [worker, g] of groups) {
    const kind: PayoutKind = g.slash ? "escrow_slash" : "escrow_release";
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO payouts (worker, lamports, status, kind) VALUES (${worker}, ${g.total.toString()}, 'pending', ${kind}) RETURNING id::text`;
    payoutQueue.enqueue({ payoutId: row.id, worker, lamports: g.total, kind, sourceIds: g.ids });
  }
  return groups.size;
}

export function startEscrowSweeper() {
  if (globalThis.__escrowSweeper) return;
  globalThis.__escrowSweeper = setInterval(() => {
    sweepEscrow().catch((e) => console.error("[escrow sweep]", (e as Error).message));
  }, Math.max(5, Math.min(30, env.ESCROW_HOLD_SECONDS / 3)) * 1000);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
