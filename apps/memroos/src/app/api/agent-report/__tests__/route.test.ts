// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `agent-report-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "reports.db");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_JWT_SECRET = "agent-report-test-secret-that-is-long-enough-32ch";
  process.env.MEMROOS_ONBOARDING_SECRET = "agent-report-onboarding-secret";
  vi.resetModules();
  const reportRoute = await import("../route");
  const transitionRoute = await import("../[id]/route");
  const dbModule = await import("@/lib/db");
  const registry = await import("@/lib/agent/registry");
  const oauth = await import("@/lib/auth/mcp-oauth-store");
  const jwt = await import("@/lib/auth/jwt");
  const rateLimit = await import("@/lib/auth/rate-limit");
  const db = dbModule.getDb();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)",
  ).run("report-admin", "report-admin@memroos.test", "Report Admin", "x");
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?,?)").run("report-admin", "admin");
  const adminToken = await jwt.signAccessToken("report-admin", "admin");
  return {
    reportRoute,
    transitionRoute,
    registerAgent: registry.registerAgent,
    registerClient: oauth.registerClient,
    issueTokens: oauth.issueTokens,
    adminToken,
    getDb: dbModule.getDb,
    closeDb: dbModule.closeDb,
    clearAuthRateLimit: rateLimit.clearAuthRateLimit,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://memroos.example.test/api/agent-report", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("agent issue reporting API", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb, clearAuthRateLimit } = await loadRoutes();
    clearAuthRateLimit();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_JWT_SECRET;
    delete process.env.MEMROOS_ONBOARDING_SECRET;
  });

  it("accepts an agent key and returns newest operator-filterable reports", async () => {
    const { reportRoute, registerAgent, adminToken } = await loadRoutes();
    const registered = registerAgent({
      id: "agent-reporting",
      name: "Reporting agent",
      role: "worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const first = await reportRoute.POST(
      post(
        { title: "First failure", body: "The tool timed out", severity: "medium", component: "memory" },
        { authorization: `Bearer ${registered.apiKey}` },
      ) as never,
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.report.reporterKind).toBe("agent_key");
    expect(firstBody.report.agentId).toBe("agent-reporting");

    const second = await reportRoute.POST(
      post(
        { title: "Second failure", body: "The auth path failed", severity: "high", component: "auth" },
        { authorization: `Bearer ${registered.apiKey}` },
      ) as never,
    );
    expect(second.status).toBe(201);

    const listed = await reportRoute.GET(
      new Request("https://memroos.example.test/api/agent-report?status=open&component=auth", {
        headers: { authorization: `Bearer ${adminToken}` },
      }) as never,
    );
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.count).toBe(1);
    expect(listedBody.reports[0].title).toBe("Second failure");
  });

  it("accepts an operator session for POST reports", async () => {
    const { reportRoute, adminToken } = await loadRoutes();
    const response = await reportRoute.POST(
      post(
        { title: "Operator report", body: "The operator-authenticated path works", component: "operator" },
        { authorization: `Bearer ${adminToken}` },
      ) as never,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).report).toMatchObject({
      reporterKind: "oauth",
      reporterId: "report-admin",
    });
  });

  it("rejects anonymous reports outside the onboarding lane", async () => {
    const { reportRoute } = await loadRoutes();
    const response = await reportRoute.POST(
      post({ title: "Anonymous report", body: "component is intentionally omitted" }) as never,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "authentication required" });
  });

  it("enforces title and body payload caps", async () => {
    const { reportRoute, registerAgent } = await loadRoutes();
    const registered = registerAgent({
      id: "agent-payload-cap-test",
      name: "Payload cap test agent",
      role: "worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const headers = { authorization: `Bearer ${registered.apiKey}` };

    const longTitle = await reportRoute.POST(
      post({ title: "t".repeat(201), body: "Body is within the limit" }, headers) as never,
    );
    const longBody = await reportRoute.POST(
      post({ title: "Title is within the limit", body: "b".repeat(8001) }, headers) as never,
    );

    expect(longTitle.status).toBe(400);
    expect(longBody.status).toBe(400);
  });

  it("rejects every supported credential-shaped content pattern", async () => {
    const { reportRoute, registerAgent } = await loadRoutes();
    const registered = registerAgent({
      id: "agent-secret-pattern-test",
      name: "Secret test agent",
      role: "worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const headers = { authorization: `Bearer ${registered.apiKey}` };
    const secrets = [
      ["agent key", `ak_${"a".repeat(20)}`],
      ["SendGrid key", `SG.${"a".repeat(10)}`],
      ["Bearer token", `Bearer ${"a".repeat(20)}`],
      ["hex key", "a".repeat(64)],
    ] as const;

    for (const [label, secret] of secrets) {
      const response = await reportRoute.POST(
        post({ title: `${label} leak`, body: `redacted value: ${secret}` }, headers) as never,
      );
      expect(response.status, label).toBe(422);
      expect(await response.json(), label).toMatchObject({
        error: "report contains credential-shaped content — strip secrets and resend",
      });
    }
  });

  it("allows five reports per authenticated principal per hour, then returns 429", async () => {
    const { reportRoute, registerAgent } = await loadRoutes();
    const registered = registerAgent({
      id: "agent-rate-test",
      name: "Rate test agent",
      role: "worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const headers = { authorization: `Bearer ${registered.apiKey}` };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await reportRoute.POST(
          post({ title: `Report ${attempt}`, body: "No secret content", component: "rate-test" }, headers) as never,
        )).status,
      ).toBe(201);
    }
    const limited = await reportRoute.POST(
      post({ title: "Report six", body: "No secret content", component: "rate-test" }, headers) as never,
    );
    expect(limited.status).toBe(429);
  });

  it("accepts a live MCP OAuth bearer when the agent API key is absent", async () => {
    const { reportRoute, registerClient, issueTokens } = await loadRoutes();
    const client = registerClient({ clientName: "Report test MCP", redirectUris: ["https://client.example.test/callback"] });
    const tokens = issueTokens({ clientId: client.clientId, userId: "report-admin", scope: "read write" });
    const response = await reportRoute.POST(
      post(
        { title: "OAuth failure", body: "The MCP transport timed out", component: "mcp" },
        { authorization: `Bearer ${tokens.accessToken}` },
      ) as never,
    );
    expect(response.status).toBe(201);
    expect((await response.json()).report).toMatchObject({
      reporterKind: "oauth",
      reporterId: "report-admin",
    });
  });

  it("accepts unauthenticated onboarding reports, forces high severity, and rate-limits by IP", async () => {
    const { reportRoute } = await loadRoutes();
    const body = {
      title: "Registration failed",
      body: "step=registration; status=503; error=upstream unavailable",
      component: "onboarding",
      severity: "low",
      tokenKid: "a1b2c3d4",
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await reportRoute.POST(post(body) as never);
      expect(response.status).toBe(201);
      expect((await response.json()).report).toMatchObject({
        reporterKind: "onboarding-script",
        severity: "high",
        component: "onboarding",
      });
    }
    expect((await reportRoute.POST(post(body) as never)).status).toBe(429);
  });

  it("allows operator acknowledgement and resolution with append-only audit events", async () => {
    const { reportRoute, transitionRoute, registerAgent, adminToken, getDb } = await loadRoutes();
    const registered = registerAgent({
      id: "agent-transition-test",
      name: "Transition test agent",
      role: "worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const created = await reportRoute.POST(
      post(
        { title: "Needs review", body: "The MCP request failed", severity: "critical", component: "mcp" },
        { authorization: `Bearer ${registered.apiKey}` },
      ) as never,
    );
    const id = (await created.json()).report.id as string;

    const ack = await transitionRoute.PATCH(
      new Request(`https://memroos.example.test/api/agent-report/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "ack", note: "Triaged" }),
      }) as never,
      { params: Promise.resolve({ id }) },
    );
    expect(ack.status).toBe(200);
    expect((await ack.json()).report.status).toBe("acked");

    const resolve = await transitionRoute.PATCH(
      new Request(`https://memroos.example.test/api/agent-report/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve", note: "Fixed in the operator lane" }),
      }) as never,
      { params: Promise.resolve({ id }) },
    );
    expect(resolve.status).toBe(200);
    expect((await resolve.json()).report.status).toBe("resolved");

    const events = getDb()
      .prepare("SELECT event_type FROM audit_entries WHERE entity_type = 'agent_issue_report' ORDER BY created_at ASC")
      .all() as Array<{ event_type: string }>;
    expect(events.map((event) => event.event_type)).toEqual([
      "agent_issue.acknowledged",
      "agent_issue.resolved",
    ]);
  });
});
