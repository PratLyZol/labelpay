import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { requireWallet } from "@/lib/auth/session";
import { z } from "zod";
import { parsePublicImageUrl } from "@/lib/images/remote";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const CreateProject = z.object({
  type: z.enum(["text", "image"]),
  title: z.string().trim().min(3).max(80),
  guidelines: z.string().trim().min(10).max(1500),
  options: z.array(z.string().trim().min(1).max(40)).min(2).max(8),
  paySol: z.string().trim(),
  items: z.array(z.string().trim().min(1).max(5000)).min(1).max(100),
});

function solToLamports(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value);
  if (!match) return null;
  return BigInt(match[1]) * 1_000_000_000n + BigInt((match[2] ?? "").padEnd(9, "0") || "0");
}

export async function GET() {
  const wallet = await requireWallet();
  const rows = await sql`
    SELECT s.id, s.type, s.title, s.guidelines, s.options, s.pay_lamports::text AS pay_lamports, s.min_latency_ms,
           s.owner_wallet, s.created_at, s.status,
           count(t.id) FILTER (WHERE t.routing IN ('human','pending'))::int AS human_tasks,
           count(t.id) FILTER (WHERE t.routing = 'auto')::int AS auto_tasks,
           count(t.id)::int AS total_tasks,
           (SELECT count(*)::int FROM label_events all_le WHERE all_le.set_id = s.id) AS labels_submitted,
           coalesce(avg(t.model_confidence) FILTER (WHERE t.routing = 'human'), 0)::float AS avg_conf,
           ${wallet ? sql`count(le.id)::int` : sql`0`} AS done_by_me,
           ${wallet ? sql`s.owner_wallet = ${wallet}` : sql`false`} AS is_owner
    FROM task_sets s
    LEFT JOIN tasks t ON t.set_id = s.id AND t.active = true
    ${wallet ? sql`LEFT JOIN label_events le ON le.task_id = t.id AND le.worker = ${wallet}` : sql``}
    WHERE s.status = 'open'
    GROUP BY s.id ORDER BY s.created_at DESC, s.id`;
  return NextResponse.json({ projects: rows });
}

export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Connect and sign in with a wallet first." }, { status: 401 });

  const parsed = CreateProject.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the project fields and try again." }, { status: 400 });

  const { type, title, guidelines, paySol, items } = parsed.data;
  const options = [...new Map(parsed.data.options.map((option) => [option.toLowerCase(), option])).values()];
  if (options.length < 2) return NextResponse.json({ error: "Use at least two different label options." }, { status: 400 });

  const payLamports = solToLamports(paySol);
  if (payLamports === null || payLamports < 10_000n || payLamports > env.BASE_PAY_LAMPORTS) {
    return NextResponse.json({ error: `Pay per label must be between 0.00001 and ${Number(env.BASE_PAY_LAMPORTS) / 1e9} SOL.` }, { status: 400 });
  }

  let normalizedItems: string[];
  try {
    normalizedItems = type === "image"
      ? items.map((item) => {
          return parsePublicImageUrl(item).toString();
        })
      : items;
  } catch {
    return NextResponse.json({ error: "Every image item must be a complete http:// or https:// URL." }, { status: 400 });
  }

  const projectId = `project-${crypto.randomUUID()}`;
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${wallet}))`;
      const [usage] = await tx<{ projects: number; tasks: number }[]>`
        SELECT count(DISTINCT s.id)::int AS projects, count(t.id)::int AS tasks
        FROM task_sets s LEFT JOIN tasks t ON t.set_id = s.id AND t.active = true
        WHERE s.owner_wallet = ${wallet} AND s.status = 'open'`;
      if (usage.projects >= 3 || usage.tasks + normalizedItems.length > 100) {
        throw new Error("Demo requester limit reached: at most 3 open projects and 100 active items per wallet.");
      }
      await tx`
        INSERT INTO task_sets (id, type, title, guidelines, options, pay_lamports, min_latency_ms, owner_wallet, status)
        VALUES (${projectId}, ${type}, ${title}, ${guidelines}, ${tx.json(options)}, ${payLamports.toString()}, 1200, ${wallet}, 'open')`;
      for (const item of normalizedItems) {
        const payload = type === "image" ? { src: item, alt: "Requester-provided image to label" } : { text: item };
        await tx`
          INSERT INTO tasks (id, set_id, payload, is_gold, routing, active)
          VALUES (${`task-${crypto.randomUUID()}`}, ${projectId}, ${tx.json(payload)}, false, 'pending', true)`;
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Demo requester limit")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    project: { id: projectId, type, title, itemCount: normalizedItems.length, payLamports: payLamports.toString() },
  }, { status: 201 });
}
