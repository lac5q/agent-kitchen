// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_AGENTS = [
  {
    id: "sophia",
    name: "Sophia",
    role: "software-developer",
    platform: "openclaw" as const,
    location: "tailscale" as const,
    host: "sophia.local",
    port: 3100,
    healthEndpoint: "/health",
    tunnelUrl: undefined,
  },
  {
    id: "alba",
    name: "Alba",
    role: "memory-curator",
    platform: "hermes" as const,
    location: "local" as const,
    host: "localhost",
    port: 3200,
    healthEndpoint: "/health",
    tunnelUrl: undefined,
  },
];

vi.mock("@/lib/agent-registry", () => ({
  getRemoteAgents: () => MOCK_AGENTS,
}));

describe("GET /api/agents/cards", () => {
  it("returns all agent cards with A2A shape", async () => {
    const { GET } = await import("../cards/route");
    const req = new Request("http://localhost/api/agents/cards");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cards).toHaveLength(2);
    const card = body.cards[0];
    expect(card).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      version: "1",
      url: expect.any(String),
      capabilities: expect.any(Object),
      authentication: expect.any(Object),
      skills: expect.any(Array),
      extensions: expect.objectContaining({ kitchen: expect.any(Object) }),
    });
  });
});

describe("GET /api/agents/[id]/card", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock("@/lib/agent-registry", () => ({
      getRemoteAgents: () => MOCK_AGENTS,
    }));
  });

  it("returns card for known agent id", async () => {
    const { GET } = await import("../[id]/card/route");
    const req = new Request("http://localhost/api/agents/sophia/card");
    const res = await GET(req, { params: Promise.resolve({ id: "sophia" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Sophia");
    expect(body.version).toBe("1");
  });

  it("returns 404 for unknown agent id", async () => {
    const { GET } = await import("../[id]/card/route");
    const req = new Request("http://localhost/api/agents/unknown/card");
    const res = await GET(req, { params: Promise.resolve({ id: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("card skills are derived from role", async () => {
    const { GET } = await import("../[id]/card/route");
    const req = new Request("http://localhost/api/agents/alba/card");
    const res = await GET(req, { params: Promise.resolve({ id: "alba" }) });
    const body = await res.json();

    expect(body.skills.some((s: { id: string }) => s.id === "memory-write")).toBe(true);
  });
});
