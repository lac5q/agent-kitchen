/**
 * Ollama nomic-embed-text embedding provider (D-01, D-05).
 *
 * The provider is gated behind MEMROOS_EMBEDDING_PROVIDER. When not set to
 * "ollama", all embedding calls short-circuit to a degraded result without
 * making any network request.
 *
 * An Ollama outage always surfaces as { embedding: null, degraded: true } —
 * embedText() NEVER throws. This ensures that recall endpoints can fail closed
 * to BM25 without a 5xx (D-05).
 */

import { loadMemroosEnv } from "@/lib/env";

/**
 * Discriminated union returned by embedText().
 *   degraded: false — successful embedding; embedding is a number[]
 *   degraded: true  — provider disabled or Ollama unreachable; embedding is null
 */
export type EmbedResult =
  | { embedding: number[]; degraded: false }
  | { embedding: null; degraded: true };

/** Degraded singleton — avoids allocating a new object on every failure path. */
const DEGRADED: EmbedResult = { embedding: null, degraded: true };

/**
 * Returns true when MEMROOS_EMBEDDING_PROVIDER is exactly "ollama".
 * Reads through the typed env module so tests can override process.env per-test.
 */
export function embeddingProviderEnabled(): boolean {
  return loadMemroosEnv().MEMROOS_EMBEDDING_PROVIDER === "ollama";
}

/**
 * Compute a nomic-embed-text embedding via the local Ollama service.
 *
 * - If the provider is disabled, returns DEGRADED immediately (no fetch).
 * - Uses a 5s AbortSignal.timeout to bound latency (T-71-01).
 * - Any network error, timeout, non-ok response, or missing embedding array
 *   returns DEGRADED — never throws (D-05).
 */
export async function embedText(text: string): Promise<EmbedResult> {
  if (!embeddingProviderEnabled()) {
    return DEGRADED;
  }

  const ollamaUrl = loadMemroosEnv().OLLAMA_URL;

  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return DEGRADED;
    }

    const body = await response.json() as { embedding?: number[] };

    if (!Array.isArray(body.embedding) || body.embedding.length === 0) {
      return DEGRADED;
    }

    return { embedding: body.embedding, degraded: false };
  } catch {
    // Network errors, timeouts, AbortError, JSON parse errors — all degrade gracefully (D-05)
    return DEGRADED;
  }
}

/**
 * Standard cosine similarity between two vectors.
 *
 * Returns 0 when either vector is zero-length or has a zero norm to avoid
 * division-by-zero and NaN propagation.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}
