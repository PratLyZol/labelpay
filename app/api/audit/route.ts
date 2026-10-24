import { NextResponse } from "next/server";
import { auditDueWorkers, auditWorker } from "@/lib/judge/audit";
import { requireWallet } from "@/lib/auth/session";
import { sql } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET: recent audits. POST {wallet?, all?}: run an audit now (own wallet by default). */
export async function GET() {
  const audits = await sql`SELECT id::text, ts, worker, labels_reviewed, quality, trust_before, trust_after, patterns, notes, model FROM audits ORDER BY ts DESC LIMIT 20`;
  return NextResponse.json({ audits });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.all) return NextResponse.json({ audited: await auditDueWorkers() });
  const wallet = body?.wallet ?? (await requireWallet());
  if (!wallet) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const result = await auditWorker(wallet, true);
  return NextResponse.json({ result });
}
