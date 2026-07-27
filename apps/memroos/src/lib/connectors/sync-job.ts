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

import { callRest, callTool, initialize } from "./mcp-client";
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
  /** Which provider (or provider/tool) failed, so `degraded` is actionable. */
  degradedProviders: string[];
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

  const args: Record<string, unknown> = { ...(tool.staticArgs ?? {}) };
  if (tool.incrementalArg && state.cursorValue) {
    args[tool.incrementalArg] = state.cursorValue;
  }

  // Each provider paginates differently, and the page-index form has no
  // natural "no more pages" signal — a short page is the only stop condition.
  if (tool.pagination === "page-index") {
    args.pageIndex = state.pageCursor ? Number(state.pageCursor) : 0;
  } else if (state.pageCursor) {
    args[tool.cursorArg ?? "cursor"] = state.pageCursor;
  }

  let payload: unknown;
  if (manifest.transport === "rest") {
    args.page_size = CONNECTOR_PAGE_SIZE;
    ({ payload } = await callRest(manifest.endpoint, accessToken, {
      method: tool.method ?? "POST",
      path: tool.path ?? "/",
      headers: tool.headers,
      body: args,
    }));
  } else {
    args.limit = CONNECTOR_PAGE_SIZE;
    ({ payload } = await callTool(
      manifest.endpoint,
      accessToken,
      tool.tool,
      args,
    ));
  }

  // `resultKey: null` means the payload IS the array (Circleback). Reading it
  // through a key would silently yield zero records instead of failing.
  const raw =
    tool.resultKey === null
      ? payload
      : (payload as Record<string, unknown>)?.[tool.resultKey];
  const records = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : [];

  let written = 0;
  let duplicates = 0;
  let skipped = 0;
  let newestSeen = state.cursorValue;

  // Set only when the whole page was processed. If the budget cuts the loop
  // short, the high-water mark must NOT advance: records arrive newest-first,
  // so a mark derived from the processed prefix would jump past the unread
  // tail and those records would never be requested again.
  let pageComplete = true;

  for (const record of records) {
    if (written >= opts.budget) {
      pageComplete = false;
      break;
    }

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

    const ts = record[tool.timestampField];
    if (typeof ts === "string" && (!newestSeen || ts > newestSeen)) {
      newestSeen = ts;
    }
  }

  const obj = (payload ?? {}) as Record<string, unknown>;
  let hasNextPage: boolean;
  let nextCursor: string | null;

  if (tool.pagination === "page-index") {
    // No cursor and no hasNextPage field — a full page implies more, a short
    // page means the sweep is done.
    hasNextPage = records.length >= CONNECTOR_PAGE_SIZE;
    const current = state.pageCursor ? Number(state.pageCursor) : 0;
    nextCursor = hasNextPage ? String(current + 1) : null;
  } else {
    hasNextPage = obj[tool.hasMoreField ?? "hasNextPage"] === true;
    const c = obj[tool.cursorField ?? "cursor"];
    nextCursor = typeof c === "string" ? c : null;
  }

  // A budget-truncated page is not done: leave the page cursor where it was so
  // the next cycle re-reads the same page and picks up the tail.
  const moreWork = hasNextPage || !pageComplete;

  writeSyncState(db, {
    connectionId,
    providerKey: manifest.providerKey,
    tool: tool.tool,
    // Advance the high-water mark only when the sweep finished AND the last
    // page was fully processed. Either alone is not enough — advancing on a
    // truncated page permanently strands its unread tail.
    cursorValue: moreWork ? state.cursorValue : newestSeen,
    pageCursor: pageComplete ? (hasNextPage ? nextCursor : null) : state.pageCursor,
    status: moreWork ? "backfilling" : "ok",
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
  const degradedProviders: string[] = [];

  try {
    const connections = await listNangoConnections();

    for (const conn of connections) {
      const manifest = getManifest(conn.providerKey);
      if (!manifest) continue; // no sync manifest — credential brokerage only
      if (written >= CONNECTOR_CYCLE_LIMIT) break;

      // Per-connection boundary. Providers are iterated in a stable order, so
      // without this one provider that throws every cycle would starve every
      // provider after it — permanently, and reported only as `degraded`.
      try {
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

        // REST providers have no handshake; only MCP needs initialize.
        if (manifest.transport === "mcp") {
          await initialize(manifest.endpoint, creds.accessToken);
        }

        for (const tool of manifest.tools) {
          if (written >= CONNECTOR_CYCLE_LIMIT) break;
          // Per-tool boundary for the same reason: one broken tool must not
          // cost the provider its other tools.
          try {
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
          } catch (err) {
            degradedProviders.push(`${conn.providerKey}/${tool.tool}`);
            console.error(
              `[connectors] ${conn.providerKey}/${tool.tool} failed:`,
              err,
            );
          }
        }
      } catch (err) {
        degradedProviders.push(conn.providerKey);
        console.error(`[connectors] ${conn.providerKey} failed:`, err);
      }
    }

    return {
      written,
      duplicates,
      skipped,
      degraded: degradedProviders.length > 0,
      degradedProviders,
    };
  } catch (err) {
    console.error("[connectors] sync cycle failed:", err);
    return { written, duplicates, skipped, degraded: true, degradedProviders };
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
