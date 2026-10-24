import "dotenv/config";
import postgres from "postgres";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : undefined, max: 1 });
async function main() {
  await sql`TRUNCATE label_events, payouts, nonces`;
  await sql`UPDATE workers SET trust_score = 60, labels_total = 0, labels_approved = 0, lamports_earned = 0, paused = false, last_answer = NULL, streak = 0`;
  console.log("cleared label_events, payouts, nonces; reset workers");
  await sql.end();
}
main();
