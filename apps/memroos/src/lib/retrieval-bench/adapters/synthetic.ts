/**
 * Synthetic (MemroOS internal) dataset adapter (VAL-RETR-001, VAL-RETR-003).
 *
 * Loads the smoke fixture from `evals/comparative-retrieval/fixtures/`
 * with a deterministic slice for `--limit N`. The synthetic dataset is
 * the only one that can be loaded entirely with local execution — no
 * remote services, no licensed data, no network calls.
 *
 * The adapter:
 *   - Loads the JSON fixture from disk (caller-local)
 *   - Deep-clones each parsed task so downstream provenance stamping
 *     NEVER mutates the source fixture on disk or the parsed JSON
 *     (VAL-RETR-001 fixture immutability)
 *   - Annotates each cloned task with the canonical provenance block
 *   - Returns a structured error (not an exception) on missing file,
 *     malformed JSON, or non-array content
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DatasetProvenance, NormalizedTask } from "../schema";
import { DATASET_PROVENANCE } from "../schema";

export interface SyntheticAdapterInit {
  fixturesDir: string;
  limit?: number;
}

export interface SyntheticAdapterResult {
  ok: boolean;
  reason?: string;
  tasks?: NormalizedTask[];
  provenance?: DatasetProvenance;
  truncated?: boolean;
  totalAvailable?: number;
}

/**
 * Structural deep-clone for parsed JSON. Handles plain objects, arrays,
 * primitives, and `null`. Does not attempt to clone functions, dates, or
 * other non-JSON-native types because the synthetic fixture contains
 * only JSON-safe primitives.
 */
function deepCloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => deepCloneJson(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepCloneJson(v);
  }
  return out as unknown as T;
}

/**
 * Load the synthetic smoke fixture with optional limit. The adapter
 * stamps each task with the canonical provenance block so downstream
 * runners see consistent metadata.
 *
 * IMPORTANT: Each parsed task is deep-cloned before stamping so the
 * synthetic adapter never mutates its source fixture (VAL-RETR-001
 * fixture immutability + the "Synthetic adapters never mutate parsed
 * source fixtures" expectation).
 */
export function loadSyntheticSmoke(args: SyntheticAdapterInit): SyntheticAdapterResult {
  const fixturePath = path.join(
    args.fixturesDir,
    "memroos-public-smoke.json",
  );
  if (!fs.existsSync(fixturePath)) {
    return { ok: false, reason: "fixture_file_not_found:" + fixturePath };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      reason: "fixture_json_malformed:" + (err instanceof Error ? err.message : String(err)),
    };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "fixture_root_not_array" };
  }
  const provenance: DatasetProvenance = {
    ...DATASET_PROVENANCE.memroos_public_synthetic,
  };
  // Deep-clone each task BEFORE stamping so we never mutate the parsed
  // source fixture. Each cloned task receives a fresh provenance block.
  const stamped: NormalizedTask[] = raw.map((t) => {
    if (typeof t !== "object" || t === null) {
      return t as NormalizedTask;
    }
    const task = deepCloneJson(t as Record<string, unknown>);
    if (!task.provenance) {
      task.provenance = { ...provenance };
    }
    if (!task.license) task.license = provenance.sourceLicense;
    if (!task.citation) task.citation = provenance.sourceCitation;
    return task as unknown as NormalizedTask;
  });
  const limit = args.limit;
  const tasks = typeof limit === "number" && limit > 0 ? stamped.slice(0, limit) : stamped;
  return {
    ok: true,
    tasks,
    provenance,
    truncated: typeof limit === "number" && limit < stamped.length,
    totalAvailable: stamped.length,
  };
}

/**
 * Stable hash over the synthetic fixture identity (id, dataset, task_type
 * only). Used to tag reports without storing raw text bodies.
 */
export function hashSyntheticSmoke(tasks: NormalizedTask[]): string {
  const canonical = JSON.stringify(
    tasks.map((t) => ({
      id: t.id,
      dataset: t.dataset,
      task_type: t.task_type,
      question_len: t.question.length,
      expected_len: t.expected_answer.length,
      evidence_count: (t.evidence_spans ?? []).length,
    })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}
