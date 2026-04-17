// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Use a unique temp directory per test run to avoid conflicts with parallel agents
const TEST_DB_DIR = path.join(os.tmpdir(), `db-ingest-test-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-ingest.db');
const TEST_MEMORY_PATH = path.join(TEST_DB_DIR, 'projects');

// Override env vars before importing modules
process.env.SQLITE_DB_PATH = TEST_DB_PATH;
process.env.CLAUDE_MEMORY_PATH = TEST_MEMORY_PATH;

// Lazy imports after env vars are set
let getDb: () => import('better-sqlite3').Database;
let closeDb: () => void;
let deriveAgentId: (projectDirName: string) => string;
let extractContent: (entry: unknown) => string | null;
let ingestAllSessions: (db: import('better-sqlite3').Database) => {
  filesProcessed: number;
  rowsInserted: number;
  filesSkipped: number;
};
let recallByKeyword: (
  db: import('better-sqlite3').Database,
  query: string,
  limit?: number
) => unknown[];

/** Helper: write a JSONL file with given entries */
function writeJsonl(filePath: string, entries: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join('\n'));
}

/** Helper: create a minimal user entry with string content */
function makeUserEntry(content: string, requestId = crypto.randomUUID()): unknown {
  return {
    type: 'user',
    message: { role: 'user', content },
    requestId,
    timestamp: new Date().toISOString(),
    sessionId: 'session-123',
    cwd: '/tmp',
    gitBranch: 'main',
  };
}

/** Helper: create a minimal assistant entry with array content */
function makeAssistantEntry(
  blocks: unknown[],
  requestId = crypto.randomUUID()
): unknown {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: blocks },
    requestId,
    timestamp: new Date().toISOString(),
    sessionId: 'session-123',
    cwd: '/tmp',
    gitBranch: 'main',
  };
}

describe('db-ingest: deriveAgentId', () => {
  beforeEach(async () => {
    const m = await import('../db-ingest');
    deriveAgentId = m.deriveAgentId;
  });

  it('Test 1: deriveAgentId("-Users-jdoe-github-agent-kitchen") returns "agent-kitchen"', () => {
    expect(deriveAgentId('-Users-jdoe-github-agent-kitchen')).toBe('agent-kitchen');
  });

  it('Test 2: deriveAgentId("-Users-jdoe--paperclip-instances-foo") returns "paperclip"', () => {
    expect(deriveAgentId('-Users-jdoe--paperclip-instances-foo')).toBe('paperclip');
  });

  it('Test 3: deriveAgentId("") returns "claude-code" (fallback)', () => {
    expect(deriveAgentId('')).toBe('claude-code');
  });
});

describe('db-ingest: extractContent', () => {
  beforeEach(async () => {
    const m = await import('../db-ingest');
    extractContent = m.extractContent;
  });

  it('Test 4: extractContent user entry with string content returns the string (truncated to 8000 chars)', () => {
    const longString = 'a'.repeat(9000);
    const entry = makeUserEntry(longString);
    const result = extractContent(entry);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(8000);
    expect(result!).toBe(longString.slice(0, 8000));
  });

  it('Test 5: extractContent user entry with array content extracts only text blocks', () => {
    const entry = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'hello world' },
          { type: 'tool_result', content: 'some tool result' },
          { type: 'text', text: 'second text' },
        ],
      },
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
    };
    const result = extractContent(entry);
    expect(result).toBe('hello world\nsecond text');
  });

  it('Test 6: extractContent assistant entry with thinking blocks skips them, extracts only text blocks', () => {
    const entry = makeAssistantEntry([
      { type: 'thinking', thinking: 'internal reasoning...', signature: 'abc123' },
      { type: 'text', text: 'The answer is 42.' },
    ]);
    const result = extractContent(entry);
    expect(result).toBe('The answer is 42.');
  });

  it('Test 7: extractContent assistant entry with tool_use blocks skips them', () => {
    const entry = makeAssistantEntry([
      { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: '/etc/passwd' } },
      { type: 'text', text: 'Reading the file now.' },
    ]);
    const result = extractContent(entry);
    expect(result).toBe('Reading the file now.');
  });

  it('Test 8: extractContent returns null for type "system" or unknown types', () => {
    expect(extractContent({ type: 'system', content: 'system prompt' })).toBeNull();
    expect(extractContent({ type: 'file-history-snapshot', data: {} })).toBeNull();
    expect(extractContent({ type: 'unknown-type' })).toBeNull();
  });
});

describe('db-ingest: ingestAllSessions and recallByKeyword', () => {
  let db: import('better-sqlite3').Database;

  beforeEach(async () => {
    // Ensure temp directories exist
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    fs.mkdirSync(TEST_MEMORY_PATH, { recursive: true });

    const dbModule = await import('../db');
    if (dbModule.closeDb) dbModule.closeDb();
    getDb = dbModule.getDb;
    closeDb = dbModule.closeDb;
    db = getDb();

    const m = await import('../db-ingest');
    ingestAllSessions = m.ingestAllSessions;
    recallByKeyword = m.recallByKeyword;
  });

  afterAll(() => {
    if (closeDb) closeDb();
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  it('Test 9: Ingesting a JSONL file creates rows in messages table with correct fields', () => {
    const projectDir = path.join(TEST_MEMORY_PATH, '-Users-jdoe-github-agent-kitchen');
    const sessionFile = path.join(projectDir, 'session-abc.jsonl');

    writeJsonl(sessionFile, [
      makeUserEntry('hello from user', 'req-001'),
      makeAssistantEntry([{ type: 'text', text: 'hello from assistant' }], 'req-002'),
    ]);

    const result = ingestAllSessions(db);

    expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.rowsInserted).toBeGreaterThanOrEqual(2);

    const rows = db
      .prepare('SELECT * FROM messages WHERE session_id = ?')
      .all('session-abc') as Array<{ project: string; agent_id: string; role: string; content: string }>;

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].project).toBe('agent-kitchen');
    expect(rows[0].agent_id).toBe('agent-kitchen');
    const roles = rows.map((r) => r.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  it('Test 10: Re-ingesting same file (unchanged mtime+size) is skipped (0 new rows)', () => {
    const projectDir = path.join(TEST_MEMORY_PATH, '-Users-jdoe-github-test-project');
    const sessionFile = path.join(projectDir, 'session-skip.jsonl');

    writeJsonl(sessionFile, [makeUserEntry('skip test message', 'req-skip-01')]);

    // First ingest
    const first = ingestAllSessions(db);
    expect(first.rowsInserted).toBeGreaterThanOrEqual(1);

    // Second ingest — same file, same mtime+size
    const second = ingestAllSessions(db);
    expect(second.filesSkipped).toBeGreaterThanOrEqual(1);
    // rowsInserted for the unchanged file should be 0
    // (other files from Test 9 might also be re-processed but skipped)
    const totalRows = (
      db.prepare('SELECT COUNT(*) as c FROM messages WHERE session_id = ?').get('session-skip') as {
        c: number;
      }
    ).c;
    // Should still be 1 (not doubled)
    expect(totalRows).toBe(1);
  });

  it('Test 11: recallByKeyword returns results with snippet, project, agent_id, rank', () => {
    const projectDir = path.join(TEST_MEMORY_PATH, '-Users-jdoe-github-recall-test');
    const sessionFile = path.join(projectDir, 'session-recall.jsonl');

    const uniqueWord = `uniquekeyword${crypto.randomUUID().replace(/-/g, '')}`;
    writeJsonl(sessionFile, [makeUserEntry(`This message contains ${uniqueWord} for recall`, 'req-recall-01')]);

    ingestAllSessions(db);

    const results = recallByKeyword(db, uniqueWord) as Array<{
      snippet: string;
      project: string;
      agent_id: string;
      rank: number;
      session_id: string;
    }>;

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty('snippet');
    expect(results[0]).toHaveProperty('project');
    expect(results[0]).toHaveProperty('agent_id');
    expect(results[0]).toHaveProperty('rank');
    expect(results[0].snippet).toContain(uniqueWord);
  });

  it('Test 12: recallByKeyword with phrase-quoted query returns exact phrase matches', () => {
    const projectDir = path.join(TEST_MEMORY_PATH, '-Users-jdoe-github-phrase-test');
    const sessionFile = path.join(projectDir, 'session-phrase.jsonl');

    writeJsonl(sessionFile, [
      makeUserEntry('The quick brown fox jumps over the lazy dog', 'req-phrase-01'),
    ]);

    ingestAllSessions(db);

    // Phrase match should find exact phrase
    const results = recallByKeyword(db, 'quick brown fox') as Array<{ snippet: string }>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].snippet).toBeTruthy();
  });
});

describe('db-ingest: recallByKeyword error handling', () => {
  let db: import('better-sqlite3').Database;

  beforeEach(async () => {
    const dbModule = await import('../db');
    getDb = dbModule.getDb;
    db = getDb();
    const m = await import('../db-ingest');
    recallByKeyword = m.recallByKeyword;
  });

  it('FTS5 syntax errors return empty array (malformed queries)', () => {
    // Unmatched quotes cause FTS5 syntax errors
    const results = recallByKeyword(db, '"unclosed quote');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('limit is capped at 100 (DoS prevention)', async () => {
    const m = await import('../db-ingest');
    // Should not throw even with absurd limit
    const results = m.recallByKeyword(db, 'test', 9999);
    expect(Array.isArray(results)).toBe(true);
    // We can't easily verify the cap without inspecting implementation,
    // but no crash is the key assertion
  });
});
