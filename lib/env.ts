export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  JUDGE_MODEL: process.env.JUDGE_MODEL ?? "gemini-3.5-flash-lite",
  AUDIT_MODEL: process.env.AUDIT_MODEL ?? "gemini-3.8-flash",
  JUDGE_MOCK: process.env.JUDGE_MOCK === "1" || !process.env.GEMINI_API_KEY,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  TREASURY_SECRET_KEY: process.env.TREASURY_SECRET_KEY ?? "",
  BASE_PAY_LAMPORTS: BigInt(process.env.BASE_PAY_LAMPORTS ?? "1000000"),
  /** Share of each approved payout sent to the wallet immediately; the rest vests in escrow. */
  INSTANT_PAY_PCT: Math.min(100, Math.max(0, Number(process.env.INSTANT_PAY_PCT ?? "70"))),
  /** Seconds a vesting payout sits in the worker's on-chain escrow before release. */
  ESCROW_HOLD_SECONDS: Number(process.env.ESCROW_HOLD_SECONDS ?? "60"),
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-secret-change-me-please-32chars!!",
  ALLOW_INSECURE_LOGIN: process.env.ALLOW_INSECURE_LOGIN === "1",
};

export const PAYOUT_MOCK = !env.TREASURY_SECRET_KEY;
