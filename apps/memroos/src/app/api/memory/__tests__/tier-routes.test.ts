// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateAgentHeaders } from "@/lib/agent/registry";

vi.mock("@/lib/agent/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/registry")>();
  return { ...actual, authenticateAgentHeaders: vi.fn(() => null) };
});

const mockAuthenticateAgentHeaders = vi.mocked(authenticateAgentHeaders);

async function loadSearchRoute() {
  vi.resetModules();
  return import("../search/route");
}

async function loadGraphRoute() {
  vi.resetModules();
  return import("../graph/route");
}

async function loadHealthRoute() {
  vi.resetModules();
  return import("../health/route");
}

describe("memory tier routes", () => {
  beforeEach(() => {
    mockAuthenticateAgentHeaders.mockReset();
    mockAuthenticateAgentHeaders.mockReturnValue(null);
    process.env.MEM0_URL = "http://mem0.test";
    process.env.NEO4J_HTTP_URL = "http://neo4j.test";
    process.env.NEO4J_USERNAME = "neo4j";
    process.env.NEO4J_PASSWORD = "secret";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, results: [{ id: "m1" }] })));
  });

  afterEach(() => {
    delete process.env.MEM0_URL;
    delete process.env.NEO4J_HTTP_URL;
    delete process.env.NEO4J_USERNAME;
    delete process.env.NEO4J_PASSWORD;
    delete process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    vi.unstubAllGlobals();
  });

  it("searches the vector tier through mem0", async () => {
    const { GET } = await loadSearchRoute();

    const response = await GET(new Request("http://localhost/api/memory/search?q=agent&limit=3"));
    const body = await response.json();
    const outboundUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, tier: "vector" });
    expect(`${outboundUrl.origin}${outboundUrl.pathname}`).toBe("http://mem0.test/memory/search");
    expect(outboundUrl.searchParams.get("q")).toBe("agent");
    expect(outboundUrl.searchParams.get("limit")).toBe("3");
  });

  it("filters vector search payloads through the retrieval policy gate", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        ok: true,
        results: [
          { id: "private", memory: "unclassified memory" },
          { id: "visible", memory: "agent visible memory", metadata: { visibility: "internal", policy: "agent_visible" } },
        ],
      })
    );
    const { GET } = await loadSearchRoute();

    const response = await GET(new Request("http://localhost/api/memory/search?q=agent&limit=3"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toEqual([
      {
        id: "visible",
        content: "agent visible memory",
        metadata: {
          id: "visible",
          memory: "agent visible memory",
          metadata: { visibility: "internal", policy: "agent_visible" },
        },
      },
    ]);
  });

  it("queries graph memory through Neo4j HTTP with parameterized search", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ results: [{ data: [{ row: [{ name: "Luis" }, [], []] }] }] })
    );
    const { GET } = await loadGraphRoute();

    const response = await GET(new Request("http://localhost/api/memory/graph?q=Luis&limit=2"));
    const body = await response.json();
    const outbound = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, tier: "graph" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://neo4j.test/db/neo4j/tx/commit");
    expect(outbound.statements[0].parameters).toMatchObject({ q: "luis", limit: 2 });
  });

  it("reports all memory tier health states", async () => {
    const { GET } = await loadHealthRoute();

    const response = await GET(new Request("http://localhost/api/memory/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tiers.map((tier: { tier: string }) => tier.tier)).toEqual(["vector", "graph", "episodic"]);
    expect(body.recallIngest).toMatchObject({ backend: "sqlite-recall" });
  });

  it("surfaces stale recall ingestion separately from vector memory health", async () => {
    process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS = "0.000001";
    const { GET } = await loadHealthRoute();

    const response = await GET(new Request("http://localhost/api/memory/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recallIngest.status).toBe("stale");
    expect(body.recallIngest.backend).toBe("sqlite-recall");
  });

  it("reports vector memory as degraded when mem0 has queued saves", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ status: "degraded", vector_store: "connected", queue: { queued: 4 } })
    );
    const { GET } = await loadHealthRoute();

    const response = await GET(new Request("http://localhost/api/memory/health"));
    const body = await response.json();
    const vector = body.tiers.find((tier: { tier: string }) => tier.tier === "vector");

    expect(vector.status).toBe("degraded");
    expect(vector.detail).toContain("4 queued memory saves");
  });

  it("reports vector memory as down (truthful) when mem0 runtime or vector status is unknown", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        status: "ok",
        vector_store: "unknown",
        memory_runtime: { status: "unavailable", error: "No module named 'mem0'" },
        queue: { queued: 0 },
      })
    );
    const { GET } = await loadHealthRoute();

    const response = await GET(new Request("http://localhost/api/memory/health"));
    const body = await response.json();
    const vector = body.tiers.find((tier: { tier: string }) => tier.tier === "vector");

    expect(vector.status).toBe("down");
    expect(vector.detail).toContain("vector store unknown");
    expect(vector.detail).toContain("runtime unavailable: No module named 'mem0'");
  });

  it("requires operator authorization for non-local memory reads", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    const searchRoute = await loadSearchRoute();
    const graphRoute = await loadGraphRoute();
    const healthRoute = await loadHealthRoute();

    expect((await searchRoute.GET(new Request("https://memroos.example/api/memory/search?q=secret"))).status).toBe(403);
    expect((await graphRoute.GET(new Request("https://memroos.example/api/memory/graph?q=secret"))).status).toBe(403);
    expect((await healthRoute.GET(new Request("https://memroos.example/api/memory/health"))).status).toBe(403);
  });

  it("allows authenticated registered agents to read non-local memory health", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    mockAuthenticateAgentHeaders.mockReturnValueOnce({ id: "codex-desktop-luis-mbp" } as never);
    const healthRoute = await loadHealthRoute();

    const response = await healthRoute.GET(
      new Request("https://memroos.example/api/memory/health", {
        headers: { authorization: "Bearer scoped-agent-key" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tiers.map((tier: { tier: string }) => tier.tier)).toEqual(["vector", "graph", "episodic"]);
    expect(mockAuthenticateAgentHeaders).toHaveBeenCalled();
  });

  it("filters graph neighbors through the retrieval policy gate", async () => {
    const graphRoute = await loadGraphRoute();
    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockResolvedValueOnce({
      results: [
        {
          node: {
            id: "parent",
            metadata: { visibility: "internal", policy: "agent_visible" },
          },
          neighbors: [
            { id: "allowed-neighbor", metadata: { visibility: "internal", policy: "agent_visible" } },
            { id: "blocked-neighbor" },
          ],
        },
      ],
    });

    const response = await graphRoute.GET(new Request("http://localhost/api/memory/graph?q=parent&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.results[0].neighbors).toHaveLength(1);
    expect(body.result.results[0].neighbors[0].id).toBe("allowed-neighbor");
  });

  it("returns 502 when graph memory backend is unavailable", async () => {
    const graphRoute = await loadGraphRoute();
    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockRejectedValueOnce(new Error("neo4j offline"));

    const response = await graphRoute.GET(new Request("http://localhost/api/memory/graph?q=fail"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, tier: "graph", error: "neo4j offline" });
  });

  it("searches vector payloads keyed by memories and data arrays", async () => {
    const searchRoute = await loadSearchRoute();
    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "searchVectorMemory").mockResolvedValueOnce({
      memories: [
        { id: 42, memory: "numeric id memory", metadata: { visibility: "internal", policy: "agent_visible" } },
      ],
      data: [{ id: "ignored", memory: "ignored" }],
    });

    const response = await searchRoute.GET(new Request("http://localhost/api/memory/search?limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.memories).toHaveLength(1);
    expect(body.result.memories[0].id).toBe(42);
  });

  it("returns 502 when vector memory backend is unavailable", async () => {
    const searchRoute = await loadSearchRoute();
    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "searchVectorMemory").mockRejectedValueOnce(new Error("mem0 offline"));

    const response = await searchRoute.GET(new Request("http://localhost/api/memory/search?q=fail"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, tier: "vector", error: "mem0 offline" });
  });
});
