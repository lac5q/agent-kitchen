import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import { recommendModels, type ModelRoutingStrategy } from "@/lib/model-routing";
import { cacheKey, responseCache } from "@/lib/response-cache";

export const dynamic = "force-dynamic";

function strategyFrom(value: unknown): ModelRoutingStrategy {
  return value === "cost" || value === "quality" || value === "latency" ? value : "balanced";
}

function limitFrom(value: string | null): number {
  const parsed = value !== null ? Number(value) : 4;
  return Math.min(8, Math.max(1, Number.isNaN(parsed) ? 4 : parsed));
}

async function buildRecommendationsGetResponse(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const taskType = (url.searchParams.get("taskType") || "engineering").trim().toLowerCase();
  const strategy = strategyFrom(url.searchParams.get("strategy"));
  const limit = limitFrom(url.searchParams.get("limit"));

  return Response.json(
    await responseCache.getOrSet(
      "model-routing-recommendations",
      cacheKey([taskType, strategy, limit]),
      15_000,
      async () => ({
        taskType,
        strategy,
        recommendations: recommendModels(getDb(), taskType, strategy, limit),
        timestamp: new Date().toISOString(),
      }),
      ["model-routing"]
    )
  );
}

async function buildRecommendationsPostResponse(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    taskType?: unknown;
    strategy?: unknown;
    limit?: unknown;
  } | null;
  const taskType = typeof body?.taskType === "string" && body.taskType.trim()
    ? body.taskType.trim().toLowerCase()
    : "engineering";
  const strategy = strategyFrom(body?.strategy);
  const limit = typeof body?.limit === "number" ? Math.min(8, Math.max(1, body.limit)) : 4;

  return Response.json({
    taskType,
    strategy,
    recommendations: recommendModels(getDb(), taskType, strategy, limit),
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  try {
    return await buildRecommendationsGetResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    return await buildRecommendationsPostResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
