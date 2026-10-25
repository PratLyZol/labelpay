import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { requireWallet } from "@/lib/auth/session";
import { markServed } from "@/lib/serve-cache";
import type { ServedTask, Task, TaskSet, Worker } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const type = new URL(req.url).searchParams.get("type");
  const project = new URL(req.url).searchParams.get("project");
  const typeFilter = type && ["text", "pairwise", "image"].includes(type) ? type : null;

  const [w] = await sql<Worker[]>`SELECT * FROM workers WHERE wallet = ${wallet}`;
  if (!w) return NextResponse.json({ error: "unknown worker" }, { status: 401 });

  // Every 5th label is a gold item; the worker cannot tell which.
  const wantGold = w.labels_total % 5 === 4;

  const pick = async (gold: boolean) => sql<(Task & { set: TaskSet })[]>`
    SELECT t.*, to_jsonb(s) AS set
    FROM tasks t JOIN task_sets s ON s.id = t.set_id
    WHERE t.active = true
      AND s.status = 'open'
      AND (s.owner_wallet IS NULL OR s.owner_wallet <> ${wallet})
      AND t.is_gold = ${gold}
      AND t.routing IN ('human', 'pending')
      ${typeFilter ? sql`AND s.type = ${typeFilter}` : sql``}
      ${project ? sql`AND s.id = ${project}` : sql``}
      AND NOT EXISTS (SELECT 1 FROM label_events le WHERE le.task_id = t.id AND le.worker = ${wallet})
    ORDER BY random() LIMIT 1`;

  let [row] = await pick(wantGold);
  if (!row) [row] = await pick(!wantGold);
  if (!row) return NextResponse.json({ task: null, done: true });

  const set = row.set as unknown as TaskSet & { pay_lamports: string | number };
  const servedAt = markServed(wallet, row.id);
  const task: ServedTask = {
    id: row.id,
    setId: set.id,
    type: set.type,
    title: set.title,
    guidelines: set.guidelines,
    options: set.options,
    payload: row.payload,
    payLamports: String(set.pay_lamports),
    servedAt,
    modelConfidence: row.routing === "human" ? row.model_confidence : null,
    modelRationale: row.routing === "human" ? row.model_rationale : null,
  };
  return NextResponse.json({ task });
}
