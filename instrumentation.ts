export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEscrowSweeper } = await import("./lib/solana/payout-queue");
    startEscrowSweeper();
  }
}
