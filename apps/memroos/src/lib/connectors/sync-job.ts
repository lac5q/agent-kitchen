/**
 * Connector ingestion cycle.
 *
 * Pulls records from connected MCP providers and writes them into `messages`,
 * from which the existing embedding cycle and FTS index pick them up with no
 * changes. Deliberately mirrors `lib/embeddings/embedding-job.ts`: an interval
 * timer, a bounded per-cycle row limit, and a degraded return rather than a
 * throw when a provider misbehaves.
 *
 * Bounded on purpose. A first sync over a large workspace spans many cycles —
 * `list_issues` pages 100 at a time and every written row later costs an
 * Ollama embedding on oracle-1. The page cursor is parked in
 * `connector_sync_state` so a backfill resumes where it stopped instead of
 * restarting the sweep each interval.
 */

import type Database from "better-sqlite3";

import { getDb } from "@/lib/db";
import {
  fetchNangoCredentials,
  listNangoConnections,
} from "@/lib/tool-auth/nango-client";

import { callTool, initialize } from "./mcp-client";
import { getManifest, type ConnectorManifest, type SyncTool } from "./manifest";
import {
  ensureConnectorSpace,
  readSyncState,
  writeConnectorRecord,
  writeSyncState,
} from "./store";

/** Records pulled per (connection, tool) per cycle. One page of Linear issues. */
export const CONNECTOR_PAGE_SIZE = 100;
/** Rows written per cycle across all tools, so a backfill drains gradually. */
export const CONNECTOR_CYCLE_LIMIT = 200;
export const CONNECTOR_INTERVAL_MS = 900_000; // 15 min

let connectorJobStarted = false;

export interface ConnectorCycleResult {
  written: number;
  duplicates: number;
  skipped: number;
  degraded: boolean;
}

/**
 * Sync one tool for one connection. Returns rows written this pass.
 *
 * The high-water mark is only advanced once a full sweep completes (no next
 * page). Advancing it mid-backfill would strand every record still unfetched:
 * the next cycle would ask for changes newer than the mark and never return
 * to the older pages.
 */
async function syncTool(
  db: Database.Database,
  opts: {
    manifest: ConnectorManifest;
    tool: SyncTool;
    connectionId: string;
    accessToken: string;
    spaceId: string;
    labels: Record<string, unknown>;
    budget: number;
  },
): Promise<{ written: number; duplicates: number; skipped: number }> {
  const { manifest, tool, connectionId, accessToken, spaceId, labels } = opts;
  const state = readSyncState(db, connectionId, tool.tool);

  const args: Record<string, unknown> = { limit: CONNECTOR_PAGE_SIZE };
  if (tool.incrementalArg && state.cursorValue) {
    args[tool.incrementalArg] = state.cursorValue;
  }
  if (state.pageCursor) {
    args.cursor = state.pageCursor;
  }

  const { payload } = await callTool(
    manifest.mcpEndpoint,
    accessToken,
    tool.tool,
    args,
  );

  const records = Array.isArray(payload[tool.resultKey])
    ? (payload[tool.resultKey] as Array<Record<string, unknown>>)
    : [];

  let written = 0;
  let duplicates = 0;
  let skipped = 0;
  let newestSeen = state.cursorValue;

  for (const record of records) {
    if (written >= opts.budget) break;

    const outcome = writeConnectorRecord({
      db,
      providerKey: manifest.providerKey,
      connectionId,
      spaceId,
      labels,
      tool,
      record,
    });

    if (outcome.status === "written") written += 1;
    else if (outcome.status === "duplicate") duplicates += 1;
    else skipped += 1;

    const updatedAt = record.updatedAt;
    if (typeof updatedAt === "string" && (!newestSeen || updatedAt > newestSeen)) {
      newestSeen = updatedAt;
    }
  }

  const hasNextPage = payload.hasNextPage === true;
  const nextCursor = typeof payload.cursor === "string" ? payload.cursor : null;

  writeSyncState(db, {
    connectionId,
    providerKey: manifest.providerKey,
    tool: tool.tool,
    // Only commit the high-water mark on a completed sweep — see the note above.
    cursorValue: hasNextPage ? state.cursorValue : newestSeen,
    pageCursor: hasNextPage ? nextCursor : null,
    status: hasNextPage ? "backfilling" : "ok",
    rowsWritten: written,
  });

  return { written, duplicates, skipped };
}

export async function runConnectorCycle(
  db: Database.Database = getDb(),
  opts: { tenantId?: string } = {},
): Promise<ConnectorCycleResult> {
  const tenantId = opts.tenantId ?? "default-tenant";
  let written = 0;
  let duplicates = 0;
  let skipped = 0;

  try {
    const connections = await listNangoConnections();

    for (const conn of connections) {
      const manifest = getManifest(conn.providerKey);
      if (!manifest) continue; // no sync manifest — credential brokerage only
      if (written >= CONNECTOR_CYCLE_LIMIT) break;

      const creds = await fetchNangoCredentials(
        conn.connectionId,
        manifest.providerConfigKey,
      );
      if (!creds?.accessToken) {
        console.warn(
          `[connectors] ${conn.providerKey}: no access token; skipping`,
        );
        continue;
      }

      const { spaceId, labels } = ensureConnectorSpace(db, {
        tenantId,
        providerKey: manifest.providerKey,
      });

      await initialize(manifest.mcpEndpoint, creds.accessToken);

      for (const tool of manifest.tools) {
        if (written >= CONNECTOR_CYCLE_LIMIT) break;
        const res = await syncTool(db, {
          manifest,
          tool,
          connectionId: conn.connectionId,
          accessToken: creds.accessToken,
          spaceId,
          labels,
          budget: CONNECTOR_CYCLE_LIMIT - written,
        });
        written += res.written;
        duplicates += res.duplicates;
        skipped += res.skipped;
      }
    }

    return { written, duplicates, skipped, degraded: false };
  } catch (err) {
    console.error("[connectors] sync cycle failed:", err);
    return { written, duplicates, skipped, degraded: true };
  }
}

export function startConnectorJob(): void {
  if (connectorJobStarted) return;
  if (!process.env.NANGO_SECRET_KEY) {
    console.info("[connectors] NANGO_SECRET_KEY unset; sync job not scheduled");
    return;
  }

  connectorJobStarted = true;
  const run = () => {
    runConnectorCycle().catch((err) =>
      console.error("[connectors] unhandled sync error:", err),
    );
  };
  setInterval(run, CONNECTOR_INTERVAL_MS).unref?.();
}
