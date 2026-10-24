import { env } from "@/lib/env";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

interface JudgeOptions {
  model?: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

function parts(content: ChatMessage["content"]) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(part.image_url.url);
    if (!match || !match[1].startsWith("image/")) throw new Error("Gemini requires a base64 image data URL");
    return { inline_data: { mime_type: match[1], data: match[2] } };
  });
}

/** Server-side Gemini call for routing, per-label monitoring, and batch auditing. */
export async function judgeJson<T>(opts: JudgeOptions): Promise<{ data: T; ms: number; model: string; raw: string }> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const model = opts.model ?? env.JUDGE_MODEL;
  const system = opts.messages.filter((m) => m.role === "system").flatMap((m) => parts(m.content));
  const contents = opts.messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: parts(m.content),
  }));
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: system },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        maxOutputTokens: opts.maxTokens ?? 1024,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  const response = JSON.parse(body);
  const candidate = response?.candidates?.[0];
  const raw = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  if (candidate?.finishReason !== "STOP" || !raw) {
    throw new Error(`Gemini returned no complete JSON response (${candidate?.finishReason ?? "no candidate"})`);
  }
  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    throw new Error(`Gemini returned invalid JSON for ${opts.schemaName}`);
  }
  return { data, ms: Date.now() - started, model, raw };
}
