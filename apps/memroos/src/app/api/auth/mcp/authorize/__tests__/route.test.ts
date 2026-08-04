// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;

vi.mock("@/lib/db", () => ({ getDb: () => db }));
// No session: these cases all fail before authentication is reached.
vi.mock("@/lib/auth/session", () => ({ authenticateUser: async () => null }));

const { registerClient } = await import("@/lib/auth/mcp-oauth-store");
const { GET } = await import("../route");

const BASE = "https://memroos-cordant.example.test";
const HTML = { accept: "text/html,application/xhtml+xml" };

function authorizeUrl(params: Record<string, string>): string {
  const url = new URL(`${BASE}/api/auth/mcp/authorize`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await GET(new NextRequest(url, { headers }));
  return { status: res.status, body: await res.text(), type: res.headers.get("content-type") ?? "" };
}

describe("MCP authorize — failures a human reads in a browser", () => {
  let clientId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    const client = registerClient({
      clientName: "Claude Code (memroos)",
      redirectUris: ["http://localhost:3118/callback"],
    });
    clientId = client.client_id;
  });

  // The reported failure: a terminal wraps the ~400-char authorize URL, the
  // click sends only the first line, and the tail (redirect_uri, resource) is
  // gone. The operator needs to be told the link was cut off — not handed a
  // raw JSON blob that looks identical to a broken registration.
  it("names truncation when a browser follows a link that lost its tail", async () => {
    const { status, body, type } = await get(
      authorizeUrl({
        response_type: "code",
        client_id: clientId,
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
      HTML,
    );
    expect(status).toBe(400);
    expect(type).toContain("text/html");
    expect(body).toContain("cut off");
    expect(body).toContain("paste");
  });

  it("does not blame truncation when the client is simply unregistered", async () => {
    const { status, body } = await get(
      authorizeUrl({
        response_type: "code",
        client_id: "mcp_definitely_not_registered",
        redirect_uri: "http://localhost:3118/callback",
        resource: `${BASE}/mcp`,
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
      HTML,
    );
    expect(status).toBe(400);
    expect(body).toContain("not registered");
    expect(body).not.toContain("cut off");
  });

  // Programmatic clients must keep getting RFC-shaped JSON.
  it("still answers JSON when the caller did not ask for HTML", async () => {
    const { status, body, type } = await get(authorizeUrl({ response_type: "code" }));
    expect(status).toBe(400);
    expect(type).toContain("application/json");
    expect(JSON.parse(body).error).toBe("invalid_client");
  });

  it("escapes caller-controlled text rather than reflecting it into the page", async () => {
    const { body } = await get(
      authorizeUrl({
        response_type: "code",
        client_id: clientId,
        redirect_uri: '"><script>alert(1)</script>',
        resource: `${BASE}/mcp`,
        code_challenge: "abc",
        code_challenge_method: "S256",
      }),
      HTML,
    );
    expect(body).not.toContain("<script>alert(1)</script>");
  });
});
