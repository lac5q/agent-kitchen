/**
 * MSIQ-05 (VAL-ORCH-010): Deterministic federated merge.
 *
 * Authorized duplicates are deduped/ranked by documented stable rules
 * and context budget. Contributing source lineage is preserved.
 * Denied duplicates cannot affect rank.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import type { FederationSourceOutcome } from "./retrieval";

export interface MergedItem {
  canonicalId: string;
  canonicalHash: string;
  sourceId: string;
  sourceHandle: string;
  sourceKind: string;
  scopeHash: string;
  score: number;
  rank: number;
  contributingOutcomeIds: string[];
  duplicateCount: number;
}

export interface AdmittedMergedCoordinate {
  canonicalId: string;
  canonicalHash: string;
  sourceId: string;
}

export interface FederationMergeInit {
  tenantId: string;
  federationRunId: string;
  outcomes: FederationSourceOutcome[];
  scopeHash: string;
  budget: {
    maxItems: number;
    maxBytes: number;
    hopCount: number;
  };
  itemsByOutcome?: Map<string, Array<{ id: string; canonicalId?: string; content: string; score: number; canonicalHash: string }>>;
}

export interface FederationMergeResult {
  packHash: string;
  packBytes: number;
  packItemCount: number;
  items: MergedItem[];
  dedupeMetadata: Record<string, unknown>;
  rankMetadata: Record<string, unknown>;
  boundStatus: "bounded" | "partial_bounded" | "over_budget";
  budgetMetadata: Record<string, unknown>;
  contributingSourceIds: string[];
  contributingOutcomeIds: string[];
}

export function mergeFederatedPack(
  db: Database.Database,
  init: FederationMergeInit,
): FederationMergeResult {
  const itemsByOutcome = init.itemsByOutcome ?? new Map();
  const allowedOutcomes = init.outcomes.filter(
    (o) => o.outcome === "success" && o.policyDecision.kind === "allow"
  );
  const deniedOutcomes = init.outcomes.filter(
    (o) => o.outcome === "denied" || o.policyDecision.kind === "deny"
  );
  void deniedOutcomes;
  const dedupeKey = new Map<string, MergedItem>();
  let totalBytes = 0;
  let boundStatus: FederationMergeResult["boundStatus"] = "bounded";
  const deniedKeys = new Set<string>();
  for (const d of init.outcomes) {
    if (d.outcome === "denied") {
      // Denied sources must NOT affect the rank of duplicate keys.
      const items = itemsByOutcome.get(d.outcomeId) ?? [];
      for (const it of items) deniedKeys.add(it.canonicalHash);
    }
  }
  for (const outcome of allowedOutcomes) {
    const items = itemsByOutcome.get(outcome.outcomeId) ?? [];
    for (const it of items) {
      if (deniedKeys.has(it.canonicalHash)) continue;
      const size = Buffer.byteLength(it.content, "utf8");
      const existing = dedupeKey.get(it.canonicalHash);
      if (existing) {
        existing.duplicateCount += 1;
        existing.contributingOutcomeIds.push(outcome.outcomeId);
        continue;
      }
      if (totalBytes + size > init.budget.maxBytes) {
        boundStatus = "over_budget";
        break;
      }
      if (dedupeKey.size >= init.budget.maxItems) {
        boundStatus = "partial_bounded";
        break;
      }
      dedupeKey.set(it.canonicalHash, {
        canonicalId: it.canonicalId ?? it.id,
        canonicalHash: it.canonicalHash,
        sourceId: outcome.sourceId,
        sourceHandle: outcome.sourceHandle,
        sourceKind: outcome.sourceKind,
        scopeHash: outcome.scopeHash,
        score: it.score,
        rank: 0,
        contributingOutcomeIds: [outcome.outcomeId],
        duplicateCount: 0,
      });
      totalBytes += size;
    }
  }
  // Deterministic rank: descending score, then source_handle (asc), then canonicalHash (asc)
  const ranked = [...dedupeKey.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.sourceHandle !== b.sourceHandle) return a.sourceHandle.localeCompare(b.sourceHandle);
    return a.canonicalHash.localeCompare(b.canonicalHash);
  });
  ranked.forEach((item, idx) => { item.rank = idx + 1; });
  const packPayload = stableJson({
    run_id: init.federationRunId,
    items: ranked.map((it) => ({
      canonical_hash: it.canonicalHash,
      source_id: it.sourceId,
      source_handle: it.sourceHandle,
      source_kind: it.sourceKind,
      score: it.score,
      rank: it.rank,
      contributing_outcome_ids: it.contributingOutcomeIds,
    })),
  });
  const packHash = sha256String(packPayload);
  const packBytes = Buffer.byteLength(packPayload, "utf8");
  const dedupeMetadata = {
    duplicates_total: ranked.reduce((n, it) => n + it.duplicateCount, 0),
    dedupe_keys: dedupeKey.size,
    hop_count: init.budget.hopCount,
  };
  const rankMetadata = { rule: "score_desc,source_handle_asc,canonical_hash_asc", tie_break: "deterministic" };
  const budgetMetadata = {
    max_items: init.budget.maxItems,
    max_bytes: init.budget.maxBytes,
    used_bytes: totalBytes,
    used_items: ranked.length,
  };
  const contributingSourceIds = [...new Set(ranked.map((it) => it.sourceId))];
  const contributingOutcomeIds = [...new Set(ranked.flatMap((it) => it.contributingOutcomeIds))];
  const admittedCoordinates: AdmittedMergedCoordinate[] = ranked.map((item) => ({
    canonicalId: item.canonicalId,
    canonicalHash: item.canonicalHash,
    sourceId: item.sourceId,
  }));
  try {
    db.transaction(() => {
      const mergeId = "pack-" + crypto.randomUUID();
      db.prepare(
        "INSERT INTO federation_merges (id, tenant_id, federation_run_id, pack_hash, pack_bytes, pack_item_count, contributing_source_ids, contributing_outcome_ids, dedupe_metadata_json, rank_metadata_json, budget_metadata_json, bound_status, scope_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        mergeId,
        init.tenantId,
        init.federationRunId,
        packHash,
        packBytes,
        ranked.length,
        stableJson(contributingSourceIds),
        stableJson(contributingOutcomeIds),
        stableJson(dedupeMetadata),
        stableJson(rankMetadata),
        stableJson(budgetMetadata),
        boundStatus,
        init.scopeHash,
        new Date().toISOString(),
      );
      const insertCoordinate = db.prepare(
        `INSERT INTO federation_merged_coordinates
          (id, tenant_id, federation_run_id, pack_hash, canonical_id, canonical_hash, source_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const coordinate of admittedCoordinates) {
        insertCoordinate.run(
          "federation-coordinate-" + crypto.randomUUID(),
          init.tenantId,
          init.federationRunId,
          packHash,
          coordinate.canonicalId,
          coordinate.canonicalHash,
          coordinate.sourceId,
          new Date().toISOString(),
        );
      }
    })();
  } catch {
    // ignore
  }
  try {
    writeAuditEntry(
      {
        tenant_id: init.tenantId,
        actor_id: "system",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_FEDERATION_MERGE,
        entity_type: ENTITY_TYPES.FEDERATION_PACK,
        entity_id: "federation_pack:" + packHash,
        reason: "federation_merge_completed",
        metadata_json: {
          federation_run_id: init.federationRunId,
          pack_hash: packHash,
          pack_item_count: ranked.length,
          bound_status: boundStatus,
          dedupe_metadata: dedupeMetadata,
          rank_metadata: rankMetadata,
          budget_metadata: budgetMetadata,
        },
      },
      db,
    );
  } catch {
    // ignore
  }
  return {
    packHash,
    packBytes,
    packItemCount: ranked.length,
    items: ranked,
    dedupeMetadata,
    rankMetadata,
    boundStatus,
    budgetMetadata,
    contributingSourceIds,
    contributingOutcomeIds,
  };
}

function sha256String(value: string): string {
  return "sha256:" + crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeStable(v)]),
    );
  }
  return value;
}
