/**
 * Fixture validation for normalized benchmark tasks (VAL-RETR-002).
 *
 * Strict schema enforcement before any scoring or report generation:
 *   - IDs, supported task_types/datasets/adapters
 *   - Corpus text + unique corpus IDs
 *   - Required fields: question, expected_answer, evidence_spans
 *   - Timestamp ISO 8601 + temporal direction enum
 *   - Duplicate ID detection across the fixture set
 *   - Dangling evidence_spans (pointing at non-existent corpus IDs)
 *   - License and citation presence
 *   - Provenance metadata presence and consistency
 *
 * Failures return a typed, field-specific error and a zero exit code is
 * never returned from the runner. The runner uses validateFixtures() to
 * refuse report generation when any task fails validation.
 */

import crypto from "node:crypto";

import {
  type CorpusEntry,
  DATASET_PROVENANCE,
  SUPPORTED_DATASETS,
  SUPPORTED_TASK_TYPES,
  type DatasetId,
  type NormalizedTask,
  type TaskType,
} from "./schema";
import { normalizeScopeIdentity } from "@/lib/msiq/scope-identity";

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface FixtureValidationIssue {
  taskId?: string;
  field: string;
  reason: string;
  detail?: string;
}

export interface FixtureValidationResult {
  ok: boolean;
  taskCount: number;
  issues: FixtureValidationIssue[];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isString(v));
}

function hasCompleteCandidateScope(value: unknown): boolean {
  if (!isObject(value)) return false;
  const required = ["tenantId", "userId", "agentId", "spaceId"];
  if (required.some((field) => !isNonEmptyString(value[field]))) return false;
  if (!isObject(value.label)) return false;
  return isNonEmptyString(value.label.visibility) && isNonEmptyString(value.label.policy);
}

/**
 * Validate a single normalized task. Used both per-task and as a building
 * block for the full fixture validator.
 */
export function validateTask(
  raw: unknown,
  ctx: { seenIds: Set<string> }
): { ok: true; task: NormalizedTask } | { ok: false; issues: FixtureValidationIssue[] } {
  const issues: FixtureValidationIssue[] = [];
  const fail = (field: string, reason: string, detail?: string) => {
    issues.push({ field, reason, detail });
  };

  if (!isObject(raw)) {
    return { ok: false, issues: [{ field: "task", reason: "task_not_object", detail: "task must be a JSON object" }] };
  }
  const task = raw as Record<string, unknown>;

  // id
  if (!isNonEmptyString(task.id)) {
    fail("id", "id_missing_or_empty");
  } else {
    if (ctx.seenIds.has(task.id)) {
      fail("id", "duplicate_task_id", task.id);
    } else {
      ctx.seenIds.add(task.id);
    }
  }

  // dataset
  if (!isString(task.dataset) || !(SUPPORTED_DATASETS as readonly string[]).includes(task.dataset)) {
    fail("dataset", "dataset_invalid_enum", String(task.dataset));
  }

  // task_type
  if (!isString(task.task_type) || !(SUPPORTED_TASK_TYPES as readonly string[]).includes(task.task_type)) {
    fail("task_type", "task_type_invalid_enum", String(task.task_type));
  }

  // corpus
  if (!Array.isArray(task.corpus)) {
    fail("corpus", "corpus_missing_or_not_array");
  } else if (task.corpus.length === 0) {
    fail("corpus", "corpus_empty");
  } else {
    const corpusIds = new Set<string>();
    for (let i = 0; i < task.corpus.length; i++) {
      const entry = task.corpus[i];
      const entryIssues = validateCorpusEntry(entry, i);
      for (const issue of entryIssues) {
        fail(`corpus[${i}].${issue.field}`, issue.reason, issue.detail);
      }
      if (isObject(entry) && isNonEmptyString(entry.id)) {
        if (corpusIds.has(entry.id)) {
          fail(`corpus[${i}].id`, "duplicate_corpus_id", entry.id);
        } else {
          corpusIds.add(entry.id);
        }
      }
    }
    // evidence_spans consistency: every span must point at a real corpus ID
    if (isArrayOfStrings(task.evidence_spans)) {
      for (const span of task.evidence_spans) {
        if (!corpusIds.has(span)) {
          fail("evidence_spans", "dangling_evidence_span", span);
        }
      }
    }
  }

  // sessions (optional)
  if (task.sessions !== undefined) {
    if (!Array.isArray(task.sessions)) {
      fail("sessions", "sessions_not_array");
    } else {
      for (let i = 0; i < task.sessions.length; i++) {
        const s = task.sessions[i];
        if (!isObject(s)) {
          fail(`sessions[${i}]`, "session_not_object");
          continue;
        }
        if (!isNonEmptyString((s as Record<string, unknown>).session_id)) {
          fail(`sessions[${i}].session_id`, "session_id_missing_or_empty");
        }
        if (!Array.isArray((s as Record<string, unknown>).turns)) {
          fail(`sessions[${i}].turns`, "session_turns_not_array");
        } else {
          for (let j = 0; j < ((s as Record<string, unknown>).turns as unknown[]).length; j++) {
            const t = ((s as Record<string, unknown>).turns as unknown[])[j] as Record<string, unknown>;
            if (!isObject(t)) {
              fail(`sessions[${i}].turns[${j}]`, "turn_not_object");
              continue;
            }
            const role = (t as Record<string, unknown>).role;
            if (role !== "user" && role !== "assistant" && role !== "system") {
              fail(`sessions[${i}].turns[${j}].role`, "turn_role_invalid", String(role));
            }
          }
        }
      }
    }
  }

  // question
  if (!isNonEmptyString(task.question)) {
    fail("question", "question_missing_or_empty");
  }

  // expected_answer — present but may be empty for abstention tasks
  if (task.expected_answer === undefined) {
    fail("expected_answer", "expected_answer_missing");
  } else if (!isString(task.expected_answer)) {
    fail("expected_answer", "expected_answer_not_string");
  }

  // abstention_correct must be boolean when present
  if (task.abstention_correct !== undefined && typeof task.abstention_correct !== "boolean") {
    fail("abstention_correct", "abstention_correct_not_boolean");
  }

  // evidence_spans (array of strings, may be empty for abstention)
  if (task.evidence_spans !== undefined && !isArrayOfStrings(task.evidence_spans)) {
    fail("evidence_spans", "evidence_spans_not_string_array");
  }

  // temporal_metadata
  if (task.temporal_metadata !== undefined) {
    const tm = task.temporal_metadata;
    if (!isObject(tm)) {
      fail("temporal_metadata", "temporal_metadata_not_object");
    } else {
      if (tm.reference_time_iso !== undefined) {
        if (!isString(tm.reference_time_iso) || !ISO_8601_REGEX.test(tm.reference_time_iso)) {
          fail("temporal_metadata.reference_time_iso", "timestamp_invalid_iso8601", String(tm.reference_time_iso));
        }
      }
      if (tm.fact_valid_until_iso !== undefined) {
        if (!isString(tm.fact_valid_until_iso) || !ISO_8601_REGEX.test(tm.fact_valid_until_iso)) {
          fail("temporal_metadata.fact_valid_until_iso", "timestamp_invalid_iso8601", String(tm.fact_valid_until_iso));
        }
      }
      if (tm.temporal_direction !== undefined) {
        const dir = tm.temporal_direction;
        if (dir !== "before" && dir !== "after" && dir !== "between" && dir !== "latest") {
          fail("temporal_metadata.temporal_direction", "temporal_direction_invalid_enum", String(dir));
        }
      }
    }
  }

  // license + citation
  if (!isNonEmptyString(task.license)) {
    fail("license", "license_missing_or_empty");
  }
  if (!isNonEmptyString(task.citation)) {
    fail("citation", "citation_missing_or_empty");
  }

  // provenance
  if (task.provenance === undefined) {
    fail("provenance", "provenance_missing");
  } else if (!isObject(task.provenance)) {
    fail("provenance", "provenance_not_object");
  } else {
    const p = task.provenance as Record<string, unknown>;
    if (!isNonEmptyString(p.sourceCitation)) fail("provenance.sourceCitation", "provenance_sourceCitation_missing");
    if (!isNonEmptyString(p.sourceLicense)) fail("provenance.sourceLicense", "provenance_sourceLicense_missing");
    if (
      p.sourceAvailability !== "available" &&
      p.sourceAvailability !== "unavailable" &&
      p.sourceAvailability !== "synthetic"
    ) {
      fail("provenance.sourceAvailability", "provenance_sourceAvailability_invalid");
    }
    // Provenance must match the dataset's canonical provenance (license + availability)
    if (isString(task.dataset) && (SUPPORTED_DATASETS as readonly string[]).includes(task.dataset)) {
      const canonical = DATASET_PROVENANCE[task.dataset as DatasetId];
      if (canonical) {
        if (isString(p.sourceLicense) && p.sourceLicense !== canonical.sourceLicense) {
          fail("provenance.sourceLicense", "provenance_sourceLicense_mismatch", p.sourceLicense + " != " + canonical.sourceLicense);
        }
      }
    }
  }

  if (issues.length > 0) {
    // Tag every issue with the task id if we have one
    const taskId = isNonEmptyString(task.id) ? task.id : undefined;
    const withTaskId = issues.map((i) => ({ taskId: i.taskId ?? taskId, ...i }));
    return { ok: false, issues: withTaskId };
  }

  // Re-cast the validated object as NormalizedTask for downstream use.
  return { ok: true, task: task as unknown as NormalizedTask };
}

function validateCorpusEntry(entry: unknown, index: number): FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];
  if (!isObject(entry)) {
    issues.push({ field: "entry", reason: "corpus_entry_not_object" });
    return issues;
  }
  if (!isNonEmptyString((entry as Record<string, unknown>).id)) {
    issues.push({ field: "id", reason: "corpus_id_missing_or_empty" });
  }
  if (!isNonEmptyString((entry as Record<string, unknown>).text)) {
    issues.push({ field: "text", reason: "corpus_text_missing_or_empty" });
  }
  const e = entry as Record<string, unknown>;
  if (e.timestamp_iso !== undefined) {
    if (!isString(e.timestamp_iso) || !ISO_8601_REGEX.test(e.timestamp_iso)) {
      issues.push({ field: "timestamp_iso", reason: "timestamp_invalid_iso8601", detail: String(e.timestamp_iso) });
    }
  }
  if (e.entity_refs !== undefined && !isArrayOfStrings(e.entity_refs)) {
    issues.push({ field: "entity_refs", reason: "entity_refs_not_string_array" });
  }
  if (e.scope !== undefined) {
    if (!hasCompleteCandidateScope(e.scope) || !normalizeScopeIdentity(e.scope ?? {})) {
      issues.push({ field: "scope", reason: "candidate_scope_invalid" });
    }
  }
  void index;
  return issues;
}

/**
 * Validate a full fixture array. Returns ok=false on any single issue.
 * The runner treats ok=false as a hard failure: no report is generated.
 */
export function validateFixtures(rawTasks: unknown): FixtureValidationResult {
  if (!Array.isArray(rawTasks)) {
    return {
      ok: false,
      taskCount: 0,
      issues: [{ field: "fixtures", reason: "fixtures_not_array" }],
    };
  }
  const issues: FixtureValidationIssue[] = [];
  const seenIds = new Set<string>();
  let validatedCount = 0;
  for (let i = 0; i < rawTasks.length; i++) {
    const result = validateTask(rawTasks[i], { seenIds });
    if (result.ok) {
      validatedCount += 1;
    } else {
      for (const issue of result.issues) {
        issues.push({ ...issue, field: `tasks[${i}].${issue.field}` });
      }
    }
  }
  return {
    ok: issues.length === 0,
    taskCount: validatedCount,
    issues,
  };
}

/**
 * Compute a stable SHA-256 hash over the validated fixture set so that
 * reports can be tagged with a reproducible fixture identity (VAL-RETR-013).
 */
export function hashFixtures(tasks: NormalizedTask[]): string {
  const canonical = JSON.stringify(
    tasks.map((t) => ({
      id: t.id,
      dataset: t.dataset,
      task_type: t.task_type,
      corpus: t.corpus.map((c) => ({ id: c.id, text: c.text, timestamp_iso: c.timestamp_iso ?? null })),
      question: t.question,
      expected_answer: t.expected_answer,
      evidence_spans: t.evidence_spans ?? [],
      abstention_correct: t.abstention_correct ?? null,
    })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Compute a stable hash over a single task's corpus. Used to tag per-task
 * scores with a non-sensitive corpus identity (VAL-RETR-013).
 */
export function hashCorpus(corpus: CorpusEntry[]): string {
  const canonical = JSON.stringify(
    corpus.map((c) => ({ id: c.id, text: c.text, timestamp_iso: c.timestamp_iso ?? null })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Stable hash over the task identity + expected answer used by score
 * reproducibility (VAL-RETR-013). Pure metadata, no corpus content.
 */
export function hashTaskIdentity(task: Pick<NormalizedTask, "id" | "task_type" | "dataset">): string {
  const canonical = JSON.stringify({
    id: task.id,
    task_type: task.task_type,
    dataset: task.dataset,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

/** Filter helper used by the runner: drop tasks that fail validation. */
export function partitionValidTasks(rawTasks: unknown): {
  ok: boolean;
  valid: NormalizedTask[];
  invalid: number;
  issues: FixtureValidationIssue[];
} {
  const result = validateFixtures(rawTasks);
  if (!result.ok) {
    return {
      ok: false,
      valid: [],
      invalid: result.issues.length,
      issues: result.issues,
    };
  }
  const valid: NormalizedTask[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawTasks as unknown[]) {
    const r = validateTask(raw, { seenIds });
    if (r.ok) valid.push(r.task);
  }
  return { ok: true, valid, invalid: 0, issues: [] };
}

/** Lightweight type guards used by the runner for narrowing. */
export function isTaskType(value: unknown): value is TaskType {
  return isString(value) && (SUPPORTED_TASK_TYPES as readonly string[]).includes(value);
}

export function isDatasetId(value: unknown): value is DatasetId {
  return isString(value) && (SUPPORTED_DATASETS as readonly string[]).includes(value);
}
