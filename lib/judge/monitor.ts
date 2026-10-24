import type { Verdict, Worker } from "@/lib/db/types";
import type { MonitorVerdict } from "./prompts";

export type Flag =
  | "too_fast"
  | "straight_lining"
  | "gold_miss"
  | "incoherent"
  | "questionable"
  | "consensus_disagree"
  | "judge_unavailable"
  | "vision_unavailable";

export interface MonitorInput {
  worker: Pick<Worker, "trust_score" | "last_answer" | "streak">;
  answer: string;
  latencyMs: number;
  minLatencyMs: number;
  isGold: boolean;
  gold: string | null;
  monitor: MonitorVerdict | null;
  /** answers other workers gave on this same item */
  peerAnswers: string[];
  extraFlags?: Flag[];
}

export interface MonitorResult {
  verdict: Verdict;
  confidence: number;
  reason: string;
  flags: Flag[];
  trustAfter: number;
  multiplier: number;
  payable: boolean;
  paused: boolean;
  streak: number;
}

export const TRUST_PAUSE = 25;
const STRAIGHT_LINE_N = 5;
const ALPHA = 0.12;
const HARD_FLAGS: Flag[] = ["too_fast", "straight_lining", "gold_miss", "incoherent"];

export function trustMultiplier(trust: number): number {
  if (trust < 40) return 0.5;
  if (trust <= 80) return 1;
  return 1.5;
}

/**
 * Pay decision. Humans are the source of truth on routed items, so the default is approve.
 * Only three things block pay: hidden-gold misses, behavioral fraud signals, and answers the
 * monitor calls absurd with high confidence. "Questionable" and peer disagreement only nudge trust.
 */
export function evaluate(input: MonitorInput): MonitorResult {
  const flags: Flag[] = [...(input.extraFlags ?? [])];
  const streak = input.worker.last_answer === input.answer ? input.worker.streak + 1 : 1;

  if (input.latencyMs < input.minLatencyMs) flags.push("too_fast");
  if (streak >= STRAIGHT_LINE_N) flags.push("straight_lining");

  const goldMiss = input.isGold && input.gold != null && norm(input.gold) !== norm(input.answer);
  if (goldMiss) flags.push("gold_miss");

  // Peer consensus: flag when at least two others answered and a clear majority disagrees.
  if (input.peerAnswers.length >= 2) {
    const counts = new Map<string, number>();
    for (const a of input.peerAnswers) counts.set(norm(a), (counts.get(norm(a)) ?? 0) + 1);
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top !== norm(input.answer) && n / input.peerAnswers.length >= 0.67) flags.push("consensus_disagree");
  }

  let verdict: Verdict = "approve";
  let confidence = 0.75;
  let reason: string;

  if (input.monitor) {
    confidence = clamp01(input.monitor.confidence);
    reason = input.monitor.note;
    if (input.monitor.severity === "absurd" && confidence >= 0.8) {
      flags.push("incoherent");
      verdict = "reject";
    } else if (input.monitor.severity !== "ok") {
      flags.push("questionable");
    }
  } else {
    reason = goldMiss ? `Reference label is "${input.gold}".` : "Accepted. Behavioral checks passed.";
  }

  if (goldMiss) {
    verdict = "reject";
    confidence = Math.max(confidence, 0.9);
    reason = `Missed a verified reference item (reference: "${input.gold}"). ${input.monitor?.note ?? ""}`.trim();
  }

  // Trust: EMA toward 100 on approve / 0 on reject, minus penalties for hard flags; soft flags nudge.
  const target = verdict === "approve" ? 100 : 0;
  let trust = input.worker.trust_score + ALPHA * (target - input.worker.trust_score);
  const hard = flags.filter((f) => HARD_FLAGS.includes(f)).length;
  const soft = flags.filter((f) => f === "questionable" || f === "consensus_disagree").length;
  trust -= 8 * hard + 2 * soft;
  trust = Math.max(0, Math.min(100, trust));

  const paused = trust < TRUST_PAUSE;
  const payable = verdict === "approve" && hard === 0 && !paused;

  return {
    verdict,
    confidence,
    reason,
    flags,
    trustAfter: Math.round(trust * 10) / 10,
    multiplier: trustMultiplier(trust),
    payable,
    paused,
    streak,
  };
}

function norm(s: string) {
  return s.trim().toLowerCase();
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}
