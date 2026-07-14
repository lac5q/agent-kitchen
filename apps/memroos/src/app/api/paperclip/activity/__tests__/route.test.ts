// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";

// Create a shared in-memory DB for the entire test suite
const testDb = new Database(":memory:");

// Apply the real schema so audit_entries table exists
const { initSchema } = await import("@/lib/db-schema");
initSchema(testDb);

// Mock @/lib/db to return the in-memory DB
vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/paperclip/activity", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function validActivityEvent(overrides: Record<string, unknown> = {}) {
  return {
    companyId: "comp-1",
    actorType: "agent",
    actorId: "agent-alpha",
    action: "agent.heartbeat",
    entityType: "agent",
    entityId: "agent-alpha",
    timestamp: "2026-07-09T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  // audit_entries is append-only (SQLite triggers block DELETE/UPDATE).
  // Tests are self-contained: each test queries by the specific auditId
  // returned from its own POST call, so no cross-test cleanup is needed.
  vi.restoreAllMocks();
});

afterAll(() => {
  if (testDb && testDb.open) testDb.close();
});

const { POST } = await import("../route");

// ---------------------------------------------------------------------------
// POST /api/paperclip/activity — activity ingestion (FLEET-18)
// ---------------------------------------------------------------------------

describe("POST /api/paperclip/activity — activity ingestion", () => {
  it("FLEET-18: ingests a valid activity event and writes an audit_entries row", async () => {
    const req = makePostRequest(validActivityEvent());
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.ingested).toBe(true);
    expect(data.hardStopOwner).toBe("paperclip");
    expect(typeof data.auditId).toBe("string");

    // Verify audit_entries row
    const row = testDb
      .prepare("SELECT * FROM audit_entries WHERE id = ?")
      .get(data.auditId) as any;
    expect(row).toBeDefined();
    expect(row.event_type).toBe("paperclip.activity");
    expect(row.entity_type).toBe("paperclip");
    expect(row.actor_role).toBe("system");
    expect(row.actor_id).toBe("paperclip:agent-alpha");
    expect(row.entity_id).toContain("comp-1");
    expect(row.entity_id).toContain("agent-alpha");
  });

  it("FLEET-18: stores summary in the reason column and event details in metadata_json", async () => {
    const event = validActivityEvent({ summary: "Agent heartbeat received" });
    const req = makePostRequest(event);
    const res = await POST(req as any);
    const data = await res.json();

    const row = testDb
      .prepare("SELECT * FROM audit_entries WHERE id = ?")
      .get(data.auditId) as any;
    expect(row.reason).toBe("Agent heartbeat received");
    const meta = JSON.parse(row.metadata_json);
    expect(meta.companyId).toBe("comp-1");
    expect(meta.action).toBe("agent.heartbeat");
    expect(meta.source).toBe("paperclip");
    expect(meta.hardStopOwner).toBe("paperclip");
    expect(meta.paperclipTimestamp).toBe("2026-07-09T10:00:00Z");
  });

  it("FLEET-18: accepts all three actorType values (agent, user, system)", async () => {
    for (const actorType of ["agent", "user", "system"]) {
      const req = makePostRequest(validActivityEvent({ actorType }));
      const res = await POST(req as any);
      expect(res.status).toBe(201);
    }
  });

  it("FLEET-18: rejects missing companyId with 400", async () => {
    const req = makePostRequest(validActivityEvent({ companyId: undefined }));
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/companyId/i);
  });

  it("FLEET-18: rejects invalid actorType with 400", async () => {
    const req = makePostRequest(validActivityEvent({ actorType: "robot" }));
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/actorType/i);
  });

  it("FLEET-18: rejects missing action with 400", async () => {
    const req = makePostRequest(validActivityEvent({ action: undefined }));
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/action/i);
  });

  it("FLEET-18: rejects missing timestamp with 400", async () => {
    const req = makePostRequest(validActivityEvent({ timestamp: undefined }));
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/timestamp/i);
  });

  it("FLEET-18: rejects invalid JSON body with 400", async () => {
    const req = new Request("http://localhost/api/paperclip/activity", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid json/i);
  });
});

// ---------------------------------------------------------------------------
// No secret leaks (MEMSEC-08 regression spirit)
// ---------------------------------------------------------------------------

describe("POST /api/paperclip/activity — no secret leaks", () => {
  it("does not store redacted metadata keys (adapter_config, auth, token, secret) in audit_entries", async () => {
    const event = validActivityEvent({
      metadata: {
        adapter_config: { apiBaseUrl: "http://secret:3100" },
        authHeader: "Bearer super-secret-token",
        apiKey: "sk-12345",
        token: "tok-abc",
        secret: " Classified",
        password: "hunter2",
        env: { KEY: "value" },
        envVars: { FOO: "bar" },
        safeField: "this is fine",
      },
    });
    const req = makePostRequest(event);
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const data = await res.json();

    const row = testDb
      .prepare("SELECT * FROM audit_entries WHERE id = ?")
      .get(data.auditId) as any;
    const meta = JSON.parse(row.metadata_json);

    // Redacted keys must not appear
    expect(meta.adapter_config).toBeUndefined();
    expect(meta.adapterConfig).toBeUndefined();
    expect(meta.authHeader).toBeUndefined();
    expect(meta.apiKey).toBeUndefined();
    expect(meta.token).toBeUndefined();
    expect(meta.secret).toBeUndefined();
    expect(meta.password).toBeUndefined();
    expect(meta.env).toBeUndefined();
    expect(meta.envVars).toBeUndefined();

    // Safe field should pass through
    expect(meta.safeField).toBe("this is fine");
  });

  it("does not leak secrets into the reason column (reason is the summary only)", async () => {
    const event = validActivityEvent({
      summary: "Normal activity",
      metadata: { token: "super-secret" },
    });
    const req = makePostRequest(event);
    const res = await POST(req as any);
    const data = await res.json();

    const row = testDb
      .prepare("SELECT * FROM audit_entries WHERE id = ?")
      .get(data.auditId) as any;
    expect(row.reason).toBe("Normal activity");
    expect(row.reason).not.toContain("super-secret");
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation when Paperclip is unconfigured
// ---------------------------------------------------------------------------

describe("POST /api/paperclip/activity — graceful degradation", () => {
  it("works without PAPERCLIP_BASE_URL (activity ingestion is a local write, not an upstream proxy)", async () => {
    delete process.env.PAPERCLIP_BASE_URL;
    const req = makePostRequest(validActivityEvent());
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ingested).toBe(true);
  });

  it("does not require any upstream fetch — no network calls are made", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const req = makePostRequest(validActivityEvent());
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    // Activity ingestion must NOT call fetch — it is a local audit write only
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
