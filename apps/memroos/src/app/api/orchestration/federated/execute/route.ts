import { getDb } from "@/lib/db";
import crypto from "crypto";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  persistFederationActionArtifact,
  resolveFederationActionProof,
} from "@/lib/federation/action-bridge";
import { executeOrchestrationPlan } from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scopedPlan(plan: Record<string, unknown>, tenantId: string, spaceId: string): boolean {
  const scope = record(plan.scope);
  return scope?.tenantId === tenantId && scope?.spaceId === spaceId;
}

function signFederationProof(reference: Record<string, string>): string | null {
  const secret = process.env.ORCHESTRATION_FEDERATION_PROOF_SECRET;
  if (!secret) return null;
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(reference).sort(([left], [right]) => left.localeCompare(right))));
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Federated action is intentionally a separate proxy surface. It creates and
 * revalidates the persisted local artifact before anything crosses into the
 * Python orchestration boundary. The Python request receives safe references
 * only, never caller-provided federation hashes or result content.
 */
export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  const body = record(await request.json().catch(() => null));
  const federation = record(body?.federation);
  const plan = record(body?.plan);
  const tenantId = text(federation?.tenantId);
  const spaceId = text(federation?.spaceId);
  const federationRunId = text(federation?.federationRunId);
  const packHash = text(federation?.packHash);
  const ontologyRecords = Array.isArray(federation?.ontologyRecords)
    ? federation.ontologyRecords
      .map(record)
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => ({ recordType: text(item.recordType) ?? "", recordId: text(item.recordId) ?? "" }))
    : [];
  if (!body || !federation || !plan || !tenantId || !spaceId || !federationRunId || !packHash || !scopedPlan(plan, tenantId, spaceId)) {
    return Response.json({ ok: false, success: false, status: "denied", reason: "federation_bridge_input_invalid" }, { status: 400 });
  }

  const db = getDb();
  const persisted = persistFederationActionArtifact(db, {
    tenantId,
    spaceId,
    federationRunId,
    packHash,
    ontologyRecords,
  });
  if (persisted.status !== "ready") {
    const status = persisted.status === "persistence_failed" ? 503 : persisted.status === "unavailable" ? 409 : 403;
    return Response.json({ ok: false, success: false, status: persisted.status, reason: persisted.reason }, { status });
  }
  const proof = resolveFederationActionProof(db, { tenantId, spaceId, artifactId: persisted.artifact.id });
  if (proof.status !== "ready") {
    return Response.json({ ok: false, success: false, status: proof.status, reason: proof.reason }, { status: 409 });
  }
  const reference = {
    artifactId: proof.artifact.id,
    artifactHash: proof.artifact.artifactHash,
    federationRunId: proof.artifact.federationRunId,
    packHash: proof.artifact.packHash,
    policyHash: proof.artifact.policyHash,
    ontologyHash: proof.artifact.ontologyHash,
    tenantId,
    spaceId,
  };
  const signature = signFederationProof(reference);
  if (!signature) {
    return Response.json({ ok: false, success: false, status: "unavailable", reason: "federation_proof_signing_unavailable" }, { status: 503 });
  }

  try {
    const result = await executeOrchestrationPlan({
      plan,
      runId: text(body.runId) ?? undefined,
      correlationId: text(body.correlationId) ?? undefined,
      crashAfterStepId: text(body.crashAfterStepId) ?? undefined,
      federationProof: {
        ...reference,
        signature,
      },
    });
    return Response.json({ ...result, federationArtifactId: proof.artifact.id, federationArtifactHash: proof.artifact.artifactHash });
  } catch (error) {
    return Response.json(
      { ok: false, success: false, status: "unavailable", reason: "orchestration_proxy_unavailable", error: error instanceof Error ? error.message : "unavailable" },
      { status: 502 },
    );
  }
}
