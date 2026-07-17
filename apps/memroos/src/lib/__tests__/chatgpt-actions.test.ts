// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants", () => ({
  CLAUDE_MEMORY_PATH: "/tmp/claude-memory",
  MEM0_URL: "http://mem0.test",
}));

vi.mock("@/lib/memory/backends", () => ({
  searchVectorMemory: vi.fn(),
  queryGraphMemory: vi.fn(),
}));

vi.mock("@/lib/parsers", () => ({
  parseClaudeMemory: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: () => ({
      get: () => null,
      all: () => [],
    }),
  })),
}));

vi.mock("@/lib/memory/policy-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memory/policy-gate")>();
  return {
    ...actual,
    filterAuthorizedMemoryItems: (_db: unknown, items: unknown[]) => items,
  };
});

import {
  authorizeChatGptAction,
  decodeChatGptActionResult,
  parseActionLimit,
  readJsonBody,
  searchMemroosForChatGpt,
} from "@/lib/chatgpt-actions";
import { searchVectorMemory, queryGraphMemory } from "@/lib/memory/backends";
import { parseClaudeMemory } from "@/lib/parsers";

describe("chatgpt-actions helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MEMROOS_CHATGPT_ACTIONS_API_KEY;
    delete process.env.MEMROOS_CHATGPT_ACTIONS_REQUIRE_KEY_LOCAL;
  });

  it("authorizes loopback requests without a key by default", () => {
    expect(authorizeChatGptAction(new Request("http://localhost/api/chatgpt/actions/search"))).toBeNull();
  });

  it("requires a configured API key for remote hosts", () => {
    const response = authorizeChatGptAction(
      new Request("https://memroos.example/api/chatgpt/actions/search"),
    );
    expect(response?.status).toBe(503);
  });

  it("accepts x-api-key and bearer tokens with timing-safe comparison", () => {
    process.env.MEMROOS_CHATGPT_ACTIONS_API_KEY = "secret-key";

    expect(
      authorizeChatGptAction(
        new Request("https://memroos.example/api/chatgpt/actions/search", {
          headers: { "x-api-key": "secret-key" },
        }),
      ),
    ).toBeNull();

    expect(
      authorizeChatGptAction(
        new Request("https://memroos.example/api/chatgpt/actions/search", {
          headers: { authorization: "Bearer secret-key" },
        }),
      ),
    ).toBeNull();

    expect(
      authorizeChatGptAction(
        new Request("https://memroos.example/api/chatgpt/actions/search", {
          headers: { host: "memroos.example", authorization: "Bearer wrong" },
        }),
      )?.status,
    ).toBe(401);
  });

  it("parses action limits and JSON bodies defensively", async () => {
    expect(parseActionLimit("not-a-number", 4)).toBe(4);
    expect(parseActionLimit("-3")).toBe(1);

    await expect(readJsonBody(new Request("https://x", { method: "POST", body: "[]" }))).resolves.toEqual({});
    await expect(
      readJsonBody(new Request("https://x", { method: "POST", body: JSON.stringify({ query: "x" }) })),
    ).resolves.toEqual({ query: "x" });
  });

  it("rejects invalid encoded result ids and malformed payloads", () => {
    expect(() => decodeChatGptActionResult("not-memroos")).toThrow(/Invalid MemRoOS result id/);

    const invalidPayload = `memroos:${Buffer.from(JSON.stringify({ title: "", text: "" }), "utf8").toString("base64url")}`;
    expect(() => decodeChatGptActionResult(invalidPayload)).toThrow(/Invalid MemRoOS result payload/);
  });
});

describe("searchMemroosForChatGpt normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes graph row results and episodic matches", async () => {
    vi.mocked(searchVectorMemory).mockResolvedValue([]);
    vi.mocked(queryGraphMemory).mockResolvedValue({
      results: [{ data: [{ row: [{ memory: "graph node hit" }] }] }],
    });
    vi.mocked(parseClaudeMemory).mockResolvedValue([
      {
        id: "ep-1",
        content: "mobile bridge preference",
        agent: "claude",
        date: "2026-05-21T00:00:00.000Z",
        type: "project",
        source: "claude-memory",
        score: 0.8,
      },
      {
        id: "ep-2",
        content: "unrelated note",
        agent: "claude",
        date: "2026-05-21T00:00:00.000Z",
        type: "project",
        source: "claude-memory",
      },
    ]);

    const result = await searchMemroosForChatGpt("mobile bridge", 5);

    expect(result.results.some((item) => item.tier === "graph" && item.text.includes("graph node hit"))).toBe(true);
    expect(result.results.some((item) => item.tier === "episodic" && item.text.includes("mobile bridge"))).toBe(true);
    expect(result.tiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: "vector", ok: true, count: 0 }),
        expect.objectContaining({ tier: "graph", ok: true }),
        expect.objectContaining({ tier: "episodic", ok: true }),
      ]),
    );
  });

  it("surfaces backend failures without throwing", async () => {
    vi.mocked(searchVectorMemory).mockRejectedValue("vector offline");
    vi.mocked(queryGraphMemory).mockRejectedValue(new Error("graph offline"));
    vi.mocked(parseClaudeMemory).mockRejectedValue(new Error("episodic offline"));

    const result = await searchMemroosForChatGpt("anything", 3);

    expect(result.results).toEqual([]);
    expect(result.tiers).toEqual([
      expect.objectContaining({ tier: "vector", ok: false, error: "Vector memory backend unavailable" }),
      expect.objectContaining({ tier: "graph", ok: false, error: "graph offline" }),
      expect.objectContaining({ tier: "episodic", ok: false, error: "episodic offline" }),
    ]);
  });
});
