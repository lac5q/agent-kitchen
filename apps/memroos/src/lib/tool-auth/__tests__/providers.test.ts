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

  it("registers 12 providers across 4+ categories", () => {
    expect(Object.keys(PROVIDERS_BY_KEY).length).toBeGreaterThanOrEqual(12);
    const grouped = getGroupedProviders();
    expect(grouped.length).toBe(5);
    // At minimum 2 providers in productivity, developer, crm, finance.
    for (const cat of ["productivity", "developer", "crm", "finance"] as const) {
      const list = getProvidersByCategory(cat);
      expect(list.length).toBeGreaterThanOrEqual(2);
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
});