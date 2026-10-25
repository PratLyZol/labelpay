import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import type { Task, TaskSet, ImagePayload } from "@/lib/db/types";
import { judgeJson } from "./gemini";
import {
  buildMonitorMessages,
  buildRoutingMessages,
  MONITOR_SCHEMA,
  ROUTING_SCHEMA,
  type MonitorVerdict,
  type RoutingResult,
} from "./prompts";
import type { Flag } from "./monitor";

/** Items the first-pass model is at least this confident about are auto-labeled and never served. */
export const ROUTE_CONFIDENCE_THRESHOLD = Number(process.env.ROUTE_CONFIDENCE_THRESHOLD ?? "0.85");

export interface MonitorOutcome {
  verdict: MonitorVerdict | null;
  ms: number;
  model: string | null;
  flags: Flag[];
}

/** Coherence check for one submitted label. Never throws: failures come back as null verdict + flag. */
export async function monitorLabel(set: TaskSet, task: Task, answer: string): Promise<MonitorOutcome> {
  if (env.JUDGE_MOCK) return mockMonitor(task, answer);

  const flags: Flag[] = [];
  const imageDataUrl = await imageFor(set, task, flags);
  if (set.type === "image" && !imageDataUrl) {
    return { verdict: null, ms: 0, model: null, flags: [...flags, "judge_unavailable"] };
  }
  const base = {
    type: set.type,
    title: set.title,
    guidelines: set.guidelines,
    options: set.options,
    payload: task.payload,
    answer,
    gold: task.gold_label,
    modelLabel: task.model_label,
    modelConfidence: task.model_confidence,
  };
  try {
    const { data, ms, model } = await judgeJson<MonitorVerdict>({ messages: buildMonitorMessages({ ...base, imageDataUrl }), schemaName: "monitor_verdict", schema: MONITOR_SCHEMA });
    if (
      !["ok", "questionable", "absurd"].includes(data.severity)
      || !Number.isFinite(data.confidence)
      || data.confidence < 0
      || data.confidence > 1
      || !set.options.includes(data.expected)
      || !Number.isFinite(data.expectedConfidence)
      || data.expectedConfidence < 0
      || data.expectedConfidence > 1
      || typeof data.note !== "string"
    ) {
      throw new Error("Gemini returned an invalid monitor verdict");
    }
    return { verdict: data, ms, model, flags };
  } catch (e) {
    console.error("[monitor] Gemini failed:", (e as Error).message);
    return { verdict: null, ms: 0, model: null, flags: [...flags, ...(imageDataUrl ? ["vision_unavailable" as Flag] : []), "judge_unavailable"] };
  }
}

/** First-pass model label used for routing. */
export async function routeTask(set: TaskSet, task: Task): Promise<RoutingResult & { ms: number; model: string | null }> {
  if (env.JUDGE_MOCK) return mockRoute(set, task);
  const flags: Flag[] = [];
  const imageDataUrl = await imageFor(set, task, flags);
  if (set.type === "image" && !imageDataUrl) throw new Error(`Image unavailable for task ${task.id}`);
  const { data, ms, model } = await judgeJson<RoutingResult>({
    messages: buildRoutingMessages({ type: set.type, title: set.title, guidelines: set.guidelines, options: set.options, payload: task.payload, imageDataUrl }),
    schemaName: "routing",
    schema: ROUTING_SCHEMA,
  });
  if (!set.options.includes(data.label) || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1 || typeof data.rationale !== "string") {
    throw new Error(`Gemini returned an invalid routing result for task ${task.id}`);
  }
  return { ...data, ms, model };
}

async function imageFor(set: TaskSet, task: Task, flags: Flag[]): Promise<string | undefined> {
  if (set.type !== "image") return undefined;
  try {
    return await loadImageAsDataUrl((task.payload as ImagePayload).src);
  } catch {
    flags.push("vision_unavailable");
    return undefined;
  }
}

export async function loadImageAsDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") ?? "image/jpeg"};base64,${buf.toString("base64")}`;
  }
  const file = resolve(process.cwd(), "public", src.replace(/^\//, ""));
  const buf = await readFile(file);
  const ext = file.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

/* ---- mock mode (no Gemini credentials) ---- */

function mockMonitor(task: Task, answer: string): MonitorOutcome {
  const ms = 120 + Math.floor(Math.random() * 200);
  const ref = task.gold_label ?? task.model_label ?? answer;
  const agrees = ref.trim().toLowerCase() === answer.trim().toLowerCase();
  return {
    verdict: {
      severity: "ok",
      confidence: 0.7,
      note: agrees ? "Consistent with the reference reading." : `Defensible; the reference reading was "${ref}".`,
      expected: ref,
      expectedConfidence: 0.7,
    },
    ms,
    model: "mock",
    flags: [],
  };
}

function mockRoute(set: TaskSet, task: Task): RoutingResult & { ms: number; model: string | null } {
  // Deterministic pseudo-confidence so ~55% of items route to humans in demo mode.
  const h = createHash("sha256").update(task.id).digest();
  const confidence = 0.55 + (h[0] / 255) * 0.45;
  const label = task.gold_label ?? set.options[h[1] % set.options.length];
  return { label, confidence: Math.round(confidence * 100) / 100, rationale: "mock routing (no Gemini credentials)", ms: 50, model: "mock" };
}
