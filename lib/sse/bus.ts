import { EventEmitter } from "node:events";

export type BusEvent =
  | {
      type: "label_verdict";
      worker: string;
      labelEventId: string;
      taskId: string;
      taskType: string;
      answer: string;
      verdict: string;
      confidence: number;
      reason: string;
      flags: string[];
      severity: string | null;
      payLamports: string;
      instantLamports: string;
      escrowLamports: string;
      trust: number;
      judgeMs: number;
      judgeModel: string | null;
      payoutId: string | null;
      at: number;
    }
  | {
      type: "payout_confirmed" | "escrow_funded" | "escrow_released" | "escrow_slashed";
      worker: string;
      payoutIds: string[];
      lamports: string;
      sig: string;
      explorer: string;
      escrow: string | null;
      escrowExplorer: string | null;
      batched: number;
      mock: boolean;
      at: number;
    }
  | { type: "payout_failed"; worker: string; payoutIds: string[]; error: string; at: number }
  | { type: "trust_update"; worker: string; trust: number; paused: boolean; at: number }
  | { type: "audit"; worker: string; quality: number; patterns: string[]; notes: string; trustBefore: number; trust: number; labelsReviewed: number; model: string; at: number };

declare global {
  var __bus: EventEmitter | undefined;
}

const emitter = globalThis.__bus ?? (globalThis.__bus = new EventEmitter());
emitter.setMaxListeners(500);

export const bus = {
  publish(ev: BusEvent) {
    emitter.emit("event", ev);
  },
  subscribe(fn: (ev: BusEvent) => void) {
    emitter.on("event", fn);
    return () => emitter.off("event", fn);
  },
};
