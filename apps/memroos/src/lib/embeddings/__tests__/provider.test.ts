/**
 * Wave 0 RED test scaffold for RECALL-01 / RECALL-02.
 *
 * These tests pin the contract for the Ollama nomic-embed-text provider
 * BEFORE implementation exists. They must fail until provider.ts is created.
 *
 * Contract:
 *   - embedText(text) returns { embedding: number[], degraded: false } on success
 *   - embedText(text) returns { embedding: null, degraded: true } on any failure (never throws)
 *   - embedText(text) returns { embedding: null, degraded: true } without fetch when provider is disabled
 *   - cosineSimilarity(a, b) returns expected cosine value
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These imports will fail (Cannot find module) until provider.ts is implemented — RED
import { embedText, embeddingProviderEnabled, cosineSimilarity } from "../provider";

describe("embedText — Ollama nomic-embed-text provider (RECALL-01)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns { embedding: number[], degraded: false } when Ollama responds ok", async () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";

    const mockVector = Array.from({ length: 768 }, (_, i) => i * 0.001);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: mockVector }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await embedText("hello world");

    expect(result.degraded).toBe(false);
    expect(result.embedding).toBeInstanceOf(Array);
    expect((result.embedding as number[]).length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns { embedding: null, degraded: true } when fetch rejects (network error)", async () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";

    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await embedText("test text");

    expect(result.degraded).toBe(true);
    expect(result.embedding).toBeNull();
    // Must NOT throw — resolved to degraded result
  });

  it("returns { embedding: null, degraded: true } when fetch returns non-ok response", async () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Model not loaded" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await embedText("test text");

    expect(result.degraded).toBe(true);
    expect(result.embedding).toBeNull();
  });

  it("returns degraded when Ollama omits a usable embedding array", async () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "ollama";
    process.env.OLLAMA_URL = "http://localhost:11434";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [] }),
      }),
    );

    const result = await embedText("empty vector");

    expect(result).toEqual({ embedding: null, degraded: true });
  });

  it("returns degraded result WITHOUT any network call when MEMROOS_EMBEDDING_PROVIDER is null/unset", async () => {
    // Provider disabled — must short-circuit without fetch
    process.env.MEMROOS_EMBEDDING_PROVIDER = "null";

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await embedText("some text");

    expect(result.degraded).toBe(true);
    expect(result.embedding).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns degraded result WITHOUT any network call when MEMROOS_EMBEDDING_PROVIDER is unset", async () => {
    delete process.env.MEMROOS_EMBEDDING_PROVIDER;

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await embedText("some text");

    expect(result.degraded).toBe(true);
    expect(result.embedding).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("embeddingProviderEnabled (RECALL-01)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when MEMROOS_EMBEDDING_PROVIDER=ollama", () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "ollama";
    expect(embeddingProviderEnabled()).toBe(true);
  });

  it("returns false when MEMROOS_EMBEDDING_PROVIDER=null", () => {
    process.env.MEMROOS_EMBEDDING_PROVIDER = "null";
    expect(embeddingProviderEnabled()).toBe(false);
  });

  it("returns false when MEMROOS_EMBEDDING_PROVIDER is unset", () => {
    delete process.env.MEMROOS_EMBEDDING_PROVIDER;
    expect(embeddingProviderEnabled()).toBe(false);
  });
});

describe("cosineSimilarity (RECALL-01)", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns 0 for zero-length vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when a vector has zero norm", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});
