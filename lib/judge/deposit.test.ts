import assert from "node:assert/strict";
import test from "node:test";
import { inspectDepositTransaction } from "@/lib/solana/deposit";
import { MEMO_PROGRAM_ADDRESS, projectDepositMemo } from "@/lib/solana/project-funding";

const expected = {
  owner: "Requester111111111111111111111111111111111",
  treasury: "Treasury111111111111111111111111111111111",
  lamports: 1_500_000n,
  memo: projectDepositMemo("project-test"),
};

function transaction(overrides: { source?: string; destination?: string; lamports?: number; memo?: string; err?: unknown } = {}) {
  return {
    meta: { err: overrides.err ?? null },
    transaction: {
      message: {
        accountKeys: [{ pubkey: expected.owner, signer: true, writable: true }],
        instructions: [
          {
            parsed: {
              info: {
                source: overrides.source ?? expected.owner,
                destination: overrides.destination ?? expected.treasury,
                lamports: overrides.lamports ?? Number(expected.lamports),
              },
              type: "transfer",
            },
            program: "system",
            programId: "11111111111111111111111111111111",
          },
          {
            parsed: overrides.memo ?? expected.memo,
            program: "spl-memo",
            programId: MEMO_PROGRAM_ADDRESS,
          },
        ],
      },
    },
  };
}

test("accepts an exact signed project deposit", () => {
  assert.deepEqual(inspectDepositTransaction(transaction(), expected), { ok: true });
});

test("rejects the wrong amount, recipient, or project memo", () => {
  assert.equal(inspectDepositTransaction(transaction({ lamports: 1_499_999 }), expected).ok, false);
  assert.equal(inspectDepositTransaction(transaction({ destination: "SomebodyElse" }), expected).ok, false);
  assert.equal(inspectDepositTransaction(transaction({ memo: "labelpay:project-other" }), expected).ok, false);
});

test("treats an absent transaction as pending and rejects failed transactions", () => {
  assert.deepEqual(inspectDepositTransaction(null, expected), {
    ok: false,
    pending: true,
    reason: "The transaction is not confirmed yet.",
  });
  assert.equal(inspectDepositTransaction(transaction({ err: { InstructionError: [0, "Custom"] } }), expected).ok, false);
});
