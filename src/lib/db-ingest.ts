import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CLAUDE_MEMORY_PATH } from './constants';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  input?: unknown;
  content?: unknown;
}

interface JsonlMessage {
  role?: string;
  content?: string | ContentBlock[];
}

interface JsonlEntry {
  type?: string;
  message?: JsonlMessage;
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
}

export interface RecallResult {
  id: number;
  session_id: string;
  project: string;
  agent_id: string;
  role: string;
  snippet: string;
  timestamp: string;
  rank: number;
}

// ─── Agent ID Derivation (Pattern 3 from Research) ───────────────────────────

/**
 * Derives a human-readable agent/project ID from a Claude projects directory name.
 *
 * Claude stores projects under ~/.claude/projects/ using a path-encoded directory name
 * where path separators (/) are encoded as dashes (-) and literal dashes in path
 * components are encoded as double-dashes (--).
 *
 * Examples:
 *   "-Users-lcalderon-github-agent-kitchen" → "agent-kitchen"
 *   "-Users-lcalderon--paperclip-instances-foo" → "paperclip"
 *   "" → "claude-code"
 */
export function deriveAgentId(projectDirName: string): string {
  if (!projectDirName) return 'claude-code';

  // Paperclip check first — overrides all other logic
  if (projectDirName.includes('paperclip')) return 'paperclip';

  // Decode the path: "--" encodes a literal "-" in a path component;
  // "-" encodes a path separator (/)
  // Step 1: Replace "--" with a sentinel to preserve literal dashes
  const SENTINEL = '\x00';
  const withSentinel = projectDirName.replace(/--/g, SENTINEL);

  // Step 2: Replace "-" with "/" (path separators)
  const withSlashes = withSentinel.replace(/-/g, '/');

  // Step 3: Restore literal dashes
  const decoded = withSlashes.replace(new RegExp(SENTINEL, 'g'), '-');

  // Step 4: Split into path components, filter empty
  const parts = decoded.split('/').filter(Boolean);

  // Path structure: [Users, username, subdir, ...project-name-parts]
  // The project name starts at index 3 (0-indexed), joined with "-"
  // e.g. ["Users","lcalderon","github","agent-kitchen"] → "agent-kitchen"
  if (parts.length >= 4) {
    return parts.slice(3).join('-');
  }

  // Fallback: last non-empty component
  return parts[parts.length - 1] ?? 'claude-code';
}

// ─── Content Extraction (Pattern 5 from Research) ────────────────────────────

/**
 * Extracts plain text content from a JSONL conversation entry.
 *
 * Rules:
 * - type "user": string content returned as-is; array content extracts only "text" blocks
 * - type "assistant": array content extracts only "text" blocks (skips thinking/tool_use)
 * - all other types (system, file-history-snapshot, etc.): return null
 *
 * Content is truncated to 8000 chars to bound DB size.
 */
export function extractContent(entry: unknown): string | null {
  const e = entry as JsonlEntry;

  if (e.type === 'user') {
    const msg = e.message;
    if (!msg) return null;
    if (typeof msg.content === 'string') {
      return msg.content.slice(0, 8000);
    }
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b: ContentBlock) => b.type === 'text')
        .map((b: ContentBlock) => b.text ?? '')
        .join('\n')
        .slice(0, 8000);
      return text || null;
    }
  }

  if (e.type === 'assistant') {
    const content = e.message?.content;
    if (Array.isArray(content)) {
      const text = content
        .filter((b: ContentBlock) => b.type === 'text')
        .map((b: ContentBlock) => b.text ?? '')
        .join('\n')
        .slice(0, 8000);
      return text || null;
    }
  }

  return null;
}

// ─── Prepared Statement Cache ─────────────────────────────────────────────────

/** Checks ingest_meta to determine if a file should be skipped. */
function shouldSkipFile(
  db: Database.Database,
  filePath: string,
  mtimeMs: number,
  fileSize: number
): boolean {
  const row = db
    .prepare('SELECT mtime_ms, file_size FROM ingest_meta WHERE file_path = ?')
    .get(filePath) as { mtime_ms: number; file_size: number } | undefined;
  return !!row && row.mtime_ms === mtimeMs && row.file_size === fileSize;
}

// ─── File Ingestion ───────────────────────────────────────────────────────────

/**
 * Parses one JSONL file and inserts all extractable messages into the DB.
 * Wraps all inserts in a single transaction for performance.
 * Returns the count of rows actually inserted.
 */
export function ingestFile(
  db: Database.Database,
  filePath: string,
  projectDirName: string
): number {
  const sessionId = path.basename(filePath, '.jsonl');
  const agentId = deriveAgentId(projectDirName);
  const project = agentId;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO messages
      (session_id, project, agent_id, role, content, timestamp, cwd, git_branch, request_id)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());

  let inserted = 0;

  const runInserts = db.transaction(() => {
    for (const line of lines) {
      let entry: JsonlEntry;
      try {
        entry = JSON.parse(line) as JsonlEntry;
      } catch {
        continue;
      }

      const content = extractContent(entry);
      if (!content) continue;

      const role =
        entry.type === 'user' ? 'user' : entry.type === 'assistant' ? 'assistant' : null;
      if (!role) continue;

      const info = insertStmt.run(
        sessionId,
        project,
        agentId,
        role,
        content,
        entry.timestamp ?? new Date().toISOString(),
        entry.cwd ?? null,
        entry.gitBranch ?? null,
        entry.requestId ?? null
      );
      inserted += Number(info.changes);
    }
  });

  runInserts();
  return inserted;
}

// ─── Incremental Ingestion ────────────────────────────────────────────────────

/**
 * Scans CLAUDE_MEMORY_PATH, ingests all new/modified JSONL files, skips unchanged ones.
 * Fully synchronous (better-sqlite3 pattern).
 */
export function ingestAllSessions(db: Database.Database): {
  filesProcessed: number;
  rowsInserted: number;
  filesSkipped: number;
} {
  let filesProcessed = 0;
  let rowsInserted = 0;
  let filesSkipped = 0;

  const upsertMeta = db.prepare(`
    INSERT OR REPLACE INTO ingest_meta (file_path, mtime_ms, file_size, row_count, ingested_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const memoryPath = CLAUDE_MEMORY_PATH;

  // List project directories
  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(memoryPath);
  } catch {
    // CLAUDE_MEMORY_PATH doesn't exist or isn't readable — return empty stats
    return { filesProcessed, rowsInserted, filesSkipped };
  }

  for (const projectDirName of projectDirs) {
    const projectPath = path.join(memoryPath, projectDirName);

    // Skip non-directories
    let stat: fs.Stats;
    try {
      stat = fs.statSync(projectPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // List JSONL files in project directory
    let files: string[];
    try {
      files = fs.readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(projectPath, file);

      let fileStat: fs.Stats;
      try {
        fileStat = fs.statSync(filePath);
      } catch {
        continue;
      }

      const mtimeMs = Math.round(fileStat.mtimeMs);
      const fileSize = fileStat.size;

      // Skip unchanged files
      if (shouldSkipFile(db, filePath, mtimeMs, fileSize)) {
        filesSkipped++;
        continue;
      }

      // Ingest the file
      const inserted = ingestFile(db, filePath, projectDirName);
      filesProcessed++;
      rowsInserted += inserted;

      // Update ingest_meta
      upsertMeta.run(filePath, mtimeMs, fileSize, inserted, new Date().toISOString());
    }
  }

  // Update last_ingest_ts in meta table
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('last_ingest_ts', ?)").run(
    new Date().toISOString()
  );

  return { filesProcessed, rowsInserted, filesSkipped };
}

// ─── FTS5 Recall Query (Pattern 6 from Research) ─────────────────────────────

const RECALL_SQL = `
  SELECT
    m.id,
    m.session_id,
    m.project,
    m.agent_id,
    m.role,
    snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet,
    m.timestamp,
    rank
  FROM messages_fts
  JOIN messages m ON m.id = messages_fts.rowid
  WHERE messages_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`;

/**
 * Queries the FTS5 index for messages matching the given keyword/phrase.
 *
 * Security:
 * - limit capped at 100 (DoS prevention per threat model T-19-04)
 * - query wrapped in double quotes for phrase match; falls back to plain match
 * - FTS5 syntax errors caught and return empty array (T-19-03)
 */
export function recallByKeyword(
  db: Database.Database,
  query: string,
  limit = 20
): RecallResult[] {
  // Cap limit at 100 (DoS prevention)
  const safeLimit = Math.min(limit, 100);

  const stmt = db.prepare(RECALL_SQL);

  // Attempt phrase match first (query wrapped in double quotes)
  const phraseQuery = `"${query}"`;
  try {
    const phraseResults = stmt.all(phraseQuery, safeLimit) as RecallResult[];
    if (phraseResults.length > 0) return phraseResults;
  } catch {
    // FTS5 syntax error in phrase match — fall through to plain query
  }

  // Fallback: plain query (no quotes)
  try {
    return stmt.all(query, safeLimit) as RecallResult[];
  } catch {
    // FTS5 syntax error — return empty array (malformed query)
    return [];
  }
}
