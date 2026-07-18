// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-registry", () => ({
  listRegisteredAgents: vi.fn(() => [
    {
      id: "research-agent",
      name: "Research Agent",
      role: "Research",
      platform: "gemini",
      protocol: "a2a",
      status: "active",
      capabilities: [{ id: "research", name: "Research", description: "", tags: ["analysis"] }],
      metadata: { a2a: { endpointUrl: "http://localhost:8001/a2a/research" } },
    },
  ]),
}));

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("orchestration API routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("rejects route requests without operator authorization", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    const { POST } = await import("../route");

    const response = await POST(jsonRequest("https://memroos.example/api/orchestration", { taskSummary: "route me" }));

    expect(response.status).toBe(403);
  });

  it("posts canonical registry agents to the orchestration service", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, runId: "run-1", status: "dispatched", selectedAgentId: "research-agent" }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");

    const response = await POST(
      jsonRequest(
        "https://memroos.example/api/orchestration",
        { taskSummary: "Research LangGraph", requiredCapability: "research", correlationId: "corr-route" },
        { authorization: "Bearer operator-secret" }
      )
    );
    const body = await response.json();
    const outbound = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, selectedAgentId: "research-agent" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3210/tasks/route");
    expect(outbound).toMatchObject({ taskSummary: "Research LangGraph", requiredCapability: "research", correlationId: "corr-route" });
    expect(outbound.agents[0]).toMatchObject({ id: "research-agent", protocol: "a2a" });
  });

  it("lists and resolves HIL decisions through the orchestration service", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, decisions: [{ id: "hil-1", status: "pending" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, id: "hil-1", status: "approved" })));
    vi.stubGlobal("fetch", fetchMock);
    const hilRoute = await import("../hil/route");
    const decisionRoute = await import("../hil/[id]/route");

    const listResponse = await hilRoute.GET(
      new Request("https://memroos.example/api/orchestration/hil", {
        headers: { authorization: "Bearer operator-secret" },
      })
    );
    const decideResponse = await decisionRoute.POST(
      jsonRequest("https://memroos.example/api/orchestration/hil/hil-1", { decision: "approve" }, { authorization: "Bearer operator-secret" }),
      { params: Promise.resolve({ id: "hil-1" }) }
    );

    expect((await listResponse.json()).decisions).toHaveLength(1);
    expect(await decideResponse.json()).toMatchObject({ ok: true, status: "approved" });
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3210/hil/hil-1/resolve");
  });

  it("rejects HIL listing without operator authorization", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    const hilRoute = await import("../hil/route");

    const response = await hilRoute.GET(new Request("https://memroos.example/api/orchestration/hil"));

    expect(response.status).toBe(403);
  });

  it("returns an empty unavailable queue when the HIL service is offline", async () => {
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const hilRoute = await import("../hil/route");

    const response = await hilRoute.GET(new Request("http://localhost/api/orchestration/hil"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Orchestration HIL is optional on cloud operators — empty unavailable is healthy (ok: true).
    expect(body).toMatchObject({ ok: true, decisions: [], status: "unavailable" });
  });
  it("guards multi-hop plan validation and forwards to the orchestration service", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: "valid", planHash: "plan-hash" }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../plans/validate/route");

    const denied = await POST(jsonRequest("https://memroos.example/api/orchestration/plans/validate", { plan: {} }));
    const allowed = await POST(
      jsonRequest(
        "https://memroos.example/api/orchestration/plans/validate",
        { plan: { id: "plan-1" } },
        { authorization: "Bearer operator-secret" }
      )
    );

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3210/plans/validate");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: { id: "plan-1" } });
  });

  it("guards run resume rollback and evidence routes", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, success: true, status: "completed" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, success: true, status: "rollback_completed" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, status: "completed", bundle: { bundleHash: "bundle-hash" } })));
    vi.stubGlobal("fetch", fetchMock);
    const resumeRoute = await import("../runs/[id]/resume/route");
    const rollbackRoute = await import("../runs/[id]/rollback/route");
    const evidenceRoute = await import("../runs/[id]/evidence/route");

    const resume = await resumeRoute.POST(
      jsonRequest("https://memroos.example/api/orchestration/runs/run-1/resume", { plan: { id: "plan-1" } }, { authorization: "Bearer operator-secret" }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const rollback = await rollbackRoute.POST(
      jsonRequest("https://memroos.example/api/orchestration/runs/run-1/rollback", { handle: "rbh" }, { authorization: "Bearer operator-secret" }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const evidence = await evidenceRoute.GET(
      new Request("https://memroos.example/api/orchestration/runs/run-1/evidence", { headers: { authorization: "Bearer operator-secret" } }),
      { params: Promise.resolve({ id: "run-1" }) }
    );

    expect(resume.status).toBe(200);
    expect(rollback.status).toBe(200);
    expect(evidence.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3210/runs/run-1/resume");
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3210/runs/run-1/rollback");
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:3210/runs/run-1/evidence");
  });

  it("maps resume and rollback invalid receipts plus service failures", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("resume offline"))
      .mockRejectedValueOnce(new Error("rollback offline"));
    vi.stubGlobal("fetch", fetchMock);
    const resumeRoute = await import("../runs/[id]/resume/route");
    const rollbackRoute = await import("../runs/[id]/rollback/route");

    const denied = await resumeRoute.POST(
      jsonRequest("https://memroos.example/api/orchestration/runs/run-1/resume", { plan: {} }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const invalidResume = await resumeRoute.POST(
      jsonRequest("https://memroos.example/api/orchestration/runs/run-1/resume", [], { authorization: "Bearer operator-secret" }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const invalidRollback = await rollbackRoute.POST(
      new Request("https://memroos.example/api/orchestration/runs/run-1/rollback", {
        method: "POST",
        headers: { authorization: "Bearer operator-secret" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const resumeUnavailable = await resumeRoute.POST(
      jsonRequest(
        "https://memroos.example/api/orchestration/runs/run-2/resume",
        { receipt: "resume-handle" },
        { authorization: "Bearer operator-secret" }
      ),
      { params: Promise.resolve({ id: "run-2" }) }
    );
    const rollbackUnavailable = await rollbackRoute.POST(
      jsonRequest(
        "https://memroos.example/api/orchestration/runs/run-2/rollback",
        { handle: "rollback-handle" },
        { authorization: "Bearer operator-secret" }
      ),
      { params: Promise.resolve({ id: "run-2" }) }
    );

    expect(denied.status).toBe(403);
    expect(invalidResume.status).toBe(400);
    expect(await invalidResume.json()).toMatchObject({ status: "missing_receipt" });
    expect(invalidRollback.status).toBe(400);
    expect(await invalidRollback.json()).toMatchObject({ status: "rollback_handle_invalid" });
    expect(resumeUnavailable.status).toBe(502);
    expect(await resumeUnavailable.json()).toMatchObject({ status: "unavailable", error: "resume offline" });
    expect(rollbackUnavailable.status).toBe(502);
    expect(await rollbackUnavailable.json()).toMatchObject({ status: "unavailable", error: "rollback offline" });
  });

  it("maps orchestration evidence auth, missing bundle, and service failures", async () => {
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_SERVICE_URL", "http://localhost:3210");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, status: "not_found", bundle: null })))
      .mockRejectedValueOnce(new Error("evidence offline"));
    vi.stubGlobal("fetch", fetchMock);
    const evidenceRoute = await import("../runs/[id]/evidence/route");

    const denied = await evidenceRoute.GET(
      new Request("https://memroos.example/api/orchestration/runs/run-1/evidence"),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    const missing = await evidenceRoute.GET(
      new Request("https://memroos.example/api/orchestration/runs/run-2/evidence", {
        headers: { authorization: "Bearer operator-secret" },
      }),
      { params: Promise.resolve({ id: "run-2" }) }
    );
    const unavailable = await evidenceRoute.GET(
      new Request("https://memroos.example/api/orchestration/runs/run-3/evidence", {
        headers: { authorization: "Bearer operator-secret" },
      }),
      { params: Promise.resolve({ id: "run-3" }) }
    );

    expect(denied.status).toBe(403);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: true, bundle: null });
    expect(unavailable.status).toBe(502);
    expect(await unavailable.json()).toMatchObject({
      ok: false,
      success: false,
      status: "unavailable",
      error: "evidence offline",
    });
  });

});
