import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { treasuryAddress, treasuryBalanceLamports } from "@/lib/solana/treasury";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const [totals] = await sql`
    SELECT count(*)::int AS labels,
           count(*) FILTER (WHERE verdict='approve')::int AS approved,
           count(*) FILTER (WHERE verdict='reject')::int AS rejected,
           coalesce(sum(pay_lamports),0)::text AS lamports,
           coalesce(avg(latency_ms),0)::int AS avg_latency_ms,
           coalesce(avg(judge_ms),0)::int AS avg_judge_ms,
           count(DISTINCT worker)::int AS workers
    FROM label_events`;
  const [pay] = await sql`
    SELECT count(*) FILTER (WHERE status IN ('confirmed','mock'))::int AS confirmed,
           count(*) FILTER (WHERE status='pending')::int AS pending,
           count(*) FILTER (WHERE status='failed')::int AS failed,
           coalesce(sum(lamports) FILTER (WHERE kind='instant' AND status IN ('confirmed','mock')),0)::text AS instant_lamports,
           coalesce(sum(lamports) FILTER (WHERE kind='escrow_fund' AND status IN ('confirmed','mock') AND released = false),0)::text AS escrow_held_lamports,
           coalesce(sum(lamports) FILTER (WHERE kind='escrow_release' AND status IN ('confirmed','mock')),0)::text AS released_lamports,
           coalesce(sum(lamports) FILTER (WHERE kind='escrow_slash' AND status IN ('confirmed','mock')),0)::text AS slashed_lamports,
           count(*) FILTER (WHERE kind='escrow_slash' AND status IN ('confirmed','mock'))::int AS slashes
    FROM payouts`;
  // Continuous aggregate (real-time: materialized + recent raw rows)
  const series = await sql`
    SELECT bucket, task_type, labels::int, approved::int, rejected::int, uncertain::int, lamports::text,
           avg_latency_ms::float, avg_judge_ms::float, too_fast::int, straight_lining::int, gold_miss::int
    FROM labels_1m WHERE bucket > now() - interval '60 minutes' ORDER BY bucket`;
  const leaderboard = await sql`
    SELECT wallet, trust_score, labels_total, labels_approved, lamports_earned::text AS lamports_earned, escrow_lamports::text AS escrow_lamports, lamports_slashed::text AS lamports_slashed, paused
    FROM workers ORDER BY lamports_earned DESC, labels_total DESC LIMIT 10`;
  const trust = await sql`
    SELECT bucket, worker, trust::float, labels::int FROM worker_1m
    WHERE bucket > now() - interval '60 minutes' ORDER BY bucket`;
  const recent = await sql`
    SELECT le.id::text, le.ts, le.worker, le.task_type, le.answer, le.verdict, le.confidence, le.reason, le.flags,
           le.pay_lamports::text AS pay_lamports, le.trust_after, le.judge_ms, p.tx_sig, p.status AS payout_status
    FROM label_events le
    LEFT JOIN LATERAL (SELECT tx_sig, status FROM payouts WHERE label_event_id = le.id AND kind = 'instant' ORDER BY ts DESC LIMIT 1) p ON true
    ORDER BY le.ts DESC LIMIT 20`;
  const byType = await sql`
    SELECT task_type, count(*)::int AS labels, count(*) FILTER (WHERE verdict='approve')::int AS approved,
           coalesce(avg(latency_ms),0)::int AS avg_latency_ms
    FROM label_events GROUP BY task_type`;

  const [routing] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE routing='auto')::int AS auto,
           count(*) FILTER (WHERE routing='human')::int AS human,
           count(*) FILTER (WHERE routing='pending')::int AS pending,
           coalesce(avg(model_confidence) FILTER (WHERE routing='human'),0)::float AS human_avg_conf,
           coalesce(avg(model_confidence) FILTER (WHERE routing='auto'),0)::float AS auto_avg_conf
    FROM tasks WHERE active = true`;
  const audits = await sql`SELECT id::text, ts, worker, labels_reviewed, quality, trust_before, trust_after, patterns, notes, model FROM audits ORDER BY ts DESC LIMIT 8`;

  let treasury: { address: string | null; lamports: string | null } = { address: null, lamports: null };
  try {
    const [addr, bal] = await Promise.all([treasuryAddress(), treasuryBalanceLamports()]);
    treasury = { address: addr, lamports: bal?.toString() ?? null };
  } catch {
    /* RPC hiccup; leave null */
  }

  return NextResponse.json({
    totals,
    payouts: pay,
    series,
    trust,
    leaderboard,
    recent,
    byType,
    treasury,
    judge: { model: env.JUDGE_MOCK ? "mock" : env.JUDGE_MODEL, mock: env.JUDGE_MOCK },
    escrow: { instantPct: env.INSTANT_PAY_PCT, holdSeconds: env.ESCROW_HOLD_SECONDS },
    routing,
    audits,
    at: Date.now(),
  });
}
