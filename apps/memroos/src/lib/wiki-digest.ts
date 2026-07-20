/**
 * Memory → human wiki digest (WIKISURF-01..03).
 *
 * Deterministic clustering of memory items into durable markdown pages under
 * `${KNOWLEDGE_BASE_PATH}/llm-wiki/wiki/`, with watermark + index/log updates.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import { MEM0_URL } from "@/lib/constants";
import { getDb } from "@/lib/db";
import {
  getKnowledgeBasePath,
  getWikiRoot,
  wikiRootExists,
} from "@/lib/wiki-vault";

export const WIKI_DIGEST_CRON_ID = "wiki-digest";
export const WIKI_DIGEST_WATERMARK_REL = path.join(
  "llm-wiki",
  ".memroos",
  "wiki-digest-watermark.json"
);

export type WikiDigestStatus = "completed" | "skipped" | "partial" | "failed";

export interface WikiDigestMemoryItem {
  id: string;
  content: string;
  createdAt?: string | null;
  agentId?: string | null;
  sensitivity?: string | null;
}

export interface WikiDigestWatermark {
  lastCreatedAt: string | null;
  lastId: string | null;
  updatedAt: string;
  pagesWritten: number;
}

export interface WikiDigestRunOptions {
  knowledgeBasePath?: string;
  dryRun?: boolean;
  agentId?: string;
  limit?: number;
  now?: Date;
  /** When mem0 fetch fails, fall back to SQLite messages (default true). */
  allowEpisodicFallback?: boolean;
  db?: Database.Database;
  fetchMemories?: (agentId: string) => Promise<WikiDigestMemoryItem[]>;
  log?: (message: string, extra?: Record<string, unknown>) => void;
}

export interface WikiDigestSummary {
  status: WikiDigestStatus;
  reason?: string;
  dryRun: boolean;
  considered: number;
  written: number;
  skipped: number;
  errors: number;
  pages: string[];
  watermarkBefore: WikiDigestWatermark;
  watermarkAfter: WikiDigestWatermark;
  wikiRoot: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key\s*[:=]\s*\S+/i,
  /bearer\s+[a-z0-9._\-]+/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /password\s*[:=]\s*\S+/i,
  /NEO4J_PASSWORD/i,
  /MEMROOS_.*SECRET/i,
];

const HIGH_SENSITIVITY = new Set([
  "personal",
  "legal",
  "attorney",
  "medical",
  "secret",
  "restricted",
]);

function toIso(value: Date): string {
  return value.toISOString();
}

function emptyWatermark(now: Date): WikiDigestWatermark {
  return {
    lastCreatedAt: null,
    lastId: null,
    updatedAt: toIso(now),
    pagesWritten: 0,
  };
}

export function watermarkPath(knowledgeBasePath: string): string {
  return path.join(knowledgeBasePath, WIKI_DIGEST_WATERMARK_REL);
}

export function readWikiDigestWatermark(
  knowledgeBasePath: string,
  now = new Date()
): WikiDigestWatermark {
  const file = watermarkPath(knowledgeBasePath);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WikiDigestWatermark>;
    return {
      lastCreatedAt: raw.lastCreatedAt ?? null,
      lastId: raw.lastId ?? null,
      updatedAt: raw.updatedAt ?? toIso(now),
      pagesWritten: Number(raw.pagesWritten ?? 0) || 0,
    };
  } catch {
    return emptyWatermark(now);
  }
}

export function writeWikiDigestWatermark(
  knowledgeBasePath: string,
  watermark: WikiDigestWatermark
): void {
  const file = watermarkPath(knowledgeBasePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(watermark, null, 2)}\n`, "utf8");
}

export function shouldSkipMemory(item: WikiDigestMemoryItem): { skip: boolean; reason?: string } {
  const content = (item.content ?? "").trim();
  if (!content) return { skip: true, reason: "empty" };
  const sensitivity = String(item.sensitivity ?? "").toLowerCase();
  if (HIGH_SENSITIVITY.has(sensitivity)) {
    return { skip: true, reason: "high_sensitivity" };
  }
  const lower = content.toLowerCase();
  if (
    /\b(attorney[- ]client|privileged legal|medical record|ssn\b|social security)\b/i.test(
      content
    )
  ) {
    return { skip: true, reason: "personal_legal_scrap" };
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) return { skip: true, reason: "secret_pattern" };
  }
  if (lower.includes("sk-") && /sk-[a-z0-9]{10,}/i.test(content)) {
    return { skip: true, reason: "secret_pattern" };
  }
  return { skip: false };
}

export function redactSecrets(content: string): string {
  let out = content;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

/** Deterministic topic key from memory content. */
export function clusterKeyForMemory(item: WikiDigestMemoryItem): string {
  const text = item.content.replace(/\s+/g, " ").trim();
  const heading = text.split(/[.!?]/)[0] ?? text;
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (slug.length >= 8) return slug;
  const hash = createHash("sha256").update(item.id || text).digest("hex").slice(0, 10);
  return `memory-${hash}`;
}

function pageRelPath(clusterKey: string): string {
  return path.join("memroos-digest", `${clusterKey}.md`);
}

function renderPage(clusterKey: string, items: WikiDigestMemoryItem[], now: Date): string {
  const title = clusterKey
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const lines = [
    `# ${title || "Memory Digest"}`,
    "",
    `> Digested by MemRoOS wiki-digest at ${toIso(now)}. Provenance: mem0/episodic candidates.`,
    "",
  ];
  for (const item of items) {
    const when = item.createdAt ? ` (${item.createdAt})` : "";
    const agent = item.agentId ? ` · agent \`${item.agentId}\`` : "";
    lines.push(`## ${item.id}${when}${agent}`);
    lines.push("");
    lines.push(redactSecrets(item.content.trim()));
    lines.push("");
    lines.push(`Source id: \`${item.id}\``);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

async function defaultFetchMemories(agentId: string): Promise<WikiDigestMemoryItem[]> {
  const url = `${MEM0_URL.replace(/\/$/, "")}/memory/all?agent_id=${encodeURIComponent(agentId)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`mem0_fetch_failed:${response.status}`);
  }
  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { results?: unknown[] })?.results)
      ? ((body as { results: unknown[] }).results)
      : Array.isArray((body as { memories?: unknown[] })?.memories)
        ? ((body as { memories: unknown[] }).memories)
        : [];
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? r.hash ?? "");
      const content = String(r.memory ?? r.data ?? r.content ?? "");
      return {
        id,
        content,
        createdAt: (r.created_at as string | undefined) ?? (r.createdAt as string | undefined) ?? null,
        agentId: (r.user_id as string | undefined) ?? (r.agent_id as string | undefined) ?? agentId,
        sensitivity: (r.sensitivity as string | undefined) ?? null,
      } satisfies WikiDigestMemoryItem;
    })
    .filter((item) => item.id && item.content);
}

/** Local SQLite episodic fallback when mem0/Qdrant are unavailable. */
export function fetchEpisodicMemoriesForDigest(
  db: Database.Database,
  options: { agentId?: string; limit?: number } = {}
): WikiDigestMemoryItem[] {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
  const agentId = options.agentId?.trim();
  const rows = agentId
    ? (db
        .prepare(
          `SELECT id, content, timestamp, agent_id
           FROM messages
           WHERE role IN ('user', 'assistant')
             AND content IS NOT NULL
             AND trim(content) != ''
             AND agent_id = ?
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(agentId, limit) as Array<{
        id: number;
        content: string;
        timestamp: string | null;
        agent_id: string | null;
      }>)
    : (db
        .prepare(
          `SELECT id, content, timestamp, agent_id
           FROM messages
           WHERE role IN ('user', 'assistant')
             AND content IS NOT NULL
             AND trim(content) != ''
           ORDER BY id DESC
           LIMIT ?`
        )
        .all(limit) as Array<{
        id: number;
        content: string;
        timestamp: string | null;
        agent_id: string | null;
      }>);

  return rows
    .map((row) => ({
      id: `episodic:${row.id}`,
      content: String(row.content ?? ""),
      createdAt: row.timestamp,
      agentId: row.agent_id,
      sensitivity: null,
    }))
    .filter((item) => item.content.trim());
}

function isAfterWatermark(
  item: WikiDigestMemoryItem,
  watermark: WikiDigestWatermark
): boolean {
  if (!watermark.lastCreatedAt && !watermark.lastId) return true;
  const created = item.createdAt ?? "";
  const last = watermark.lastCreatedAt ?? "";
  if (created && last) {
    if (created > last) return true;
    if (created < last) return false;
  }
  if (watermark.lastId && item.id === watermark.lastId) return false;
  if (watermark.lastId && created === last) {
    return item.id > watermark.lastId;
  }
  return Boolean(created) || Boolean(item.id);
}

function updateIndexAndLog(
  wikiRoot: string,
  writtenRels: string[],
  now: Date,
  dryRun: boolean
): void {
  if (writtenRels.length === 0) return;
  const indexPath = path.join(wikiRoot, "index.md");
  const logPath = path.join(wikiRoot, "log.md");
  const stamp = toIso(now);
  const indexBlock = [
    "",
    `## MemRoOS digest (${stamp})`,
    ...writtenRels.map((rel) => `- [[${rel.replace(/\.md$/i, "")}]]`),
    "",
  ].join("\n");
  const logBlock = [
    "",
    `### ${stamp} — wiki-digest`,
    `Wrote ${writtenRels.length} page(s): ${writtenRels.join(", ")}`,
    "",
  ].join("\n");

  if (dryRun) return;

  fs.mkdirSync(wikiRoot, { recursive: true });
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, indexBlock, "utf8");
  } else {
    fs.writeFileSync(indexPath, `# Wiki Index\n${indexBlock}`, "utf8");
  }
  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, logBlock, "utf8");
  } else {
    fs.writeFileSync(logPath, `# Wiki Log\n${logBlock}`, "utf8");
  }
}

function refreshGraphStub(wikiRoot: string, pageRels: string[], dryRun: boolean): void {
  const graphDir = path.join(wikiRoot, "graph");
  const graphPath = path.join(graphDir, "knowledge-graph.json");
  const nodes = pageRels.map((rel) => ({
    id: rel,
    label: path.basename(rel, ".md"),
    path: rel,
  }));
  const edges: Array<{ source: string; target: string }> = [];
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "wiki-digest",
    nodes,
    edges,
  };
  if (dryRun) return;
  fs.mkdirSync(graphDir, { recursive: true });
  // Merge with existing graph when present.
  let existing: { nodes?: unknown[]; edges?: unknown[] } = {};
  try {
    existing = JSON.parse(fs.readFileSync(graphPath, "utf8")) as typeof existing;
  } catch {
    existing = {};
  }
  const byId = new Map<string, { id: string; label: string; path: string }>();
  for (const node of Array.isArray(existing.nodes) ? existing.nodes : []) {
    const n = node as { id?: string; label?: string; path?: string };
    if (n.id) byId.set(String(n.id), { id: String(n.id), label: String(n.label ?? n.id), path: String(n.path ?? n.id) });
  }
  for (const node of nodes) byId.set(node.id, node);
  const mergedEdges = Array.isArray(existing.edges) ? existing.edges : [];
  fs.writeFileSync(
    graphPath,
    `${JSON.stringify({ ...payload, nodes: [...byId.values()], edges: [...mergedEdges, ...edges] }, null, 2)}\n`,
    "utf8"
  );
}

export async function runWikiDigest(
  options: WikiDigestRunOptions = {}
): Promise<WikiDigestSummary> {
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const agentId = options.agentId ?? process.env.MEMROOS_DEFAULT_AGENT_ID ?? "luis";
  const knowledgeBasePath = getKnowledgeBasePath(options.knowledgeBasePath);
  const wikiRoot = getWikiRoot({ knowledgeBasePath });
  const log =
    options.log ??
    ((message: string, extra?: Record<string, unknown>) => {
      if (extra) console.log(`[wiki-digest] ${message}`, extra);
      else console.log(`[wiki-digest] ${message}`);
    });

  const watermarkBefore = readWikiDigestWatermark(knowledgeBasePath, now);
  const summary: WikiDigestSummary = {
    status: "completed",
    dryRun,
    considered: 0,
    written: 0,
    skipped: 0,
    errors: 0,
    pages: [],
    watermarkBefore,
    watermarkAfter: { ...watermarkBefore },
    wikiRoot,
  };

  let memories: WikiDigestMemoryItem[] = [];
  let usedEpisodicFallback = false;
  try {
    memories = await (options.fetchMemories ?? defaultFetchMemories)(agentId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const allowFallback = options.allowEpisodicFallback !== false;
    if (!allowFallback) {
      summary.status = "failed";
      summary.reason = reason;
      summary.errors = 1;
      log("fetch failed", { reason: summary.reason });
      return summary;
    }
    try {
      const db = options.db ?? getDb();
      memories = fetchEpisodicMemoriesForDigest(db, {
        agentId,
        limit: options.limit ?? 200,
      });
      usedEpisodicFallback = true;
      log("mem0 unavailable; using sqlite episodic fallback", {
        reason,
        episodicCount: memories.length,
      });
    } catch (fallbackErr) {
      summary.status = "failed";
      summary.reason = `${reason}; episodic_fallback_failed:${
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      }`;
      summary.errors = 1;
      log("fetch failed", { reason: summary.reason });
      return summary;
    }
  }

  const limit = Math.max(1, options.limit ?? 200);
  const clusters = new Map<string, WikiDigestMemoryItem[]>();
  let newest: WikiDigestMemoryItem | null = null;

  for (const item of memories.slice(0, limit)) {
    summary.considered += 1;
    if (!isAfterWatermark(item, watermarkBefore)) {
      summary.skipped += 1;
      continue;
    }
    const gate = shouldSkipMemory(item);
    if (gate.skip) {
      summary.skipped += 1;
      continue;
    }
    const key = clusterKeyForMemory(item);
    const list = clusters.get(key) ?? [];
    list.push(item);
    clusters.set(key, list);
    if (
      !newest ||
      String(item.createdAt ?? "") > String(newest.createdAt ?? "") ||
      (item.createdAt === newest.createdAt && item.id > newest.id)
    ) {
      newest = item;
    }
  }

  if (clusters.size === 0) {
    summary.status = "skipped";
    summary.reason = usedEpisodicFallback
      ? wikiRootExists(wikiRoot)
        ? "nothing_new_episodic_fallback"
        : "nothing_new_missing_vault_ok_episodic_fallback"
      : wikiRootExists(wikiRoot)
        ? "nothing_new"
        : "nothing_new_missing_vault_ok";
    return summary;
  }

  if (!dryRun) {
    fs.mkdirSync(path.join(wikiRoot, "memroos-digest"), { recursive: true });
  }

  for (const [key, items] of clusters) {
    const rel = pageRelPath(key).split(path.sep).join("/");
    const abs = path.join(wikiRoot, rel);
    const body = renderPage(key, items, now);
    try {
      if (!dryRun) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body, "utf8");
      }
      summary.written += 1;
      summary.pages.push(rel);
    } catch (err) {
      summary.errors += 1;
      log("write failed", {
        path: rel,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  updateIndexAndLog(wikiRoot, summary.pages, now, dryRun);
  refreshGraphStub(wikiRoot, summary.pages, dryRun);

  if (newest && !dryRun) {
    summary.watermarkAfter = {
      lastCreatedAt: newest.createdAt ?? watermarkBefore.lastCreatedAt,
      lastId: newest.id,
      updatedAt: toIso(now),
      pagesWritten: watermarkBefore.pagesWritten + summary.written,
    };
    writeWikiDigestWatermark(knowledgeBasePath, summary.watermarkAfter);
  } else if (newest && dryRun) {
    summary.watermarkAfter = {
      lastCreatedAt: newest.createdAt ?? watermarkBefore.lastCreatedAt,
      lastId: newest.id,
      updatedAt: toIso(now),
      pagesWritten: watermarkBefore.pagesWritten + summary.written,
    };
  }

  if (summary.errors > 0 && summary.written > 0) summary.status = "partial";
  else if (summary.errors > 0) summary.status = "failed";
  else summary.status = "completed";

  log("done", {
    status: summary.status,
    written: summary.written,
    skipped: summary.skipped,
    dryRun,
  });
  return summary;
}
