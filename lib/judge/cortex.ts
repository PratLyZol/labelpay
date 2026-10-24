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

/**
 * Calls the Snowflake Cortex OpenAI-compatible Chat Completions endpoint with a JSON schema
 * response format and returns the parsed JSON object.
 */
export async function cortexJson<T>(opts: CortexOptions): Promise<{ data: T; ms: number; model: string; raw: string }> {
  const model = opts.model ?? env.JUDGE_MODEL;
  const url = `${env.SNOWFLAKE_ACCOUNT_URL}/api/v2/cortex/v1/chat/completions`;
  const body = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0,
    max_completion_tokens: opts.maxTokens ?? 400,
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
    },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SNOWFLAKE_PAT}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) throw new CortexError(`Cortex ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  const json = JSON.parse(text);
  const content: unknown = json?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
  return { data: extractJson<T>(raw), ms, model, raw };
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
