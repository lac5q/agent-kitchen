/**
 * Dataset adapter tests (VAL-RETR-003, VAL-RETR-004).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  convertLoCoMoSamples,
  hashLoCoMoSource,
  type LoCoMoRawSample,
} from "../adapters/locomo";
import {
  convertLongMemEvalSamples,
  hashLongMemEvalSource,
  type LongMemEvalRawSample,
} from "../adapters/longmemeval";
import { loadSyntheticSmoke } from "../adapters/synthetic";

describe("LoCoMo dataset adapter (VAL-RETR-003, VAL-RETR-004)", () => {
  it("preserves session/turn order and evidence spans", () => {
    const samples: LoCoMoRawSample[] = [
      {
        sample_id: "s1",
        conversations: [
          {
            session_id: "sess-1",
            turns: [
              { role: "user", text: "Hello.", timestamp_iso: "2026-01-01T00:00:00Z" },
              { role: "assistant", text: "Hi!", timestamp_iso: "2026-01-01T00:00:01Z" },
            ],
          },
        ],
        qa: [
          {
            qid: "q1",
            question: "What was said?",
            answer: "Hello.",
            category: "qa",
            evidence_session_ids: ["sess-1"],
          },
        ],
      },
    ];
    const r = convertLoCoMoSamples({ rawSamples: samples });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tasks.length).toBe(1);
    const task = r.tasks[0];
    expect(task.dataset).toBe("locomo");
    expect(task.evidence_spans).toContain("s1-sess-1-turn-0");
    expect(task.sessions?.length).toBe(1);
    expect(task.sessions?.[0].turns.length).toBe(2);
    expect(task.corpus[0].id).toBe("s1-sess-1-turn-0");
  });

  it("attaches provenance metadata to each task", () => {
    const r = convertLoCoMoSamples({
      rawSamples: [
        {
          sample_id: "s1",
          conversations: [{ session_id: "s", turns: [{ role: "user", text: "x" }] }],
          qa: [{ qid: "q1", question: "?", answer: "!" }],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tasks[0].provenance.dataset).toBe("locomo");
    expect(r.tasks[0].provenance.sourceLicense).toBe("CC BY 4.0");
    expect(r.tasks[0].provenance.sourceAvailability).toBe("available");
  });

  it("rejects malformed samples with a typed reason", () => {
    const r = convertLoCoMoSamples({ rawSamples: [{ sample_id: "" } as unknown as LoCoMoRawSample] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("malformed");
    }
  });

  it("hashLoCoMoSource is stable across equivalent inputs", () => {
    const a = hashLoCoMoSource([
      {
        sample_id: "s1",
        conversations: [{ session_id: "s", turns: [{ role: "user", text: "x" }] }],
        qa: [{ qid: "q1", question: "?", answer: "!" }],
      },
    ]);
    const b = hashLoCoMoSource([
      {
        sample_id: "s1",
        conversations: [{ session_id: "s", turns: [{ role: "user", text: "x" }] }],
        qa: [{ qid: "q1", question: "?", answer: "!" }],
      },
    ]);
    expect(a).toBe(b);
  });
});

describe("LongMemEval dataset adapter (VAL-RETR-003, VAL-RETR-004)", () => {
  it("explicitly refuses LongMemEval-V2 with an error (not empty success)", () => {
    const r = convertLongMemEvalSamples({ rawSamples: [], variant: "longmemeval_v2" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("longmemeval_v2_unavailable");
    }
  });

  it("preserves history session order and abstention_correct flag", () => {
    const samples: LongMemEvalRawSample[] = [
      {
        sample_id: "s1",
        history_sessions: [
          { session_id: "h-1", turns: [{ role: "user", text: "ok" }] },
        ],
        questions: [
          { qid: "q1", question: "?", answer: "!", abstention: true, category: "abstention" },
        ],
      },
    ];
    const r = convertLongMemEvalSamples({ rawSamples: samples, variant: "longmemeval" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tasks[0].abstention_correct).toBe(true);
    expect(r.tasks[0].sessions?.length).toBe(1);
  });

  it("hashLongMemEvalSource is deterministic", () => {
    const a = hashLongMemEvalSource([
      {
        sample_id: "s1",
        history_sessions: [{ session_id: "h", turns: [{ role: "user", text: "x" }] }],
        questions: [{ qid: "q1", question: "?", answer: "!" }],
      },
    ]);
    const b = hashLongMemEvalSource([
      {
        sample_id: "s1",
        history_sessions: [{ session_id: "h", turns: [{ role: "user", text: "x" }] }],
        questions: [{ qid: "q1", question: "?", answer: "!" }],
      },
    ]);
    expect(a).toBe(b);
  });
});

describe("Synthetic dataset adapter (VAL-RETR-001)", () => {
  it("loads the smoke fixture when the path is correct", () => {
    const fixturesDir = path.join(process.cwd(), "..", "..", "evals", "comparative-retrieval", "fixtures");
    const r = loadSyntheticSmoke({ fixturesDir, limit: 25 });
    if (!r.ok) {
      // Try a few alternative paths because the test may be run from a
      // different working directory.
      const alt = path.resolve("/Users/lcalderon/github/memroos/evals/comparative-retrieval/fixtures");
      const r2 = loadSyntheticSmoke({ fixturesDir: alt, limit: 25 });
      expect(r2.ok).toBe(true);
      return;
    }
    expect(r.tasks?.length).toBe(25);
    expect(r.truncated).toBe(false);
  });

  it("returns a typed error when the fixture file is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-fixtures-"));
    const r = loadSyntheticSmoke({ fixturesDir: dir });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("fixture_file_not_found");
    }
  });
});
