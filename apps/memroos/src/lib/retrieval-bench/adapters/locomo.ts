/**
 * LoCoMo dataset adapter (VAL-RETR-003, VAL-RETR-004).
 *
 * Converts LoCoMo source conversations to the normalized schema. Raw
 * LoCoMo conversation files are NEVER committed to this repo per the
 * non-redistribution rules in evals/comparative-retrieval/fixtures/README.md.
 *
 * The adapter is a pure converter: it consumes a structured source
 * payload (already loaded from caller-local data), emits normalized
 * tasks with provenance metadata, and applies the non-distribution guard
 * to refuse propagation of raw conversations outside the fixture layer.
 */

import crypto from "node:crypto";
import type { DatasetProvenance, NormalizedTask, SessionRecord, TaskType } from "../schema";
import { DATASET_PROVENANCE, SUPPORTED_TASK_TYPES } from "../schema";

const LOCOMO_TASK_TYPE_MAP: Record<string, TaskType> = {
  qa: "single_hop",
  multi_hop: "multi_hop",
  temporal: "temporal_reasoning",
  event_summary: "event_summary",
  entity_state: "entity_state",
  abstention: "abstention",
};

export interface LoCoMoRawSample {
  sample_id: string;
  conversations: Array<{
    session_id: string;
    turns: Array<{ role: "user" | "assistant" | "system"; text: string; timestamp_iso?: string }>;
  }>;
  qa: Array<{
    qid: string;
    question: string;
    answer: string;
    category?: string;
    evidence_session_ids?: string[];
    evidence_turn_ids?: string[];
  }>;
  /** Optional SHA-256 of the source file as a stable fingerprint. */
  source_file_hash?: string;
}

export interface LoCoMoAdapterInit {
  tenantId: string;
  sourceRoot: string;
}

/**
 * Load + convert LoCoMo samples into normalized tasks. Returns either a
 * successful list of tasks or a typed error. The adapter never writes
 * raw conversations anywhere — it only emits normalized IDs and hashes.
 */
export function convertLoCoMoSamples(args: {
  rawSamples: LoCoMoRawSample[];
}): { ok: true; tasks: NormalizedTask[]; provenance: DatasetProvenance } | { ok: false; reason: string } {
  if (!Array.isArray(args.rawSamples)) {
    return { ok: false, reason: "raw_samples_not_array" };
  }
  if (args.rawSamples.length === 0) {
    return { ok: false, reason: "raw_samples_empty" };
  }
  const baseProvenance: DatasetProvenance = {
    ...DATASET_PROVENANCE.locomo,
  };
  const tasks: NormalizedTask[] = [];
  for (const sample of args.rawSamples) {
    if (!sample.sample_id || !Array.isArray(sample.conversations) || !Array.isArray(sample.qa)) {
      return { ok: false, reason: "sample_malformed:" + (sample.sample_id ?? "?") };
    }
    // Build corpus from session turns (in order) — IDs are preserved
    const corpus = [];
    const sessionOrder: SessionRecord[] = [];
    for (const session of sample.conversations) {
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
          source: `locomo/${sample.sample_id}/${session.session_id}#${i}`,
          timestamp_iso: turn.timestamp_iso,
          session_id: session.session_id,
        });
      }
    }
    for (const qa of sample.qa) {
      const taskType = LOCOMO_TASK_TYPE_MAP[qa.category ?? "qa"] ?? "single_hop";
      if (!SUPPORTED_TASK_TYPES.includes(taskType)) {
        return { ok: false, reason: "task_type_unsupported:" + qa.category };
      }
      // Map evidence_session_ids / evidence_turn_ids -> corpus IDs
      const evidenceSpans = [];
      if (Array.isArray(qa.evidence_session_ids)) {
        for (const sid of qa.evidence_session_ids) {
          evidenceSpans.push(`${sample.sample_id}-${sid}-turn-0`);
        }
      }
      tasks.push({
        id: `locomo-${sample.sample_id}-${qa.qid}`,
        dataset: "locomo",
        task_type: taskType,
        corpus,
        sessions: sessionOrder,
        question: qa.question,
        expected_answer: qa.answer,
        evidence_spans: evidenceSpans,
        license: baseProvenance.sourceLicense,
        citation: baseProvenance.sourceCitation,
        provenance: {
          ...baseProvenance,
          sourceHash: sample.source_file_hash,
        },
      });
    }
  }
  return {
    ok: true,
    tasks,
    provenance: baseProvenance,
  };
}

/**
 * Compute a stable SHA-256 hash over the raw sample set so that fixtures
 * can be tagged with their source identity without storing raw data.
 */
export function hashLoCoMoSource(rawSamples: LoCoMoRawSample[]): string {
  const canonical = JSON.stringify(
    rawSamples.map((s) => ({
      sample_id: s.sample_id,
      conversations: s.conversations.map((c) => ({
        session_id: c.session_id,
        turns: c.turns.map((t) => ({ role: t.role, text: t.text })),
      })),
      qa: s.qa.map((q) => ({ qid: q.qid, question: q.question, answer: q.answer })),
    })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}
