import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import { listEvalRuns } from "@/lib/evals/persistence";

export const dynamic = "force-dynamic";

function limitFrom(value: string | null): number {
  const parsed = value ? Number(value) : 25;
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 25;
}

function buildEvalHistoryResponse(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  return Response.json({
    runs: listEvalRuns(getDb(), limitFrom(url.searchParams.get("limit"))),
    timestamp: new Date().toISOString(),
  });
}

export function GET(req: NextRequest) {
  try {
    return buildEvalHistoryResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
