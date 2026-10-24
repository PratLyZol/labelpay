/** Tries several models over each Cortex transport and prints what works on this account/region. */
import "dotenv/config";
import { env } from "../lib/env";

const MODELS = (process.env.PROBE_MODELS || "claude-haiku-4-5,claude-sonnet-4-5,claude-3-5-sonnet,openai-gpt-5-mini,llama3.1-8b,llama3.1-70b,mistral-large2,mistral-7b,snowflake-arctic").split(",");
const H = {
  Authorization: `Bearer ${env.SNOWFLAKE_PAT}`,
  "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 140);

async function sqlProbe(model: string) {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/statements?async=false`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ statement: `SELECT AI_COMPLETE(?::VARCHAR, ?::VARCHAR) AS r`, timeout: 60, warehouse: env.SNOWFLAKE_WAREHOUSE, bindings: { "1": { type: "TEXT", value: model }, "2": { type: "TEXT", value: "Reply with the single word: ok" } } }),
    signal: AbortSignal.timeout(60_000),
  });
  const t = await res.text();
  return res.ok ? `OK ${short(JSON.parse(t)?.data?.[0]?.[0] ?? "")}` : `${res.status} ${short(t)}`;
}
async function chatProbe(model: string) {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/v1/chat/completions`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ok" }], max_completion_tokens: 10 }),
    signal: AbortSignal.timeout(30_000),
  });
  const t = await res.text();
  return res.ok ? `OK ${short(JSON.parse(t)?.choices?.[0]?.message?.content ?? "")}` : `${res.status} ${short(t)}`;
}
async function inferenceProbe(model: string) {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/inference:complete`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 10 }),
    signal: AbortSignal.timeout(30_000),
  });
  const t = await res.text();
  return res.ok ? `OK ${short(t)}` : `${res.status} ${short(t)}`;
}

async function main() {
  console.log("account", env.SNOWFLAKE_ACCOUNT_URL, "warehouse", env.SNOWFLAKE_WAREHOUSE);
  // Region + edition + params, useful for the diagnosis
  for (const q of ["SELECT CURRENT_REGION(), CURRENT_ACCOUNT(), CURRENT_ROLE(), CURRENT_USER()", "SHOW PARAMETERS LIKE 'CORTEX_ENABLED_CROSS_REGION' IN ACCOUNT"]) {
    const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/statements?async=false`, { method: "POST", headers: H, body: JSON.stringify({ statement: q, timeout: 30, warehouse: env.SNOWFLAKE_WAREHOUSE }) });
    const t = await res.text();
    console.log("meta", res.status, short(res.ok ? JSON.stringify(JSON.parse(t)?.data ?? "") : t));
  }
  for (const m of MODELS) {
    const [c, i, s] = await Promise.all([chatProbe(m).catch((e) => `ERR ${short(String(e))}`), inferenceProbe(m).catch((e) => `ERR ${short(String(e))}`), sqlProbe(m).catch((e) => `ERR ${short(String(e))}`)]);
    console.log(`\n${m}\n  chat:      ${c}\n  inference: ${i}\n  sql:       ${s}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
