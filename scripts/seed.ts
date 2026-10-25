import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : undefined, max: 1 });

interface SetSpec { id: string; type: string; title: string; guidelines: string; options: string[]; pay_lamports: number; min_latency_ms: number }
const read = <T,>(p: string) => JSON.parse(readFileSync(resolve(p), "utf8")) as T;

/** Deterministic pseudo-shuffle so ~35% of items become hidden gold checks. */
function isGoldIndex(i: number, total: number) {
  return (i * 7919) % total < Math.ceil(total * 0.35);
}

async function upsertSet(set: SetSpec) {
  await sql`
    INSERT INTO task_sets (id, type, title, guidelines, options, pay_lamports, min_latency_ms)
    VALUES (${set.id}, ${set.type}, ${set.title}, ${set.guidelines}, ${sql.json(set.options)}, ${set.pay_lamports}, ${set.min_latency_ms})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, guidelines = EXCLUDED.guidelines, options = EXCLUDED.options,
      pay_lamports = EXCLUDED.pay_lamports, min_latency_ms = EXCLUDED.min_latency_ms`;
}

async function upsertTasks(setId: string, rows: { id: string; payload: unknown; gold: string }[], allGold = false) {
  for (const [i, r] of rows.entries()) {
    const isGold = allGold || isGoldIndex(i, rows.length);
    const goldLabel = isGold ? r.gold : null;
    await sql`
      INSERT INTO tasks (id, set_id, payload, gold_label, is_gold, active)
      VALUES (${r.id}, ${setId}, ${sql.json(r.payload as never)}, ${goldLabel}, ${isGold}, true)
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, gold_label = EXCLUDED.gold_label, is_gold = EXCLUDED.is_gold, active = true`;
  }
  console.log(`${setId}: ${rows.length} tasks (${rows.filter((_, i) => allGold || isGoldIndex(i, rows.length)).length} gold)`);
}

async function main() {
  const text = read<{ set: SetSpec; items: { text: string; gold: string }[] }>("seed/text_sentiment.json");
  await upsertSet(text.set);
  await upsertTasks(text.set.id, text.items.map((it, i) => ({ id: `${text.set.id}-${i + 1}`, payload: { text: it.text }, gold: it.gold })));

  const pair = read<{ set: SetSpec; items: { prompt: string; a: string; b: string; gold: string }[] }>("seed/pairwise.json");
  await upsertSet(pair.set);
  await upsertTasks(pair.set.id, pair.items.map((it, i) => ({ id: `${pair.set.id}-${i + 1}`, payload: { prompt: it.prompt, a: it.a, b: it.b }, gold: it.gold })));

  const img = read<{ set: SetSpec; perClass: number }>("seed/images.json");
  await upsertSet(img.set);
  if (existsSync(resolve("seed/images.manifest.json"))) {
    const manifest = read<{ src: string; gold: string; alt: string; source?: string }[]>("seed/images.manifest.json");
    const classCounts = new Map(img.set.options.map((option) => [option, 0]));
    for (const item of manifest) classCounts.set(item.gold, (classCounts.get(item.gold) ?? 0) + 1);
    const validManifest = manifest.length === img.set.options.length * img.perClass
      && manifest.every((item) => img.set.options.includes(item.gold))
      && [...classCounts.values()].every((count) => count === img.perClass)
      && new Set(manifest.map((item) => item.src)).size === manifest.length
      && new Set(manifest.map((item) => item.source)).size === manifest.length
      && manifest.every((item) => item.source && existsSync(resolve("public", item.src.replace(/^\//, ""))));
    if (!validManifest) {
      throw new Error("Invalid image manifest; regenerate it with `pnpm images`");
    }
    const rows = manifest.map((m, i) => ({ id: `${img.set.id}-v2-${i + 1}`, payload: { src: m.src, alt: m.alt }, gold: m.gold }));
    await upsertTasks(img.set.id, rows);
    const activeIds = rows.map((row) => row.id);
    await sql`UPDATE tasks SET active = false WHERE set_id = ${img.set.id} AND id NOT IN ${sql(activeIds)}`;
  } else {
    console.warn("seed/images.manifest.json missing: run `pnpm images` first");
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
