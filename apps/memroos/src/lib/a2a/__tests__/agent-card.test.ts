// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  A2A_CANONICAL_AGENT_CARD_PATH,
  A2A_COMPAT_AGENT_CARD_PATH,
} from "../types";
import { getA2aConfig } from "../config";
import { buildMemroosAgentCard } from "../agent-card";
import { A2A_CONTRACT_HEADER, A2A_CONTRACT_ID } from "../contract";

const A2A_ENV_KEYS = [
  "MEMROOS_A2A_PROFILE",
  "MEMROOS_PUBLIC_BASE_URL",
  "MEMROOS_A2A_ENDPOINT_BASE_URL",
  "MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS",
  "MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS",
  "MEMROOS_A2A_ADK_FIXTURE_CARD_URL",
] as const;

afterEach(() => {
  for (const key of A2A_ENV_KEYS) {
    delete process.env[key];
  }
  vi.resetModules();
});

describe("getA2aConfig", () => {
  it("defaults to local-dev profile", () => {
    expect(getA2aConfig()).toEqual({
      profile: "local-dev",
      publicBaseUrl: "http://localhost:3000",
      endpointBaseUrl: "http://localhost:3000",
      canonicalCardPath: "/.well-known/agent-card.json",
      compatCardPath: "/.well-known/agent.json",
      remoteCardTimeoutMs: 5000,
      allowPrivateNetworkCards: true,
      adkFixtureCardUrl:
        "http://localhost:8001/a2a/check_prime_agent/.well-known/agent-card.json",
    });
  });

  it("honors A2A environment overrides and normalizes URLs", () => {
    process.env.MEMROOS_A2A_PROFILE = "private-network";
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.test/";
    process.env.MEMROOS_A2A_ENDPOINT_BASE_URL = "https://a2a.example.test/";
    process.env.MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS = "1250";
    process.env.MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS = "false";
    process.env.MEMROOS_A2A_ADK_FIXTURE_CARD_URL =
      "https://adk.example.test/.well-known/agent-card.json";

    expect(getA2aConfig()).toMatchObject({
      profile: "private-network",
      publicBaseUrl: "https://memroos.example.test",
      endpointBaseUrl: "https://a2a.example.test",
      remoteCardTimeoutMs: 1250,
      allowPrivateNetworkCards: false,
      adkFixtureCardUrl: "https://adk.example.test/.well-known/agent-card.json",
    });
  });

  it("denies private-network remote cards by default outside local/private profiles", () => {
    process.env.MEMROOS_A2A_PROFILE = "cloud-https";
    delete process.env.MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS;

    expect(getA2aConfig()).toMatchObject({
      profile: "cloud-https",
      allowPrivateNetworkCards: false,
    });
  });
});

describe("buildMemroosAgentCard", () => {
  it("builds a spec-shaped MemroOS card with canonical card paths", () => {
    const card = buildMemroosAgentCard({
      ...getA2aConfig(),
      endpointBaseUrl: "https://memroos.example.test/a2a",
    });

    expect(card.url).toBe("https://memroos.example.test/a2a");
    expect(card.url.startsWith("https://memroos.example.test/a2a")).toBe(true);
    expect(card.extensions.memroos.cardPaths.canonical).toBe(A2A_CANONICAL_AGENT_CARD_PATH);
    expect(card.extensions.memroos.cardPaths.compatibility).toBe(A2A_COMPAT_AGENT_CARD_PATH);
  });

  it("does not leak secrets in the public card", () => {
    const json = JSON.stringify(buildMemroosAgentCard());

    expect(json).toContain("bearerAuth");
    expect(json).not.toContain("authentication: none");
    expect(json).not.toContain("apiKey");
    expect(json).not.toContain("token");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("AGENT_CONFIGS_PATH");
    expect(json).not.toContain("KNOWLEDGE_BASE_PATH");
  });

  it("advertises streaming, task history, and MemroOS A2A skills", () => {
    const card = buildMemroosAgentCard();

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.stateTransitionHistory).toBe(true);
    expect(card.skills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(["agent_registry", "task_delegation", "memory_reporting"])
    );
  });
});

describe("well-known A2A agent card routes", () => {
  it("returns the canonical MemroOS card", async () => {
    const { GET } = await import("../../../app/.well-known/agent-card.json/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(A2A_CONTRACT_HEADER)).toBe(A2A_CONTRACT_ID);
    expect(body.name).toBe("MemroOS");
    expect(body.extensions.memroos.cardPaths.canonical).toBe(A2A_CANONICAL_AGENT_CARD_PATH);
    expect(body.extensions.memroos.compatibilityAlias).toBeUndefined();
  });

  it("returns a compatibility alias card at the legacy roadmap path", async () => {
    const { GET } = await import("../../../app/.well-known/agent.json/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(A2A_CONTRACT_HEADER)).toBe(A2A_CONTRACT_ID);
    expect(body.name).toBe("MemroOS");
    expect(body.extensions.memroos.cardPaths.compatibility).toBe(A2A_COMPAT_AGENT_CARD_PATH);
    expect(body.extensions.memroos.compatibilityAlias).toBe(true);
  });
});
