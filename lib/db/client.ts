import postgres from "postgres";
import { env } from "@/lib/env";

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__sql ??
  postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_URL.includes("sslmode=require") || env.DATABASE_URL.includes("tsdb") ? "require" : undefined,
    max: 10,
    idle_timeout: 30,
    types: { bigint: postgres.BigInt },
  });

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
