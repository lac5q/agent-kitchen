// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let sessionRole: "admin" | "operator" | "reviewer" | null = "operator";

vi.mock("@/lib/constants", () => ({
  CLAUDE_MEMORY_PATH: "/tmp/claude-memory",
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () =>
    sessionRole
      ? {
          userId: "user-1",
          role: sessionRole,
          email: "operator@example.com",
          displayName: "Operator",
          tenantId: "default-tenant",
        }
      : null,
}));

vi.mock("@/lib/parsers", () => ({
  parseClaudeMemory: vi.fn(),
}));

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

describe("GET /api/memory/okf/export", () => {
  beforeEach(async () => {
    sessionRole = "operator";
    const parsers = await import("@/lib/parsers");
    vi.mocked(parsers.parseClaudeMemory).mockResolvedValue([
      {
        id: "project/foo.md",
        content: "Project memory with a source-backed detail.",
        agent: "claude",
        date: "2026-06-13T18:00:00.000Z",
        type: "project",
        source: "/tmp/claude-memory/project/foo.md",
      },
    ]);
  });

  it("requires operator access", async () => {
    const { GET } = await loadRoute();

    sessionRole = null;
    expect((await GET(new Request("http://localhost/api/memory/okf/export") as never)).status).toBe(401);

    sessionRole = "reviewer";
    expect((await GET(new Request("http://localhost/api/memory/okf/export") as never)).status).toBe(403);
  });

  it("exports local Claude memory as an OKF bundle with validation metadata", async () => {
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/memory/okf/export") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe("claude");
    expect(body.conceptCount).toBe(1);
    expect(body.validation.conformant).toBe(true);
    expect(body.bundle["index.md"]).toContain("# MemRoOS memory export");
    expect(body.bundle["memory/project/foo.md"]).toContain("type: \"Memory Entry\"");
  });
});
