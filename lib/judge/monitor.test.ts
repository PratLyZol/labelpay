import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, type MonitorInput } from "./monitor";

const base: MonitorInput = {
  worker: { trust_score: 60, last_answer: null, streak: 0 },
  answer: "cat",
  latencyMs: 5_000,
  minLatencyMs: 1_000,
  isGold: false,
  gold: null,
  modelLabel: "cat",
  modelConfidence: 0.9,
  monitor: null,
  peerAnswers: [],
};

test("a Gemini match raises trust in proportion to model confidence", () => {
  const highConfidence = evaluate(base);
  const lowConfidence = evaluate({ ...base, modelConfidence: 0.2 });

  assert.equal(highConfidence.trustAfter, 64.3);
  assert.equal(lowConfidence.trustAfter, 61);
  assert.ok(highConfidence.flags.includes("model_match"));
});

test("a defensible disagreement is retained without an automatic trust penalty", () => {
  const result = evaluate({ ...base, answer: "dog" });

  assert.equal(result.verdict, "approve");
  assert.equal(result.trustAfter, 60);
  assert.ok(result.flags.includes("model_disagree"));
});

test("a verified reference outranks Gemini", () => {
  const result = evaluate({
    ...base,
    isGold: true,
    gold: "cat",
    modelLabel: "dog",
    modelConfidence: 0.99,
  });

  assert.equal(result.verdict, "approve");
  assert.equal(result.trustAfter, 64.8);
  assert.ok(result.flags.includes("model_match"));
});

test("missing a verified reference still rejects and lowers trust", () => {
  const result = evaluate({ ...base, answer: "dog", isGold: true, gold: "cat" });

  assert.equal(result.verdict, "reject");
  assert.ok(result.trustAfter < base.worker.trust_score);
  assert.ok(result.flags.includes("gold_miss"));
});
