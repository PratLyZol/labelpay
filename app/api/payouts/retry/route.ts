import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/auth/session";
import { retryFailedPayouts } from "@/lib/solana/payout-queue";

export const dynamic = "force-dynamic";

/** POST: re-send this wallet's failed payouts (or every wallet's with {all: true}). Signed-in only. */
export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const requeued = await retryFailedPayouts(body?.all ? undefined : wallet);
  return NextResponse.json({ requeued });
}
