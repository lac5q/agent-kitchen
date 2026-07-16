import { afterEach, describe, expect, it, vi } from "vitest";
import { checkVectorHealth } from "../backends";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("vector health disk vs vector separation", () => {
  it("keeps vector up when Qdrant is connected and only home disk advisory is critical", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: {
            critical: false,
            warning: true,
            home_advisory: { critical: true, percent_used: 97.2 },
            paths: [{ path: "/tmp/mem0", critical: false }],
          },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("up");
    expect(String(health.detail)).toMatch(/home disk advisory critical/);
  });

  it("marks vector down when vector_store is disconnected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "disconnected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: { critical: false },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("down");
    expect(String(health.detail)).toMatch(/vector store disconnected/);
  });

  it("marks vector degraded (not down) when path-scoped disk is critical but vector is connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: { critical: true, warning: true },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("degraded");
    expect(health.status).not.toBe("down");
  });
});
