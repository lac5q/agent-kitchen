/**
 * LongMemEval dataset adapter (VAL-RETR-003, VAL-RETR-004).
 *
 * Same non-redistribution contract as the LoCoMo adapter: raw session
 * data is read from caller-local paths and only normalized IDs, hashes,
 * and metadata are emitted to the runner.
 *
 * LongMemEval-V2 is explicitly UNAVAILABLE — the adapter refuses to
 * fabricate a successful conversion when the source is not present
 * (VAL-RETR-003: "unavailable V2 is an explicit error, not empty success").
 */

import crypto from "node:crypto";
import type { DatasetProvenance, NormalizedTask, SessionRecord, TaskType } from "../schema";
import { DATASET_PROVENANCE, SUPPORTED_TASK_TYPES } from "../schema";

const LME_TASK_TYPE_MAP: Record<string, TaskType> = {
  single_hop: "single_hop",
  multi_hop: "multi_hop",
  temporal: "temporal_reasoning",
  open_domain: "open_domain_qa",
  abstention: "abstention",
};

export interface LongMemEvalRawSample {
  sample_id: string;
  history_sessions: Array<{
    session_id: string;
    turns: Array<{ role: "user" | "assistant" | "system"; text: string; timestamp_iso?: string }>;
  }>;
  questions: Array<{
    qid: string;
    question: string;
    answer: string;
    category?: string;
    evidence_session_ids?: string[];
    abstention?: boolean;
  }>;
  source_file_hash?: string;
}

export function convertLongMemEvalSamples(args: {
  rawSamples: LongMemEvalRawSample[];
  variant: "longmemeval" | "longmemeval_v2";
}): { ok: true; tasks: NormalizedTask[]; provenance: DatasetProvenance } | { ok: false; reason: string } {
  if (args.variant === "longmemeval_v2") {
    return {
      ok: false,
      reason: "longmemeval_v2_unavailable",
    };
  }
  if (!Array.isArray(args.rawSamples) || args.rawSamples.length === 0) {
    return { ok: false, reason: "raw_samples_empty" };
  }
  const baseProvenance: DatasetProvenance = {
    ...DATASET_PROVENANCE.longmemeval,
  };
  const tasks: NormalizedTask[] = [];
  for (const sample of args.rawSamples) {
    if (!sample.sample_id || !Array.isArray(sample.history_sessions) || !Array.isArray(sample.questions)) {
      return { ok: false, reason: "sample_malformed:" + (sample.sample_id ?? "?") };
    }
    const corpus = [];
    const sessionOrder: SessionRecord[] = [];
    for (const session of sample.history_sessions) {
      sessionOrder.push({
        session_id: session.session_id,
        turns: session.turns.map((t) => ({
          role: t.role,
          text: t.text,
          timestamp_iso: t.timestamp_iso,
        })),
      });
      for (let i = 0; i < session.turns.length; i++) {
        const turn = session.turns[i];
        corpus.push({
          id: `${sample.sample_id}-${session.session_id}-turn-${i}`,
          text: turn.text,
          source: `longmemeval/${sample.sample_id}/${session.session_id}#${i}`,
          timestamp_iso: turn.timestamp_iso,
          session_id: session.session_id,
        });
      }
    }
    for (const q of sample.questions) {
      const taskType = LME_TASK_TYPE_MAP[q.category ?? "single_hop"] ?? "single_hop";
      if (!SUPPORTED_TASK_TYPES.includes(taskType)) {
        return { ok: false, reason: "task_type_unsupported:" + q.category };
      }
      const evidenceSpans = [];
      if (Array.isArray(q.evidence_session_ids)) {
        for (const sid of q.evidence_session_ids) {
          evidenceSpans.push(`${sample.sample_id}-${sid}-turn-0`);
        }
      }
      tasks.push({
        id: `longmemeval-${sample.sample_id}-${q.qid}`,
        dataset: "longmemeval",
        task_type: taskType,
        corpus,
        sessions: sessionOrder,
        question: q.question,
        expected_answer: q.answer,
        evidence_spans: evidenceSpans,
        abstention_correct: q.abstention === true ? true : undefined,
        license: baseProvenance.sourceLicense,
        citation: baseProvenance.sourceCitation,
        provenance: {
          ...baseProvenance,
          sourceHash: sample.source_file_hash,
        },
      });
    }
  }
  return { ok: true, tasks, provenance: baseProvenance };
}

export function hashLongMemEvalSource(rawSamples: LongMemEvalRawSample[]): string {
  const canonical = JSON.stringify(
    rawSamples.map((s) => ({
      sample_id: s.sample_id,
      history_sessions: s.history_sessions.map((c) => ({
        session_id: c.session_id,
        turns: c.turns.map((t) => ({ role: t.role, text: t.text })),
      })),
      questions: s.questions.map((q) => ({ qid: q.qid, question: q.question, answer: q.answer })),
    })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}
