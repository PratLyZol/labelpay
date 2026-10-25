import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWallet } from "@/lib/auth/session";
import { sql } from "@/lib/db/client";
import { verifyProjectDeposit } from "@/lib/solana/deposit";
import { projectDepositMemo } from "@/lib/solana/project-funding";
import { explorerTx, treasuryAddress } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  signature: z.string().trim().min(64).max(88).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
});

type FundableProject = {
  id: string;
  owner_wallet: string;
  status: "funding" | "open" | "closed";
  funding_lamports: string;
  deposit_tx_sig: string | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Connect and sign in with a wallet first." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid Solana transaction signature." }, { status: 400 });

  const { id } = await params;
  const [project] = await sql<FundableProject[]>`
    SELECT id, owner_wallet, status, funding_lamports::text, deposit_tx_sig
    FROM task_sets WHERE id = ${id} AND owner_wallet = ${wallet}`;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.status === "open" && project.deposit_tx_sig === parsed.data.signature) {
    return NextResponse.json({ projectId: id, status: "open", signature: parsed.data.signature, explorer: explorerTx(parsed.data.signature) });
  }
  if (project.status !== "funding") return NextResponse.json({ error: "This project is not awaiting funding." }, { status: 409 });

  const [used] = await sql<{ id: string }[]>`
    SELECT id FROM task_sets WHERE deposit_tx_sig = ${parsed.data.signature} AND id <> ${id} LIMIT 1`;
  if (used) return NextResponse.json({ error: "That deposit has already funded another project." }, { status: 409 });

  const treasury = await treasuryAddress();
  if (!treasury) return NextResponse.json({ error: "The Testnet treasury is not configured." }, { status: 503 });
  const check = await verifyProjectDeposit(parsed.data.signature, {
    owner: wallet,
    treasury,
    lamports: BigInt(project.funding_lamports),
    memo: projectDepositMemo(id),
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.reason, pending: check.pending ?? false }, { status: check.pending ? 425 : 400 });
  }

  try {
    const activated = await sql.begin(async (tx) => {
      const [locked] = await tx<FundableProject[]>`
        SELECT id, owner_wallet, status, funding_lamports::text, deposit_tx_sig
        FROM task_sets WHERE id = ${id} AND owner_wallet = ${wallet} FOR UPDATE`;
      if (!locked) return false;
      if (locked.status === "open" && locked.deposit_tx_sig === parsed.data.signature) return true;
      if (locked.status !== "funding") return false;
      const [signatureOwner] = await tx<{ id: string }[]>`
        SELECT id FROM task_sets WHERE deposit_tx_sig = ${parsed.data.signature} AND id <> ${id} LIMIT 1`;
      if (signatureOwner) return false;
      await tx`
        UPDATE task_sets
        SET status = 'open', deposit_tx_sig = ${parsed.data.signature}, funded_at = now()
        WHERE id = ${id}`;
      await tx`UPDATE tasks SET active = true WHERE set_id = ${id}`;
      return true;
    });
    if (!activated) return NextResponse.json({ error: "The project could not be activated." }, { status: 409 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "That deposit has already funded another project." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    projectId: id,
    status: "open",
    signature: parsed.data.signature,
    explorer: explorerTx(parsed.data.signature),
  });
}
