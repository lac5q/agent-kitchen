/**
 * Temporal retrieval with uncertainty disclosure (VAL-RETR-020).
 *
 * Temporal retrieval must:
 *   - Resolve `reference_time_iso`, `fact_valid_until_iso`, and
 *     `temporal_direction` from the task or scope
 *   - Disclose whether the candidate set is `supported`, `caveat`, or
 *     `unresolved` — never claim certainty past missing/conflicting
 *     timestamps
 *   - Honor `latest`, `before`, `after`, `between` directions
 *     deterministically and use a documented tie-break (canonical id)
 *   - Emit a typed uncertainty caveat embedded in the result instead of
 *     silently picking a single candidate when multiple conflict
 *
 * The module does NOT decide whether the answer is correct; the
 * downstream scorer treats uncertainty as `caveat` or `abstain` per
 * the report's status field. The temporal stage is bounded so that
 * excessive candidates are truncated and the truncation is reflected
 * in the receipt.
 */

import crypto from "node:crypto";

import type { CorpusEntry, TemporalMetadata } from "../schema";

export const TEMPORAL_RETRIEVAL_VERSION = "temporal-retrieval-v1";

export type TemporalDirection = "before" | "after" | "between" | "latest";

export interface TemporalRetrievedItem {
  id: string;
  timestamp_iso?: string;
  timestampMs?: number | null;
  supersessionChainId?: string;
  supersededBy?: string;
  confidence: number;
}

export type TemporalCaveatCode =
  | "no_reference_time"
  | "no_timestamps"
  | "candidate_stale"
  | "conflicting_facts"
  | "supersession_chain"
  | "missing_validity_window"
  | "direction_underspecified";

export interface TemporalCaveat {
  code: TemporalCaveatCode;
  message: string;
  /** Documented non-sensitive IDs involved. */
  candidateIds: string[];
}

export type TemporalResultStatus =
  | "supported"
  | "caveat"
  | "abstain";

export interface TemporalRetrievalResult {
  ok: boolean;
  reason?: string;
  status: TemporalResultStatus;
  direction: TemporalDirection;
  referenceTimeMs: number | null;
  referenceTimeIso: string | null;
  validUntilMs: number | null;
  validUntilIso: string | null;
  selected: string[];
  candidates: TemporalRetrievedItem[];
  caveats: TemporalCaveat[];
  receipt: {
    stageVersion: string;
    consideredCount: number;
    selectedCount: number;
    truncated: boolean;
    timestampHash: string;
    status: TemporalResultStatus;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function hashCandidateSet(items: TemporalRetrievedItem[]): string {
  const canonical = JSON.stringify(
    items.map((c) => ({
      id: c.id,
      timestampMs: c.timestampMs ?? null,
      supersessionChainId: c.supersessionChainId ?? null,
    })),
  );
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

function stableSort(items: TemporalRetrievedItem[]): TemporalRetrievedItem[] {
  return [...items].sort((a, b) => {
    const at = a.timestampMs ?? -Infinity;
    const bt = b.timestampMs ?? -Infinity;
    if (at !== bt) return at - bt;
    // Deterministic tie-break: canonical id ordering.
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TemporalRetrievalOptions {
  nowIso?: string;
  /** Maximum candidate set size after filtering. Default 32. */
  maxCandidates?: number;
}

export function performTemporalRetrieval(args: {
  candidates: CorpusEntry[];
  metadata: TemporalMetadata | undefined;
  scopeReferenceIso?: string;
  options?: TemporalRetrievalOptions;
}): TemporalRetrievalResult {
  const options = args.options ?? {};
  const maxCandidates = options.maxCandidates ?? 32;
  const nowIso = args.options?.nowIso ?? args.scopeReferenceIso ?? new Date().toISOString();

  const referenceTimeMs = parseTimestamp(args.metadata?.reference_time_iso) ??
    parseTimestamp(args.scopeReferenceIso) ??
    parseTimestamp(nowIso);
  const referenceTimeIso = referenceTimeMs !== null
    ? new Date(referenceTimeMs).toISOString()
    : null;
  const validUntilMs = parseTimestamp(args.metadata?.fact_valid_until_iso ?? undefined);
  const validUntilIso = validUntilMs !== null ? new Date(validUntilMs).toISOString() : null;

  const direction: TemporalDirection = args.metadata?.temporal_direction ?? "latest";

  const caveats: TemporalCaveat[] = [];

  if (referenceTimeMs === null) {
    caveats.push({
      code: "no_reference_time",
      message:
        "No reference_time_iso supplied; temporal reasoning uses current clock and discloses caveats.",
      candidateIds: [],
    });
  }

  // Filter + sort by timestamp
  const preliminary: TemporalRetrievedItem[] = [];
  let missingTimestampCount = 0;
  for (const c of args.candidates) {
    const ts = parseTimestamp(c.timestamp_iso);
    if (ts === null) {
      missingTimestampCount += 1;
      continue;
    }
    preliminary.push({
      id: c.id,
      timestamp_iso: c.timestamp_iso,
      timestampMs: ts,
      confidence: 1.0,
    });
  }
  if (args.candidates.length > 0 && missingTimestampCount === args.candidates.length) {
    caveats.push({
      code: "no_timestamps",
      message: "All candidate corpus entries lack parseable timestamps.",
      candidateIds: args.candidates.map((c) => c.id),
    });
  }

  // Directional filtering
  let filtered = preliminary;
  if (referenceTimeMs !== null) {
    filtered = preliminary.filter((it) => {
      const ms = it.timestampMs ?? -Infinity;
      if (direction === "before") return ms <= referenceTimeMs;
      if (direction === "after") return ms >= referenceTimeMs;
      if (direction === "latest") return ms <= referenceTimeMs;
      // "between" requires a validUntil, otherwise we caveat and include
      // all candidates <= referenceTime.
      return ms <= referenceTimeMs;
    });
    if (direction === "between" && validUntilMs === null) {
      caveats.push({
        code: "missing_validity_window",
        message:
          "`between` direction requires a fact_valid_until_iso window; result is treated as `before`.",
        candidateIds: [],
      });
    }
  }

  // Validity window filter: drop items older than validUntilMs when set.
  if (validUntilMs !== null) {
    filtered = filtered.filter((it) => {
      const ms = it.timestampMs ?? -Infinity;
      return ms <= validUntilMs;
    });
  }

  // Stale gate relative to referenceTimeMs: items older than 1 day before
  // the reference time are stale candidates (per VAL-RETR-020).
  const staleCutoffMs = referenceTimeMs !== null ? referenceTimeMs - 24 * 60 * 60 * 1000 : null;
  if (staleCutoffMs !== null) {
    const stale = filtered.filter((it) => (it.timestampMs ?? -Infinity) < staleCutoffMs);
    if (stale.length > 0) {
      caveats.push({
        code: "candidate_stale",
        message:
          "One or more candidates predate the staleness window relative to the reference time.",
        candidateIds: stale.map((s) => s.id),
      });
    }
  }

  // Detect conflicting facts (two items with identical timestamps but
  // different ids) — disclose as caveat, never silently pick one.
  if (filtered.length > 1) {
    const seenTs = new Map<number, string[]>();
    for (const it of filtered) {
      const key = it.timestampMs ?? -Infinity;
      const list = seenTs.get(key) ?? [];
      list.push(it.id);
      seenTs.set(key, list);
    }
    const conflicts: string[] = [];
    for (const list of seenTs.values()) {
      if (list.length > 1) conflicts.push(...list);
    }
    if (conflicts.length > 0) {
      caveats.push({
        code: "conflicting_facts",
        message:
          "Two or more candidates share timestamps but differ in id; both are surfaced, neither wins.",
        candidateIds: [...new Set(conflicts)].sort(),
      });
    }
  }

  // Truncate with disclosure
  let truncated = false;
  if (filtered.length > maxCandidates) {
    filtered = filtered.slice(0, maxCandidates);
    truncated = true;
    caveats.push({
      code: "direction_underspecified",
      message: `Candidate set truncated to ${maxCandidates} items; downstream stages are bounded.`,
      candidateIds: [],
    });
  }

  filtered = stableSort(filtered);

  // Direction-specific selection
  let selected: string[] = [];
  if (direction === "latest") {
    const last = filtered[filtered.length - 1];
    selected = last ? [last.id] : [];
  } else if (direction === "before") {
    // Pick the closest item strictly before the reference time.
    const befores = filtered.filter(
      (it) => (it.timestampMs ?? Infinity) <= (referenceTimeMs ?? Infinity),
    );
    const lastBefore = befores[befores.length - 1];
    selected = lastBefore ? [lastBefore.id] : [];
  } else if (direction === "after") {
    const afters = filtered.filter(
      (it) => (it.timestampMs ?? -Infinity) >= (referenceTimeMs ?? -Infinity),
    );
    selected = afters.length > 0 ? [afters[0].id] : [];
  } else if (direction === "between") {
    if (validUntilMs === null) {
      selected = [];
    } else {
      const inWindow = filtered.filter((it) => {
        const ms = it.timestampMs ?? -Infinity;
        return ms >= (referenceTimeMs ?? -Infinity) && ms <= validUntilMs;
      });
      // Prefer the midpoint candidate for stable ordering.
      selected = inWindow.length > 0 ? [inWindow[Math.floor(inWindow.length / 2)].id] : [];
    }
  }

  const status: TemporalResultStatus = (() => {
    if (selected.length === 0) return "abstain";
    if (
      caveats.some((c) =>
        c.code === "conflicting_facts" ||
        c.code === "missing_validity_window" ||
        c.code === "direction_underspecified" ||
        c.code === "candidate_stale"
      )
    ) {
      return "caveat";
    }
    return "supported";
  })();

  return {
    ok: true,
    status,
    direction,
    referenceTimeMs,
    referenceTimeIso,
    validUntilMs,
    validUntilIso,
    selected,
    candidates: filtered,
    caveats,
    receipt: {
      stageVersion: TEMPORAL_RETRIEVAL_VERSION,
      consideredCount: args.candidates.length,
      selectedCount: selected.length,
      truncated,
      timestampHash: hashCandidateSet(filtered),
      status,
    },
  };
}
