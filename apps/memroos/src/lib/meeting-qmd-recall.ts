/**
 * Meeting QMD lane helpers for unified memory recall (v8.11 / URECALL-04).
 * Discovers enabled meeting collections and shells out to `qmd search -c`.
 */
import { execFile as defaultExecFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

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
    return {
      id: `qmd:${collection}:${path || index}`,
      collection,
      title: String(title),
      content: String(content).slice(0, 4000),
      path: path ? String(path) : undefined,
      score,
      metadata: item,
    };
  });
}

export async function searchMeetingCollections(
  query: string,
  limit = 10,
  collections?: string[],
  execFileAsync: ExecFileAsync = defaultExecFileAsync
): Promise<{ ok: boolean; hits: MeetingQmdHit[]; error?: string; collections: string[] }> {
  const q = query.trim();
  if (!q) return { ok: false, hits: [], error: "query is required", collections: [] };

  const cols = collections ?? (await loadEnabledMeetingCollections());
  const per = Math.max(2, Math.min(limit, 8));
  const qmdBin = process.env.QMD_BIN || "qmd";
  const hits: MeetingQmdHit[] = [];
  const seen = new Set<string>();
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
      for (const hit of normalizeHits(parsed, collection, per)) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        hits.push(hit);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Collection may be missing — continue federating
    }
  }

  return {
    ok: hits.length > 0 || !lastError,
    hits: hits.slice(0, Math.max(1, Math.min(limit, 25))),
    error: hits.length === 0 ? lastError : undefined,
    collections: cols,
  };
}
