/**
 * Graph catchup — incremental / one-shot projection of episodic (SQLite) and
 * vector (mem0/Qdrant) memories into Neo4j as `:MemoryFact` nodes via
 * idempotent MERGE, plus optional `:MemoryEntity` + `:MENTIONS` edges.
 *
 * Shared by the in-app scheduler, HTTP lifecycle route, and CLI runners.
 *
 * Vector source notes:
 * - mem0 `/memory/all` is capped (~100). Prefer Qdrant scroll for full catchup.
 * - One-shot mode paginates Qdrant and rate-limits Neo4j writes for Aura Free.
 */
import type Database from "better-sqlite3";

import { MEM0_URL } from "@/lib/constants";
import { neo4jConfig, neo4jHttpQuery } from "@/lib/memory/backends";
import { extractEntities } from "@/lib/retrieval-bench/modules/entity-extraction";

export const GRAPH_CATCHUP_CRON_ID = "graph-catchup";
export const GRAPH_CATCHUP_CHECKPOINT_ID = "default";
export const GRAPH_CATCHUP_DEFAULT_BATCH = 50;
export const GRAPH_CATCHUP_DEFAULT_AGENT_ID = "luis";
export const GRAPH_CATCHUP_DEFAULT_WRITE_DELAY_MS = 200;
export const GRAPH_CATCHUP_DEFAULT_PAGE_SIZE = 50;

export type GraphCatchupStatus =
  | "completed"
  | "skipped"
  | "partial"
  | "failed";

export interface GraphCatchupCheckpoint {
  id: string;
  episodicLastId: number;
  vectorLastCreatedAt: string | null;
  vectorLastId: string | null;
  updatedAt: string;
}

export interface GraphProjectionItem {
  id: string;
  content: string;
  source: "episodic" | "vector";
  agentId?: string | null;
  createdAt?: string | null;
  /** Numeric cursor for episodic messages (message id). */
  episodicId?: number;
}

export interface GraphCatchupRunOptions {
  batchSize?: number;
  dryRun?: boolean;
  agentId?: string;
  /** Skip mem0/Qdrant vector projection (episodic only). */
  skipVector?: boolean;
  /** Skip SQLite episodic projection (vector only). */
  skipEpisodic?: boolean;
  /**
   * Keep paging vector source until exhausted (or maxPoints).
   * Required for full Qdrant catchup beyond a single batch.
   */
  oneshot?: boolean;
  /** Soft cap on vector points processed in oneshot mode (0 = unlimited). */
  maxPoints?: number;
  /** Delay between Neo4j writes for Aura Free (default 200ms). */
  writeDelayMs?: number;
  /** Qdrant/mem0 page size when scrolling (default 50). */
  pageSize?: number;
  /** Prefer Qdrant scroll over mem0 /memory/all (default true when QDRANT_URL set). */
  useQdrantScroll?: boolean;
  /** Also MERGE MemoryEntity + MENTIONS from deterministic extraction. */
  projectEntities?: boolean;
  now?: Date;
  /** Injectable Neo4j write for tests. */
  projectFact?: (item: GraphProjectionItem) => Promise<void>;
  /** Injectable mem0 fetch for tests (legacy all-at-once). */
  fetchVectorMemories?: (agentId: string) => Promise<unknown[]>;
  /** Injectable paginated vector fetch (cursor-based). */
  fetchVectorPage?: (
    cursor: string | null,
    limit: number,
    agentId: string
  ) => Promise<{ items: unknown[]; nextCursor: string | null }>;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export interface GraphCatchupSummary {
  status: GraphCatchupStatus;
  reason?: string;
  considered: number;
  projected: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  neo4jConfigured: boolean;
  pages?: number;
  neo4jBefore?: number;
  neo4jAfter?: number;
  checkpointBefore: GraphCatchupCheckpoint;
  checkpointAfter: GraphCatchupCheckpoint;
  sources: {
    episodic: { considered: number; projected: number; errors: number };
    vector: { considered: number; projected: number; errors: number };
  };
  errorSamples?: string[];
}

function toIso(value: Date): string {
  return value.toISOString();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultLog(message: string, extra?: Record<string, unknown>): void {
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[graph-catchup] ${message}`, extra);
    return;
  }
  console.log(`[graph-catchup] ${message}`);
}

export function isNeo4jConfigured(
  config: { password?: string } = neo4jConfig()
): boolean {
  return Boolean(config.password && String(config.password).trim());
}

export function ensureGraphCatchupSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_catchup_checkpoints (
      id                      TEXT PRIMARY KEY,
      episodic_last_id        INTEGER NOT NULL DEFAULT 0,
      vector_last_created_at  TEXT,
      vector_last_id          TEXT,
      updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO graph_catchup_checkpoints (id, episodic_last_id)
     VALUES (?, 0)`
  ).run(GRAPH_CATCHUP_CHECKPOINT_ID);
}

export function readGraphCatchupCheckpoint(
  db: Database.Database,
  id: string = GRAPH_CATCHUP_CHECKPOINT_ID
): GraphCatchupCheckpoint {
  ensureGraphCatchupSchema(db);
  const row = db
    .prepare(
      `SELECT id, episodic_last_id, vector_last_created_at, vector_last_id, updated_at
       FROM graph_catchup_checkpoints WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        episodic_last_id: number;
        vector_last_created_at: string | null;
        vector_last_id: string | null;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return {
      id,
      episodicLastId: 0,
      vectorLastCreatedAt: null,
      vectorLastId: null,
      updatedAt: new Date(0).toISOString(),
    };
  }

  return {
    id: row.id,
    episodicLastId: Number(row.episodic_last_id ?? 0),
    vectorLastCreatedAt:
      typeof row.vector_last_created_at === "string" ? row.vector_last_created_at : null,
    vectorLastId: typeof row.vector_last_id === "string" ? row.vector_last_id : null,
    updatedAt: String(row.updated_at),
  };
}

export function writeGraphCatchupCheckpoint(
  db: Database.Database,
  checkpoint: Omit<GraphCatchupCheckpoint, "updatedAt"> & { updatedAt?: string }
): GraphCatchupCheckpoint {
  ensureGraphCatchupSchema(db);
  const updatedAt = checkpoint.updatedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO graph_catchup_checkpoints (
       id, episodic_last_id, vector_last_created_at, vector_last_id, updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       episodic_last_id = excluded.episodic_last_id,
       vector_last_created_at = excluded.vector_last_created_at,
       vector_last_id = excluded.vector_last_id,
       updated_at = excluded.updated_at`
  ).run(
    checkpoint.id,
    checkpoint.episodicLastId,
    checkpoint.vectorLastCreatedAt,
    checkpoint.vectorLastId,
    updatedAt
  );
  return readGraphCatchupCheckpoint(db, checkpoint.id);
}

export function mapEpisodicMessageToProjection(row: {
  id: number;
  content: string;
  agent_id?: string | null;
  timestamp?: string | null;
}): GraphProjectionItem {
  return {
    id: `episodic:${row.id}`,
    content: String(row.content ?? "").slice(0, 8000),
    source: "episodic",
    agentId: row.agent_id ?? null,
    createdAt: row.timestamp ?? null,
    episodicId: row.id,
  };
}

/** Normalize a Qdrant scroll point or mem0 memory row into a flat record. */
export function normalizeVectorMemoryRaw(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.payload && typeof row.payload === "object") {
    const payload = row.payload as Record<string, unknown>;
    return {
      ...payload,
      id: row.id ?? payload.id,
    };
  }
  return row;
}

/**
 * Map mem0 / Qdrant memory rows into a GraphProjectionItem.
 * Accepts mem0 shape (`memory`) and Qdrant payload shape (`data`).
 */
export function mapVectorMemoryToProjection(
  item: unknown,
  index = 0
): GraphProjectionItem | null {
  const row = normalizeVectorMemoryRaw(item);
  if (!row) return null;

  const content =
    typeof row.memory === "string"
      ? row.memory
      : typeof row.data === "string"
        ? row.data
        : typeof row.content === "string"
          ? row.content
          : typeof row.text === "string"
            ? row.text
            : null;
  if (!content || !content.trim()) return null;

  const idRaw = row.id ?? row.memory_id ?? row.uuid;
  const id =
    typeof idRaw === "string" || typeof idRaw === "number"
      ? String(idRaw)
      : `vector-anon-${index}`;

  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : typeof row.ingested_at === "string"
        ? row.ingested_at
        : typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.timestamp === "string"
            ? row.timestamp
            : null;

  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;

  const agentId =
    typeof row.user_id === "string"
      ? row.user_id
      : typeof row.agent_id === "string"
        ? row.agent_id
        : typeof metadata?.saved_by_agent === "string"
          ? metadata.saved_by_agent
          : null;

  return {
    id: `vector:${id}`,
    content: content.slice(0, 8000),
    source: "vector",
    agentId,
    createdAt,
  };
}

/** True when candidate is strictly after the vector checkpoint cursor. */
export function isAfterVectorCursor(
  item: { createdAt?: string | null; id: string },
  cursor: { vectorLastCreatedAt: string | null; vectorLastId: string | null }
): boolean {
  if (!cursor.vectorLastCreatedAt && !cursor.vectorLastId) return true;
  const created = item.createdAt ?? "";
  const cursorCreated = cursor.vectorLastCreatedAt ?? "";
  if (created && cursorCreated) {
    if (created > cursorCreated) return true;
    if (created < cursorCreated) return false;
    const itemKey = item.id.startsWith("vector:") ? item.id.slice(7) : item.id;
    const cursorKey = cursor.vectorLastId ?? "";
    return itemKey > cursorKey;
  }
  if (created && !cursorCreated) return true;
  if (!created && cursorCreated) return false;
  const itemKey = item.id.startsWith("vector:") ? item.id.slice(7) : item.id;
  const cursorKey = cursor.vectorLastId ?? "";
  return itemKey > cursorKey;
}

export function buildMemoryFactMergeCypher(): string {
  return `MERGE (n:MemoryFact {id: $id})
SET n.content = $content,
    n.source = $source,
    n.agentId = coalesce($agentId, n.agentId),
    n.createdAt = coalesce($createdAt, n.createdAt),
    n.updatedAt = datetime(),
    n.projectedBy = 'graph-catchup'
RETURN n.id AS id`;
}

export async function countNeo4jNodes(
  queryFn: typeof neo4jHttpQuery = neo4jHttpQuery
): Promise<number> {
  const body = await queryFn("MATCH (n) RETURN count(n) AS count", {}, 8000);
  const row = body.results?.[0]?.data?.[0]?.row?.[0];
  return typeof row === "number" ? row : Number(row) || 0;
}

async function projectEntitiesForFact(
  item: GraphProjectionItem,
  queryFn: typeof neo4jHttpQuery
): Promise<void> {
  const extracted = extractEntities(item.content, {
    seed: 0,
    limits: { maxEntitiesPerTask: 6, maxExpansionPerEntity: 4 },
  });
  if (extracted.entities.length === 0) return;

  const entities = extracted.entities
    .filter((e) => e.id && e.canonical && !(e.kind === "unknown" && e.canonical.length < 3))
    .map((e) => ({
      id: e.id,
      name: e.surface.slice(0, 120),
      kind: e.kind,
      canonical: e.canonical.slice(0, 120),
    }));
  if (entities.length === 0) return;

  await queryFn(
    `UNWIND $entities AS entity
     MERGE (n:MemoryEntity {id: entity.id})
     SET n.name = entity.name,
         n.kind = entity.kind,
         n.canonical = entity.canonical,
         n.updatedAt = datetime(),
         n.projectedBy = 'graph-catchup'
     WITH entity
     MATCH (f:MemoryFact {id: $factId})
     MATCH (e:MemoryEntity {id: entity.id})
     MERGE (f)-[r:MENTIONS]->(e)
     SET r.updatedAt = datetime()
     RETURN count(r) AS written`,
    { entities, factId: item.id },
    12_000
  );
}

export async function projectMemoryFact(
  item: GraphProjectionItem,
  options: {
    dryRun?: boolean;
    queryFn?: typeof neo4jHttpQuery;
    projectEntities?: boolean;
  } = {}
): Promise<"projected" | "dry_run"> {
  if (options.dryRun) return "dry_run";
  const queryFn = options.queryFn ?? neo4jHttpQuery;
  await queryFn(
    buildMemoryFactMergeCypher(),
    {
      id: item.id,
      content: item.content,
      source: item.source,
      agentId: item.agentId ?? null,
      createdAt: item.createdAt ?? null,
    },
    8000
  );
  if (options.projectEntities !== false) {
    try {
      await projectEntitiesForFact(item, queryFn);
    } catch (err) {
      // Entity edges are best-effort; fact MERGE already succeeded.
      console.warn(
        "[graph-catchup] entity projection failed",
        item.id,
        err instanceof Error ? err.message : err
      );
    }
  }
  return "projected";
}

async function defaultFetchVectorMemories(agentId: string): Promise<unknown[]> {
  const params = new URLSearchParams({ agent_id: agentId });
  const response = await fetch(`${MEM0_URL}/memory/all?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`mem0 /memory/all failed: HTTP ${response.status}`);
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (Array.isArray(body.memories)) return body.memories;
  if (Array.isArray(body.results)) return body.results;
  if (Array.isArray(body)) return body;
  return [];
}

export async function scrollQdrantPoints(
  cursor: string | null,
  limit: number,
  options: {
    url?: string;
    apiKey?: string;
    collection?: string;
  } = {}
): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const url = (options.url ?? process.env.QDRANT_URL ?? "").replace(/\/$/, "");
  if (!url) throw new Error("QDRANT_URL is not configured");
  const apiKey = options.apiKey ?? process.env.QDRANT_API_KEY ?? "";
  const collection =
    options.collection ??
    process.env.QDRANT_COLLECTION ??
    process.env.MEM0_COLLECTION ??
    "agent_memory_local";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const body: Record<string, unknown> = {
    limit,
    with_payload: true,
    with_vector: false,
  };
  if (cursor) body.offset = cursor;

  const response = await fetch(
    `${url}/collections/${encodeURIComponent(collection)}/points/scroll`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Qdrant scroll failed: HTTP ${response.status}`);
  }
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const points = Array.isArray(result.points) ? result.points : [];
  const next =
    result.next_page_offset === undefined || result.next_page_offset === null
      ? null
      : String(result.next_page_offset);
  return { items: points, nextCursor: next };
}

function selectEpisodicBatch(
  db: Database.Database,
  afterId: number,
  limit: number
): Array<{ id: number; content: string; agent_id: string; timestamp: string }> {
  return db
    .prepare(
      `SELECT id, content, agent_id, timestamp
       FROM messages
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(afterId, limit) as Array<{
    id: number;
    content: string;
    agent_id: string;
    timestamp: string;
  }>;
}

/**
 * Run one incremental catchup cycle (or a full oneshot when options.oneshot).
 * Advances the SQLite checkpoint only for successfully projected items.
 */
export async function runGraphCatchup(
  db: Database.Database,
  options: GraphCatchupRunOptions = {}
): Promise<GraphCatchupSummary> {
  ensureGraphCatchupSchema(db);
  const dryRun = Boolean(options.dryRun);
  const batchSize = Math.max(1, Math.min(options.batchSize ?? GRAPH_CATCHUP_DEFAULT_BATCH, 200));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? GRAPH_CATCHUP_DEFAULT_PAGE_SIZE, 200));
  const writeDelayMs = Math.max(
    0,
    options.writeDelayMs ??
      Number(process.env.GRAPH_CATCHUP_WRITE_DELAY_MS ?? GRAPH_CATCHUP_DEFAULT_WRITE_DELAY_MS)
  );
  const maxPoints = Math.max(0, options.maxPoints ?? 0);
  const oneshot = Boolean(options.oneshot);
  const projectEntities = options.projectEntities !== false;
  const agentId = options.agentId ?? process.env.GRAPH_CATCHUP_AGENT_ID ?? GRAPH_CATCHUP_DEFAULT_AGENT_ID;
  const now = options.now ?? new Date();
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? defaultLog;
  const checkpointBefore = readGraphCatchupCheckpoint(db);
  const neo4jConfigured = isNeo4jConfigured();
  const useQdrantScroll =
    options.useQdrantScroll ??
    Boolean(process.env.QDRANT_URL && String(process.env.QDRANT_URL).trim());

  const summary: GraphCatchupSummary = {
    status: "completed",
    considered: 0,
    projected: 0,
    skipped: 0,
    errors: 0,
    dryRun,
    neo4jConfigured,
    pages: 0,
    checkpointBefore,
    checkpointAfter: checkpointBefore,
    sources: {
      episodic: { considered: 0, projected: 0, errors: 0 },
      vector: { considered: 0, projected: 0, errors: 0 },
    },
    errorSamples: [],
  };

  if (!neo4jConfigured && !dryRun) {
    summary.status = "skipped";
    summary.reason = "neo4j_not_configured";
    return summary;
  }

  if (!dryRun) {
    try {
      summary.neo4jBefore = await countNeo4jNodes();
    } catch {
      summary.neo4jBefore = undefined;
    }
  }

  let episodicLastId = checkpointBefore.episodicLastId;
  let vectorLastCreatedAt = checkpointBefore.vectorLastCreatedAt;
  let vectorLastId = checkpointBefore.vectorLastId;

  const project =
    options.projectFact ??
    (async (item: GraphProjectionItem) => {
      await projectMemoryFact(item, { dryRun, projectEntities });
    });

  if (!options.skipEpisodic) {
    // Episodic: page through until oneshot exhausted or single batch.
    for (;;) {
      const rows = selectEpisodicBatch(db, episodicLastId, batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        const item = mapEpisodicMessageToProjection(row);
        if (!item.content.trim()) {
          summary.skipped += 1;
          episodicLastId = row.id;
          continue;
        }
        summary.considered += 1;
        summary.sources.episodic.considered += 1;
        try {
          await project(item);
          summary.projected += 1;
          summary.sources.episodic.projected += 1;
          episodicLastId = row.id;
          if (writeDelayMs > 0 && !dryRun) await sleep(writeDelayMs);
        } catch (err) {
          summary.errors += 1;
          summary.sources.episodic.errors += 1;
          const message = err instanceof Error ? err.message : String(err);
          if ((summary.errorSamples?.length ?? 0) < 8) summary.errorSamples?.push(message);
          console.error("[graph-catchup] episodic project failed", row.id, err);
          break;
        }
      }
      if (!oneshot || rows.length < batchSize) break;
      if (summary.errors > 0) break;
    }
  }

  if (!options.skipVector) {
    try {
      let cursor: string | null = null;
      let vectorProcessed = 0;

      const fetchPage =
        options.fetchVectorPage ??
        (useQdrantScroll
          ? async (pageCursor: string | null, limit: number) =>
              scrollQdrantPoints(pageCursor, limit)
          : null);

      if (fetchPage) {
        for (;;) {
          if (maxPoints > 0 && vectorProcessed >= maxPoints) break;
          const page = await fetchPage(cursor, pageSize, agentId);
          summary.pages = (summary.pages ?? 0) + 1;
          const mapped: GraphProjectionItem[] = [];
          for (let index = 0; index < page.items.length; index += 1) {
            const item = mapVectorMemoryToProjection(page.items[index], index);
            if (!item) {
              summary.skipped += 1;
              continue;
            }
            mapped.push(item);
          }

          if (mapped.length === 0 && !page.nextCursor) break;

          for (const item of mapped) {
            if (maxPoints > 0 && vectorProcessed >= maxPoints) break;
            vectorProcessed += 1;

            // Oneshot full rebuild: project all; incremental: respect cursor.
            if (
              !oneshot &&
              !isAfterVectorCursor(item, { vectorLastCreatedAt, vectorLastId })
            ) {
              summary.skipped += 1;
              continue;
            }

            summary.considered += 1;
            summary.sources.vector.considered += 1;
            try {
              await project(item);
              summary.projected += 1;
              summary.sources.vector.projected += 1;
              vectorLastCreatedAt = item.createdAt ?? vectorLastCreatedAt;
              vectorLastId = item.id.startsWith("vector:") ? item.id.slice(7) : item.id;
              if (writeDelayMs > 0 && !dryRun) await sleep(writeDelayMs);
            } catch (err) {
              summary.errors += 1;
              summary.sources.vector.errors += 1;
              const message = err instanceof Error ? err.message : String(err);
              if ((summary.errorSamples?.length ?? 0) < 8) summary.errorSamples?.push(message);
              console.error("[graph-catchup] vector project failed", item.id, err);
              // Continue oneshot on single-item failure; stop incremental.
              if (!oneshot) break;
            }
          }

          log("vector page", {
            page: summary.pages,
            pageItems: mapped.length,
            projected: summary.sources.vector.projected,
            errors: summary.sources.vector.errors,
            next: page.nextCursor ? "yes" : "no",
          });

          cursor = page.nextCursor;
          if (!cursor) break;
          if (!oneshot) break; // incremental: one page per cron tick
        }
      } else {
        // Legacy mem0 /memory/all path (capped ~100).
        const fetchMemories = options.fetchVectorMemories ?? defaultFetchVectorMemories;
        const raw = await fetchMemories(agentId);
        summary.pages = 1;
        const mapped = raw
          .map((item, index) => mapVectorMemoryToProjection(item, index))
          .filter((item): item is GraphProjectionItem => item !== null)
          .filter((item) =>
            oneshot
              ? true
              : isAfterVectorCursor(item, {
                  vectorLastCreatedAt,
                  vectorLastId,
                })
          )
          .sort((a, b) => {
            const ac = a.createdAt ?? "";
            const bc = b.createdAt ?? "";
            if (ac !== bc) return ac < bc ? -1 : 1;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          })
          .slice(0, oneshot ? raw.length : batchSize);

        for (const item of mapped) {
          summary.considered += 1;
          summary.sources.vector.considered += 1;
          try {
            await project(item);
            summary.projected += 1;
            summary.sources.vector.projected += 1;
            vectorLastCreatedAt = item.createdAt ?? vectorLastCreatedAt;
            vectorLastId = item.id.startsWith("vector:") ? item.id.slice(7) : item.id;
            if (writeDelayMs > 0 && !dryRun) await sleep(writeDelayMs);
          } catch (err) {
            summary.errors += 1;
            summary.sources.vector.errors += 1;
            const message = err instanceof Error ? err.message : String(err);
            if ((summary.errorSamples?.length ?? 0) < 8) summary.errorSamples?.push(message);
            console.error("[graph-catchup] vector project failed", item.id, err);
            if (!oneshot) break;
          }
        }
      }
    } catch (err) {
      summary.errors += 1;
      summary.sources.vector.errors += 1;
      summary.reason =
        summary.reason ??
        `vector_fetch_failed:${err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120)}`;
      console.error("[graph-catchup] vector fetch failed", err);
    }
  }

  const nextCheckpoint: GraphCatchupCheckpoint = {
    id: GRAPH_CATCHUP_CHECKPOINT_ID,
    episodicLastId,
    vectorLastCreatedAt,
    vectorLastId,
    updatedAt: toIso(now),
  };

  if (!dryRun) {
    summary.checkpointAfter = writeGraphCatchupCheckpoint(db, nextCheckpoint);
    try {
      summary.neo4jAfter = await countNeo4jNodes();
    } catch {
      summary.neo4jAfter = undefined;
    }
  } else {
    summary.checkpointAfter = nextCheckpoint;
  }

  if (summary.errors > 0 && summary.projected > 0) summary.status = "partial";
  else if (summary.errors > 0 && summary.projected === 0) summary.status = "failed";
  else summary.status = "completed";

  log("complete", {
    status: summary.status,
    considered: summary.considered,
    projected: summary.projected,
    skipped: summary.skipped,
    errors: summary.errors,
    neo4jBefore: summary.neo4jBefore,
    neo4jAfter: summary.neo4jAfter,
  });

  return summary;
}

/** Alias used by the durable scheduler path (same implementation). */
export const runIncrementalGraphCatchup = runGraphCatchup;

/**
 * Compatibility helper for Qdrant scroll payloads → typed vector point.
 * Prefer `mapVectorMemoryToProjection` for projection into Neo4j.
 */
export function normalizeVectorMemoryPoint(raw: unknown): {
  id: string;
  content: string;
  userId?: string;
  hash?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
} | null {
  const flat = normalizeVectorMemoryRaw(raw);
  if (!flat) return null;
  const mapped = mapVectorMemoryToProjection(flat);
  const idRaw = flat.id ?? flat.memory_id;
  const id = typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw) : mapped?.id?.replace(/^vector:/, "");
  if (!id) return null;
  return {
    id,
    content: mapped?.content ?? "",
    userId: mapped?.agentId ?? undefined,
    hash: typeof flat.hash === "string" ? flat.hash : undefined,
    createdAt: mapped?.createdAt ?? undefined,
    metadata:
      flat.metadata && typeof flat.metadata === "object"
        ? (flat.metadata as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Pure projection preview (no Neo4j I/O) for tests / inspection.
 * Live writes go through `projectMemoryFact` which MERGEs MemoryFact + entities.
 */
export function projectMemoryToGraph(input: {
  id: string;
  content: string;
  userId?: string;
  hash?: string;
  createdAt?: string;
}): {
  skipped: boolean;
  reason?: string;
  fact: { id: string; content: string; source: string; hash?: string } | null;
  entities: Array<{ id: string; name: string }>;
  relationships: Array<{ factId: string; entityId: string; type: "MENTIONS" }>;
} {
  const content = String(input.content ?? "").trim();
  if (!content) {
    return { skipped: true, reason: "empty_content", fact: null, entities: [], relationships: [] };
  }
  const extracted = extractEntities(content, {
    seed: 0,
    limits: { maxEntitiesPerTask: 6, maxExpansionPerEntity: 4 },
  });
  const entities = extracted.entities
    .filter((e) => e.id && e.canonical && !(e.kind === "unknown" && e.canonical.length < 3))
    .map((e) => ({ id: e.id, name: e.surface.slice(0, 120) }));
  return {
    skipped: false,
    fact: {
      id: input.id,
      content: content.slice(0, 8000),
      source: input.userId || "memroos",
      hash: input.hash,
    },
    entities,
    relationships: entities.map((e) => ({
      factId: input.id,
      entityId: e.id,
      type: "MENTIONS" as const,
    })),
  };
}

