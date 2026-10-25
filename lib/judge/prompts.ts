import type { TaskPayload, TaskType, PairwisePayload, TextPayload, ImagePayload } from "@/lib/db/types";
import type { ChatMessage, ChatContentPart } from "./gemini";

/* ------------------------------------------------------------------ */
/* 1. Routing: the model labels first. Confident items never reach a    */
/*    human; the rest are what humans get paid for.                     */
/* ------------------------------------------------------------------ */

export const ROUTING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", description: "Your best label, exactly one of the allowed labels." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Probability that your label is the one a careful human annotator would choose." },
    rationale: { type: "string", description: "One sentence. If the item is ambiguous, say what makes it hard." },
  },
  required: ["label", "confidence", "rationale"],
} as const;

export interface RoutingResult {
  label: string;
  confidence: number;
  rationale: string;
}

const ROUTING_SYSTEM = `You are the first-pass labeler for a data-labeling pipeline. Label the item yourself and report an honest, calibrated confidence.
Be humble: items that depend on tone, sarcasm, cultural context, mixed signals, subjective judgment, or partially visible subjects should get LOWER confidence so a human reviews them. Items that are unambiguous get HIGH confidence.
Respond only with JSON matching the schema.`;

export function buildRoutingMessages(args: { type: TaskType; title: string; guidelines: string; options: string[]; payload: TaskPayload; imageDataUrl?: string }): ChatMessage[] {
  const userText = [
    `TASK SET: ${args.title} (${args.type})`,
    `GUIDELINES: ${args.guidelines}`,
    `ALLOWED LABELS: ${args.options.join(" | ")}`,
    describeItem(args.type, args.payload),
  ].join("\n");
  return [
    { role: "system", content: ROUTING_SYSTEM },
    { role: "user", content: withImage(userText, args.imageDataUrl) },
  ];
}

/* ------------------------------------------------------------------ */
/* 2. Monitor: coherence, not correctness. Flags only absurd answers,   */
/*    never overrides a human on a close call, writes feedback.         */
/* ------------------------------------------------------------------ */

export const MONITOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    severity: {
      type: "string",
      enum: ["ok", "questionable", "absurd"],
      description: "ok = defensible under some reasonable reading of the guidelines. questionable = unlikely but a careful person could argue it. absurd = no reasonable reading supports it (e.g. a glowing review labeled negative, a clear photo of a dog labeled airplane).",
    },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "How sure you are about the severity call." },
    note: { type: "string", description: "One short sentence of feedback addressed to the worker. Neutral tone. If ok, say what made the item tricky or just acknowledge." },
    expected: { type: "string", description: "Your own best label, for the record. Informational only." },
    expectedConfidence: { type: "number", minimum: 0, maximum: 1, description: "Probability that your expected label is the one a careful human annotator would choose." },
  },
  required: ["severity", "confidence", "note", "expected", "expectedConfidence"],
} as const;

export interface MonitorVerdict {
  severity: "ok" | "questionable" | "absurd";
  confidence: number;
  note: string;
  expected: string;
  expectedConfidence: number;
}

const MONITOR_SYSTEM = `You are the quality monitor for a paid data-labeling platform. Humans are the source of truth here, not you: these items were routed to a human precisely because a model was not confident about them.
Your job is NOT to decide whether the worker is right. Your job is to decide whether the answer is DEFENSIBLE: could a careful person who read the guidelines arrive at it?
- Mark "ok" for anything plausible, including answers you personally disagree with on a close call.
- Mark "questionable" only when the answer is unlikely but arguable.
- Mark "absurd" only when no reasonable reading of the item and guidelines supports the answer. This is the signal for random clicking or not reading the item.
When a hidden reference label is provided, use it only to write a helpful one-sentence note explaining the reference; the platform handles the pay decision for reference items separately.
Respond only with JSON matching the schema.`;

export function buildMonitorMessages(args: {
  type: TaskType;
  title: string;
  guidelines: string;
  options: string[];
  payload: TaskPayload;
  answer: string;
  gold: string | null;
  modelLabel?: string | null;
  modelConfidence?: number | null;
  imageDataUrl?: string;
}): ChatMessage[] {
  const labels = args.type === "image"
    ? `SUGGESTED LABELS (not exhaustive; a worker may enter a more accurate label): ${args.options.join(" | ")}`
    : `ALLOWED LABELS: ${args.options.join(" | ")}`;
  const lines = [
    `TASK SET: ${args.title} (${args.type})`,
    `GUIDELINES: ${args.guidelines}`,
    labels,
    describeItem(args.type, args.payload),
  ];
  if (args.modelLabel) lines.push(`FIRST-PASS MODEL GUESS: ${args.modelLabel} (confidence ${args.modelConfidence?.toFixed(2) ?? "?"}; this item was routed to a human because the model was unsure)`);
  if (args.gold) lines.push(`HIDDEN REFERENCE LABEL: ${args.gold}`);
  lines.push(`WORKER ANSWER: ${args.answer}`);
  return [
    { role: "system", content: MONITOR_SYSTEM },
    { role: "user", content: withImage(lines.join("\n"), args.imageDataUrl) },
  ];
}

/* ------------------------------------------------------------------ */
/* 3. Audit: a bigger model re-reads a worker's recent batch and        */
/*    adjusts trust. Runs periodically, not per label.                  */
/* ------------------------------------------------------------------ */

export const AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    quality: { type: "number", minimum: 0, maximum: 1, description: "Overall quality of this batch: 1 = careful, consistent, guideline-following; 0 = random or careless." },
    patterns: { type: "array", items: { type: "string" }, description: "Short tags for anything systematic, e.g. 'over-uses neutral', 'ignores sarcasm', 'consistent on pairwise', 'none'." },
    notes: { type: "string", description: "Two sentences max, addressed to the platform operator." },
  },
  required: ["quality", "patterns", "notes"],
} as const;

export interface AuditResult {
  quality: number;
  patterns: string[];
  notes: string;
}

const AUDIT_SYSTEM = `You audit a data-labeling worker's recent batch for a paid labeling platform. You see each item, the guidelines, the worker's answer, and where available the hidden reference label and the first-pass model guess.
Judge the batch as a whole: consistency, attention to guidelines, and whether disagreements with references look like honest judgment calls or carelessness. Do not penalize defensible disagreements on ambiguous items.
Respond only with JSON matching the schema.`;

export function buildAuditMessages(rows: { type: TaskType; title: string; guidelines: string; options: string[]; payload: TaskPayload; answer: string; gold: string | null; modelLabel: string | null; latencyMs: number; imageDataUrl?: string }[]): ChatMessage[] {
  const body: ChatContentPart[] = [];
  rows.forEach((r, i) => {
    body.push({ type: "text", text: [
        `--- ITEM ${i + 1} (${r.type}: ${r.title}) ---`,
        `GUIDELINES: ${r.guidelines}`,
        `LABELS: ${r.options.join(" | ")}`,
        describeItem(r.type, r.payload),
        r.modelLabel ? `MODEL GUESS: ${r.modelLabel}` : "",
        r.gold ? `REFERENCE: ${r.gold}` : "",
        `WORKER ANSWER: ${r.answer} (took ${(r.latencyMs / 1000).toFixed(1)}s)`,
      ].filter(Boolean).join("\n") });
    if (r.imageDataUrl) body.push({ type: "image_url", image_url: { url: r.imageDataUrl } });
  });
  return [
    { role: "system", content: AUDIT_SYSTEM },
    { role: "user", content: body },
  ];
}

/* helpers */

function describeItem(type: TaskType, payload: TaskPayload): string {
  if (type === "text") return `ITEM TEXT: """${(payload as TextPayload).text}"""`;
  if (type === "pairwise") {
    const p = payload as PairwisePayload;
    return `PROMPT: """${p.prompt}"""\nRESPONSE A: """${p.a}"""\nRESPONSE B: """${p.b}"""`;
  }
  const img = payload as ImagePayload;
  return `ITEM: the attached image${img.alt ? ` (${img.alt})` : ""}`;
}

function withImage(text: string, imageDataUrl?: string): string | ChatContentPart[] {
  return imageDataUrl ? [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }] : text;
}
