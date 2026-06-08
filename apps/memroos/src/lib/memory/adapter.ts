/**
 * MemoryAdapter interface — stable contract for Phase 71 recall work.
 *
 * Constraints (MEM-06, T-70-10):
 * - No method returns a Qdrant or Neo4j client handle.
 * - Adapter surface: tiers, capabilities, search, write, health — nothing else.
 */

import type { MemoryTier } from "./tiers";
import type { MemoryTierHealth } from "./registry-contract";

/** Capability tags that describe what a backend can do.
 * Defined in CONTEXT.md Specifics — used by Phase 70.1 shadow adapter selection.
 */
export type MemoryCapability =
  | "semantic"
  | "graphTraversal"
  | "reasoningTrace"
  | "bufferedWrite"
  | "tenantScoped"
  | "auditEdges";

/** Normalized search result returned by any MemoryAdapter. */
export interface MemorySearchResult {
  id: string | number;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Stable abstraction over a memory backend.
 *
 * An adapter declares which tier(s) it owns. When an adapter is registered for a
 * tier, the existing shim functions delegate to it — preventing the double-writer
 * hazard (RESEARCH.md Pitfall 4, T-70-12).
 *
 * Do NOT add getClient(), client, driver, or any method that returns a backend
 * client handle. That would violate MEM-06 and expose Qdrant/Neo4j handles to callers.
 */
export interface MemoryAdapter {
  /** Which tier(s) this adapter owns. Declaring a tier disables the direct-call path. */
  readonly tiers: MemoryTier[];

  /** Capability metadata for adapter selection and telemetry. */
  readonly capabilities: MemoryCapability[];

  /** Query the backend for relevant memories. */
  search(query: string, limit: number): Promise<MemorySearchResult[]>;

  /** Write a memory entry to the backend. */
  write(payload: Record<string, unknown>): Promise<void>;

  /**
   * Return health status.
   * Must not return or expose internal client handles — wrap in a plain status object only.
   */
  health(): Promise<MemoryTierHealth>;
}
