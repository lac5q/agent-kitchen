// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `agents-truthful-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes(
  options: { localRuntimeOk?: boolean; localRuntimeError?: string } = {}
) {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  vi.doMock("@/lib/local-agent-runtime", () => {
    if (options.localRuntimeOk === false) {
      return {
        getLocalAgentRuntime: () => {
          throw new Error(options.localRuntimeError ?? "ps unavailable");
        },
      };
    }
    return {
      getLocalAgentRuntime: () => ({
        activeCliCount: 0,
        byPlatform: {},
        scannedAt: "2026-07-15T12:00:00.000Z",
      }),
    };
  });
  const agentsRoute = await import("../route");
  const registerRoute = await import("../register/route");
  const dbModule = await import("@/lib/db");
  return {
    agentsRoute,
    registerRoute,
    getDb: dbModule.getDb,
    closeDb: dbModule.closeDb,
  };
}

describe("GET /api/agents truthful summary envelopes", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("returns empty liveness when no agents are registered", async () => {
    const { agentsRoute } = await loadRoutes();
    const response = await agentsRoute.GET();
    const body = await response.json();
    expect(body.summary.total).toMatchObject({
      value: 0,
      status: "live",
      source: "sqlite://registered_agents",
    });
    expect(body.liveness).toMatchObject({
      value: null,
      status: "empty",
      reason: expect.stringMatching(/empty, not zero/i),
    });
    expect(body.protocols.rest).toMatchObject({ value: null, status: "empty" });
    expect(body.protocols.a2a).toMatchObject({ value: null, status: "empty" });
    expect(body.readiness.average).toMatchObject({
      value: null,
      status: "empty",
      reason: expect.stringMatching(/not a measured zero/i),
    });
    expect(body.readiness.withCapabilities).toMatchObject({
      value: null,
      status: "empty",
    });
    expect(body.localRuntime).toMatchObject({
      ok: true,
      metric: expect.objectContaining({ status: "live" }),
    });
  });

  it("classifies never-heartbeat agents as never in the liveness summary", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes();
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "never-agent",
          name: "Never Agent",
          role: "no heartbeat",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );
    const body = await (await agentsRoute.GET()).json();
    expect(body.liveness).toMatchObject({
      status: "degraded",
      value: 0,
      reason: expect.stringMatching(/1 never of 1/),
    });
    expect(body.agents[0].liveness).toMatchObject({
      state: "never",
      observedAt: null,
      freshnessMs: null,
      source: expect.stringContaining("registered_agents"),
    });
  });

  it("classifies stale heartbeats and never-heartbeats distinctly when both are present", async () => {
    const { agentsRoute, registerRoute, getDb } = await loadRoutes();
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "stale-agent",
          name: "Stale Agent",
          role: "stale heartbeat",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "never-agent",
          name: "Never Agent",
          role: "never heartbeat",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );
    const staleTs = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE registered_agents SET last_heartbeat_at = ? WHERE id = ?`)
      .run(staleTs, "stale-agent");
    const body = await (await agentsRoute.GET()).json();
    const staleAgent = body.agents.find((a: { id: string }) => a.id === "stale-agent");
    const neverAgent = body.agents.find((a: { id: string }) => a.id === "never-agent");
    expect(staleAgent.liveness).toMatchObject({
      state: "stale",
      observedAt: staleTs,
      source: expect.stringContaining("registered_agents"),
      reason: expect.stringMatching(/14400s old/),
    });
    expect(neverAgent.liveness).toMatchObject({
      state: "never",
      observedAt: null,
    });
    expect(body.liveness).toMatchObject({
      status: "degraded",
      value: 0,
      reason: expect.stringMatching(/1 stale, 1 never of 2/),
    });
  });

  it("returns localRuntime unavailable when the host scan throws", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes({
      localRuntimeOk: false,
      localRuntimeError: "ps not available in this environment",
    });
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "no-runtime",
          name: "No Runtime",
          role: "test",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );
    const body = await (await agentsRoute.GET()).json();
    expect(body.localRuntime).toMatchObject({
      ok: false,
      metric: expect.objectContaining({
        status: "unavailable",
        value: null,
        reason: expect.stringContaining("Local runtime scan is unavailable"),
      }),
    });
    expect(body.agents[0].liveness).toMatchObject({ state: "never" });
  });

  it("per-protocol envelopes reflect registry totals without zero-filling a2a", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes();
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "rest-a",
          name: "Rest A",
          role: "rest",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "a2a-a",
          name: "A2A A",
          role: "a2a",
          platform: "gemini",
          protocol: "a2a",
          issueApiKey: false,
        }),
      })
    );
    const body = await (await agentsRoute.GET()).json();
    expect(body.protocols.rest).toMatchObject({ value: 1, status: "live" });
    expect(body.protocols.a2a).toMatchObject({ value: 1, status: "live" });
    expect(body.protocols.ui).toMatchObject({ value: 0, status: "zero" });
    expect(body.protocols.local).toMatchObject({ value: 0, status: "zero" });
  });
});
