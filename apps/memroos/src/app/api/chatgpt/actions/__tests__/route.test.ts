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
  getDb: vi.fn(),
}));

vi.mock("@/lib/agent-registry", () => ({
  recordMemoryWrite: vi.fn(),
  registerAgent: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/response-cache", () => ({
  responseCache: { invalidateTag: vi.fn() },
}));

vi.mock("@/lib/security-policy", () => ({
  checkMemoryWritePolicy: vi.fn(),
}));

async function loadSearchRoute() {
  vi.resetModules();
  return import("../search/route");
}

async function loadFetchRoute() {
  vi.resetModules();
  return import("../fetch/route");
}

async function loadOpenApiRoute() {
  vi.resetModules();
  return import("../openapi/route");
}

async function loadSaveRoute() {
  vi.resetModules();
  return import("../save/route");
}

describe("ChatGPT Actions bridge", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.MEMROOS_CHATGPT_ACTIONS_API_KEY;
    vi.unstubAllGlobals();
    const backends = await import("@/lib/memory/backends");
    const parsers = await import("@/lib/parsers");

    vi.mocked(backends.searchVectorMemory).mockResolvedValue([
      {
        id: "v1",
        content: "MemRoOS exposes a mobile actions bridge",
        score: 0.9,
        metadata: { visibility: "internal", policy: "agent_visible" },
      },
    ]);
    vi.mocked(backends.queryGraphMemory).mockResolvedValue([
      {
        id: "g1",
        content: "ChatGPT mobile connects through GPT Actions",
        metadata: { visibility: "internal", policy: "agent_visible" },
      },
    ]);
    vi.mocked(parsers.parseClaudeMemory).mockResolvedValue([
      {
        id: "p1/memory.md",
        content: "Luis prefers a single MemRoOS memory/search surface.",
        agent: "claude",
        date: "2026-05-21T00:00:00.000Z",
        type: "project",
        source: "/tmp/claude-memory/p1/memory/memory.md",
      },
    ]);
  });

  it("serves an OpenAPI schema for the Custom GPT editor", async () => {
    const { GET } = await loadOpenApiRoute();
    const response = await GET(new Request("https://memroos.example/api/chatgpt/actions/openapi"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.info.title).toBe("MemRoOS Mobile Actions");
    expect(body.paths["/api/chatgpt/actions/search"].post.operationId).toBe("searchMemroos");
    expect(body.components.securitySchemes.ApiKeyAuth.name).toBe("x-api-key");
  });

  it("uses the configured public base URL in the OpenAPI schema", async () => {
    process.env.MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL = "https://app.memroos.test";
    const { GET } = await loadOpenApiRoute();
    const response = await GET(new Request("https://localhost:3002/api/chatgpt/actions/openapi"));
    const body = await response.json();

    expect(body.servers).toEqual([{ url: "https://app.memroos.test" }]);
    delete process.env.MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL;
  });

  it("ignores x-forwarded-host headers and uses the literal request origin (SEC-03/B01-003)", async () => {
    // x-forwarded-host is intentionally not trusted to prevent spec URL poisoning.
    // For reverse-proxy deployments, set MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL instead.
    const { GET } = await loadOpenApiRoute();
    const response = await GET(
      new Request("https://localhost:3002/api/chatgpt/actions/openapi", {
        headers: {
          "x-forwarded-host": "app.memroos.test",
          "x-forwarded-proto": "https",
        },
      })
    );
    const body = await response.json();

    // Must use literal request URL origin, NOT the x-forwarded-host value
    expect(body.servers).toEqual([{ url: "https://localhost:3002" }]);
  });

  it("searches MemRoOS on loopback without requiring a setup key", async () => {
    const { POST } = await loadSearchRoute();
    const response = await POST(
      new Request("http://localhost/api/chatgpt/actions/search", {
        method: "POST",
        body: JSON.stringify({ query: "mobile", limit: 2 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({
      title: "Semantic memory",
      tier: "vector",
      text: "MemRoOS exposes a mobile actions bridge",
    });
  });

  it("requires an action API key for remote requests", async () => {
    const { POST } = await loadSearchRoute();
    const response = await POST(
      new Request("https://memroos.example/api/chatgpt/actions/search", {
        method: "POST",
        body: JSON.stringify({ query: "mobile" }),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "MEMROOS_CHATGPT_ACTIONS_API_KEY is not configured",
    });
  });

  it("fetches an encoded search result id", async () => {
    const search = await loadSearchRoute();
    const searchResponse = await search.POST(
      new Request("http://localhost/api/chatgpt/actions/search", {
        method: "POST",
        body: JSON.stringify({ query: "mobile", limit: 1 }),
      })
    );
    const searchBody = await searchResponse.json();

    const fetchRoute = await loadFetchRoute();
    const fetchResponse = await fetchRoute.POST(
      new Request("http://localhost/api/chatgpt/actions/fetch", {
        method: "POST",
        body: JSON.stringify({ id: searchBody.results[0].id }),
      })
    );
    const fetchBody = await fetchResponse.json();

    expect(fetchResponse.status).toBe(200);
    expect(fetchBody).toMatchObject({
      ok: true,
      title: "Semantic memory",
      text: "MemRoOS exposes a mobile actions bridge",
      tier: "vector",
    });
  });

  it("fails closed when fetching an encoded result without a policy label", async () => {
    const legacyId = `memroos:${Buffer.from(
      JSON.stringify({
        title: "Legacy memory",
        text: "Old result id without labels",
        tier: "vector",
        source: "mem0",
      }),
      "utf8"
    ).toString("base64url")}`;

    const fetchRoute = await loadFetchRoute();
    const fetchResponse = await fetchRoute.POST(
      new Request("http://localhost/api/chatgpt/actions/fetch", {
        method: "POST",
        body: JSON.stringify({ id: legacyId }),
      })
    );
    const fetchBody = await fetchResponse.json();

    expect(fetchResponse.status).toBe(400);
    expect(fetchBody).toMatchObject({
      ok: false,
      error: "MemRoOS result is not authorized for ChatGPT action fetch",
    });
  });

  it("saves explicit memories through the mem0 backend with action API key auth", async () => {
    process.env.MEMROOS_CHATGPT_ACTIONS_API_KEY = "test-action-key";
    const registry = await import("@/lib/agent-registry");
    const policy = await import("@/lib/security-policy");
    vi.mocked(registry.registerAgent).mockReturnValue({
      agent: { id: "chatgpt-mobile", capabilities: [] },
    } as any);
    vi.mocked(policy.checkMemoryWritePolicy).mockReturnValue({ allowed: true });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, id: "mem-1" })));

    const { POST } = await loadSaveRoute();
    const response = await POST(
      new Request("https://memroos.example/api/chatgpt/actions/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "test-action-key",
        },
        body: JSON.stringify({ text: "Remember this from ada@example.com with SSN 123-45-6789", type: "episodic" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, tier: "episodic", result: { ok: true, id: "mem-1" } });
    expect(fetch).toHaveBeenCalledWith(
      "http://mem0.test/memory/add",
      expect.objectContaining({ method: "POST" })
    );
    const forwarded = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(forwarded.text).toBe("Remember this from [REDACTED:EMAIL_ADDRESS] with SSN [REDACTED:SSN_US]");
    expect(forwarded.metadata.pii).toMatchObject({
      protected: true,
      provider: "presidio-compatible-local",
      entityTypes: ["EMAIL_ADDRESS", "SSN_US"],
      findingCount: 2,
    });
    expect(registry.recordMemoryWrite).toHaveBeenCalledWith(
      "chatgpt-mobile",
      expect.objectContaining({
        type: "episodic",
        content: "Remember this from [REDACTED:EMAIL_ADDRESS] with SSN [REDACTED:SSN_US]",
      }),
      { ok: true, id: "mem-1" }
    );
  });
});
