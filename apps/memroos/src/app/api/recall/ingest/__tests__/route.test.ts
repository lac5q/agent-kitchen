// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/db-ingest", () => ({
  ingestAllSessions: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
}));

import { ingestAllSessions } from "@/lib/db-ingest";
import { writeAuditLog } from "@/lib/audit";

const mockIngestAllSessions = vi.mocked(ingestAllSessions);
const mockWriteAuditLog = vi.mocked(writeAuditLog);
const originalOperatorKey = process.env.MEMROOS_OPERATOR_API_KEY;

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

describe("POST /api/recall/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.MEMROOS_OPERATOR_API_KEY = originalOperatorKey;
    vi.restoreAllMocks();
  });

  it("returns ingestion results on success", async () => {
    mockIngestAllSessions.mockReturnValue({
      filesProcessed: 3,
      rowsInserted: 42,
      filesSkipped: 1,
    });

    const { POST } = await loadRoute();
    const response = await POST(new Request("http://localhost/api/recall/ingest", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filesProcessed).toBe(3);
    expect(body.rowsInserted).toBe(42);
    expect(body.filesSkipped).toBe(1);
    expect(body.timestamp).toBeTruthy();
    expect(mockWriteAuditLog).toHaveBeenCalledOnce();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: "system",
        action: "ingest_run",
        target: "recall",
        severity: "info",
      })
    );
  });

  it("returns 500 with error message when ingestAllSessions throws an Error", async () => {
    mockIngestAllSessions.mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    const { POST } = await loadRoute();
    const response = await POST(new Request("http://localhost/api/recall/ingest", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("DB connection lost");
  });

  it("returns 500 with String(err) when ingestAllSessions throws a non-Error", async () => {
    mockIngestAllSessions.mockImplementation(() => {
      throw "string error";
    });

    const { POST } = await loadRoute();
    const response = await POST(new Request("http://localhost/api/recall/ingest", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("string error");
  });

  it("rejects non-local requests without operator authorization", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";

    const { POST } = await loadRoute();
    const response = await POST(new Request("https://memroos.example/api/recall/ingest", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(mockIngestAllSessions).not.toHaveBeenCalled();
  });

  it("allows non-local requests with operator authorization", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    mockIngestAllSessions.mockReturnValue({
      filesProcessed: 1,
      rowsInserted: 2,
      filesSkipped: 0,
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("https://memroos.example/api/recall/ingest", {
        method: "POST",
        headers: { "x-memroos-operator-key": "operator-secret" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rowsInserted).toBe(2);
    expect(mockIngestAllSessions).toHaveBeenCalledOnce();
  });
});
