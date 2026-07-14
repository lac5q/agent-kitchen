/**
 * GET /api/library/freshness
 *
 * Returns per-collection freshness state for the Library UI.
 * Compares latest source file mtime against qmd index timestamp.
 *
 * Auth: requires valid session (any authenticated user).
 *
 * The freshness state machine is bounded by `serializeQmdUpdate` and
 * `finalizeQmdUpdate` from `@/lib/memory/qmd`. The route forwards the most
 * recent `memory_qmd_updates` row alongside the per-collection freshness so
 * callers see one canonical bounded freshness state (pending | success |
 * failed | cancelled | timeout) -- VAL-MEM-012 forbids ambiguous freshness.
 *
 * Response shape:
 * {
 *   collections: CollectionFreshness[];
 *   timestamp: string;          // ISO-8601
 *   isUpdating: boolean;        // true when qmd update is known to be running
 *   qmd: {                      // bounded freshness state from memory_qmd_updates
 *     updateId: string | null;
 *     status: "pending" | "success" | "failed" | "cancelled" | "timeout" | null;
 *     lastSuccessTimestamp: string | null;
 *     sourceHash: string | null;
 *     freshnessTimestamp: string | null;
 *   };
 * }
 */

import { stat } from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import {
  loadCollections,
  collectCollectionFiles,
} from "@/lib/knowledge-collections";
import { computeFreshnessState, type CollectionFreshness } from "@/lib/library/qmd-freshness";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Staleness threshold: 2 hours before a live index is considered stale. */
const STALENESS_THRESHOLD_MS = 2 * 60 * 60 * 1_000;

interface QmdUpdateRow {
  id: string;
  status: "pending" | "success" | "failed" | "cancelled" | "timeout";
  source_hash: string;
  freshness_timestamp: string;
  last_success_timestamp: string | null;
}

function tableExists(db: ReturnType<typeof getDb>, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function latestBoundedQmdUpdate(): QmdUpdateRow | null {
  try {
    const db = getDb();
    if (!tableExists(db, "memory_qmd_updates")) return null;
    const row = db
      .prepare(
        `SELECT id, status, source_hash, freshness_timestamp, last_success_timestamp
         FROM memory_qmd_updates
         ORDER BY freshness_timestamp DESC, id DESC
         LIMIT 1`
      )
      .get() as QmdUpdateRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Attempt to find the qmd index SQLite file and read its mtime as the
 * best available proxy for "when qmd update last completed".
 *
 * Falls back to null (missing state) when QMD_INDEX_PATH is unset and
 * the default cache location is unreadable.
 */
async function readQmdIndexTimestamp(): Promise<Date | null> {
  const candidates = [
    process.env.QMD_INDEX_PATH,
    process.env.HOME ? path.join(process.env.HOME, ".cache/qmd/index.sqlite") : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      return s.mtime;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Walk a collection's source paths and find the maximum mtime across all files.
 * Returns null when the path doesn't exist or is empty.
 */
async function latestSourceMtime(col: ReturnType<typeof loadCollections>[number]): Promise<Date | null> {
  try {
    const files = await collectCollectionFiles(col);
    if (files.length === 0) return null;
    return files.reduce<Date | null>(
      (latest, f) => (!latest || f.mtime > latest ? f.mtime : latest),
      null
    );
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collections = loadCollections();
  const indexTimestamp = await readQmdIndexTimestamp();

  // The qmd-update route calls serializeQmdUpdate / finalizeQmdUpdate on every
  // lifecycle event so memory_qmd_updates is the authoritative bounded freshness
  // surface. The freshness route reports the most recent bounded state so the
  // UI cannot see ambiguous "is it running?" values.
  const boundedUpdate = latestBoundedQmdUpdate();

  const collectionFreshness: CollectionFreshness[] = await Promise.all(
    collections.map(async (col) => {
      const sourceMtime = await latestSourceMtime(col);
      return computeFreshnessState({
        collection: col.name,
        sourceMtime,
        indexTimestamp,
        stalenessThresholdMs: STALENESS_THRESHOLD_MS,
      });
    })
  );

  return Response.json({
    collections: collectionFreshness,
    timestamp: new Date().toISOString(),
    isUpdating: boundedUpdate?.status === "pending",
    qmd: {
      updateId: boundedUpdate?.id ?? null,
      status: boundedUpdate?.status ?? null,
      lastSuccessTimestamp: boundedUpdate?.last_success_timestamp ?? null,
      sourceHash: boundedUpdate?.source_hash ?? null,
      freshnessTimestamp: boundedUpdate?.freshness_timestamp ?? null,
    },
  });
}
