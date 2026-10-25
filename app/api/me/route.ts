import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { requireWallet } from "@/lib/auth/session";
import { trustMultiplier, TRUST_PAUSE } from "@/lib/judge/monitor";
import type { Worker } from "@/lib/db/types";
import { balanceOf } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ wallet: null });
  const [w] = await sql<Worker[]>`SELECT * FROM workers WHERE wallet = ${wallet}`;
  if (!w) return NextResponse.json({ wallet: null });
  const recent = await sql`
    SELECT id::text, ts, task_type, answer, verdict, confidence, reason, flags, pay_lamports::text AS pay_lamports, trust_after, judge_ms
    FROM label_events WHERE worker = ${wallet} ORDER BY ts DESC LIMIT 25`;
  const payouts = await sql`
    SELECT id::text, ts, lamports::text AS lamports, tx_sig, status, kind, release_at, released, escrow_address FROM payouts WHERE worker = ${wallet} ORDER BY ts DESC LIMIT 25`;
  const walletBalanceLamports = await balanceOf(wallet).catch(() => null);
  return NextResponse.json({
    wallet,
    trust: w.trust_score,
    multiplier: trustMultiplier(w.trust_score),
    paused: w.trust_score < TRUST_PAUSE,
    labelsTotal: w.labels_total,
    labelsApproved: w.labels_approved,
    lamportsEarned: w.lamports_earned.toString(),
    escrowLamports: w.escrow_lamports.toString(),
    lamportsReleased: w.lamports_released.toString(),
    lamportsSlashed: w.lamports_slashed.toString(),
    walletBalanceLamports: walletBalanceLamports?.toString() ?? null,
    escrowAddress: w.escrow_address,
    recent,
    payouts,
  });
}
