import { parseModelUsage } from "@/lib/parsers";
import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import {
  aggregateEfficiencyTokenLedger,
  mergeModelUsageSources,
} from "@/lib/efficiency-telemetry";
import { aggregateModelRoutingTokenUsage } from "@/lib/model-routing";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ModelUsageResult = Awaited<ReturnType<typeof parseModelUsage>>;

let modelUsageCache:
  | {
      key: string;
      checkedAt: number;
      usage: ModelUsageResult;
      sources: Record<string, number>;
    }
  | null = null;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyUsage(): ModelUsageResult {
  return {
    models: [],
    total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, requests: 0 },
  };
}

async function buildModelUsageResponse(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const cacheKey = since?.toISOString() ?? "all";
  const ttlMs = positiveNumber(process.env.MODEL_USAGE_CACHE_TTL_MS, 30_000);
  if (modelUsageCache?.key === cacheKey && Date.now() - modelUsageCache.checkedAt < ttlMs) {
    return Response.json({
      usage: modelUsageCache.usage,
      sources: modelUsageCache.sources,
      timestamp: new Date().toISOString(),
    });
  }

  // Claude JSONL + efficiency token_ledger.
  // model_routing_events are a fallback only: recordModelRoutingEvent also mirrors
  // into token_ledger, so merging both would double-count when routing is active.
  const claudeUsage = await parseModelUsage(since);
  let ledgerUsage = emptyUsage();
  let routingUsage = emptyUsage();
  try {
    const db = getDb();
    ledgerUsage = aggregateEfficiencyTokenLedger(db, since);
    routingUsage = aggregateModelRoutingTokenUsage(db, since);
  } catch {
    // Keep Claude-only results if the efficiency/routing tables are unavailable.
  }
  const durableUsage = ledgerUsage.models.length > 0 ? ledgerUsage : routingUsage;
  const usage = mergeModelUsageSources(claudeUsage, durableUsage);
  const sources = {
    claudeJsonlModels: claudeUsage.models.length,
    efficiencyLedgerModels: ledgerUsage.models.length,
    modelRoutingModels: routingUsage.models.length,
    modelRoutingUsedAsFallback: ledgerUsage.models.length === 0 ? routingUsage.models.length : 0,
  };
  modelUsageCache = { key: cacheKey, checkedAt: Date.now(), usage, sources };
  return Response.json({
    usage,
    sources,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  try {
    return await buildModelUsageResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
