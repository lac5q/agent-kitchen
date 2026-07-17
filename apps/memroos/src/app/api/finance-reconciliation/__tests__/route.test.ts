// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

const authorizeRegistryWriteMock = vi.hoisted(() => vi.fn(() => true));

let testDb: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: authorizeRegistryWriteMock,
  registryWriteUnauthorizedResponse: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

beforeEach(() => {
  testDb = makeDb();
  authorizeRegistryWriteMock.mockReset();
  authorizeRegistryWriteMock.mockReturnValue(true);
});

afterEach(() => {
  testDb.close();
});

describe("POST /api/finance-reconciliation", () => {
  it("processes the demo mode and returns reconciliation summary counts", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/finance-reconciliation", {
      method: "POST",
      body: JSON.stringify({ mode: "demo", count: 100 }),
    });

    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.processed).toBe(100);
    expect(body.summary.auditEntries).toBe(100);
    expect(body.summary.hilEscalations).toBe(body.summary.escalated);
  });

  it("processes uploaded CSV payloads", async () => {
    const { POST } = await import("../route");
    const csv = [
      "transaction_id,correlation_id,amount,expected_amount,status,confidence,reason",
      "txn-route,corr-route,10,12,mismatched,0.4,needs review",
    ].join("\n");
    const req = new Request("http://localhost/api/finance-reconciliation", {
      method: "POST",
      body: JSON.stringify({ mode: "csv", csv }),
    });

    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.processed).toBe(1);
    expect(body.summary.mismatched).toBe(1);
    expect(body.summary.hilEscalations).toBe(1);
  });

  it("returns 401 when registry write is unauthorized", async () => {
    authorizeRegistryWriteMock.mockReturnValueOnce(false);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/finance-reconciliation", {
        method: "POST",
        body: JSON.stringify({ mode: "demo" }),
      }) as never
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when the JSON body is missing or invalid", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/finance-reconciliation", {
        method: "POST",
        body: "not-json",
      }) as never
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("JSON body required");
  });

  it("processes webhook and batched event payloads", async () => {
    const { POST } = await import("../route");

    const webhookRes = await POST(
      new Request("http://localhost/api/finance-reconciliation", {
        method: "POST",
        body: JSON.stringify({
          mode: "webhook",
          event: {
            transaction_id: "txn-webhook",
            correlation_id: "corr-webhook",
            amount: 10,
            expected_amount: 10,
            status: "matched",
            confidence: 0.99,
          },
        }),
      }) as never
    );
    expect(webhookRes.status).toBe(200);
    expect((await webhookRes.json()).summary.processed).toBe(1);

    const eventsRes = await POST(
      new Request("http://localhost/api/finance-reconciliation", {
        method: "POST",
        body: JSON.stringify({
          mode: "events",
          events: [
            {
              transaction_id: "txn-batch",
              correlation_id: "corr-batch",
              amount: 5,
              expected_amount: 5,
              status: "matched",
              confidence: 0.9,
            },
          ],
        }),
      }) as never
    );
    expect(eventsRes.status).toBe(200);
    expect((await eventsRes.json()).summary.processed).toBe(1);
  });

  it("returns 400 for unsupported reconciliation modes", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/finance-reconciliation", {
        method: "POST",
        body: JSON.stringify({ mode: "unsupported" }),
      }) as never
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unsupported finance reconciliation mode/i);
  });
});
