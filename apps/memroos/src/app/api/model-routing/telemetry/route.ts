import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  listModelRoutingEvents,
  recordModelRoutingEvent,
  summarizeModelRouting,
  type ModelRoutingEventInput,
} from "@/lib/model-routing";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { responseCache } from "@/lib/response-cache";

export const dynamic = "force-dynamic";

function clampLimit(raw: string | null): number {
  const parsed = raw !== null ? Number(raw) : 50;
  return Math.min(200, Math.max(1, Number.isNaN(parsed) ? 50 : parsed));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const db = getDb();
  return Response.json({
    events: listModelRoutingEvents(db, clampLimit(url.searchParams.get("limit"))),
    summary: summarizeModelRouting(db),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

  const body = (await req.json().catch(() => null)) as Partial<ModelRoutingEventInput> | null;
  if (!body || !isString(body.taskType) || !isString(body.provider) || !isString(body.model)) {
    return Response.json(
      { error: "taskType, provider, and model are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const event = recordModelRoutingEvent(db, {
    ...body,
    taskType: body.taskType.trim().toLowerCase(),
    provider: body.provider.trim().toLowerCase(),
    model: body.model.trim(),
  });
  responseCache.invalidateTag("model-routing");

  return Response.json({
    ok: true,
    event,
    summary: summarizeModelRouting(db),
    timestamp: new Date().toISOString(),
  });
}
