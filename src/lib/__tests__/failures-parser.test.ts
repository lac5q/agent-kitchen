// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: vi.fn() };
});

const { readFile } = await import("fs/promises");
const { parseFailuresLog, aggregateFailures } = await import("../failures-parser");

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: build a compact single-line JSON entry
function makeEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2026-04-13T10:00:00Z",
    agent_id: "hermes",
    error_type: "permission_denied",
    ...overrides,
  });
}

// Helper: build a multi-line pretty-printed entry
function makeMultiLineEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      timestamp: "2026-04-13T10:00:00Z",
      agent_id: "gwen",
      error_type: "timeout",
      ...overrides,
    },
    null,
    2
  );
}

describe("parseFailuresLog", () => {
  it("Test 1: parses three single-line JSON entries", async () => {
    const content = [
      makeEntry({ agent_id: "hermes", error_type: "permission_denied" }),
      makeEntry({ agent_id: "gwen",   error_type: "timeout" }),
      makeEntry({ agent_id: "alba",   error_type: "file_not_found" }),
    ].join("\n");
    mockReadFile.mockResolvedValue(content as never);
    const entries = await parseFailuresLog("/fake/failures.log");
    expect(entries).toHaveLength(3);
    expect(entries[0].agent_id).toBe("hermes");
    expect(entries[1].agent_id).toBe("gwen");
    expect(entries[2].agent_id).toBe("alba");
  });

  it("Test 2 (CRITICAL): parses a single multi-line pretty-printed JSON object as ONE entry", async () => {
    // This is the test that breaks naive splitlines + JSON.parse
    const content = makeMultiLineEntry({ agent_id: "gwen", error_type: "timeout" });
    // Verify it actually spans multiple lines
    expect(content.split("\n").length).toBeGreaterThan(1);
    mockReadFile.mockResolvedValue(content as never);
    const entries = await parseFailuresLog("/fake/failures.log");
    // Must be exactly 1 entry, NOT 8 (one per line)
    expect(entries).toHaveLength(1);
    expect(entries[0].agent_id).toBe("gwen");
    expect(entries[0].error_type).toBe("timeout");
  });

  it("Test 3: parses mixed single-line and multi-line entries in the same file", async () => {
    const singleLine = makeEntry({ agent_id: "hermes", error_type: "permission_denied" });
    const multiLine = makeMultiLineEntry({ agent_id: "gwen", error_type: "timeout" });
    const content = singleLine + "\n" + multiLine + "\n" + makeEntry({ agent_id: "alba", error_type: "file_not_found" });
    mockReadFile.mockResolvedValue(content as never);
    const entries = await parseFailuresLog("/fake/failures.log");
    expect(entries).toHaveLength(3);
    const agentIds = entries.map(e => e.agent_id);
    expect(agentIds).toContain("hermes");
    expect(agentIds).toContain("gwen");
    expect(agentIds).toContain("alba");
  });

  it("Test 6: returns [] for empty file", async () => {
    mockReadFile.mockResolvedValue("" as never);
    const entries = await parseFailuresLog("/fake/failures.log");
    expect(entries).toEqual([]);
  });

  it("Test 7: returns [] when file does not exist (ENOENT) — does NOT reject", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })
    );
    // Must resolve to [] — not reject
    await expect(parseFailuresLog("/nonexistent/path")).resolves.toEqual([]);
  });

  it("Test 8: skips unterminated JSON at EOF, returns earlier complete entries", async () => {
    const complete1 = makeEntry({ agent_id: "hermes", error_type: "permission_denied" });
    const complete2 = makeEntry({ agent_id: "gwen",   error_type: "timeout" });
    const unterminated = '{"timestamp": "2026-04-13T10:00:00Z", "agent_id": "broken"'; // no closing brace
    const content = complete1 + "\n" + complete2 + "\n" + unterminated;
    mockReadFile.mockResolvedValue(content as never);
    const entries = await parseFailuresLog("/fake/failures.log");
    expect(entries).toHaveLength(2);
    expect(entries[0].agent_id).toBe("hermes");
    expect(entries[1].agent_id).toBe("gwen");
  });
});

describe("aggregateFailures", () => {
  it("Test 4: filters disk_critical from failuresByErrorType", () => {
    const entries = [
      { timestamp: "t", agent_id: "hermes", error_type: "permission_denied" },
      { timestamp: "t", agent_id: "hermes", error_type: "permission_denied" },
      { timestamp: "t", agent_id: "gwen",   error_type: "disk_critical" },
      { timestamp: "t", agent_id: "gwen",   error_type: "disk_critical" },
      { timestamp: "t", agent_id: "gwen",   error_type: "disk_critical" },
      { timestamp: "t", agent_id: "alba",   error_type: "timeout" },
    ];
    const result = aggregateFailures(entries);
    expect(result.failuresByErrorType).toEqual({ permission_denied: 2, timeout: 1 });
    expect(result.failuresByErrorType).not.toHaveProperty("disk_critical");
  });

  it("Test 5: groups failures by agent_id; missing agent_id goes to 'unknown' bucket", () => {
    const entries = [
      { timestamp: "t", agent_id: "hermes",    error_type: "permission_denied" },
      { timestamp: "t", agent_id: "hermes",    error_type: "timeout" },
      { timestamp: "t", agent_id: "gwen",      error_type: "permission_denied" },
      { timestamp: "t", error_type: "timeout" }, // no agent_id
    ];
    const result = aggregateFailures(entries);
    expect(result.failuresByAgent).toEqual({ hermes: 2, gwen: 1, unknown: 1 });
  });

  it("Test 6b: aggregateFailures([]) returns empty objects — never undefined", () => {
    const result = aggregateFailures([]);
    expect(result.failuresByAgent).toEqual({});
    expect(result.failuresByErrorType).toEqual({});
    // Explicitly not undefined/null
    expect(result.failuresByAgent).not.toBeUndefined();
    expect(result.failuresByErrorType).not.toBeUndefined();
  });
});
