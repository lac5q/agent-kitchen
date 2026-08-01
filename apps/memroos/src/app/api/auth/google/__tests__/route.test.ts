// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn(), all: vi.fn() })) },
}));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));

function configureGoogleEnv() {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.com";
  delete process.env.GOOGLE_REDIRECT_URI;
}

function clearGoogleEnv() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.MEMROOS_JWT_SECRET = "test-secret-that-is-long-enough-32ch";
  clearGoogleEnv();
});

describe("GET /api/auth/google (start)", () => {
  it("404s when Google sign-in is not configured", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/auth/google"));
    expect(res.status).toBe(404);
  });

  it("redirects to Google with PKCE state cookies and carries the invite token", async () => {
    configureGoogleEnv();
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/auth/google?invite=tok-9"));

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("client-id");
    expect(location).toContain(encodeURIComponent("https://memroos.example.com/api/auth/google/callback"));
    expect(location).toContain("code_challenge");

    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("google_oauth_state=");
    expect(cookies).toContain("google_oauth_verifier=");
    expect(cookies).toContain("google_oauth_invite=tok-9");
    expect(cookies).toContain("HttpOnly");
  });
});

describe("GET /api/auth/google/status", () => {
  it("reports configured=false then true", async () => {
    const { GET } = await import("../status/route");
    expect(await (await GET()).json()).toEqual({ configured: false });

    configureGoogleEnv();
    vi.resetModules();
    const { GET: GET2 } = await import("../status/route");
    expect(await (await GET2()).json()).toEqual({ configured: true });
  });
});

describe("GET /api/auth/google/callback", () => {
  it("404s when not configured", async () => {
    const { GET } = await import("../callback/route");
    const res = await GET(new NextRequest("http://localhost/api/auth/google/callback?code=c&state=s"));
    expect(res.status).toBe(404);
  });

  it("redirects to login with a state-mismatch error and clears flow cookies", async () => {
    configureGoogleEnv();
    const { GET } = await import("../callback/route");
    const req = new NextRequest("http://localhost/api/auth/google/callback?code=c&state=WRONG", {
      headers: { cookie: "google_oauth_state=RIGHT; google_oauth_verifier=v" },
    });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=google_state_mismatch");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("google_oauth_state=;");
    expect(cookies).toContain("Max-Age=0");
  });

  it("routes state-mismatch errors back to the invite page when an invite rode along", async () => {
    configureGoogleEnv();
    const { GET } = await import("../callback/route");
    const req = new NextRequest("http://localhost/api/auth/google/callback?code=c&state=WRONG", {
      headers: {
        cookie: "google_oauth_state=RIGHT; google_oauth_verifier=v; google_oauth_invite=tok-9",
      },
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toBe("/invite/tok-9?error=google_state_mismatch");
  });
});
