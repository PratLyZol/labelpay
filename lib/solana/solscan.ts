import { SOLANA_NETWORK } from "./network";

const SOLSCAN = "https://solscan.io";

export function solscanTx(signature: string) {
  return `${SOLSCAN}/tx/${encodeURIComponent(signature)}?cluster=${SOLANA_NETWORK}`;
}

export function solscanAddress(address: string) {
  return `${SOLSCAN}/account/${encodeURIComponent(address)}?cluster=${SOLANA_NETWORK}`;
}
