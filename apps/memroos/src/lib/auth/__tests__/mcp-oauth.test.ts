// @vitest-environment node
import { createHash, randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;

vi.mock("@/lib/db", () => ({ getDb: () => db }));

const {
  registerClient,
  getClient,
  verifyClientSecret,
  isRegisteredRedirectUri,
  createAuthorizationCode,
  consumeAuthorizationCode,
  issueTokens,
  resolveAccessToken,
  consumeRefreshToken,
  verifyPkce,
} = await import("@/lib/auth/mcp-oauth-store");

const { buildAuthorizationServerMetadata, buildProtectedResourceMetadata, publicOriginFromRequest } = await import(
  "@/lib/auth/mcp-oauth"
);

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function seedUser(id = "u-1"): string {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    `${id}@cordant.ai`,
    "Eric",
    "x"
  );
  return id;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

describe("MCP OAuth — discovery metadata", () => {
  it("advertises endpoints on the host the client actually dialled", () => {
    // One build serves two hosts; a mismatched issuer fails discovery.
    const req = new Request("https://memroos-cordant.epiloguecapital.com/.well-known/oauth-authorization-server");
    const origin = publicOriginFromRequest(req);
    const meta = buildAuthorizationServerMetadata(origin);

    expect(meta.issuer).toBe("https://memroos-cordant.epiloguecapital.com");
    expect(meta.registration_endpoint).toBe(
      "https://memroos-cordant.epiloguecapital.com/api/auth/mcp/register"
    );
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("protected-resource metadata points at the MCP endpoint and its auth server", () => {
    const meta = buildProtectedResourceMetadata("https://memroos-cordant.epiloguecapital.com");
    expect(meta.resource).toBe("https://memroos-cordant.epiloguecapital.com/mcp");
    expect(meta.authorization_servers).toEqual(["https://memroos-cordant.epiloguecapital.com"]);
  });
});

describe("MCP OAuth — registration", () => {
  it("registers a public client with no secret", () => {
    const { clientId, clientSecret } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    expect(clientId).toMatch(/^mcp_/);
    expect(clientSecret).toBeUndefined();

    const client = getClient(clientId);
    expect(client?.hasSecret).toBe(false);
    expect(client?.redirectUris).toEqual([REDIRECT]);
  });

  it("issues and verifies a secret only when one was requested", () => {
    const { clientId, clientSecret } = registerClient({
      clientName: "Confidential",
      redirectUris: [REDIRECT],
      issueSecret: true,
    });
    expect(clientSecret).toBeDefined();
    expect(verifyClientSecret(clientId, clientSecret!)).toBe(true);
    expect(verifyClientSecret(clientId, "wrong")).toBe(false);
  });

  it("matches redirect URIs exactly — prefix matches are an open redirect", () => {
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const client = getClient(clientId)!;

    expect(isRegisteredRedirectUri(client, REDIRECT)).toBe(true);
    expect(isRegisteredRedirectUri(client, `${REDIRECT}/../evil`)).toBe(false);
    expect(isRegisteredRedirectUri(client, "https://claude.ai.evil.com/cb")).toBe(false);
    expect(isRegisteredRedirectUri(client, `${REDIRECT}?x=1`)).toBe(false);
  });
});

describe("MCP OAuth — authorization code", () => {
  it("round-trips a code and yields the authenticated user", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { challenge } = pkcePair();

    const code = createAuthorizationCode({
      clientId,
      userId,
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      scope: "mcp:read",
    });

    const consumed = consumeAuthorizationCode(code);
    expect(consumed?.userId).toBe(userId);
    expect(consumed?.clientId).toBe(clientId);
  });

  it("is single-use — a replayed code is rejected", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { challenge } = pkcePair();
    const code = createAuthorizationCode({
      clientId,
      userId,
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      scope: "",
    });

    expect(consumeAuthorizationCode(code)).not.toBeNull();
    expect(consumeAuthorizationCode(code)).toBeNull(); // replay
  });

  it("rejects an unknown code", () => {
    expect(consumeAuthorizationCode("not-a-real-code")).toBeNull();
  });

  it("stores the code hashed — the raw value is not recoverable from the row", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const code = createAuthorizationCode({
      clientId,
      userId,
      redirectUri: REDIRECT,
      codeChallenge: pkcePair().challenge,
      scope: "",
    });

    const stored = db.prepare("SELECT code_hash FROM mcp_oauth_codes").get() as { code_hash: string };
    expect(stored.code_hash).not.toBe(code);
    expect(stored.code_hash).toBe(createHash("sha256").update(code).digest("hex"));
  });
});

describe("MCP OAuth — PKCE", () => {
  it("accepts the matching verifier and rejects another", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(randomBytes(32).toString("base64url"), challenge)).toBe(false);
  });

  it("rejects a plain (unhashed) verifier — S256 only", () => {
    const verifier = randomBytes(32).toString("base64url");
    expect(verifyPkce(verifier, verifier)).toBe(false);
  });
});

describe("MCP OAuth — tokens", () => {
  it("resolves an access token to its principal", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { accessToken } = issueTokens({ clientId, userId, scope: "mcp:read" });

    const resolved = resolveAccessToken(accessToken);
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.clientId).toBe(clientId);
  });

  it("rejects an unknown or revoked access token", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { accessToken } = issueTokens({ clientId, userId, scope: "" });

    expect(resolveAccessToken("mat_bogus")).toBeNull();

    db.prepare("UPDATE mcp_oauth_tokens SET revoked_at = ? WHERE kind = 'access'").run(new Date().toISOString());
    expect(resolveAccessToken(accessToken)).toBeNull();
  });

  it("rejects an expired access token", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { accessToken } = issueTokens({ clientId, userId, scope: "" });

    db.prepare("UPDATE mcp_oauth_tokens SET expires_at = ? WHERE kind = 'access'").run("2000-01-01T00:00:00.000Z");
    expect(resolveAccessToken(accessToken)).toBeNull();
  });

  it("rotates refresh tokens — the presented one cannot be reused", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { refreshToken } = issueTokens({ clientId, userId, scope: "mcp:read" });

    const first = consumeRefreshToken(refreshToken);
    expect(first?.userId).toBe(userId);
    expect(consumeRefreshToken(refreshToken)).toBeNull(); // reuse rejected
  });

  it("stores tokens hashed", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    const { accessToken } = issueTokens({ clientId, userId, scope: "" });

    const row = db.prepare("SELECT token_hash FROM mcp_oauth_tokens WHERE kind = 'access'").get() as {
      token_hash: string;
    };
    expect(row.token_hash).not.toBe(accessToken);
  });

  it("revoking the user cascades their tokens away", () => {
    const userId = seedUser();
    const { clientId } = registerClient({ clientName: "Claude", redirectUris: [REDIRECT] });
    issueTokens({ clientId, userId, scope: "" });

    db.pragma("foreign_keys = ON");
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    const left = db.prepare("SELECT COUNT(*) AS n FROM mcp_oauth_tokens").get() as { n: number };
    expect(left.n).toBe(0);
  });
});
