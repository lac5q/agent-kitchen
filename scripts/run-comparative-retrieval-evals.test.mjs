import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isExpectedAnswerSupported,
  scoreTask,
} from "./run-comparative-retrieval-evals.mjs";

function buildRetrieval(text) {
  return {
    adapterName: "lexical",
    ignored: [],
    injected: ["source-1"],
    latencyMs: 1,
    retrieved: [
      {
        id: "source-1",
        score: 1,
        text,
      },
    ],
  };
}

describe("comparative retrieval scoring", () => {
  it("requires full normalized expected-answer containment for answer support", () => {
    const longAnswer =
      "MemRoOS preserves operational continuity through receipts and governed memory gates.";

    assert.equal(
      isExpectedAnswerSupported(longAnswer, "MemRoOS preserves operational continuity through receipts."),
      false
    );
    assert.equal(
      isExpectedAnswerSupported(
        longAnswer,
        "The report says MemRoOS preserves operational continuity through receipts and governed memory gates."
      ),
      true
    );
  });

  it("does not treat an empty expected answer as supported by every retrieved source", () => {
    assert.equal(isExpectedAnswerSupported("", "any retrieved text"), false);
    assert.equal(isExpectedAnswerSupported(null, "any retrieved text"), false);
  });

  it("scores answer support without using a 40-character prefix shortcut", () => {
    const task = {
      corpus: [],
      evidence_spans: ["source-1"],
      expected_answer:
        "MemRoOS preserves operational continuity through receipts and governed memory gates.",
      id: "task-1",
      source: "fixture",
      task_type: "recall",
    };

    const score = scoreTask(
      task,
      buildRetrieval("MemRoOS preserves operational continuity through receipts.")
    );

    assert.equal(score.answerSupportedByRetrievedSource, false);
  });
});
