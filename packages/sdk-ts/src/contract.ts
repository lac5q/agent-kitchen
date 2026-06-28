import type { EvalSubmitResult } from "./types";

export const PUBLIC_EVAL_API_V1_CONTRACT_ID = "public-eval-api.v1";
export const PUBLIC_EVAL_CONTRACT_HEADER = "X-Memroos-Contract";

function isLayerBreakdown(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.score === "number" &&
    typeof record.weight === "number" &&
    Array.isArray(record.scorers)
  );
}

export function assertEvalSubmitResult(value: unknown): asserts value is EvalSubmitResult {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid EvalSubmitResult: response body must be an object");
  }

  const record = value as Record<string, unknown>;
  const layers = record.layers;
  if (
    typeof record.runId !== "string" ||
    typeof record.w !== "number" ||
    !layers ||
    typeof layers !== "object" ||
    !Array.isArray(record.proposalIds) ||
    typeof record.tenantId !== "string"
  ) {
    throw new Error("Invalid EvalSubmitResult: missing required public eval contract fields");
  }

  const layerEntries = Object.entries(layers as Record<string, unknown>);
  if (layerEntries.length === 0 || !layerEntries.every(([, layer]) => isLayerBreakdown(layer))) {
    throw new Error("Invalid EvalSubmitResult: layers must contain EvalLayerBreakdown values");
  }
}
