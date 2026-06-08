// Leaf type module; keep this free of memory sibling imports.
// Prevents circular: adapter.ts -> backends.ts -> registry.ts -> adapter.ts.
import type { MemoryTier } from "./tiers";

export interface MemoryTierHealth {
  tier: MemoryTier;
  backend: string;
  status: "up" | "degraded" | "down" | "not_configured";
  detail?: string;
  count?: number | null;
  lastWrite?: string | null;
}
