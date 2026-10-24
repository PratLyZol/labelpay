import { env } from "@/lib/env";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface CortexOptions {
  model?: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export class CortexError extends Error {
  constructor(message: string, public status: number, public body?: string) {
    super(message);
  }
}

export type Transport = "chat" | "inference" | "sql";
const ORDER: Transport[] = ["chat", "inference", "sql"];

declare global {
  var __cortexTransport: Transport | undefined;
}

function headers() {
  return {
    Authorization: `Bearer ${env.SNOWFLAKE_PAT}`,
    "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
}

/**
 * Calls Snowflake Cortex with a JSON schema response format and returns the parsed object.
 * Three transports, tried in order on the first call and then pinned:
 *   chat      POST /api/v2/cortex/v1/chat/completions   (OpenAI-compatible; newest, not on every account)
 *   inference POST /api/v2/cortex/inference:complete    (legacy Cortex LLM REST API, SSE response)
 *   sql       POST /api/v2/statements  SELECT AI_COMPLETE(...)  (works anywhere Cortex SQL works)
 * CORTEX_TRANSPORT=chat|inference|sql pins one explicitly.
 */
export async function cortexJson<T>(opts: CortexOptions): Promise<{ data: T; ms: number; model: string; raw: string; transport: Transport }> {
  const model = opts.model ?? env.JUDGE_MODEL;
  const forced = process.env.CORTEX_TRANSPORT as Transport | undefined;
  const candidates = forced && ORDER.includes(forced) ? [forced] : globalThis.__cortexTransport ? [globalThis.__cortexTransport] : ORDER;
  let lastErr: unknown;
  for (const t of candidates) {
    const t0 = Date.now();
    try {
      const raw = t === "chat" ? await viaChat(model, opts) : t === "inference" ? await viaInference(model, opts) : await viaSql(model, opts);
      globalThis.__cortexTransport = t;
      return { data: extractJson<T>(raw), ms: Date.now() - t0, model, raw, transport: t };
    } catch (e) {
      lastErr = e;
      const status = e instanceof CortexError ? e.status : 0;
      // Only fall through on "endpoint not available" style failures; auth and model errors are real.
      const fallthrough = status === 403 || status === 404 || status === 400 || status === 405 || status === 0;
      if (candidates.length === 1 || !fallthrough) throw e;
      console.warn(`[cortex] transport ${t} failed (${status || (e as Error).message.slice(0, 80)}), trying next`);
    }
  }
  throw lastErr;
}

async function viaChat(model: string, opts: CortexOptions): Promise<string> {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/v1/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_completion_tokens: opts.maxTokens ?? 400,
      response_format: { type: "json_schema", json_schema: { name: opts.schemaName, schema: opts.schema, strict: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new CortexError(`Cortex chat ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  const json = JSON.parse(text);
  const content: unknown = json?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
}

/** Legacy Cortex LLM REST API. Always streams server-sent events; we concatenate the deltas. */
async function viaInference(model: string, opts: CortexOptions): Promise<string> {
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/inference:complete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: flattenMessages(opts.messages),
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 400,
      response_format: { type: "json", schema: opts.schema },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new CortexError(`Cortex inference ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  if (!text.includes("data:")) {
    const json = JSON.parse(text);
    return json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? "";
  }
  let out = "";
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload);
      out += j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? "";
    } catch {
      /* skip keepalive */
    }
  }
  return out;
}

/** Snowflake SQL API: SELECT AI_COMPLETE(...). Needs a warehouse; trials ship COMPUTE_WH. */
async function viaSql(model: string, opts: CortexOptions): Promise<string> {
  // Positional args with explicit casts: named args with bound VARIANTs make Snowflake report
  // "More than one function of AI_COMPLETE are resolved in prepare state".
  // Trial accounts only allow the plain two-argument COMPLETE(model, prompt): every variant with
  // model_parameters / response_format / message arrays fails with "not available for trial accounts".
  // So the JSON schema is spelled out in the prompt and parsed from the reply.
  const statement = `SELECT AI_COMPLETE(?::VARCHAR, ?::VARCHAR) AS r`;
  const res = await fetch(`${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/statements?async=false`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      statement,
      timeout: 60,
      warehouse: env.SNOWFLAKE_WAREHOUSE,
      bindings: {
        "1": { type: "TEXT", value: model },
        "2": { type: "TEXT", value: `${toSinglePrompt(opts.messages)}\n\nRespond with ONLY a single JSON object (no prose, no code fences) that matches this JSON schema:\n${JSON.stringify(opts.schema)}` },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new CortexError(`Cortex sql ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  const json = JSON.parse(text);
  const cell = json?.data?.[0]?.[0];
  if (cell == null) throw new CortexError(`Cortex sql: empty result ${text.slice(0, 200)}`, 500, text);
  const s = typeof cell === "string" ? cell : JSON.stringify(cell);
  // AI_COMPLETE with response_format may wrap the object as {"structured_output":[{"raw_message":{...}}]}
  try {
    const j = JSON.parse(s);
    const inner = j?.structured_output?.[0]?.raw_message ?? j?.choices?.[0]?.messages ?? null;
    if (inner) return typeof inner === "string" ? inner : JSON.stringify(inner);
  } catch {
    /* plain text, fall through */
  }
  return s;
}

/** One prompt string: system instructions first, then the conversation. */
function toSinglePrompt(messages: ChatMessage[]) {
  return flattenMessages(messages)
    .map((m) => (m.role === "system" ? `INSTRUCTIONS:\n${m.content}` : m.role === "user" ? `INPUT:\n${m.content}` : `ASSISTANT:\n${m.content}`))
    .join("\n\n");
}

/** Image parts are not supported on the legacy / SQL transports; keep the text. */
function flattenMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"),
  }));
}

function extractJson<T>(s: string): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1)) as T;
    throw new Error(`Judge returned non-JSON: ${s.slice(0, 200)}`);
  }
}
