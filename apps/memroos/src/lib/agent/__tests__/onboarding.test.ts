// @vitest-environment node
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertMintableUrl,
  createAgentOnboardingToken,
  OnboardingMintError,
  verifyAgentOnboardingToken,
} from "@/lib/agent/onboarding";

describe("onboarding mint URL validation", () => {
  beforeEach(() => {
    process.env.MEMROOS_ONBOARDING_SECRET = "onboarding-test-secret-a";
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  afterEach(() => {
    delete process.env.MEMROOS_ONBOARDING_SECRET;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it("accepts an HTTPS public URL and HTTP localhost URLs", () => {
    expect(assertMintableUrl("https://memroos.example.test/mcp", "mcpUrl").hostname).toBe(
      "memroos.example.test"
    );
    expect(() =>
      assertMintableUrl(
        "https://memroos.example.test:8443/mcp?foo=bar&baz=qux#section",
        "mcpUrl"
      )
    ).not.toThrow();
    expect(() => assertMintableUrl("http://localhost:3000", "memroosUrl")).not.toThrow();
    expect(() => assertMintableUrl("http://127.0.0.1:3000", "memroosUrl")).not.toThrow();
  });

  it.each([
    ["comma host", "https://a.com,a.com", /commas/],
    ["doubled host", "https://a.coma.com", /doubled host/],
    ["doubled host with legitimate prefix", "https://sub.a.coma.com", /doubled host/],
    [
      "repeated host without separator",
      "https://memroos-cordant.epiloguecapital.commemroos-cordant.epiloguecapital.com",
      /doubled host/,
    ],
    ["whitespace", "https://a.com/path with space", /whitespace/],
    ["shell metacharacter", "https://good.example/$(id)", /unsupported characters/],
    ["IPv6 brackets", "http://[::1]:3000", /unsupported characters/],
    ["embedded credentials", "https://user:password@a.com", /credentials/],
    ["non-local HTTP", "http://a.com", /must use https/],
  ])("rejects %s", (_caseName, raw, message) => {
    expect(() => assertMintableUrl(raw, "memroosUrl")).toThrow(OnboardingMintError);
    expect(() => assertMintableUrl(raw, "memroosUrl")).toThrow(message);
  });

  it.each([
    "https://x.comcast.com",
    "https://sub.memroos-cordant.epiloguecapital.com",
    "http://localhost",
  ])("accepts legitimate host %s", (raw) => {
    expect(() => assertMintableUrl(raw, "memroosUrl")).not.toThrow();
  });

  it("validates both the base URL and the resolved MCP URL at mint time", () => {
    expect(() =>
      createAgentOnboardingToken({
        memroosUrl: "https://memroos.example.test",
        mcpUrl: "https://a.coma.com/mcp",
        allowedAgentIds: ["agent-1"],
      })
    ).toThrow(/mcpUrl.*doubled host/);
  });
});

describe("onboarding token signing-key diagnostics", () => {
  beforeEach(() => {
    process.env.MEMROOS_ONBOARDING_SECRET = "onboarding-test-secret-a";
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  afterEach(() => {
    delete process.env.MEMROOS_ONBOARDING_SECRET;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it("carries a short key id through a mint/verify round trip", () => {
    const minted = createAgentOnboardingToken({
      memroosUrl: "https://memroos.example.test",
      allowedAgentIds: ["agent-1"],
    });

    expect(minted.payload.kid).toMatch(/^[0-9a-f]{8}$/);
    expect(verifyAgentOnboardingToken(minted.token)).toMatchObject({
      ok: true,
      payload: { kid: minted.payload.kid },
    });
  });

  it("reports both key ids when another signing secret verifies the token", () => {
    const minted = createAgentOnboardingToken({
      memroosUrl: "https://memroos.example.test",
      allowedAgentIds: ["agent-1"],
    });
    const serverSecret = "onboarding-test-secret-b";
    process.env.MEMROOS_ONBOARDING_SECRET = serverSecret;
    const serverKid = crypto.createHash("sha256").update(serverSecret).digest("hex").slice(0, 8);

    const result = verifyAgentOnboardingToken(minted.token);
    expect(result).toEqual({
      ok: false,
      error: `Invalid onboarding token signature (token kid ${minted.payload.kid}, server kid ${serverKid})`,
    });
  });

  it("keeps the generic signature error for same-secret body tampering", () => {
    const { token } = createAgentOnboardingToken({
      memroosUrl: "https://memroos.example.test",
      allowedAgentIds: ["agent-1"],
    });
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp: number };
    decoded.exp += 1;
    const tamperedBody = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const tampered = `${tamperedBody}.${signature}`;

    expect(verifyAgentOnboardingToken(tampered)).toEqual({
      ok: false,
      error: "Invalid onboarding token signature",
    });
  });

  it("accepts a valid legacy token without a signing key id", () => {
    const payload = {
      version: 1,
      exp: Math.floor(Date.now() / 1000) + 60,
      memroosUrl: "https://memroos.example.test",
      mcpUrl: "https://memroos.example.test/mcp",
      allowedAgentIds: ["legacy-agent"],
      nonce: "legacy-nonce",
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", "onboarding-test-secret-a")
      .update(body)
      .digest("base64url");

    expect(verifyAgentOnboardingToken(`${body}.${signature}`)).toEqual({
      ok: true,
      payload,
    });
  });
});
