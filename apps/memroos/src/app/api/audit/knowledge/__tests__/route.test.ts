// @vitest-environment node
/**
 * Phase 125 / ENTOPS-03: tests for POST /api/audit/knowledge.
 *
 * Verifies the central-audit ingest endpoint enforces:
 *  - 401 when the Authorization header is missing
 *  - 403 when the bearer key does not match MEMROOS_AGENT_API_KEY
 *  - 503 when MEMROOS_AGENT_API_KEY is not configured (operator mode off)
 *  - 400 on invalid body
 *  - 201 + entryHash + audit_entries row on success
 *  - hash chaining: two POSTs produce a chain where row 2's
 *    previousEntryHash == row 1's entryHash
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `audit-knowledge-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "audit.db");
const TEST_AGENT_KEY = "phase-125-test-agent-key-do-not-reuse";

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_AGENT_API_KEY = TEST_AGENT_KEY;
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    POST: route.POST,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
  };
}

function makeReq(body: unknown, bearer?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`;
  return new Request("http://localhost/api/audit/knowledge", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Partial<{
  tenant_id: string;
  user_id: string;
  agent_id: string;
  operation: "write" | "read" | "delete" | "search";
  path: string;
  op_hash: string;
}> = {}) {
  return {
    tenant_id: "tenant-alpha",
    user_id: "user-1",
    agent_id: "mcp-agent-1",
    operation: "write" as const,
    path: "shared/notes.md",
    op_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    ...overrides,
  };
}

// Imported lazily because vi.resetModules requires a fresh import per load.
async function importVi() {
  const { vi } = await import("vitest");
  return vi;
}

describe("POST /api/audit/knowledge", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_AGENT_API_KEY;
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/bearer/i);
  });

  it("returns 403 when the bearer key is wrong", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq(validBody(), "definitely-not-the-key"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/api key/i);
  });

  it("returns 503 when MEMROOS_AGENT_API_KEY is not configured", async () => {
    // Pre-load the route so the DB is initialized (SQLITE_DB_PATH must be
    // set during the first import), then clear the key.
    process.env.SQLITE_DB_PATH = TEST_DB_PATH;
    process.env.MEMROOS_AGENT_API_KEY = TEST_AGENT_KEY;
    const vi = await importVi();
    vi.resetModules();
    const dbModule = await import("@/lib/db");
    dbModule.getDb();
    dbModule.closeDb();

    delete process.env.MEMROOS_AGENT_API_KEY;
    vi.resetModules();
    const route = await import("../route");

    const res = await route.POST(
      makeReq(validBody(), TEST_AGENT_KEY)
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/disabled/i);
  });

  it("returns 400 on invalid body (missing required field)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ tenant_id: "tenant-alpha" }, TEST_AGENT_KEY)
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation failed");
  });

  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/audit/knowledge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TEST_AGENT_KEY}`,
      },
      body: "this is not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("writes a hash-chained audit_entries row and returns 201 + entryHash", async () => {
    const { POST, getDb } = await loadRoute();
    const res = await POST(makeReq(validBody({ tenant_id: "tenant-alpha" }), TEST_AGENT_KEY));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      entryHash: string;
      tenantId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f-]+$/);
    expect(body.entryHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.tenantId).toBe("tenant-alpha");

    // Confirm the row is in the DB with the expected event/entity types.
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, event_type, entity_type, metadata_json FROM audit_entries WHERE id = ?"
      )
      .get(body.id) as
      | { id: string; event_type: string; entity_type: string; metadata_json: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.event_type).toBe("knowledge.access");
    expect(row?.entity_type).toBe("knowledge_vault");
    const parsed = JSON.parse(row?.metadata_json ?? "{}") as Record<string, unknown>;
    expect(parsed.path).toBe("shared/notes.md");
    expect(parsed.operation).toBe("write");
    expect(parsed.previousEntryHash).toBeNull(); // first row in tenant
  });

  it("chains two writes -- row 2's previousEntryHash == row 1's entryHash", async () => {
    const { POST, getDb } = await loadRoute();
    const tenantId = "tenant-bravo";

    const first = await POST(
      makeReq(validBody({ tenant_id: tenantId, path: "a.md" }), TEST_AGENT_KEY)
    );
    const firstBody = (await first.json()) as { entryHash: string };

    const second = await POST(
      makeReq(validBody({ tenant_id: tenantId, path: "b.md" }), TEST_AGENT_KEY)
    );
    const secondBody = (await second.json()) as { entryHash: string };

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const db = getDb();
    const rows = db
      .prepare(
        "SELECT id, metadata_json FROM audit_entries WHERE tenant_id = ? ORDER BY rowid ASC"
      )
      .all(tenantId) as { id: string; metadata_json: string }[];

    expect(rows).toHaveLength(2);

    const firstMeta = JSON.parse(rows[0].metadata_json) as Record<string, unknown>;
    const secondMeta = JSON.parse(rows[1].metadata_json) as Record<string, unknown>;

    expect(firstMeta.entryHash).toBe(firstBody.entryHash);
    expect(secondMeta.entryHash).toBe(secondBody.entryHash);
    expect(secondMeta.previousEntryHash).toBe(firstMeta.entryHash);
    expect(firstMeta.previousEntryHash).toBeNull();
  });

  it("isolates chains across tenants (different tenants do not link)", async () => {
    const { POST, getDb } = await loadRoute();
    await POST(makeReq(validBody({ tenant_id: "tenant-x" }), TEST_AGENT_KEY));
    await POST(makeReq(validBody({ tenant_id: "tenant-y" }), TEST_AGENT_KEY));

    const db = getDb();
    const xs = db
      .prepare("SELECT metadata_json FROM audit_entries WHERE tenant_id = ?")
      .all("tenant-x") as { metadata_json: string }[];
    const ys = db
      .prepare("SELECT metadata_json FROM audit_entries WHERE tenant_id = ?")
      .all("tenant-y") as { metadata_json: string }[];

    const xMeta = JSON.parse(xs[0].metadata_json) as Record<string, unknown>;
    const yMeta = JSON.parse(ys[0].metadata_json) as Record<string, unknown>;

    expect(xMeta.previousEntryHash).toBeNull();
    expect(yMeta.previousEntryHash).toBeNull();
    expect(xMeta.entryHash).not.toBe(yMeta.entryHash);
  });
});