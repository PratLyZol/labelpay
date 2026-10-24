import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { bus } from "@/lib/sse/bus";
import type { TaskPayload, TaskType } from "@/lib/db/types";
import { cortexJson } from "./cortex";
import { AUDIT_SCHEMA, buildAuditMessages, type AuditResult } from "./prompts";
import { TRUST_PAUSE } from "./monitor";

export const AUDIT_EVERY_N_LABELS = Number(process.env.AUDIT_EVERY_N_LABELS ?? "10");
const AUDIT_BATCH = 20;
const MAX_TRUST_DELTA = 12;

interface Row {
  type: TaskType;
  title: string;
  guidelines: string;
  options: string[];
  payload: TaskPayload;
  answer: string;
  gold: string | null;
  model_label: string | null;
  latency_ms: number;
  verdict: string;
}

/** Re-reads a worker's last batch with the bigger model and nudges trust. Returns null if nothing to do. */
export async function auditWorker(wallet: string, force = false) {
  const [w] = await sql<{ trust_score: number; labels_total: number; last_audit_label_count: number }[]>`
    SELECT trust_score, labels_total, last_audit_label_count FROM workers WHERE wallet = ${wallet}`;
  if (!w) return null;
  if (!force && w.labels_total - w.last_audit_label_count < AUDIT_EVERY_N_LABELS) return null;

  const rows = await sql<Row[]>`
    SELECT s.type, s.title, s.guidelines, s.options, t.payload, le.answer, t.gold_label AS gold, t.model_label, le.latency_ms, le.verdict
    FROM label_events le JOIN tasks t ON t.id = le.task_id JOIN task_sets s ON s.id = t.set_id
    WHERE le.worker = ${wallet} ORDER BY le.ts DESC LIMIT ${AUDIT_BATCH}`;
  if (rows.length < 3) return null;

  let result: AuditResult;
  let model: string;
  if (env.JUDGE_MOCK) {
    const approved = rows.filter((r) => r.verdict === "approve").length;
    const goldRows = rows.filter((r) => r.gold);
    const goldHits = goldRows.filter((r) => r.gold!.toLowerCase() === r.answer.toLowerCase()).length;
    result = {
      quality: Math.round(((approved / rows.length) * 0.5 + (goldRows.length ? goldHits / goldRows.length : 0.8) * 0.5) * 100) / 100,
      patterns: approved === rows.length ? ["consistent"] : ["some rejects"],
      notes: "Mock audit from approval and reference-hit rates (no Snowflake credentials).",
    };
    model = "mock";
  } else {
    const out = await cortexJson<AuditResult>({
      model: env.AUDIT_MODEL,
      maxTokens: 500,
      schemaName: "worker_audit",
      schema: AUDIT_SCHEMA,
      messages: buildAuditMessages(rows.map((r) => ({ type: r.type, title: r.title, guidelines: r.guidelines, options: r.options, payload: r.payload, answer: r.answer, gold: r.gold, modelLabel: r.model_label, latencyMs: r.latency_ms }))),
    });
    result = out.data;
    model = out.model;
  }

  // quality 0.5 is neutral; map to a bounded trust delta.
  const delta = Math.max(-MAX_TRUST_DELTA, Math.min(MAX_TRUST_DELTA, (result.quality - 0.5) * 2 * MAX_TRUST_DELTA));
  const trustAfter = Math.round(Math.max(0, Math.min(100, w.trust_score + delta)) * 10) / 10;

  await sql`INSERT INTO audits (worker, labels_reviewed, quality, trust_before, trust_after, patterns, notes, model)
            VALUES (${wallet}, ${rows.length}, ${result.quality}, ${w.trust_score}, ${trustAfter}, ${sql.json(result.patterns)}, ${result.notes}, ${model})`;
  await sql`UPDATE workers SET trust_score = ${trustAfter}, paused = ${trustAfter < TRUST_PAUSE}, last_audit_label_count = ${w.labels_total} WHERE wallet = ${wallet}`;

  bus.publish({
    type: "audit",
    worker: wallet,
    quality: result.quality,
    patterns: result.patterns,
    notes: result.notes,
    trustBefore: w.trust_score,
    trust: trustAfter,
    labelsReviewed: rows.length,
    model,
    at: Date.now(),
  });
  return { ...result, trustBefore: w.trust_score, trustAfter, labelsReviewed: rows.length, model };
}

/** Audits every worker who has accumulated enough new labels. */
export async function auditDueWorkers() {
  const due = await sql<{ wallet: string }[]>`SELECT wallet FROM workers WHERE labels_total - last_audit_label_count >= ${AUDIT_EVERY_N_LABELS}`;
  for (const { wallet } of due) {
    try {
      await auditWorker(wallet);
    } catch (e) {
      console.error("[audit]", wallet, (e as Error).message);
    }
  }
  return due.length;
}
