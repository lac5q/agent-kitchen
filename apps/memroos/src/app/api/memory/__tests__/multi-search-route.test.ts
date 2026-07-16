// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants", () => ({
  CLAUDE_MEMORY_PATH: "/tmp/claude-memory.jsonl",
  MEM0_URL: "http://mem0.test",
}));

vi.mock("@/lib/parsers", () => ({
  parseClaudeMemory: vi.fn(),
}));

vi.mock("@/lib/memory/backends", () => ({
  searchVectorMemory: vi.fn(),
  queryGraphMemory: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn() })),
  })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("../multi-search/route");
}

describe("multi memory search route", () => {
  beforeEach(async () => {
    const parsers = await import("@/lib/parsers");
    const backends = await import("@/lib/memory/backends");

    vi.mocked(parsers.parseClaudeMemory).mockResolvedValue([
      {
        id: "e1",
        content: "Product roadmap memory survives across sessions",
        agent: "claude",
        date: "2026-05-11",
        type: "project",
        source: "local",
      },
      {
        id: "e2",
        content: "Unrelated note",
        agent: "claude",
        date: "2026-05-10",
        type: "daily",
        source: "local",
      },
    ]);
    vi.mocked(backends.searchVectorMemory).mockResolvedValue({
      results: [
        {
          id: "v1",
          memory: "Vector memory result",
          score: 0.87,
          metadata: { visibility: "internal", policy: "agent_visible" },
        },
      ],
    });
    vi.mocked(backends.queryGraphMemory).mockResolvedValue({
      results: [
        {
          data: [
            {
              row: [
                {
                  name: "Product",
                  summary: "Graph memory result",
                  metadata: { visibility: "internal", policy: "agent_visible" },
                },
                ["MENTIONS"],
                [{ name: "Roadmap" }],
              ],
            },
          ],
        },
      ],
    });
  });

  it("returns only policy-authorized vector and graph search results", async () => {
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/multi-search?q=roadmap&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.query).toBe("roadmap");
    expect(body.tiers.map((tier: { tier: string; ok: boolean }) => [tier.tier, tier.ok])).toEqual([
      ["vector", true],
      ["graph", true],
      ["episodic", true],
    ]);
    expect(body.results.map((result: { tier: string }) => result.tier)).toEqual(["vector", "graph"]);
    expect(body.tiers).toMatchObject([
      { tier: "vector", ok: true, count: 1 },
      { tier: "graph", ok: true, count: 1 },
      { tier: "episodic", ok: true, count: 0 },
    ]);
    // Each tier now carries a truthful metric envelope so the UI can
    // distinguish healthy empty from offline / errored / blocked.
    for (const t of body.tiers) {
      expect(t.metric).toMatchObject({
        scope: expect.objectContaining({ window: expect.any(String), workspace: expect.any(String) }),
        source: expect.any(String),
        status: expect.any(String),
      });
    }
  });

  it("fails closed for unlabeled external search results", async () => {
    const backends = await import("@/lib/memory/backends");
    vi.mocked(backends.searchVectorMemory).mockResolvedValue({
      results: [{ id: "v1", memory: "Unclassified vector memory", score: 0.87 }],
    });
    vi.mocked(backends.queryGraphMemory).mockResolvedValue({
      results: [{ data: [{ row: [{ name: "Unclassified graph memory" }, [], []] }] }],
    });

    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/multi-search?q=memory&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.tiers.map((tier: { count: number }) => tier.count)).toEqual([0, 0, 0]);
  });

  it("requires a query", async () => {
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/multi-search"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "Query is required" });
  });
});

describe("multi memory search truthful metric contract (VAL-MEM-002)", () => {
  it("emits a per-tier metric envelope so healthy empty is distinct from offline / blocked / errored", async () => {
    const backends = await import("@/lib/memory/backends");
    vi.mocked(backends.searchVectorMemory).mockResolvedValue({
      results: [
        { id: "v1", memory: "Vector hit", score: 0.9, metadata: { visibility: "internal", policy: "agent_visible" } },
      ],
    });
    vi.mocked(backends.queryGraphMemory).mockRejectedValue(new Error("neo4j unreachable"));
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/multi-search?q=truthful&q=foo&limit=5"));
    const body = await response.json();

    expect(body.tiers).toHaveLength(3);
    const byName = Object.fromEntries(
      body.tiers.map((t: { tier: string; metric: { status: string; value: number | null; source: string; observedAt: string | null; reason: string | null } }) => [
        t.tier,
        { tier: t.tier, ok: t.ok, ...t.metric },
      ])
    );

    // Vector: 1 successful hit -> live + value=1
    expect(byName.vector).toMatchObject({ tier: "vector", status: "live", value: 1, ok: true });
    expect(byName.vector.source).toBe("mem0-qdrant");
    expect(typeof byName.vector.observedAt).toBe("string");

    // Graph: backend failed -> error + value=null + ok=false
    expect(byName.graph.status).toBe("error");
    expect(byName.graph.value).toBeNull();
    expect(byName.graph.ok).toBe(false);
    expect(byName.graph.reason).toMatch(/neo4j/i);
    expect(byName.graph.source).toBe("neo4j");

    // Episodic: no claude entries that match -> empty (healthy source, no hits)
    expect(byName.episodic.status).toBe("empty");
    expect(byName.episodic.value).toBeNull();
    expect(byName.episodic.ok).toBe(true);
    expect(byName.episodic.source).toBe("claude-memory-jsonl");
    expect(byName.episodic.reason).toMatch(/no observations|no results|empty/i);
  });

  it("distinguishes a healthy no-result from a denied tier result", async () => {
    const backends = await import("@/lib/memory/backends");
    vi.mocked(backends.searchVectorMemory).mockResolvedValue({
      results: [{ id: "v1", memory: "policy denied", score: 0.9 }],
    });
    vi.mocked(backends.queryGraphMemory).mockResolvedValue({ results: [] });
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/multi-search?q=anything&limit=5"));
    const body = await response.json();

    const byName = Object.fromEntries(
      body.tiers.map((t: { tier: string; metric: { status: string; value: number | null } }) => [
        t.tier,
        { ok: t.ok, count: t.count, error: t.error, ...t.metric },
      ])
    );
    // Vector hit but filtered out by policy => blocked (count 0 but source ok)
    expect(byName.vector.status).toBe("blocked");
    expect(byName.vector.value).toBeNull();
    // Graph returned empty list => empty (healthy, no hits)
    expect(byName.graph.status).toBe("empty");
    expect(byName.graph.value).toBeNull();
  });
});
