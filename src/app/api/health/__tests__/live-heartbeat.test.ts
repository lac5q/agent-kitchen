// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execFileSync: vi.fn() };
});

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, stat: vi.fn(), readFile: vi.fn() };
});

vi.mock("@/lib/constants", () => ({
  MEM0_URL: "http://localhost:3201",
  AGENT_CONFIGS_PATH: "/tmp/agent-configs",
  OBSIDIAN_VAULT_PATH: "/tmp/vault",
  CURATOR_LOG_PATH: "/tmp/knowledge-curator.log",
}));

const { obsidianStatus, curatorStatus } = await import("../route");
const { stat: fsStat, readFile } = await import("fs/promises");

const mockStat = vi.mocked(fsStat);
const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("obsidianStatus", () => {
  it("returns 'down' when vault root is inaccessible", async () => {
    mockStat.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect(await obsidianStatus()).toBe("down");
  });

  it("returns 'degraded' when vault accessible but today's journal missing", async () => {
    mockStat.mockResolvedValueOnce({} as never); // vault root OK
    mockStat.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" })); // journal missing
    expect(await obsidianStatus()).toBe("degraded");
  });

  it("returns 'up' when vault and today's journal both exist", async () => {
    mockStat.mockResolvedValueOnce({} as never); // vault root OK
    mockStat.mockResolvedValueOnce({} as never); // journal OK
    expect(await obsidianStatus()).toBe("up");
  });
});

describe("curatorStatus", () => {
  const FRESH_MTIME = { mtimeMs: Date.now() - 1 * 60 * 60 * 1000 }; // 1h ago
  const STALE_MTIME = { mtimeMs: Date.now() - 30 * 60 * 60 * 1000 }; // 30h ago

  const LOG_CLEAN = [
    "[2026-04-12 02:00:03] Starting Knowledge Curator...",
    "[2026-04-12 02:00:28] Knowledge Curator complete.",
  ].join("\n");

  const LOG_WARNINGS = [
    "[2026-04-12 02:00:03] Starting Knowledge Curator...",
    "[2026-04-12 02:00:07]   Warning: gitnexus-index failed (non-fatal)",
    "[2026-04-12 02:00:28] Knowledge Curator complete.",
  ].join("\n");

  const LOG_INCOMPLETE = [
    "[2026-04-12 02:00:03] Starting Knowledge Curator...",
    "[2026-04-12 02:00:07] [1/5] GitNexus analyze...",
    // no completion line
  ].join("\n");

  it("returns 'down' when log file does not exist", async () => {
    mockStat.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect(await curatorStatus()).toBe("down");
  });

  it("returns 'down' when log is older than 26h", async () => {
    mockStat.mockResolvedValueOnce(STALE_MTIME as never);
    expect(await curatorStatus()).toBe("down");
  });

  it("returns 'down' when log is fresh but run did not complete", async () => {
    mockStat.mockResolvedValueOnce(FRESH_MTIME as never);
    mockReadFile.mockResolvedValueOnce(LOG_INCOMPLETE);
    expect(await curatorStatus()).toBe("down");
  });

  it("returns 'degraded' when run completed with warnings", async () => {
    mockStat.mockResolvedValueOnce(FRESH_MTIME as never);
    mockReadFile.mockResolvedValueOnce(LOG_WARNINGS);
    expect(await curatorStatus()).toBe("degraded");
  });

  it("returns 'up' when run completed with no warnings", async () => {
    mockStat.mockResolvedValueOnce(FRESH_MTIME as never);
    mockReadFile.mockResolvedValueOnce(LOG_CLEAN);
    expect(await curatorStatus()).toBe("up");
  });

  it("checks only the last run block — ignores previous completed run if current is incomplete", async () => {
    const LOG_MULTI_RUN = [
      "[2026-04-11 02:00:03] Starting Knowledge Curator...",
      "[2026-04-11 02:00:28] Knowledge Curator complete.",
      "[2026-04-12 02:00:03] Starting Knowledge Curator...",
      "[2026-04-12 02:00:07] [1/5] GitNexus analyze...",
      // no second completion
    ].join("\n");
    mockStat.mockResolvedValueOnce(FRESH_MTIME as never);
    mockReadFile.mockResolvedValueOnce(LOG_MULTI_RUN);
    expect(await curatorStatus()).toBe("down");
  });
});
