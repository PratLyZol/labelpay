import { env } from "@/lib/env";
import { MEMO_PROGRAM_ADDRESS } from "@/lib/solana/project-funding";

type DepositExpectation = {
  owner: string;
  treasury: string;
  lamports: bigint;
  memo: string;
};

export type DepositCheck =
  | { ok: true }
  | { ok: false; pending?: boolean; reason: string };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function integer(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

/** Validate the RPC's jsonParsed transaction rather than trusting client-supplied payment details. */
export function inspectDepositTransaction(value: unknown, expected: DepositExpectation): DepositCheck {
  if (value === null) return { ok: false, pending: true, reason: "The transaction is not confirmed yet." };
  const root = object(value);
  const meta = object(root?.meta);
  const transaction = object(root?.transaction);
  const message = object(transaction?.message);
  if (!root || !meta || !transaction || !message) return { ok: false, reason: "The RPC returned an incomplete transaction." };
  if (meta.err !== null) return { ok: false, reason: "The deposit transaction failed onchain." };

  const accountKeys = Array.isArray(message.accountKeys) ? message.accountKeys : [];
  const ownerSigned = accountKeys.some((entry) => {
    const key = object(entry);
    return key?.pubkey === expected.owner && key.signer === true;
  });
  if (!ownerSigned) return { ok: false, reason: "The signed-in wallet did not sign this transaction." };

  const instructions = Array.isArray(message.instructions) ? message.instructions : [];
  const hasMemo = instructions.some((entry) => {
    const instruction = object(entry);
    return instruction?.program === "spl-memo"
      && instruction.programId === MEMO_PROGRAM_ADDRESS
      && instruction.parsed === expected.memo;
  });
  if (!hasMemo) return { ok: false, reason: "The transaction is not linked to this project." };

  const hasTransfer = instructions.some((entry) => {
    const instruction = object(entry);
    const parsed = object(instruction?.parsed);
    const info = object(parsed?.info);
    return instruction?.program === "system"
      && parsed?.type === "transfer"
      && info?.source === expected.owner
      && info.destination === expected.treasury
      && integer(info.lamports) === expected.lamports;
  });
  if (!hasTransfer) return { ok: false, reason: "The transaction does not contain the exact required treasury deposit." };

  return { ok: true };
}

async function fetchTransaction(signature: string): Promise<unknown> {
  const response = await fetch(env.SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`);
  const body = object(await response.json());
  const rpcError = object(body?.error);
  if (rpcError) throw new Error(typeof rpcError.message === "string" ? rpcError.message : "Solana RPC rejected the request");
  return body?.result ?? null;
}

export async function verifyProjectDeposit(signature: string, expected: DepositExpectation): Promise<DepositCheck> {
  let last: DepositCheck = { ok: false, pending: true, reason: "The transaction is not confirmed yet." };
  for (let attempt = 0; attempt < 8; attempt++) {
    last = inspectDepositTransaction(await fetchTransaction(signature), expected);
    if (last.ok || !last.pending) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}
