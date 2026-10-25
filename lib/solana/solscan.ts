const SOLSCAN = "https://solscan.io";

export function solscanTx(signature: string) {
  return `${SOLSCAN}/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function solscanAddress(address: string) {
  return `${SOLSCAN}/account/${encodeURIComponent(address)}?cluster=devnet`;
}
