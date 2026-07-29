// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const testDb = new Database(':memory:');

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

testDb.exec(`
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    request_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    policy TEXT NOT NULL DEFAULT 'sealed',
    space_id TEXT
  );
  CREATE TABLE space_members (
    space_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_type TEXT NOT NULL DEFAULT 'human',
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (space_id, member_id)
  );
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content=messages, content_rowid=id, tokenize='unicode61'
  );
  CREATE TRIGGER messages_ai AFTER INSERT ON messages
    WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
    BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
`);

afterAll(() => {
  testDb.close();
});

beforeEach(() => {
  testDb.exec('DELETE FROM messages');
  testDb.exec('DELETE FROM space_members');
});

function seed(row: {
  session_id: string;
  role: string;
  content: string;
  request_id?: string;
  visibility: string;
  policy: string;
  space_id?: string | null;
}) {
  testDb
    .prepare(
      `INSERT INTO messages (session_id, role, content, timestamp, request_id, visibility, policy, space_id)
       VALUES (:session_id, :role, :content, :ts, :request_id, :visibility, :policy, :space_id)`
    )
    .run({
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      ts: '2026-07-20T00:00:00Z',
      request_id: row.request_id ?? null,
      visibility: row.visibility,
      policy: row.policy,
      space_id: row.space_id ?? null,
    });
}

function addSpaceMember(spaceId: string, memberId: string) {
  testDb
    .prepare(`INSERT OR REPLACE INTO space_members (space_id, member_id) VALUES (?, ?)`)
    .run(spaceId, memberId);
}

describe('GET /api/internal/connector-search', () => {
  it('rejects requests from a non-loopback host with no operator key', async () => {
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    const { GET } = await import('../route');
    const req = new Request('http://example.com/api/internal/connector-search?q=test', {
      headers: { host: 'example.com' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(403);
  });

  it('allows a loopback request with no auth header at all', async () => {
    seed({
      session_id: 'linear:conn-1',
      role: 'connector',
      content: 'COR-101 Draft Alacriti FI CAB segment concepts',
      request_id: 'COR-101',
      visibility: 'internal',
      policy: 'indexable',
    });

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/internal/connector-search?q=Alacriti');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].request_id).toBe('COR-101');
  });

  it('accepts a non-loopback caller presenting MEMROOS_OPERATOR_API_KEY', async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = 'test-operator-key';
    seed({
      session_id: 'linear:conn-1',
      role: 'connector',
      content: 'COR-101 Draft Alacriti FI CAB segment concepts',
      request_id: 'COR-101',
      visibility: 'internal',
      policy: 'indexable',
    });

    const { GET } = await import('../route');
    const req = new Request('http://example.com/api/internal/connector-search?q=Alacriti', {
      headers: { host: 'example.com', authorization: 'Bearer test-operator-key' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it('excludes non-connector rows and sealed/private connector rows', async () => {
    seed({
      session_id: 'chat:session-1',
      role: 'user',
      content: 'Alacriti chat message',
      visibility: 'internal',
      policy: 'indexable',
    });
    seed({
      session_id: 'linear:conn-1',
      role: 'connector',
      content: 'Alacriti sealed connector row',
      request_id: 'COR-999',
      visibility: 'private',
      policy: 'sealed',
    });

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/internal/connector-search?q=Alacriti');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body.results).toHaveLength(0);
  });

  it('requires a non-empty q param', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/internal/connector-search');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it('withholds space-scoped rows from a caller with no identity', async () => {
    seed({
      session_id: 'notion:conn-1',
      role: 'connector',
      content: 'Alacriti private notion body',
      request_id: 'notion-page-1',
      visibility: 'internal',
      policy: 'indexable',
      space_id: 'spc_notion',
    });
    seed({
      session_id: 'linear:conn-1',
      role: 'connector',
      content: 'Alacriti unscoped linear issue',
      request_id: 'COR-101',
      visibility: 'internal',
      policy: 'indexable',
    });

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/internal/connector-search?q=Alacriti');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].request_id).toBe('COR-101');
  });

  it('withholds space-scoped rows from a non-member', async () => {
    seed({
      session_id: 'notion:conn-1',
      role: 'connector',
      content: 'Alacriti private notion body',
      request_id: 'notion-page-1',
      visibility: 'internal',
      policy: 'indexable',
      space_id: 'spc_notion',
    });
    addSpaceMember('spc_notion', 'user:member');

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/internal/connector-search?q=Alacriti&user_id=user:stranger'
    );
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body.results).toHaveLength(0);
  });

  it('returns space-scoped rows to a member', async () => {
    seed({
      session_id: 'notion:conn-1',
      role: 'connector',
      content: 'Alacriti private notion body',
      request_id: 'notion-page-1',
      visibility: 'internal',
      policy: 'indexable',
      space_id: 'spc_notion',
    });
    addSpaceMember('spc_notion', 'user:member');

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/internal/connector-search?q=Alacriti&user_id=user:member'
    );
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].request_id).toBe('notion-page-1');
  });

  it('falls back to a plain (non-phrase) match when the query has FTS5 metacharacters', async () => {
    seed({
      session_id: 'notion:conn-1',
      role: 'connector',
      content: 'Q3 roadmap: multi-tenant rollout',
      request_id: 'notion-page-1',
      visibility: 'internal',
      policy: 'indexable',
    });

    const { GET } = await import('../route');
    // A hyphenated term is a plain-token match but not a valid quoted phrase
    // once combined with other punctuation FTS5 may reject.
    const req = new Request('http://localhost/api/internal/connector-search?q=multi-tenant');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });
});
