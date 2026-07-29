// @vitest-environment node
// The audit bridge bypasses the JWT gate (ROUTE_LOCAL_AUTH_API_ROUTES), so on
// an internet-published host it must refuse anything that reached it through a
// proxy or tunnel. These tests pin that boundary.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../route";

const ORIGINAL = { ...process.env };

function post(url: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      tenant_id: "default-tenant",
      agent_id: "probe",
      operation: "search",
      path: "(search) probe",
      op_hash: "sha256:abcdef1234567890",
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("audit/knowledge host-local guard", () => {
  beforeEach(() => {
    delete process.env.MEMROOS_AUDIT_ALLOW_REMOTE;
    // A shared key so the request would otherwise reach validation.
    process.env.MEMROOS_AGENT_API_KEY = "shared-test-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("404s a tunnelled request even with a valid bearer", async () => {
    const res = await POST(
      post("https://memroos.epiloguecapital.com/api/audit/knowledge", {
        authorization: "Bearer shared-test-key",
        "x-forwarded-for": "203.0.113.7",
      }),
    );
    // 404, not 403: a remote caller should not learn the route exists, nor
    // whether its key was accepted.
    expect(res.status).toBe(404);
  });

  it("404s on Cloudflare headers specifically", async () => {
    const res = await POST(
      post("https://memroos.epiloguecapital.com/api/audit/knowledge", {
        authorization: "Bearer shared-test-key",
        "cf-connecting-ip": "203.0.113.7",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("allows a loopback request from the sibling MCP process", async () => {
    const res = await POST(
      post("http://127.0.0.1:3000/api/audit/knowledge", {
        authorization: "Bearer shared-test-key",
      }),
    );
    // Past the origin gate — whatever happens next is auth/validation, not 404.
    expect(res.status).not.toBe(404);
  });

  it("allows the docker compose service hostname", async () => {
    const res = await POST(
      post("http://memroos:3000/api/audit/knowledge", {
        authorization: "Bearer shared-test-key",
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it("honours MEMROOS_AUDIT_ALLOW_REMOTE=1 for self-fronted deployments", async () => {
    process.env.MEMROOS_AUDIT_ALLOW_REMOTE = "1";
    const res = await POST(
      post("https://memroos.epiloguecapital.com/api/audit/knowledge", {
        authorization: "Bearer shared-test-key",
        "x-forwarded-for": "203.0.113.7",
      }),
    );
    expect(res.status).not.toBe(404);
  });
});
