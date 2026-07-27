// apps/memroos/src/lib/tool-auth/__tests__/providers.test.ts
// Phase 179 / v8.23 — provider registry unit tests.

import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  PROVIDERS_BY_KEY,
  PROVIDER_CATEGORIES,
  getCategories,
  getGroupedProviders,
  getProvider,
  getProvidersByCategory,
  isApiKeyProvider,
  isOAuthProvider,
} from "../providers";

describe("tool-auth/providers", () => {
  it("exports 5 ordered categories", () => {
    expect(PROVIDER_CATEGORIES).toEqual([
      "productivity",
      "developer",
      "crm",
      "finance",
      "other",
    ]);
  });

  it("every category has a label and description", () => {
    for (const id of PROVIDER_CATEGORIES) {
      const meta = CATEGORIES[id];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("registers 9+ providers across all 5 categories", () => {
    expect(Object.keys(PROVIDERS_BY_KEY).length).toBeGreaterThanOrEqual(9);
    const grouped = getGroupedProviders();
    expect(grouped.length).toBe(5);
    // Every category carries at least one provider. This was ">= 2 in
    // productivity/developer/crm/finance" until 2026-07-27, when the HubSpot,
    // Salesforce, and Xero cards were removed for pointing at Nango
    // integrations that do not exist — leaving crm with Intercom alone. A
    // minimum-count assertion should not be what forces an unusable card to
    // stay in the registry.
    for (const cat of PROVIDER_CATEGORIES) {
      expect(getProvidersByCategory(cat).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every provider has a unique lowercase-hyphen-safe key", () => {
    const keys = Object.keys(PROVIDERS_BY_KEY);
    const seen = new Set<string>();
    for (const k of keys) {
      expect(k).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("every OAuth provider has at least one scope", () => {
    for (const p of Object.values(PROVIDERS_BY_KEY)) {
      if (isOAuthProvider(p)) {
        expect(p.scopes.length).toBeGreaterThan(0);
        expect(p.providerConfigKey.length).toBeGreaterThan(0);
      }
    }
  });

  it("every API-key provider has a docsUrl and field label", () => {
    for (const p of Object.values(PROVIDERS_BY_KEY)) {
      if (isApiKeyProvider(p)) {
        expect(p.apiKeyField.length).toBeGreaterThan(0);
        expect(p.docsUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it("getProvider returns undefined for unknown keys", () => {
    expect(getProvider("not-a-real-provider")).toBeUndefined();
  });

  it("type guards narrow correctly", () => {
    const slack = getProvider("slack");
    expect(slack).toBeDefined();
    if (slack && isOAuthProvider(slack)) {
      // @ts-expect-error — authMode is narrowed to "oauth" here
      expect(slack.apiKeyField).toBeUndefined();
    }
    const stripe = getProvider("stripe");
    expect(stripe).toBeDefined();
    if (stripe && isApiKeyProvider(stripe)) {
      expect(stripe.apiKeyField).toMatch(/key/i);
    }
  });

  it("getCategories returns ordered category metadata", () => {
    const cats = getCategories();
    expect(cats.map((c) => c.id)).toEqual([...PROVIDER_CATEGORIES]);
  });

  /**
   * Every OAuth card drives a Connect button that hands its providerConfigKey
   * straight to Nango. A key with no matching Nango integration renders a card
   * that can only fail — which is exactly how Linear shipped (pointing at
   * `linear` when prod only had an admin-gated OAuth app plus `linear-mcp`),
   * and how Slack and Google Calendar were pointing at names without the `-mcp`
   * suffix prod actually uses.
   *
   * This list mirrors the live Nango prod integration list (verified against
   * GET https://api.nango.dev/integrations on 2026-07-27). When you add an
   * integration in the Nango dashboard, add it here in the same commit — a
   * card whose key is absent here is a card no user can connect.
   */
  const NANGO_PROD_INTEGRATIONS = [
    "circleback-mcp",
    "github",
    "google",
    "google-calendar-mcp",
    "google-drive",
    "google-mail",
    "linear",
    "linear-mcp",
    "mcp-generic",
    "notion",
    "slack-mcp",
  ];

  it("every OAuth provider's providerConfigKey exists in Nango prod", () => {
    const orphans = Object.values(PROVIDERS_BY_KEY)
      .filter(isOAuthProvider)
      .filter((p) => !NANGO_PROD_INTEGRATIONS.includes(p.providerConfigKey))
      .map((p) => `${p.key} -> ${p.providerConfigKey}`);

    expect(orphans).toEqual([]);
  });
});