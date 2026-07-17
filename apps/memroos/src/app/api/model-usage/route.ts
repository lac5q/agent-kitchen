import { parseModelUsage } from "@/lib/parsers";
import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import {
  aggregateEfficiencyTokenLedger,
  mergeModelUsageSources,
} from "@/lib/efficiency-telemetry";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ModelUsageResult = Awaited<ReturnType<typeof parseModelUsage>>;

let modelUsageCache:
  | { key: string; checkedAt: number; usage: ModelUsageResult }
  | null = null;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function buildModelUsageResponse(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const cacheKey = since?.toISOString() ?? "all";
  const ttlMs = positiveNumber(process.env.MODEL_USAGE_CACHE_TTL_MS, 30_000);
  if (modelUsageCache?.key === cacheKey && Date.now() - modelUsageCache.checkedAt < ttlMs) {
    return Response.json({ usage: modelUsageCache.usage, timestamp: new Date().toISOString() });
  }

  // Claude JSONL (local developer hosts) + durable token_ledger (cloud/Heroku).
  const claudeUsage = await parseModelUsage(since);
  let ledgerUsage = { models: [] as ModelUsageResult["models"], total: claudeUsage.total };
  try {
    ledgerUsage = aggregateEfficiencyTokenLedger(getDb(), since);
  } catch {
    // Keep Claude-only results if the efficiency table is unavailable.
  }
  const usage = mergeModelUsageSources(claudeUsage, ledgerUsage);
  modelUsageCache = { key: cacheKey, checkedAt: Date.now(), usage };
  return Response.json({
    usage,
    sources: {
      claudeJsonlModels: claudeUsage.models.length,
      efficiencyLedgerModels: ledgerUsage.models.length,
    },
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
