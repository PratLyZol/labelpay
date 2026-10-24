import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : undefined, max: 1 });
const file = readFileSync(resolve(process.cwd(), "lib/db/migrate.sql"), "utf8");
const statements = file.split(/^---\s*$/m).map((s) => s.trim()).filter(Boolean);

/** Rewrites a continuous aggregate into a plain view for databases without TimescaleDB (local dev). */
function toPlainView(stmt: string) {
  return stmt
    .replace(/CREATE MATERIALIZED VIEW IF NOT EXISTS/i, "CREATE OR REPLACE VIEW")
    .replace(/WITH \(timescaledb\.continuous\) AS/i, "AS")
    .replace(/\s*WITH NO DATA;?$/i, "")
    .replace(/last\((\w+), ts\)/gi, "(array_agg($1 ORDER BY ts DESC))[1]")
    .replace(/time_bucket\('1 minute', ts\)/gi, "date_trunc('minute', ts)");
}

async function main() {
  let timescale = true;
  for (const stmt of statements) {
    const head = stmt.split("\n")[0].slice(0, 80);
    const isTs = /create_hypertable|add_continuous_aggregate_policy|timescaledb\.continuous|CREATE EXTENSION IF NOT EXISTS timescaledb|DROP MATERIALIZED VIEW/i.test(stmt);
    try {
      if (!timescale && isTs) {
        if (/timescaledb\.continuous/i.test(stmt)) {
          await sql.unsafe(toPlainView(stmt));
          console.log("view", head.replace("MATERIALIZED VIEW IF NOT EXISTS", "VIEW (plain fallback)"));
        } else if (/DROP MATERIALIZED VIEW/i.test(stmt)) {
          await sql.unsafe(stmt.replace(/DROP MATERIALIZED VIEW/i, "DROP VIEW"));
          console.log("drop", head);
        } else {
          console.log("skip", head, "(no timescaledb)");
        }
        continue;
      }
      await sql.unsafe(stmt);
      console.log("ok  ", head);
    } catch (e) {
      const msg = (e as Error).message;
      if (/CREATE EXTENSION/i.test(stmt)) {
        timescale = false;
        console.warn("warn timescaledb extension unavailable, falling back to plain tables/views:", msg.split("\n")[0]);
      } else if (/already exists/i.test(msg)) {
        console.log("skip", head);
      } else if (/timescaledb\.continuous/i.test(stmt)) {
        console.warn("warn continuous aggregate failed, creating plain view:", msg.split("\n")[0]);
        await sql.unsafe(toPlainView(stmt));
      } else if (/add_continuous_aggregate_policy/i.test(stmt)) {
        console.warn("skip", head, msg.split("\n")[0]);
      } else {
        console.error("FAIL", head, "\n", msg);
        throw e;
      }
    }
  }
  if (timescale) {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM timescaledb_information.hypertables`;
    const caggs = await sql`SELECT view_name FROM timescaledb_information.continuous_aggregates`;
    console.log(`hypertables: ${count}, continuous aggregates: ${caggs.map((c) => c.view_name).join(", ") || "none"}`);
  } else {
    console.log("plain PostgreSQL mode (use Tiger Cloud for hypertables + continuous aggregates)");
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
