// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `a2a-register-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "route.db");
const CARD_URL = "http://localhost:8001/a2a/check_prime_agent/.well-known/agent-card.json";

const ADK_CARD = {
  name: "ADK Check Prime Agent",
  description: "Checks whether numbers are prime",
  url: "http://localhost:8001/a2a/check_prime_agent",
  version: "1.0",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  securitySchemes: {
    bearerAuth: { type: "http", scheme: "bearer" },
  },
  security: [{ bearerAuth: [] }],
  skills: [
    {
      id: "check_prime",
      name: "Check Prime",
      description: "Determine whether a supplied integer is prime.",
      tags: ["math", "adk"],
    },
  ],
  extensions: { adk: { agent: "check_prime_agent" } },
};

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  // This asserts canonical registration, not authorization. The agents listing
  // it verifies against now requires a viewer, so give it an admin one.
  vi.doMock("@/lib/auth/session", () => ({
    authenticateUser: async () => ({
      userId: "test-admin",
      role: "admin",
      email: "admin@test",
      displayName: "admin",
      tenantId: "default-tenant",
    }),
  }));
  const registerRoute = await import("../register/route");
  const agentsRoute = await import("../../../agents/route");
  const dbModule = await import("@/lib/db");
  return { registerRoute, agentsRoute, closeDb: dbModule.closeDb };
}

function mockFetchCard() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(ADK_CARD), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  );
}

describe("POST /api/a2a/agents/register", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    vi.unstubAllGlobals();
  });

  it("returns 400 when cardUrl is missing", async () => {
    const { registerRoute } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("http://localhost/api/a2a/agents/register", {
        method: "POST",
        body: JSON.stringify({ source: "adk" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "cardUrl is required",
      code: "INVALID_BODY",
    });
  });

  it("returns a safe error for unsafe card URLs", async () => {
    const { registerRoute } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("http://localhost/api/a2a/agents/register", {
        method: "POST",
        body: JSON.stringify({ cardUrl: "file:///tmp/agent-card.json", source: "manual" }),
      })
    );
    const body = await response.json();

    expect([400, 422]).toContain(response.status);
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("agent-card contents");
  });

  it("registers an ADK-shaped card through the canonical registry", async () => {
    mockFetchCard();
    const { registerRoute, agentsRoute } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("http://localhost/api/a2a/agents/register", {
        method: "POST",
        body: JSON.stringify({ cardUrl: CARD_URL, source: "adk", issueApiKey: true }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.apiKey).toBeTruthy();
    expect(body.agent).toMatchObject({
      protocol: "a2a",
      platform: "gemini",
      metadata: { a2a: { source: "adk" } },
    });

    const listResponse = await agentsRoute.GET(
      new Request("http://localhost/api/agents") as never
    );
    const agents = (await listResponse.json()).agents;
    expect(agents).toEqual([
      expect.objectContaining({ id: body.agent.id, protocol: "a2a", platform: "gemini" }),
    ]);
  });
});
