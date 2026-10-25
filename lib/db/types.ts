export type TaskType = "text" | "pairwise" | "image";
export type Verdict = "approve" | "reject" | "uncertain";

export interface Worker {
  wallet: string;
  trust_score: number;
  labels_total: number;
  labels_approved: number;
  lamports_earned: bigint;
  escrow_lamports: bigint;
  lamports_released: bigint;
  lamports_slashed: bigint;
  escrow_address: string | null;
  paused: boolean;
  last_audit_label_count: number;
  last_answer: string | null;
  streak: number;
  created_at: Date;
}

export interface TaskSet {
  id: string;
  type: TaskType;
  title: string;
  guidelines: string;
  options: string[];
  pay_lamports: bigint;
  min_latency_ms: number;
}

export interface TextPayload { text: string }
export interface PairwisePayload { prompt: string; a: string; b: string }
export interface ImagePayload { src: string; alt?: string }
export type TaskPayload = TextPayload | PairwisePayload | ImagePayload;

export interface Task {
  id: string;
  set_id: string;
  payload: TaskPayload;
  gold_label: string | null;
  is_gold: boolean;
  model_label: string | null;
  model_confidence: number | null;
  model_rationale: string | null;
  routing: "pending" | "auto" | "human";
  active: boolean;
}

export interface ServedTask {
  id: string;
  setId: string;
  type: TaskType;
  title: string;
  guidelines: string;
  options: string[];
  payload: TaskPayload;
  payLamports: string;
  servedAt: number;
  /** why this item needed a human: the first-pass model's confidence and its own words */
  modelConfidence: number | null;
  modelRationale: string | null;
}

export interface LabelEvent {
  id: bigint;
  ts: Date;
  worker: string;
  task_id: string;
  set_id: string;
  task_type: TaskType;
  answer: string;
  latency_ms: number;
  verdict: Verdict;
  confidence: number | null;
  reason: string | null;
  flags: string[];
  pay_lamports: bigint;
  trust_after: number | null;
  judge_ms: number | null;
  judge_model: string | null;
}

export interface Payout {
  id: bigint;
  ts: Date;
  worker: string;
  label_event_id: bigint | null;
  lamports: bigint;
  tx_sig: string | null;
  status: "pending" | "sent" | "confirmed" | "failed" | "mock";
  error: string | null;
  kind: PayoutKind;
  release_at: Date | null;
  released: boolean;
  slash_requested: boolean;
  escrow_address: string | null;
  top_up_lamports: bigint;
}

export type PayoutKind = "instant" | "escrow_fund" | "escrow_release" | "escrow_slash";
