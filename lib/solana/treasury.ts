import { createHash } from "node:crypto";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createAddressWithSeed,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { getTransferSolInstruction, getTransferSolWithSeedInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import bs58 from "bs58";
import { env, PAYOUT_MOCK } from "@/lib/env";

const rpc = createSolanaRpc(env.SOLANA_RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(env.SOLANA_RPC_URL.replace(/^http/, "ws"));
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

let signerPromise: Promise<KeyPairSigner> | null = null;
let rentMinPromise: Promise<bigint> | null = null;

function decodeSecret(raw: string): Uint8Array {
  const s = raw.trim();
  if (s.startsWith("[")) return Uint8Array.from(JSON.parse(s) as number[]);
  return bs58.decode(s);
}

export function getTreasurySigner(): Promise<KeyPairSigner> {
  if (!signerPromise) {
    if (!env.TREASURY_SECRET_KEY) throw new Error("TREASURY_SECRET_KEY is not set");
    signerPromise = createKeyPairSignerFromBytes(decodeSecret(env.TREASURY_SECRET_KEY));
  }
  return signerPromise;
}

/** Minimum balance a zero-data account must hold to be rent exempt (~0.00089 SOL). */
export function rentMinimum(): Promise<bigint> {
  if (!rentMinPromise) rentMinPromise = rpc.getMinimumBalanceForRentExemption(0n).send().then((v) => BigInt(v));
  return rentMinPromise;
}

export async function balanceOf(addr: string): Promise<bigint> {
  const { value } = await rpc.getBalance(address(addr)).send();
  return BigInt(value);
}

export async function treasuryAddress(): Promise<string | null> {
  if (PAYOUT_MOCK) return null;
  return (await getTreasurySigner()).address;
}

export async function treasuryBalanceLamports(): Promise<bigint | null> {
  if (PAYOUT_MOCK) return null;
  return balanceOf((await getTreasurySigner()).address);
}

export function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
export function explorerAddress(addr: string) {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
}

/* ------------------------------------------------------------------ */
/* Escrow: one System-Program account per worker, derived from the      */
/* treasury address + a seed. Only the treasury (base) can move funds   */
/* out, via SystemProgram::TransferWithSeed. No custom program needed.  */
/* ------------------------------------------------------------------ */

export function escrowSeed(wallet: string) {
  return createHash("sha256").update(`labelpay-escrow:${wallet}`).digest("hex").slice(0, 32);
}

export async function escrowAddressFor(wallet: string): Promise<string> {
  if (PAYOUT_MOCK) return `mockEscrow${wallet.slice(0, 8)}`;
  const treasury = await getTreasurySigner();
  return createAddressWithSeed({ baseAddress: treasury.address, programAddress: SYSTEM_PROGRAM_ADDRESS, seed: escrowSeed(wallet) });
}

/** Worker-owned funds in escrow = on-chain balance minus the rent reserve the treasury seeded. */
export async function escrowHeldLamports(wallet: string): Promise<bigint> {
  if (PAYOUT_MOCK) return 0n;
  const [bal, rent] = await Promise.all([balanceOf(await escrowAddressFor(wallet)), rentMinimum()]);
  return bal > rent ? bal - rent : 0n;
}

async function sendInstructions(ixs: Instruction[]): Promise<string> {
  const signer = await getTreasurySigner();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}

function mockSig() {
  return `mock${bs58.encode(crypto.getRandomValues(new Uint8Array(40)))}`.slice(0, 88);
}
async function mockDelay() {
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
}

/** Extra lamports needed so `dest` ends rent exempt after receiving `amount`. */
async function rentTopUp(dest: Address, amount: bigint): Promise<bigint> {
  const [bal, rent] = await Promise.all([balanceOf(dest), rentMinimum()]);
  const after = bal + amount;
  return after < rent ? rent - after : 0n;
}

export interface TxResult {
  sig: string;
  /** lamports the treasury added on top so the destination stays rent exempt (not owed to worker) */
  topUp: bigint;
}

/** Instant payout: treasury -> worker. */
export async function payWorker(wallet: string, amount: bigint): Promise<TxResult> {
  if (PAYOUT_MOCK) {
    await mockDelay();
    return { sig: mockSig(), topUp: 0n };
  }
  const signer = await getTreasurySigner();
  const dest = address(wallet);
  const topUp = await rentTopUp(dest, amount);
  const sig = await sendInstructions([getTransferSolInstruction({ source: signer, destination: dest, amount: lamports(amount + topUp) })]);
  return { sig, topUp };
}

/** Escrow fund: treasury -> worker's escrow account (seeded with rent reserve on first use). */
export async function fundEscrow(wallet: string, amount: bigint): Promise<TxResult & { escrow: string }> {
  const escrow = await escrowAddressFor(wallet);
  if (PAYOUT_MOCK) {
    await mockDelay();
    return { sig: mockSig(), topUp: 0n, escrow };
  }
  const signer = await getTreasurySigner();
  const dest = address(escrow);
  const topUp = await rentTopUp(dest, amount);
  const sig = await sendInstructions([getTransferSolInstruction({ source: signer, destination: dest, amount: lamports(amount + topUp) })]);
  return { sig, topUp, escrow };
}

/** Escrow release: escrow -> worker, signed by the treasury as the seed base. */
export async function releaseEscrow(wallet: string, amount: bigint): Promise<TxResult & { escrow: string }> {
  const escrow = await escrowAddressFor(wallet);
  if (PAYOUT_MOCK) {
    await mockDelay();
    return { sig: mockSig(), topUp: 0n, escrow };
  }
  const signer = await getTreasurySigner();
  const dest = address(wallet);
  const ixs: Instruction[] = [
    getTransferSolWithSeedInstruction({
      source: address(escrow),
      baseAccount: signer,
      destination: dest,
      amount: lamports(amount),
      fromSeed: escrowSeed(wallet),
      fromOwner: SYSTEM_PROGRAM_ADDRESS,
    }),
  ];
  const topUp = await rentTopUp(dest, amount);
  if (topUp > 0n) ixs.push(getTransferSolInstruction({ source: signer, destination: dest, amount: lamports(topUp) }));
  const sig = await sendInstructions(ixs);
  return { sig, topUp, escrow };
}

/** Escrow slash (clawback): escrow -> treasury. */
export async function slashEscrow(wallet: string, amount: bigint): Promise<TxResult & { escrow: string }> {
  const escrow = await escrowAddressFor(wallet);
  if (PAYOUT_MOCK) {
    await mockDelay();
    return { sig: mockSig(), topUp: 0n, escrow };
  }
  const signer = await getTreasurySigner();
  const sig = await sendInstructions([
    getTransferSolWithSeedInstruction({
      source: address(escrow),
      baseAccount: signer,
      destination: signer.address,
      amount: lamports(amount),
      fromSeed: escrowSeed(wallet),
      fromOwner: SYSTEM_PROGRAM_ADDRESS,
    }),
  ]);
  return { sig, topUp: 0n, escrow };
}
