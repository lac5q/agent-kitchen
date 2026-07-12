import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  bindOntologyProvenance,
  discoverOntology,
  ensureCanonicalUpperOntology,
  getDomainPack,
  getOntologyProvenanceBinding,
  publishOntologyVersion,
  registerDomainPack,
  transitionDomainPack,
  updateOntologyProjection,
  OntologyRegistryError,
  type DomainPackInput,
  type PackLifecycleState,
  type PublishOntologyInput,
} from "@/lib/ontology/registry";
import { decideOntologyCandidate, extractOntologyCandidate, getOntologyCandidate, promoteOntologyCandidate, registerOntologyPolicyContext } from "@/lib/ontology/candidates";
import { registerOntologyAlias, resolveOntologyAlias, transitionOntologyAlias } from "@/lib/ontology/aliases";
import { approveOntologyMigration, executeOntologyMigration, planOntologyMigration } from "@/lib/ontology/migrations";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be an object");
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const dynamic = "force-dynamic";

function safeOntologyError(error: unknown): { error: string; code: string } {
  if (error instanceof OntologyRegistryError) {
    return { error: "ontology request rejected", code: error.code };
  }
  return { error: "ontology request rejected", code: "invalid" };
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = asObject(await request.json());
    const action = asString(body.action, "action");
    const db = getDb();

    if (action === "ensure_canonical") {
      return Response.json({ ok: true, ontology: ensureCanonicalUpperOntology(db, asOptionalString(body.actor) ?? "system") });
    }

    if (action === "publish") {
      const ontology = publishOntologyVersion(db, {
        ...body,
        id: asString(body.id, "id"),
        version: asString(body.version, "version"),
        definitions: body.definitions as PublishOntologyInput["definitions"],
        relationships: body.relationships as PublishOntologyInput["relationships"],
        projections: body.projections as PublishOntologyInput["projections"],
        actor: asString(body.actor, "actor"),
        suppliedHash: asOptionalString(body.suppliedHash),
        parent: body.parent as PublishOntologyInput["parent"],
      });
      return Response.json({ ok: true, ontology });
    }

    if (action === "reconcile_projection") {
      const reconciliation = updateOntologyProjection(db, {
        ontologyId: asString(body.ontologyId, "ontologyId"),
        version: asString(body.version, "version"),
        projection: asString(body.projection, "projection") as PublishOntologyInput["projections"][number]["projection"],
        contentHash: asString(body.contentHash, "contentHash"),
        status: asString(body.status, "status") as "current" | "stale" | "divergent" | "failed",
        actor: asString(body.actor, "actor"),
      });
      return Response.json({ ok: reconciliation.every((entry) => entry.current), reconciliation });
    }

    if (action === "bind_provenance") {
      const binding = bindOntologyProvenance(db, {
        recordType: asString(body.recordType, "recordType"),
        recordId: asString(body.recordId, "recordId"),
        ontologyId: asString(body.ontologyId, "ontologyId"),
        ontologyVersion: asString(body.ontologyVersion, "ontologyVersion"),
        ontologyContentHash: asString(body.ontologyContentHash, "ontologyContentHash"),
        actor: asString(body.actor, "actor"),
      });
      return Response.json({ ok: true, binding });
    }

    if (action === "register_pack") {
      const pack = registerDomainPack(db, {
        ...body,
        namespace: asString(body.namespace, "namespace"),
        owner: asString(body.owner, "owner"),
        version: asString(body.version, "version"),
        sourceHash: asString(body.sourceHash, "sourceHash"),
        provenanceSummary: asObject(body.provenanceSummary),
        ontology: asObject(body.ontology) as DomainPackInput["ontology"],
        dependencies: (body.dependencies ?? []) as DomainPackInput["dependencies"],
        types: body.types as DomainPackInput["types"],
        actor: asString(body.actor, "actor"),
      });
      return Response.json({ ok: true, pack });
    }

    if (action === "transition_pack") {
      const pack = transitionDomainPack(db, {
        packId: asString(body.packId, "packId"),
        toState: asString(body.toState, "toState") as PackLifecycleState,
        actor: asString(body.actor, "actor"),
        reason: asOptionalString(body.reason),
        replacementPackId: asOptionalString(body.replacementPackId),
      });
      return Response.json({ ok: true, pack });
    }

    if (action === "extract_candidate") {
      return Response.json({ ok: true, candidate: extractOntologyCandidate(db, {
        ...body, tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        sourceId: asString(body.sourceId, "sourceId"), sourceHash: asString(body.sourceHash, "sourceHash"),
        sourceSpans: body.sourceSpans as string[], extractorId: asString(body.extractorId, "extractorId"),
        extractorVersion: asString(body.extractorVersion, "extractorVersion"), candidateKind: asString(body.candidateKind, "candidateKind") as "type" | "relationship" | "alias",
        namespace: asString(body.namespace, "namespace"), proposed: asObject(body.proposed), confidenceLabel: asString(body.confidenceLabel, "confidenceLabel") as "low" | "medium" | "high",
        confidenceScore: body.confidenceScore as number, actor: asString(body.actor, "actor"),
      }) });
    }

    if (action === "decide_candidate") {
      return Response.json({ ok: true, candidate: decideOntologyCandidate(db, {
        candidateId: asString(body.candidateId, "candidateId"), tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        decision: asString(body.decision, "decision") as "approve" | "reject" | "defer" | "supersede" | "invalidate",
        reviewerId: asString(body.reviewerId, "reviewerId"), reason: asString(body.reason, "reason"), supersededBy: asOptionalString(body.supersededBy),
      }) });
    }

    if (action === "promote_candidate") {
      return Response.json({ ok: true, promotion: promoteOntologyCandidate(db, {
        candidateId: asString(body.candidateId, "candidateId"), tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        sealProposalId: asString(body.sealProposalId, "sealProposalId"), sealDecisionId: asString(body.sealDecisionId, "sealDecisionId"),
        ontologyId: asString(body.ontologyId, "ontologyId"), ontologyVersion: asString(body.ontologyVersion, "ontologyVersion"),
        ontologyContentHash: asString(body.ontologyContentHash, "ontologyContentHash"), namespace: asString(body.namespace, "namespace"),
        policyContextHash: asString(body.policyContextHash, "policyContextHash"), reviewerId: asString(body.reviewerId, "reviewerId"),
        idempotencyKey: asString(body.idempotencyKey, "idempotencyKey"), expiresAt: asString(body.expiresAt, "expiresAt"),
      }) });
    }

    if (action === "register_policy_context") {
      registerOntologyPolicyContext(db, {
        tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        contextHash: asString(body.contextHash, "contextHash"), policyVersion: asString(body.policyVersion, "policyVersion"),
        actor: asString(body.actor, "actor"), expiresAt: asString(body.expiresAt, "expiresAt"),
      });
      return Response.json({ ok: true });
    }

    if (action === "register_alias") {
      return Response.json({ ok: true, alias: registerOntologyAlias(db, {
        ontologyId: asString(body.ontologyId, "ontologyId"), ontologyVersion: asString(body.ontologyVersion, "ontologyVersion"),
        ontologyContentHash: asString(body.ontologyContentHash, "ontologyContentHash"), namespace: asString(body.namespace, "namespace"),
        alias: asString(body.alias, "alias"), canonicalId: asString(body.canonicalId, "canonicalId"),
        actor: asString(body.actor, "actor"), reason: asString(body.reason, "reason"),
      }) });
    }

    if (action === "transition_alias") {
      return Response.json({ ok: true, alias: transitionOntologyAlias(db, {
        aliasId: asString(body.aliasId, "aliasId"), action: asString(body.aliasAction, "aliasAction") as "redirect" | "deprecate" | "restore" | "remove",
        canonicalId: asOptionalString(body.canonicalId), actor: asString(body.actor, "actor"), reason: asString(body.reason, "reason"),
      }) });
    }

    if (action === "plan_migration") {
      return Response.json({ ok: true, plan: planOntologyMigration(db, {
        tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        source: asObject(body.source) as { ontologyId: string; version: string; hash: string },
        target: asObject(body.target) as { ontologyId: string; version: string; hash: string },
        mappings: asObject(body.mappings) as Record<string, string[]>, actor: asString(body.actor, "actor"),
      }) });
    }

    if (action === "approve_migration") {
      return Response.json({ ok: true, plan: approveOntologyMigration(db, {
        planId: asString(body.planId, "planId"), tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        planHash: asString(body.planHash, "planHash"), actor: asString(body.actor, "actor"),
      }) });
    }

    if (action === "execute_migration") {
      return Response.json({ ok: true, ...executeOntologyMigration(db, {
        planId: asString(body.planId, "planId"), tenantId: asString(body.tenantId, "tenantId"), spaceId: asString(body.spaceId, "spaceId"),
        actor: asString(body.actor, "actor"), records: body.records as Array<{ recordType: string; recordId: string; sourceType: string }>,
      }) });
    }

    return Response.json({ ok: false, error: "ontology request rejected", code: "invalid" }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, ...safeOntologyError(error) }, { status: 400 });
  }
}

export function GET(request: Request): Response {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const url = new URL(request.url);
    const db = getDb();
    const recordType = url.searchParams.get("recordType");
    const recordId = url.searchParams.get("recordId");
    if (recordType && recordId) {
      return Response.json({ ok: true, binding: getOntologyProvenanceBinding(db, recordType, recordId) });
    }
    const candidateId = url.searchParams.get("candidateId");
    const tenantId = url.searchParams.get("tenantId");
    const spaceId = url.searchParams.get("spaceId");
    if (candidateId && tenantId && spaceId) return Response.json({ ok: true, candidate: getOntologyCandidate(db, candidateId, tenantId, spaceId) });
    const alias = url.searchParams.get("alias");
    const namespace = url.searchParams.get("namespace");
    if (alias && namespace) {
      return Response.json({ ok: true, resolution: resolveOntologyAlias(db, {
        ontologyId: url.searchParams.get("ontologyId") ?? "memroos.upper",
        ontologyVersion: asString(url.searchParams.get("version") ?? "", "version"),
        namespace, submitted: alias,
      }) });
    }
    const packId = url.searchParams.get("packId");
    if (packId) return Response.json({ ok: true, pack: getDomainPack(db, packId) });
    const ontology = discoverOntology(db, {
      ontologyId: url.searchParams.get("ontologyId") ?? undefined,
      version: url.searchParams.get("version") ?? undefined,
    });
    return Response.json({ ok: ontology.globallyActive, ontology });
  } catch (error) {
    const safe = safeOntologyError(error);
    return Response.json({ ok: false, ...safe }, { status: safe.code === "not_found" ? 404 : 400 });
  }
}
