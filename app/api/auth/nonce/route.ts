import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  await sql`INSERT INTO nonces (nonce) VALUES (${nonce})`;
  await sql`DELETE FROM nonces WHERE created_at < now() - interval '10 minutes'`;
  const host = new URL(req.url).host;
  const message = `Sign in to LabelPay on ${host}\n\nThis signature proves you own this wallet. It does not cost anything.\n\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}`;
  return NextResponse.json({ nonce, message });
}
