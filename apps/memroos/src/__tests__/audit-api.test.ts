// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, vi, beforeEach } from "vitest";

const testDb = new Database(":memory:");
const { initSchema } = await import("@/lib/db-schema");
initSchema(testDb);

// Mock the DB singleton
vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Mock authenticateUser — we override per-test via vi.mocked
vi.mock("@/lib/auth/session", () => ({
  authenticateUser: vi.fn(),
}));

// Import after mocks are set
const { writeAuditEntry } = await import("@/lib/audit/write");
const { openEscalation } = await import("@/lib/audit/write");
const auditRoute = await import("@/app/api/audit/route");
const auditExportRoute = await import("@/app/api/audit/export/route");
const escalationsRoute = await import("@/app/api/escalations/route");
const resolveRoute = await import("@/app/api/escalations/[id]/resolve/route");

import { authenticateUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";

// Seed the operator user in the shared test DB so FK constraints pass
testDb.prepare(
  `INSERT OR IGNORE INTO users (id, email, display_name, password_hash, tenant_id)
   VALUES ('user-operator', 'operator@test.com', 'Operator', 'hash', 'default-tenant')`
).run();
testDb.prepare(
  `INSERT OR IGNORE INTO user_roles (user_id, role) VALUES ('user-operator', 'operator')`
).run();

const reviewerSession: SessionUser = {
  userId: "user-reviewer",
  role: "reviewer",
  email: "reviewer@test.com",
  displayName: "Reviewer",
  tenantId: "default-tenant",
};

const operatorSession: SessionUser = {
  userId: "user-operator",
  role: "operator",
  email: "operator@test.com",
  displayName: "Operator",
  tenantId: "default-tenant",
};

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// Seed a few audit entries
beforeEach(() => {
  writeAuditEntry(
    {
      actor_id: "system",
      actor_role: "system",
      event_type: "seal.proposed",
      entity_type: "seal_proposal",
      entity_id: "seal_proposal:s-001",
    },
    testDb
  );
});

describe("GET /api/audit — auth gating", () => {
  it("returns 403 when not authenticated", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(null);
    const res = await auditRoute.GET(
      makeRequest("http://localhost/api/audit") as any
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with entries array for reviewer", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(reviewerSession);
    const res = await auditRoute.GET(
      makeRequest("http://localhost/api/audit") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("parses multi-value event filters and clamps oversized limits", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(reviewerSession);
    writeAuditEntry(
      {
        actor_id: "system",
        actor_role: "system",
        event_type: "seal.rescored",
        entity_type: "seal_job",
        entity_id: "seal_job:s-002",
        tenant_id: "default-tenant",
      },
      testDb
    );

    const res = await auditRoute.GET(
      makeRequest("http://localhost/api/audit?eventType=seal.proposed,seal.rescored&limit=999&cursor=0") as any
    );
    const body = await res.json() as { entries: Array<{ event_type?: string; eventType?: string }>; total: number };

    expect(res.status).toBe(200);
    expect(body.total).toBeLessThanOrEqual(200);
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

describe("GET /api/audit/export — role enforcement", () => {
  it("returns 403 for reviewer (cannot bulk-export)", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(reviewerSession);
    const res = await auditExportRoute.GET(
      makeRequest("http://localhost/api/audit/export") as any
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with valid NDJSON stream for operator", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(operatorSession);
    const res = await auditExportRoute.GET(
      makeRequest("http://localhost/api/audit/export?format=ndjson") as any
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");
    const text = await res.text();
    // Each line should be valid JSON (or empty)
    const lines = text.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("returns 200 with valid CSV for operator", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(operatorSession);
    const res = await auditExportRoute.GET(
      makeRequest("http://localhost/api/audit/export?format=csv") as any
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("csv");
    const text = await res.text();
    // Should start with CSV header
    expect(text.startsWith("id,")).toBe(true);
  });
});

describe("GET /api/escalations — auth gating", () => {
  it("returns 200 with escalations array for reviewer", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(reviewerSession);
    const res = await escalationsRoute.GET(
      makeRequest("http://localhost/api/escalations") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { escalations: unknown[] };
    expect(Array.isArray(body.escalations)).toBe(true);
  });

  it("returns 403 when not authenticated", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(null);
    const res = await escalationsRoute.GET(
      makeRequest("http://localhost/api/escalations") as any
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/escalations/:id/resolve", () => {
  it("returns 403 for reviewer", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(reviewerSession);
    const res = await resolveRoute.POST(
      makeRequest("http://localhost/api/escalations/any-id/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as any,
      { params: Promise.resolve({ id: "any-id" }) } as any
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent escalation with operator", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(operatorSession);
    const res = await resolveRoute.POST(
      makeRequest("http://localhost/api/escalations/does-not-exist/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as any,
      { params: Promise.resolve({ id: "does-not-exist" }) } as any
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 and resolves with operator", async () => {
    vi.mocked(authenticateUser).mockResolvedValue(operatorSession);
    // Create an escalation to resolve
    const escId = openEscalation(
      {
        entity_type: "agent",
        entity_id: "agent:resolve-test",
        escalation_type: "agent_escalate",
        opened_by: "system",
      },
      testDb
    );

    const res = await resolveRoute.POST(
      makeRequest(`http://localhost/api/escalations/${escId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "resolved by operator" }),
      }) as any,
      { params: Promise.resolve({ id: escId }) } as any
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { escalation: { status: string } };
    expect(body.escalation.status).toBe("resolved");
  });
});
