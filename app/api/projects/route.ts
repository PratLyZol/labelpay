import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { requireWallet } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await requireWallet();
  const rows = await sql`
    SELECT s.id, s.type, s.title, s.guidelines, s.options, s.pay_lamports::text AS pay_lamports, s.min_latency_ms,
           count(t.id) FILTER (WHERE t.routing IN ('human','pending'))::int AS human_tasks,
           count(t.id) FILTER (WHERE t.routing = 'auto')::int AS auto_tasks,
           count(t.id)::int AS total_tasks,
           coalesce(avg(t.model_confidence) FILTER (WHERE t.routing = 'human'), 0)::float AS avg_conf,
           ${wallet ? sql`count(le.id)::int` : sql`0`} AS done_by_me
    FROM task_sets s
    LEFT JOIN tasks t ON t.set_id = s.id
    ${wallet ? sql`LEFT JOIN label_events le ON le.task_id = t.id AND le.worker = ${wallet}` : sql``}
    GROUP BY s.id ORDER BY s.id`;
  return NextResponse.json({ projects: rows });
}
