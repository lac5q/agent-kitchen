import { getDb } from "@/lib/db";
import {
  listTaskEvidenceBundles,
  upsertTaskEvidenceBundle,
  type TaskEvidenceBundleInput,
} from "@/lib/evidence/task-bundles";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function listValue(value: unknown) {
  return Array.isArray(value) ? (value as Array<Record<string, unknown> | string>) : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 });
  }

  const rawLimit = Number(url.searchParams.get("limit") ?? 20);
  const bundles = listTaskEvidenceBundles(getDb(), taskId, Number.isFinite(rawLimit) ? rawLimit : 20);
  return Response.json({ ok: true, bundles });
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.taskId !== "string" || !body.taskId.trim()) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 });
  }

  const input: TaskEvidenceBundleInput = {
    id: typeof body.id === "string" ? body.id : undefined,
    taskId: body.taskId,
    tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
    status:
      body.status === "verified" || body.status === "failed" || body.status === "superseded"
        ? body.status
        : "open",
    plan: listValue(body.plan),
    context: listValue(body.context),
    permissions: listValue(body.permissions),
    tools: listValue(body.tools),
    actions: listValue(body.actions),
    verification: listValue(body.verification),
    memories: listValue(body.memories),
    sources: listValue(body.sources),
    assumptions: listValue(body.assumptions),
    residualRisks: listValue(body.residualRisks),
    replayHandle: typeof body.replayHandle === "string" ? body.replayHandle : null,
    rollbackHandle: typeof body.rollbackHandle === "string" ? body.rollbackHandle : null,
    orchestrationRunId: typeof body.orchestrationRunId === "string" ? body.orchestrationRunId : null,
    orchestrationPlanHash: typeof body.orchestrationPlanHash === "string" ? body.orchestrationPlanHash : null,
    orchestrationBundleHash: typeof body.orchestrationBundleHash === "string" ? body.orchestrationBundleHash : null,
  };

  const bundle = upsertTaskEvidenceBundle(getDb(), input);
  return Response.json({ ok: true, bundle }, { status: 201 });
}
