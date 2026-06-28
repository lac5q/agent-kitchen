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

async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

describe("POST /api/recall/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ingestion results on success", async () => {
    mockIngestAllSessions.mockReturnValue({
      filesProcessed: 3,
      rowsInserted: 42,
      filesSkipped: 1,
    });

    const { POST } = await loadRoute();
    const response = await POST();
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
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("DB connection lost");
  });

  it("returns 500 with String(err) when ingestAllSessions throws a non-Error", async () => {
    mockIngestAllSessions.mockImplementation(() => {
      throw "string error";
    });

    const { POST } = await loadRoute();
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("string error");
  });
});
