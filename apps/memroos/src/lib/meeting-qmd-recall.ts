/**
 * Meeting QMD lane helpers for unified memory recall (v8.11 / URECALL-04).
 * Discovers enabled meeting collections and shells out to `qmd search -c`.
 *
 * Phase 172 (MEETREL-FOLLOWUP-05): Each collection now surfaces a bounded
 * `SourceStatus` so operators can distinguish "not captured" from "captured
 * but not routed" from "indexed but not recalled" from "recalled".
 */
import { execFile as defaultExecFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

import {
  SOURCE_STATUS,
  SOURCE_STATUS_VALUES,
  coerceSourceStatus,
  isTerminalSourceStatus,
  type MeetingSourceStatus,
  type SourceStatus,
} from "./meeting-source-status";

const defaultExecFileAsync = promisify(defaultExecFile);

export type ExecFileAsync = (
  file: string,
  args: string[],
  options?: {
    timeout?: number;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
  }
) => Promise<{ stdout: string; stderr: string }>;


export const DEFAULT_MEETING_COLLECTIONS = [
  "meet-recordings",
  "spark-recordings",
  "meet-recordings-circleback",
  "meet-recordings-epilogue",
  "meet-recordings-personal",
  "meet-recordings-zoom",
  "meet-recordings-fathom",
] as const;

export interface MeetingQmdHit {
  id: string;
  collection: string;
  title: string;
  content: string;
  path?: string;
  score?: number;
  metadata?: unknown;
}

function expandHome(raw: string): string {
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  if (raw === "~") return homedir();
  return raw.replace(/\$HOME/g, homedir());
}

export async function loadEnabledMeetingCollections(
  configPath?: string
): Promise<string[]> {
  const candidates = [
    configPath,
    process.env.MEMROOS_MEETING_SOURCES_CONFIG,
    join(homedir(), ".memroos", "meeting-sources.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(expandHome(candidate), "utf8");
      const cfg = JSON.parse(raw) as {
        sources?: Array<{ enabled?: boolean; qmdCollections?: string[] }>;
      };
      const names: string[] = [];
      for (const source of cfg.sources || []) {
        if (!source.enabled) continue;
        for (const col of source.qmdCollections || []) {
          if (col && !names.includes(col)) names.push(col);
        }
      }
      if (names.length) return names;
    } catch {
      // try next
    }
  }
  return [...DEFAULT_MEETING_COLLECTIONS];
}

function normalizeHits(data: unknown, collection: string, limit: number): MeetingQmdHit[] {
  let items: unknown[] = [];
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const nested = record.results || record.hits || record.documents;
    items = Array.isArray(nested) ? nested : record.file ? [data] : [];
  }

  return items.slice(0, limit).map((item, index) => {
    if (!item || typeof item !== "object") {
      return {
        id: `qmd:${collection}:${index}`,
        collection,
        title: `${collection} hit`,
        content: String(item ?? ""),
      };
    }
    const row = item as Record<string, unknown>;
    const path = (row.file || row.path || row.id) as string | undefined;
    const title =
      (typeof row.title === "string" && row.title) ||
      (typeof row.name === "string" && row.name) ||
      (path ? path.split("/").pop() || collection : collection);
    const content =
      (typeof row.snippet === "string" && row.snippet) ||
      (typeof row.excerpt === "string" && row.excerpt) ||
      (typeof row.text === "string" && row.text) ||
      (typeof row.content === "string" && row.content) ||
      path ||
      "";
    const score = typeof row.score === "number" ? row.score : undefined;
    const indexedAtRaw =
      (typeof row.indexed_at === "string" && row.indexed_at) ||
      (typeof row.indexedAt === "string" && row.indexedAt) ||
      (typeof row.updated_at === "string" && row.updated_at);
    return {
      id: `qmd:${collection}:${path || index}`,
      collection,
      title: String(title),
      content: String(content).slice(0, 4000),
      path: path ? String(path) : undefined,
      score,
      metadata: indexedAtRaw
        ? { ...(item as Record<string, unknown>), indexedAt: indexedAtRaw }
        : item,
    };
  });
}

/**
 * Compute the aggregate (weakest) status across all collections.
 *
 * Semantics: if ANY collection is `provider_absent` while another is `recalled`,
 * the aggregate must surface the absent provider — `recalled` cannot mask a
 * stopped pre-flight. Mirrors `compute_aggregate_status` in the Python
 * `memory_recall` module.
 */
export function aggregateSourceStatus(
  collections: Record<string, MeetingSourceStatus>
): SourceStatus {
  const seen = Object.values(collections).map((v) => v.status);
  if (seen.length === 0) return SOURCE_STATUS.providerAbsent;
  let weakest = Number.POSITIVE_INFINITY;
  for (const status of seen) {
    const idx = SOURCE_STATUS_VALUES.indexOf(coerceSourceStatus(status));
    if (idx >= 0 && idx < weakest) weakest = idx;
  }
  if (!Number.isFinite(weakest)) return SOURCE_STATUS.providerAbsent;
  return SOURCE_STATUS_VALUES[weakest];
}

export interface SearchMeetingCollectionsResult {
  ok: boolean;
  hits: MeetingQmdHit[];
  error?: string;
  collections: string[];
  collectionStatus: Record<string, MeetingSourceStatus>;
  aggregateStatus: SourceStatus;
}

export async function searchMeetingCollections(
  query: string,
  limit = 10,
  collections?: string[],
  execFileAsync: ExecFileAsync = defaultExecFileAsync
): Promise<SearchMeetingCollectionsResult> {
  const q = query.trim();
  if (!q)
    return {
      ok: false,
      hits: [],
      error: "query is required",
      collections: [],
      collectionStatus: {},
      aggregateStatus: SOURCE_STATUS.providerAbsent,
    };

  const cols = collections ?? (await loadEnabledMeetingCollections());
  const per = Math.max(2, Math.min(limit, 8));
  const qmdBin = process.env.QMD_BIN || "qmd";
  const hits: MeetingQmdHit[] = [];
  const seen = new Set<string>();
  const collectionStatus: Record<string, MeetingSourceStatus> = {};
  let lastError: string | undefined;

  for (const collection of cols) {
    try {
      const { stdout } = await execFileAsync(
        qmdBin,
        ["search", q, "-c", collection, "-n", String(per), "--json"],
        {
          timeout: 45000,
          env: { ...process.env, QMD_FORCE_CPU: process.env.QMD_FORCE_CPU || "1" },
          maxBuffer: 4 * 1024 * 1024,
        }
      );
      const parsed = JSON.parse(stdout || "[]");
      const normalized = normalizeHits(parsed, collection, per);
      const retained: MeetingQmdHit[] = [];
      let lastIndexAt: string | null = null;
      for (const hit of normalized) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        hits.push(hit);
        retained.push(hit);
        const metadata = hit.metadata as Record<string, unknown> | undefined;
        if (metadata) {
          const hint =
            (typeof metadata.indexedAt === "string" && metadata.indexedAt) ||
            (typeof metadata.indexed_at === "string" && metadata.indexed_at) ||
            (typeof metadata.updated_at === "string" && metadata.updated_at);
          if (typeof hint === "string" && !lastIndexAt) lastIndexAt = hint;
        }
      }
      collectionStatus[collection] = {
        collection,
        status:
          retained.length > 0
            ? SOURCE_STATUS.recalled
            : SOURCE_STATUS.indexedUnrecalled,
        count: retained.length,
        lastIndexAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      collectionStatus[collection] = {
        collection,
        status: SOURCE_STATUS.indexedUnrecalled,
        count: 0,
        lastIndexAt: null,
        reason: lastError,
      };
    }
  }

  const aggregateStatus = aggregateSourceStatus(collectionStatus);
  return {
    ok: hits.length > 0 || !lastError,
    hits: hits.slice(0, Math.max(1, Math.min(limit, 25))),
    error: hits.length === 0 ? lastError : undefined,
    collections: cols,
    collectionStatus,
    aggregateStatus,
  };
}

export function isSearchAggregateRecalled(
  result: Pick<SearchMeetingCollectionsResult, "aggregateStatus">
): boolean {
  return isTerminalSourceStatus(result.aggregateStatus);
}
