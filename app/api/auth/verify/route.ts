import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { z } from "zod";
import { sql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Body = z.object({
  wallet: z.string().min(32).max(44),
  message: z.string().optional(),
  signature: z.string().optional(), // base58
  nonce: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { wallet, message, signature, nonce } = parsed.data;

  let pubkey: Uint8Array;
  try {
    pubkey = bs58.decode(wallet);
    if (pubkey.length !== 32) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }

  if (!env.ALLOW_INSECURE_LOGIN) {
    if (!message || !signature || !nonce) return NextResponse.json({ error: "signature required" }, { status: 401 });
    if (!message.includes(`Nonce: ${nonce}`)) return NextResponse.json({ error: "nonce mismatch" }, { status: 401 });
    const [row] = await sql`DELETE FROM nonces WHERE nonce = ${nonce} AND created_at > now() - interval '10 minutes' RETURNING nonce`;
    if (!row) return NextResponse.json({ error: "nonce expired" }, { status: 401 });
    let ok = false;
    try {
      ok = nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signature), pubkey);
    } catch {
      ok = false;
    }
    if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  await sql`INSERT INTO workers (wallet) VALUES (${wallet}) ON CONFLICT (wallet) DO NOTHING`;
  const session = await getSession();
  session.wallet = wallet;
  await session.save();
  return NextResponse.json({ ok: true, wallet });
}
