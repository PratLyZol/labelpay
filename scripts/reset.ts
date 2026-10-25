import "dotenv/config";
import postgres from "postgres";

/** Wipe worker activity (labels, payouts, audits, sessions) and reset every worker. Tasks and routing stay. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : undefined, max: 1 });

async function main() {
  await sql`TRUNCATE label_events, payouts, nonces, audits`;
  if (process.env.RESET_WORKERS === "delete") {
    await sql`DELETE FROM workers`;
    console.log("cleared label_events, payouts, nonces, audits; deleted workers");
  } else {
    await sql`UPDATE workers SET trust_score = 60, labels_total = 0, labels_approved = 0, lamports_earned = 0,
      escrow_lamports = 0, lamports_released = 0, lamports_slashed = 0, escrow_address = NULL,
      last_audit_label_count = 0, paused = false, last_answer = NULL, streak = 0`;
    console.log("cleared label_events, payouts, nonces, audits; reset workers");
  }
  await sql.end();
}
main();
