// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

async function loadGraphRoute() {
  return import("../../app/knowledge-graph.json/route");
}

async function loadMetaRoute() {
  return import("../../app/meta.json/route");
}

async function loadDiffOverlayRoute() {
  return import("../../app/diff-overlay.json/route");
}

async function loadDomainGraphRoute() {
  return import("../../app/domain-graph.json/route");
}

async function loadFileContentRoute() {
  return import("../../app/file-content.json/route");
}

describe("Understand graph routes", () => {
  const originalToken = process.env.UNDERSTAND_GRAPH_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.UNDERSTAND_GRAPH_TOKEN;
    } else {
      process.env.UNDERSTAND_GRAPH_TOKEN = originalToken;
    }
  });

  it("rejects graph requests without the configured token", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const { GET } = await loadGraphRoute();

    const response = await GET(new Request("https://memroos.com/knowledge-graph.json"));

    expect(response.status).toBe(403);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Forbidden") });
  });

  it("serves the graph with noindex headers when the token matches", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const { GET } = await loadGraphRoute();

    const response = await GET(new Request("https://memroos.com/knowledge-graph.json?token=test-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(body.project.name).toBe("memroos-monorepo");
    expect(body.nodes.length).toBeGreaterThan(1000);
  });

  it("serves metadata only when the token matches", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const { GET } = await loadMetaRoute();

    const response = await GET(new Request("https://memroos.com/meta.json?token=test-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(typeof body.analyzedFiles).toBe("number");
    expect(body.analyzedFiles).toBeGreaterThan(0);
  });

  it("rejects file-content requests without the configured token", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const { GET } = await loadFileContentRoute();

    const response = await GET(new Request("https://memroos.com/file-content.json"));

    expect(response.status).toBe(403);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Forbidden") });
  });

  it("returns the hosted file-content placeholder only after token authorization", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const { GET } = await loadFileContentRoute();

    const response = await GET(new Request("https://memroos.com/file-content.json?token=test-token"));

    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toContain("Not available");
  });

  it("serves empty optional sidecar data with a valid token", async () => {
    process.env.UNDERSTAND_GRAPH_TOKEN = "test-token";
    const diffRoute = await loadDiffOverlayRoute();
    const domainRoute = await loadDomainGraphRoute();

    const diffResponse = await diffRoute.GET(
      new Request("https://memroos.com/diff-overlay.json?token=test-token")
    );
    const domainResponse = await domainRoute.GET(
      new Request("https://memroos.com/domain-graph.json?token=test-token")
    );

    expect(diffResponse.status).toBe(200);
    expect(domainResponse.status).toBe(200);
    expect(diffResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    await expect(diffResponse.json()).resolves.toBeNull();
    await expect(domainResponse.json()).resolves.toBeNull();
  });
});
