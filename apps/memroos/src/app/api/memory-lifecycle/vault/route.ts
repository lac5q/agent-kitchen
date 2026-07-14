import { getDb } from "@/lib/db";
import {
  reconcileVaultDurability,
  writeVaultArtifactWithDurability,
  replayVaultArtifactWithDurability,
  listVaultArtifactsForTenant,
  readVaultArtifactForTenant,
  markOrphanedArtifacts,
} from "@/lib/memory/vault-durability";
import type { VaultLabel } from "@/lib/vault/types";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

type Body = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asLabel(value: unknown): VaultLabel {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  return {
    visibility: typeof rec.visibility === "string" ? (rec.visibility as VaultLabel["visibility"]) : undefined,
    policy: typeof rec.policy === "string" ? (rec.policy as VaultLabel["policy"]) : undefined,
    domain: typeof rec.domain === "string" ? (rec.domain as VaultLabel["domain"]) : null,
    sensitivity: typeof rec.sensitivity === "string" ? (rec.sensitivity as VaultLabel["sensitivity"]) : null,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const action = asString(body.action, "action");
    const tenantId = asString(asOptionalString(body.tenantId) ?? "default-tenant", "tenantId");
    const actorId = asString(body.actorId, "actorId");

    if (action === "write") {
      const written = writeVaultArtifactWithDurability(getDb(), {
        tenantId,
        sourceType: asString(body.sourceType, "sourceType"),
        sourceId: asOptionalString(body.sourceId) ?? null,
        sessionId: asOptionalString(body.sessionId) ?? null,
        project: asOptionalString(body.project) ?? null,
        body: asString(body.body, "body"),
        label: asLabel(body.label),
        keyId: asOptionalString(body.keyId) ?? null,
        retentionUntil: asOptionalString(body.retentionUntil) ?? null,
        replayMetadata: asRecord(body.replayMetadata),
        actorId,
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, artifact: written });
    }

    if (action === "replay") {
      const result = replayVaultArtifactWithDurability(
        getDb(),
        tenantId,
        asString(body.artifactId, "artifactId"),
        actorId
      );
      return Response.json({ ok: result.ok, result });
    }

    if (action === "reconcile") {
      const summary = reconcileVaultDurability(getDb(), tenantId, actorId);
      return Response.json({ ok: true, summary });
    }

    if (action === "mark_orphans") {
      const marked = markOrphanedArtifacts(getDb(), tenantId);
      return Response.json({ ok: true, marked });
    }

    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "default-tenant";
    const artifactId = url.searchParams.get("artifactId");
    if (artifactId) {
      const replayed = readVaultArtifactForTenant(getDb(), tenantId, artifactId);
      return Response.json({ ok: true, artifact: { id: replayed.id, tenantId: replayed.tenantId, artifactUri: replayed.artifactUri, contentHash: replayed.contentHash, hashVerified: replayed.hashVerified } });
    }
    const list = listVaultArtifactsForTenant(getDb(), tenantId, {
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      cursor: url.searchParams.get("cursor"),
    });
    return Response.json({ ok: true, artifacts: list.artifacts, nextCursor: list.nextCursor });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
