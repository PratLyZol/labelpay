import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireWallet } from "@/lib/auth/session";
import { takeServed } from "@/lib/serve-cache";
import { monitorLabel } from "@/lib/judge";
import { auditWorker } from "@/lib/judge/audit";
import { evaluate } from "@/lib/judge/monitor";
import { payoutQueue, startEscrowSweeper } from "@/lib/solana/payout-queue";
import { bus } from "@/lib/sse/bus";
import { env } from "@/lib/env";
import type { Task, TaskSet, Worker } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ taskId: z.string().min(1), answer: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { taskId, answer } = parsed.data;

  const servedAt = takeServed(wallet, taskId);
  const latencyMs = servedAt ? Date.now() - servedAt : 0;

  const [w] = await sql<Worker[]>`SELECT * FROM workers WHERE wallet = ${wallet}`;
  const [task] = await sql<Task[]>`SELECT * FROM tasks WHERE id = ${taskId} AND active = true`;
  if (!w || !task) return NextResponse.json({ error: "unknown task" }, { status: 404 });
  const [set] = await sql<TaskSet[]>`SELECT * FROM task_sets WHERE id = ${task.set_id}`;
  const [dup] = await sql`SELECT 1 FROM label_events WHERE task_id = ${taskId} AND worker = ${wallet} LIMIT 1`;
  if (dup) return NextResponse.json({ error: "already labeled" }, { status: 409 });
  if (!set.options.map((o) => o.toLowerCase()).includes(answer.toLowerCase()))
    return NextResponse.json({ error: "answer not in allowed labels" }, { status: 400 });

  const [judge, peers] = await Promise.all([
    monitorLabel(set, task, answer),
    sql<{ answer: string }[]>`SELECT answer FROM label_events WHERE task_id = ${taskId} AND worker <> ${wallet}`,
  ]);
  const result = evaluate({
    worker: w,
    answer,
    latencyMs,
    minLatencyMs: set.min_latency_ms,
    isGold: task.is_gold,
    gold: task.gold_label,
    modelLabel: task.model_label,
    modelConfidence: task.model_confidence,
    monitor: judge.verdict,
    peerAnswers: peers.map((p) => p.answer),
    extraFlags: judge.flags,
  });

  const basePay = BigInt(set.pay_lamports) || env.BASE_PAY_LAMPORTS;
  const pay = result.payable ? BigInt(Math.round(Number(basePay) * result.multiplier)) : 0n;

  const [ev] = await sql<{ id: bigint }[]>`
    INSERT INTO label_events (worker, task_id, set_id, task_type, answer, latency_ms, verdict, confidence, reason, flags, pay_lamports, trust_after, judge_ms, judge_model)
    VALUES (${wallet}, ${task.id}, ${set.id}, ${set.type}, ${answer}, ${latencyMs}, ${result.verdict}, ${result.confidence}, ${result.reason},
            ${sql.json(result.flags)}, ${pay.toString()}, ${result.trustAfter}, ${judge.ms}, ${judge.model})
    RETURNING id`;

  await sql`
    UPDATE workers SET
      trust_score = ${result.trustAfter},
      labels_total = labels_total + 1,
      labels_approved = labels_approved + ${result.verdict === "approve" ? 1 : 0},
      paused = ${result.paused},
      last_answer = ${answer},
      streak = ${result.streak}
    WHERE wallet = ${wallet}`;

  // Missing a hidden gold check claws back everything still vesting in this worker's escrow.
  if (result.flags.includes("gold_miss")) {
    await sql`UPDATE payouts SET slash_requested = true WHERE worker = ${wallet} AND kind = 'escrow_fund' AND released = false`;
  }

  let payoutId: string | null = null;
  let instant = 0n;
  let hold = 0n;
  if (pay > 0n) {
    startEscrowSweeper();
    instant = (pay * BigInt(env.INSTANT_PAY_PCT)) / 100n;
    hold = pay - instant;
    if (instant > 0n) {
      const [p] = await sql<{ id: string }[]>`
        INSERT INTO payouts (worker, label_event_id, lamports, status, kind)
        VALUES (${wallet}, ${String(ev.id)}, ${instant.toString()}, 'pending', 'instant') RETURNING id::text`;
      payoutId = p.id;
      payoutQueue.enqueue({ payoutId: p.id, worker: wallet, lamports: instant, kind: "instant" });
    }
    if (hold > 0n) {
      const [h] = await sql<{ id: string }[]>`
        INSERT INTO payouts (worker, label_event_id, lamports, status, kind, release_at)
        VALUES (${wallet}, ${String(ev.id)}, ${hold.toString()}, 'pending', 'escrow_fund', now() + make_interval(secs => ${env.ESCROW_HOLD_SECONDS})) RETURNING id::text`;
      payoutQueue.enqueue({ payoutId: h.id, worker: wallet, lamports: hold, kind: "escrow_fund" });
    }
  }

  const payload = {
    labelEventId: String(ev.id),
    taskId: task.id,
    taskType: set.type,
    answer,
    verdict: result.verdict,
    confidence: result.confidence,
    reason: result.reason,
    flags: result.flags,
    payLamports: pay.toString(),
    instantLamports: instant.toString(),
    escrowLamports: hold.toString(),
    escrowHoldSeconds: env.ESCROW_HOLD_SECONDS,
    trust: result.trustAfter,
    multiplier: result.multiplier,
    paused: result.paused,
    latencyMs,
    judgeMs: judge.ms,
    judgeModel: judge.model,
    payoutId,
    expected: task.gold_label ?? judge.verdict?.expected ?? null,
    severity: judge.verdict?.severity ?? null,
  };
  bus.publish({ type: "label_verdict", worker: wallet, ...payload, at: Date.now() });
  // Periodic deep audit with the bigger model, fire-and-forget.
  void auditWorker(wallet).catch((e) => console.error("[audit]", (e as Error).message));
  return NextResponse.json(payload);
}
