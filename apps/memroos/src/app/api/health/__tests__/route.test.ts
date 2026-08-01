// @vitest-environment node
import { execFile } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  stat: vi.fn(async () => ({})),
}));

vi.mock("@/lib/memory/backends", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memory/backends")>();
  return {
    ...actual,
    checkGraphHealth: vi.fn(async () => ({
      tier: "graph",
      backend: "neo4j",
      status: "not_configured",
    })),
  };
});

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

describe("runtime health route", () => {
  beforeEach(() => {
    process.env.MEM0_URL = "http://mem0.test";
    process.env.KNOWLEDGE_INDEX_HEALTH_TTL_MS = "0";
    vi.mocked(execFile).mockImplementation((_command, args, options, callback) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) throw new Error("missing callback");
      if (Array.isArray(args) && args.includes("--json")) {
        done(null, JSON.stringify({ ok: true, pendingEmbeddings: 0, failures: [], warnings: [] }), "");
        return {} as ReturnType<typeof execFile>;
      }
      done(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
  });

  afterEach(() => {
    delete process.env.MEM0_URL;
    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
    delete process.env.KNOWLEDGE_INDEX_HEALTH_TTL_MS;
    delete process.env.KNOWLEDGE_INDEX_HEALTH_REQUEST_TIMEOUT_MS;
    delete process.env.NEO4J_PASSWORD;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("probes mem0 with the shared MEM0_HEALTH_TIMEOUT_MS budget (default 15s)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();
    await GET();

    expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    timeoutSpy.mockRestore();
  });

  it("honors MEM0_HEALTH_TIMEOUT_MS for the operator mem0 probe", async () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "12500";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();
    await GET();

    expect(timeoutSpy).toHaveBeenCalledWith(12_500);
    timeoutSpy.mockRestore();
  });

  it("marks mem0 degraded when the health payload reports queued writes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "connected",
          queue: { queued: 3 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const mem0 = body.services.find((service: { service: string }) => service.service === "mem0");

    expect(mem0.status).toBe("degraded");
    expect(mem0.detail).toContain("3 queued memory saves");
  });

  it("marks mem0 degraded when Qdrant is not connected through mem0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "unavailable",
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const mem0 = body.services.find((service: { service: string }) => service.service === "mem0");

    expect(mem0.status).toBe("degraded");
    expect(mem0.detail).toContain("vector store unavailable");
  });

  it("marks mem0 degraded when the runtime package is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "unavailable", error: "No module named 'mem0'" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const mem0 = body.services.find((service: { service: string }) => service.service === "mem0");

    expect(mem0.status).toBe("degraded");
    expect(mem0.detail).toContain("runtime unavailable: No module named 'mem0'");
  });

  it("includes failure details when a service check throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3201");
      })
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const mem0 = body.services.find((service: { service: string }) => service.service === "mem0");

    expect(mem0.status).toBe("down");
    expect(mem0.detail).toContain("ECONNREFUSED");
  });

  it("includes the source-to-QMD knowledge indexing contract in app health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const knowledge = body.services.find((service: { service: string }) => service.service === "Knowledge Index");

    expect(knowledge.status).toBe("up");
    expect(knowledge.detail).toBe("0 pending embeddings");
  });

  it("marks knowledge indexing degraded when the contract report has failures", async () => {
    vi.mocked(execFile).mockImplementation((_command, args, options, callback) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) throw new Error("missing callback");
      if (Array.isArray(args) && args.includes("--json")) {
        done(
          new Error("knowledge index contract failed"),
          JSON.stringify({
            ok: false,
            pendingEmbeddings: 63,
            failures: ["emails: missing qmd://emails/example.md"],
            warnings: [],
          }),
          ""
        );
        return {} as ReturnType<typeof execFile>;
      }
      done(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const knowledge = body.services.find((service: { service: string }) => service.service === "Knowledge Index");

    expect(knowledge.status).toBe("degraded");
    expect(knowledge.detail).toContain("63 pending embeddings");
    expect(knowledge.detail).toContain("missing qmd");
  });

  it("returns a bounded degraded result when knowledge indexing is still running", async () => {
    process.env.KNOWLEDGE_INDEX_HEALTH_REQUEST_TIMEOUT_MS = "1";
    vi.mocked(execFile).mockImplementation((_command, args, options, callback) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) throw new Error("missing callback");
      if (Array.isArray(args) && args.includes("--json")) {
        return {} as ReturnType<typeof execFile>;
      }
      done(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const knowledge = body.services.find((service: { service: string }) => service.service === "Knowledge Index");

    expect(knowledge.status).toBe("degraded");
    expect(knowledge.detail).toContain("still running");
  });

  it("marks mem0 down when the health endpoint returns a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("service unavailable", { status: 503 }))
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const mem0 = body.services.find((service: { service: string }) => service.service === "mem0");

    expect(mem0.status).toBe("down");
    expect(mem0.detail).toContain("HTTP 503");
  });

  it("marks RTK and QMD optional binaries as degraded when not installed", async () => {
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) throw new Error("missing callback");
      if (command === "rtk") {
        done(new Error("rtk not found"), "", "");
        return {} as ReturnType<typeof execFile>;
      }
      if (command === "which" && Array.isArray(args) && args[0] === "qmd") {
        done(new Error("qmd not found"), "", "");
        return {} as ReturnType<typeof execFile>;
      }
      if (Array.isArray(args) && args.includes("--json")) {
        done(null, JSON.stringify({ ok: true, pendingEmbeddings: 0, failures: [], warnings: [] }), "");
        return {} as ReturnType<typeof execFile>;
      }
      done(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const rtk = body.services.find((service: { service: string }) => service.service === "RTK");
    const qmd = body.services.find((service: { service: string }) => service.service === "QMD");

    expect(rtk.status).toBe("degraded");
    expect(rtk.detail).toContain("rtk binary not installed");
    expect(qmd.status).toBe("degraded");
    expect(qmd.detail).toContain("qmd binary not installed");
  });

  it("skips knowledge indexing when qmd is not installed", async () => {
    vi.mocked(execFile).mockImplementation((_command, args, options, callback) => {
      const done = typeof options === "function" ? options : callback;
      if (!done) throw new Error("missing callback");
      if (Array.isArray(args) && args[0] === "qmd") {
        done(new Error("qmd not found"), "", "");
        return {} as ReturnType<typeof execFile>;
      }
      done(null, "", "");
      return {} as ReturnType<typeof execFile>;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const knowledge = body.services.find((service: { service: string }) => service.service === "Knowledge Index");

    expect(knowledge.status).toBe("up");
    expect(knowledge.detail).toContain("skipped");
    expect(knowledge.detail).toContain("qmd not installed");
  });

  it("reports graph memory as up when Neo4j is healthy", async () => {
    const { checkGraphHealth } = await import("@/lib/memory/backends");
    vi.mocked(checkGraphHealth).mockResolvedValueOnce({
      tier: "graph",
      backend: "neo4j",
      status: "up",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const graph = body.services.find((service: { service: string }) => service.service === "Graph Memory");

    expect(graph.status).toBe("up");
    expect(graph.detail).toBe("neo4j");
  });

  it("marks graph memory down when the backend is degraded", async () => {
    const { checkGraphHealth } = await import("@/lib/memory/backends");
    vi.mocked(checkGraphHealth).mockResolvedValueOnce({
      tier: "graph",
      backend: "neo4j",
      status: "degraded",
      detail: "write probe timed out",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const graph = body.services.find((service: { service: string }) => service.service === "Graph Memory");

    expect(graph.status).toBe("down");
    expect(graph.detail).toContain("write probe timed out");
  });

  it("marks Agents down when the configs path is missing", async () => {
    const fsPromises = await import("fs/promises");
    vi.mocked(fsPromises.stat).mockRejectedValueOnce(new Error("ENOENT: agent configs missing"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    const agents = body.services.find((service: { service: string }) => service.service === "Agents");

    expect(agents.status).toBe("down");
    expect(agents.detail).toContain("agent configs missing");
  });

  it("includes graph memory status in app health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          memory_runtime: { status: "available" },
          queue: { queued: 0 },
        })
      )
    );
    const { GET } = await loadRoute();

    const response = await GET();
    const body = await response.json();
    const graph = body.services.find((service: { service: string }) => service.service === "Graph Memory");

    expect(graph.status).toBe("down");
    expect(graph.detail).toMatch(/not configured|NOT storing/i);
  });
});
