/**
 * First-pass routing: the model labels every task. Confident items are marked `auto` and never
 * served to a human; the rest become `human`. Re-run any time; only unrouted tasks are processed
 * unless --all is passed.
 */
import "dotenv/config";
import postgres from "postgres";
import { routeTask, ROUTE_CONFIDENCE_THRESHOLD } from "../lib/judge";
import type { Task, TaskSet } from "../lib/db/types";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : undefined, max: 2 });
const all = process.argv.includes("--all");

async function main() {
  const sets = await sql<TaskSet[]>`SELECT * FROM task_sets`;
  const byId = new Map(sets.map((s) => [s.id, s]));
  // Unrouted = never routed, or a previous attempt failed (routing set but no model label).
  const tasks = await sql<Task[]>`SELECT * FROM tasks WHERE active = true ${all ? sql`` : sql`AND (routing = 'pending' OR model_label IS NULL)`} ORDER BY id`;
  console.log(`routing ${tasks.length} tasks (threshold ${ROUTE_CONFIDENCE_THRESHOLD})`);
  let auto = 0, human = 0, failures = 0, imageFallbacks = 0, consecutiveFailures = 0;
  for (const t of tasks) {
    const set = byId.get(t.set_id)!;
    try {
      const r = await routeTask(set, t);
      // Gold tasks are calibration checks and must reach a human even when the model is confident.
      const routing = t.is_gold || r.confidence < ROUTE_CONFIDENCE_THRESHOLD ? "human" : "auto";
      if (routing === "auto") auto++;
      else human++;
      consecutiveFailures = 0;
      await sql`UPDATE tasks SET model_label = ${r.label}, model_confidence = ${r.confidence}, model_rationale = ${r.rationale}, routing = ${routing}, routed_at = now() WHERE id = ${t.id}`;
      console.log(`${routing.padEnd(5)} ${t.id.padEnd(26)} ${r.label.padEnd(10)} ${r.confidence.toFixed(2)}  ${r.ms}ms  ${r.rationale.slice(0, 60)}`);
    } catch (e) {
      const msg = (e as Error).message.replace(/\s+/g, " ");
      if (set.type === "image") {
        imageFallbacks++;
        console.warn(`image ${t.id} requires human review: ${msg.slice(0, 200)}`);
      } else {
        if (consecutiveFailures === 0) console.warn(`routing failed for ${t.id}: ${msg.slice(0, 600)}`);
        failures++;
        consecutiveFailures++;
      }
      // Serve it to humans for now, keep model_label NULL so the next run retries it.
      await sql`UPDATE tasks SET routing = 'human', routed_at = now() WHERE id = ${t.id}`;
      human++;
      if (consecutiveFailures >= 3) {
        console.warn(`aborting after ${consecutiveFailures} consecutive failures; remaining tasks stay unrouted and will be served to humans`);
        break;
      }
    }
  }
  console.log(`done: ${auto} auto-labeled by model, ${human} routed to humans${imageFallbacks ? ` (${imageFallbacks} image fallbacks)` : ""}${failures ? ` (${failures} routing failures)` : ""}`);
  await sql.end();
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
