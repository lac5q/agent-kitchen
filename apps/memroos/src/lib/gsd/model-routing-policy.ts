import type Database from "better-sqlite3";

import {
  ensureModelRoutingSchema,
  recordModelRoutingEvent,
  type ModelRoutingEventInput,
} from "@/lib/model-routing";

export type GsdRoutingTier =
  | "cheap_local"
  | "frontier"
  | "private_customer_bound"
  | "vision"
  | "validator";

export interface GsdModelRoutingPolicyEntry {
  taskClass: string;
  tier: GsdRoutingTier;
  provider: string;
  model: string;
  reason: string;
}

export interface GsdModelRouteInput {
  taskClass: string;
  agentId?: string;
  taskId?: string;
  overrideTier?: GsdRoutingTier;
  overrideReason?: string;
  sensitive?: boolean;
  multimodal?: boolean;
  highRisk?: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  qualityScore?: number;
  success?: boolean;
  error?: string;
}

export interface GsdModelRouteResult {
  taskClass: string;
  tier: GsdRoutingTier;
  provider: string;
  model: string;
  reason: string;
  overrideApplied: boolean;
  receiptId: number;
  estimatedCostUsd: number | null;
  qualityScore: number | null;
}

export const GSD_MODEL_ROUTING_POLICY: GsdModelRoutingPolicyEntry[] = [
  {
    taskClass: "extraction",
    tier: "cheap_local",
    provider: "minimax",
    model: "MiniMax-M3",
    reason: "Preferred MiniMax worker for cheap extraction and formatting.",
  },
  {
    taskClass: "classification",
    tier: "cheap_local",
    provider: "minimax",
    model: "MiniMax-M3",
    reason: "Preferred MiniMax worker for classification and routing.",
  },
  {
    taskClass: "formatting",
    tier: "cheap_local",
    provider: "minimax",
    model: "MiniMax-M3",
    reason: "Preferred MiniMax worker for deterministic formatting.",
  },
  {
    taskClass: "hard_reasoning",
    tier: "frontier",
    provider: "anthropic",
    model: "claude-sonnet",
    reason: "Frontier tier for hard reasoning and final synthesis.",
  },
  {
    taskClass: "final_synthesis",
    tier: "frontier",
    provider: "anthropic",
    model: "claude-sonnet",
    reason: "Frontier tier for final synthesis.",
  },
  {
    taskClass: "customer_bound",
    tier: "private_customer_bound",
    provider: "local",
    model: "qwen-coder-local",
    reason: "Private/customer-bound tier for sensitive data (never MiniMax).",
  },
  {
    taskClass: "multimodal_evidence",
    tier: "vision",
    provider: "google",
    model: "gemini-pro",
    reason: "Vision/multimodal tier for evidence review.",
  },
  {
    taskClass: "high_risk_review",
    tier: "validator",
    provider: "anthropic",
    model: "claude-sonnet",
    reason: "Validator tier for high-risk review (independent of MiniMax worker).",
  },
];

function resolvePolicyEntry(input: GsdModelRouteInput): GsdModelRoutingPolicyEntry {
  if (input.highRisk) {
    return GSD_MODEL_ROUTING_POLICY.find((entry) => entry.tier === "validator")!;
  }
  if (input.multimodal) {
    return GSD_MODEL_ROUTING_POLICY.find((entry) => entry.tier === "vision")!;
  }
  if (input.sensitive) {
    return GSD_MODEL_ROUTING_POLICY.find((entry) => entry.tier === "private_customer_bound")!;
  }
  const direct = GSD_MODEL_ROUTING_POLICY.find((entry) => entry.taskClass === input.taskClass);
  if (direct) return direct;
  return GSD_MODEL_ROUTING_POLICY.find((entry) => entry.taskClass === "hard_reasoning")!;
}

export function routeGsdModel(db: Database.Database, input: GsdModelRouteInput): GsdModelRouteResult {
  ensureModelRoutingSchema(db);
  const base = resolvePolicyEntry(input);
  const overrideApplied = Boolean(input.overrideTier);
  const selected =
    input.overrideTier != null
      ? GSD_MODEL_ROUTING_POLICY.find((entry) => entry.tier === input.overrideTier) ?? base
      : base;
  const reason = overrideApplied
    ? `${selected.reason} Override: ${input.overrideReason ?? "operator override"}`
    : selected.reason;

  const event: ModelRoutingEventInput = {
    taskType: input.taskClass,
    taskId: input.taskId,
    agentId: input.agentId,
    provider: selected.provider,
    model: selected.model,
    strategy: selected.tier === "cheap_local" ? "cost" : selected.tier === "validator" ? "quality" : "balanced",
    latencyMs: input.latencyMs,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    estimatedCostUsd: input.actualCostUsd ?? input.estimatedCostUsd,
    qualityScore: input.qualityScore,
    success: input.success,
    contextTags: [selected.tier, overrideApplied ? "override" : "policy"],
    error: input.error,
  };

  const receipt = recordModelRoutingEvent(db, event);
  return {
    taskClass: input.taskClass,
    tier: selected.tier,
    provider: selected.provider,
    model: selected.model,
    reason,
    overrideApplied,
    receiptId: receipt.id,
    estimatedCostUsd: input.actualCostUsd ?? input.estimatedCostUsd ?? null,
    qualityScore: input.qualityScore ?? null,
  };
}

export function getGsdModelRoutingPolicy(): GsdModelRoutingPolicyEntry[] {
  return GSD_MODEL_ROUTING_POLICY;
}
