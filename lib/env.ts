export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  SNOWFLAKE_ACCOUNT_URL: (process.env.SNOWFLAKE_ACCOUNT_URL ?? "").replace(/\/$/, ""),
  SNOWFLAKE_PAT: process.env.SNOWFLAKE_PAT ?? "",
  JUDGE_MODEL: process.env.JUDGE_MODEL ?? "claude-haiku-4-5",
  AUDIT_MODEL: process.env.AUDIT_MODEL ?? "claude-sonnet-4-5",
  JUDGE_MOCK: process.env.JUDGE_MOCK === "1" || !process.env.SNOWFLAKE_PAT,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  TREASURY_SECRET_KEY: process.env.TREASURY_SECRET_KEY ?? "",
  BASE_PAY_LAMPORTS: BigInt(process.env.BASE_PAY_LAMPORTS ?? "1000000"),
  /** Share of each approved payout sent to the wallet immediately; the rest vests in escrow. */
  INSTANT_PAY_PCT: Math.min(100, Math.max(0, Number(process.env.INSTANT_PAY_PCT ?? "70"))),
  /** Seconds a vesting payout sits in the worker's on-chain escrow before release. */
  ESCROW_HOLD_SECONDS: Number(process.env.ESCROW_HOLD_SECONDS ?? "90"),
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-secret-change-me-please-32chars!!",
  ALLOW_INSECURE_LOGIN: process.env.ALLOW_INSECURE_LOGIN === "1",
};

export const PAYOUT_MOCK = !env.TREASURY_SECRET_KEY;
