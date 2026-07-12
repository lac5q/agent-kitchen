/**
 * MSIQ-04 (VAL-ORCH-001..005): Self-hosted Microsoft Agent Framework
 * memory adapter through MCP.
 *
 * Hard rules (fail-closed):
 *   - Local MCP only. Foundry/paid transports are explicit-opt-in and
 *     denied without an explicit allow + provider override. There is NO
 *     hosted fallback: when foundry_only_mode is requested without a
 *     local MCP target available, the adapter returns typed unavailable
 *     and does not call any provider.
 *   - MCP protocol + capability validation precedes any access. See
 *     `./mcp-protocol.ts` for the strict envelope / descriptor rules.
 *   - Scope identity is complete (tenant/user/agent/space/label/purpose
 *     /belief-stage). Missing or mismatched scope is denied.
 *   - Writes are idempotent: same (idempotency_key, scope_hash,
 *     request_hash) tuple resolves one logical write; reuse with changed
 *     payload or scope returns a typed `conflict` (no overwrite).
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { computeCanonicalHash } from "@/lib/memory/canonical";
import {
  authorizeMemoryUse,
  type MemoryUseActor,
  type MemoryUsePurpose,
  type MemoryLabelSnapshot,
} from "@/lib/memory/policy-gate";

import {
  detectInjection,
  type InjectionDetectionResult,
  type InjectionPolicyMode,
} from "./injection-detector";
import {
  negotiateDescriptor,
  resolveRegisteredTool,
  validateInitializeParams,
  validateJsonRpcEnvelope,
  type McpCapabilityDescriptor,
  type McpInitializeResult,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpToolDescriptor,
  type McpValidationOutcome,
  type SupportedMcpProtocolVersion,
} from "./mcp-protocol";
import {
  buildScopeIdentity,
  hashScopeIdentity,
  isCompleteScopeIdentity,
  normalizeScopeIdentity,
  scopeIdentityRecord,
  type BeliefStage,
  type MsiqScopeIdentity,
} from "./scope-identity";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MsiqSessionInit {
  tenantId: string;
  actor: MemoryUseActor;
  spaceId: string;
  label: MemoryLabelSnapshot;
  purpose: MemoryUsePurpose;
  beliefStage: BeliefStage;
  foundryOnlyMode?: boolean;
  now?: () => Date;
  protocolVersion?: SupportedMcpProtocolVersion;
  capabilities?: McpCapabilityDescriptor[];
  tools?: McpToolDescriptor[];
}

export type MsiqSessionOpenOutcome =
  | {
      kind: "opened";
      sessionToken: string;
      sessionId: string;
      scope: MsiqScopeIdentity;
      scopeHash: string;
      protocolVersion: SupportedMcpProtocolVersion;
      capabilities: McpCapabilityDescriptor[];
      tools: McpToolDescriptor[];
      validation: McpValidationOutcome;
      transcriptHash: string;
      openedAt: string;
    }
  | {
      kind: "denied";
      reason: MsiqSessionDenialReason;
      detail: string;
      validation: McpValidationOutcome | null;
    }
  | {
      kind: "foundry_only_unavailable";
      detail: string;
    };

export type MsiqSessionDenialReason =
  | "incomplete_scope"
  | "foundry_only_unavailable"
  | "mcp_validation_failed"
  | "forbidden_capability";

export type MsiqWriteInit = {
  sessionToken: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  scopeOverride?: Partial<MsiqScopeIdentity>;
  injectionMode?: InjectionPolicyMode;
};

export type MsiqWriteOutcome =
  | {
      kind: "applied";
      sessionId: string;
      canonicalMemoryId: string;
      canonicalHash: string;
      contentHash: string;
      requestHash: string;
      responseHash: string;
      scopeHash: string;
      policyVersion: string;
      policyDecision: "allow";
      injection: InjectionDetectionResult;
      replayed: boolean;
      operationId: string;
      recordedAt: string;
    }
  | {
      kind: "replayed";
      sessionId: string;
      canonicalMemoryId: string;
      canonicalHash: string;
      replayCount: number;
      operationId: string;
      recordedAt: string;
    }
  | {
      kind: "conflict";
      reason: "payload_mismatch" | "scope_mismatch";
      detail: string;
      existingIdempotencyId: string;
      operationId: string;
    }
  | {
      kind: "denied";
      reason: MsiqWriteDenialReason;
      detail: string;
      operationId: string;
    };

export type MsiqWriteDenialReason =
  | "session_not_found"
  | "session_closed"
  | "session_expired"
  | "session_denied"
  | "incomplete_scope"
  | "policy_denied"
  | "policy_review_required"
  | "injection_blocked"
  | "idempotency_conflict";

export interface MsiqReadInit {
  sessionToken: string;
  query: string;
  limit: number;
  injectionMode?: InjectionPolicyMode;
}

export type MsiqReadOutcome =
  | {
      kind: "applied";
      sessionId: string;
      results: MsiqReadResult[];
      resultCount: number;
      scopeHash: string;
      operationId: string;
      injection: InjectionDetectionResult;
      recordedAt: string;
    }
  | {
      kind: "denied";
      reason: MsiqWriteDenialReason;
      detail: string;
      operationId: string;
    };

export interface MsiqReadResult {
  id: string;
  content: string;
  score: number;
  scopeHash: string;
  policyVersion: string;
  policyDecision: "allow" | "redact" | "deny" | "review-required";
  injection: InjectionDetectionResult;
  canonicalHash: string;
}

export interface MsiqCloseOutcome {
  sessionId: string;
  closedAt: string;
}

export interface MsiqReadBackend {
  search(args: { query: string; limit: number }): Array<{ id: string; content: string; score: number }>;
}

// ---------------------------------------------------------------------------
// Constants and internals
// ---------------------------------------------------------------------------

const DEFAULT_PROTOCOL_VERSION: SupportedMcpProtocolVersion = "2024-11-05";
const POLICY_VERSION = "msiq-04.v1";

interface SessionRow {
  id: string;
  tenant_id: string;
  session_token: string;
  actor_id: string;
  actor_role: string;
  agent_id: string | null;
  space_id: string | null;
  scope_hash: string;
  tool_manifest_json: string;
  capability_flags_json: string;
  discovery_transcript: string;
  status: "active" | "closed" | "expired" | "revoked" | "denied";
  opened_at: string;
  closed_at: string | null;
  expires_at: string | null;
  label_json: string;
}

// ---------------------------------------------------------------------------
// openMsiqSession
// ---------------------------------------------------------------------------

export function openMsiqSession(db: Database.Database, init: MsiqSessionInit): MsiqSessionOpenOutcome {
  const now = init.now ?? ((): Date => new Date());

  const scope = buildScopeIdentity({
    actor: init.actor,
    spaceId: init.spaceId,
    label: init.label,
    purpose: init.purpose,
    beliefStage: init.beliefStage,
  });
  if (!scope) {
    return {
      kind: "denied",
      reason: "incomplete_scope",
      detail: "tenantId, userId, agentId, spaceId, label, purpose, beliefStage are all required",
      validation: null,
    };
  }
  const scopeHash = hashScopeIdentity(scope);

  if (init.foundryOnlyMode === true) {
    const detail = "Foundry-only mode requested without a self-hosted provider override; refusing hosted fallback";
    emitSessionAudit(db, {
      tenantId: scope.tenantId,
      actorId: init.actor.id,
      sessionId: null,
      decision: "unavailable",
      reason: detail,
      metadata: {
        scope_hash: scopeHash,
        foundry_only_mode: true,
        foundry_blocked: true,
      },
    });
    return { kind: "foundry_only_unavailable", detail };
  }

  const protocolVersion: SupportedMcpProtocolVersion = init.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  const capabilities = init.capabilities ?? defaultCapabilities();
  const tools = init.tools ?? defaultTools();

  const initRequest: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: "init-1",
    method: "initialize",
    params: {
      protocolVersion,
      capabilities,
      clientInfo: { name: "memroos-msiq-adapter", version: "1.0.0" },
    },
  };
  const initEnvelope = validateJsonRpcEnvelope(initRequest);
  if (!initEnvelope.ok) {
    return {
      kind: "denied",
      reason: "mcp_validation_failed",
      detail: initEnvelope.detail,
      validation: null,
    };
  }
  const initParams = validateInitializeParams(initEnvelope.request.params);
  if (!initParams.ok) {
    return {
      kind: "denied",
      reason: "mcp_validation_failed",
      detail: initParams.detail,
      validation: null,
    };
  }

  const toolsListRequest: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: "list-1",
    method: "tools/list",
    params: {},
  };
  const toolsListEnvelope = validateJsonRpcEnvelope(toolsListRequest);
  if (!toolsListEnvelope.ok) {
    return {
      kind: "denied",
      reason: "mcp_validation_failed",
      detail: toolsListEnvelope.detail,
      validation: null,
    };
  }

  const initResult: McpInitializeResult = {
    protocolVersion,
    capabilities,
    serverInfo: { name: "self-hosted-mcp", version: "1.0.0" },
    tools,
  };
  const validation = negotiateDescriptor({
    transport: "local",
    initialize: initResult,
    transcript: [initEnvelope.request, toolsListEnvelope.request],
  });
  if (!validation.ok) {
    emitSessionAudit(db, {
      tenantId: scope.tenantId,
      actorId: init.actor.id,
      sessionId: null,
      decision: "deny",
      reason: validation.detail,
      metadata: {
        scope_hash: scopeHash,
        reason_code: validation.reason,
      },
    });
    return {
      kind: "denied",
      reason: "mcp_validation_failed",
      detail: validation.detail,
      validation,
    };
  }

  const openedAt = now().toISOString();
  const sessionId = `msiq-${crypto.randomUUID()}`;
  const sessionToken = `msst-${crypto.randomBytes(24).toString("hex")}`;
  const transcriptHash = `sha256:${crypto
    .createHash("sha256")
    .update(stableJson(validation.transcript))
    .digest("hex")}`;

  db.prepare(
    `INSERT INTO msiq_adapter_sessions
      (id, tenant_id, session_token, actor_id, actor_role, agent_id, space_id,
       scope_hash, mcp_protocol_version, tool_manifest_json, capability_flags_json,
       discovery_transcript, status, foundry_blocked, foundry_only_mode,
       opened_at, expires_at, label_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 0, ?, ?, ?)`
  ).run(
    sessionId,
    scope.tenantId,
    sessionToken,
    init.actor.id,
    init.actor.role,
    init.actor.capability ?? "anonymous",
    scope.spaceId,
    scopeHash,
    validation.protocolVersion,
    JSON.stringify(validation.tools),
    JSON.stringify(validation.capabilities),
    JSON.stringify(validation.transcript),
    openedAt,
    expiryFromNow(now()),
    JSON.stringify(scope.label),
  );

  emitSessionAudit(db, {
    tenantId: scope.tenantId,
    actorId: init.actor.id,
    sessionId,
    decision: "allow",
    reason: "msiq_session_opened",
    metadata: {
      scope_hash: scopeHash,
      protocol_version: validation.protocolVersion,
      tool_count: validation.tools.length,
      capability_count: validation.capabilities.length,
      transcript_hash: transcriptHash,
    },
  });

  return {
    kind: "opened",
    sessionToken,
    sessionId,
    scope,
    scopeHash,
    protocolVersion: validation.protocolVersion,
    capabilities: validation.capabilities,
    tools: validation.tools,
    validation,
    transcriptHash,
    openedAt,
  };
}

// ---------------------------------------------------------------------------
// writeViaMsiqAdapter
// ---------------------------------------------------------------------------

export function writeViaMsiqAdapter(db: Database.Database, init: MsiqWriteInit): MsiqWriteOutcome {
  const recordedAt = new Date().toISOString();
  const operationId = `mop-${crypto.randomUUID()}`;
  const injectionMode = init.injectionMode ?? "omitted";

  const sessionRow = resolveSession(db, init.sessionToken);
  if (!sessionRow) {
    return recordWriteDenial(db, init, operationId, "session_not_found", "session token not found", recordedAt, injectionMode);
  }
  if (sessionRow.status !== "active") {
    return recordWriteDenial(
      db,
      init,
      operationId,
      sessionRow.status === "expired" ? "session_expired" : "session_closed",
      `session is ${sessionRow.status}`,
      recordedAt,
      injectionMode,
    );
  }

  const effectiveScope = resolveEffectiveScope(init.scopeOverride, sessionRow);
  if (!isCompleteScopeIdentity(effectiveScope)) {
    return recordWriteDenial(
      db,
      init,
      operationId,
      "incomplete_scope",
      "scope override must be a complete MsiqScopeIdentity",
      recordedAt,
      injectionMode,
    );
  }
  if (hashScopeIdentity(effectiveScope as MsiqScopeIdentity) !== sessionRow.scope_hash) {
    return recordWriteDenial(
      db,
      init,
      operationId,
      "incomplete_scope",
      "scope identity mismatch with the session's negotiated scope",
      recordedAt,
      injectionMode,
    );
  }

  const toolResolution = resolveRegisteredTool({
    tools: parseTools(sessionRow.tool_manifest_json),
    name: "memory_write",
    requestedScope: [
      "tenantId",
      "userId",
      "agentId",
      "spaceId",
      "label",
      "purpose",
      "beliefStage",
    ],
    requestedCapabilities: ["memory.write"],
  });
  if (!toolResolution.ok) {
    return recordWriteDenial(
      db,
      init,
      operationId,
      "incomplete_scope",
      `tool resolution failed: ${toolResolution.detail}`,
      recordedAt,
      injectionMode,
    );
  }

  const requestHash = sha256String(stableJson(init.payload));
  const contentText = typeof init.payload.content === "string" ? init.payload.content : JSON.stringify(init.payload);
  const injection = detectInjection(contentText, injectionMode);
  if (injection.disposition.kind === "omitted" || injection.disposition.kind === "quarantined") {
    recordOperation(db, {
      tenantId: sessionRow.tenant_id,
      sessionId: sessionRow.id,
      operationId,
      operationKind: "write",
      decision: "deny",
      reasonCode: injection.disposition.kind === "omitted" ? "injection_omitted" : "injection_quarantined",
      toolName: "memory_write",
      scopeHash: sessionRow.scope_hash,
      scopeIdentity: effectiveScope,
      requestHash,
      responseHash: null,
      transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
      durationMs: 0,
      provenance: {
        injection_rules: injection.matchedRules,
        injection_score: injection.score,
        scanned_bytes: injection.scannedBytes,
      },
      recordedAt,
    });
    return {
      kind: "denied",
      reason: "injection_blocked",
      detail: `injection ${injection.disposition.kind}`,
      operationId,
    };
  }
  if (injection.disposition.kind === "review_required") {
    recordOperation(db, {
      tenantId: sessionRow.tenant_id,
      sessionId: sessionRow.id,
      operationId,
      operationKind: "write",
      decision: "review-required",
      reasonCode: "injection_review_required",
      toolName: "memory_write",
      scopeHash: sessionRow.scope_hash,
      scopeIdentity: effectiveScope,
      requestHash,
      responseHash: null,
      transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
      durationMs: 0,
      provenance: {
        injection_rules: injection.matchedRules,
        injection_score: injection.score,
        scanned_bytes: injection.scannedBytes,
      },
      recordedAt,
    });
    return {
      kind: "denied",
      reason: "policy_review_required",
      detail: `injection review_required`,
      operationId,
    };
  }

  const policyDecision = authorizeMemoryUse({
    actor: actorFromScope(effectiveScope as MsiqScopeIdentity),
    purpose: (effectiveScope as MsiqScopeIdentity).purpose,
    label: (effectiveScope as MsiqScopeIdentity).label,
  });
  if (policyDecision.decision !== "allow") {
    recordOperation(db, {
      tenantId: sessionRow.tenant_id,
      sessionId: sessionRow.id,
      operationId,
      operationKind: "write",
      decision: policyDecision.decision,
      reasonCode: policyDecision.reason,
      toolName: "memory_write",
      scopeHash: sessionRow.scope_hash,
      scopeIdentity: effectiveScope,
      requestHash,
      responseHash: null,
      transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
      durationMs: 0,
      provenance: { policy_version: POLICY_VERSION },
      recordedAt,
    });
    return {
      kind: "denied",
      reason: policyDecision.decision === "deny" ? "policy_denied" : "policy_review_required",
      detail: policyDecision.reason,
      operationId,
    };
  }

  const existing = db
    .prepare(
      `SELECT id, request_hash, response_payload, response_hash, canonical_memory_id,
              replay_count, conflict
       FROM msiq_adapter_idempotency
       WHERE tenant_id = ? AND idempotency_key = ? AND scope_hash = ?`
    )
    .get(sessionRow.tenant_id, init.idempotencyKey, sessionRow.scope_hash) as
    | {
        id: string;
        request_hash: string;
        response_payload: string;
        response_hash: string;
        canonical_memory_id: string | null;
        replay_count: number;
        conflict: number;
      }
    | undefined;

  if (existing) {
    if (existing.request_hash !== requestHash) {
      db.prepare(
        `UPDATE msiq_adapter_idempotency
         SET conflict = 1, replay_count = replay_count + 1, updated_at = ?
         WHERE id = ?`
      ).run(recordedAt, existing.id);
      recordOperation(db, {
        tenantId: sessionRow.tenant_id,
        sessionId: sessionRow.id,
        operationId,
        operationKind: "write",
        decision: "conflict",
        reasonCode: "idempotency_payload_mismatch",
        toolName: "memory_write",
        scopeHash: sessionRow.scope_hash,
        scopeIdentity: effectiveScope,
        requestHash,
        responseHash: existing.response_hash,
        transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
        durationMs: 0,
        provenance: { existing_idempotency_id: existing.id },
        recordedAt,
      });
      return {
        kind: "conflict",
        reason: "payload_mismatch",
        detail: "idempotency_key already used with a different request payload",
        existingIdempotencyId: existing.id,
        operationId,
      };
    }
    db.prepare(
      `UPDATE msiq_adapter_idempotency
       SET replay_count = replay_count + 1, updated_at = ?
       WHERE id = ?`
    ).run(recordedAt, existing.id);
    recordOperation(db, {
      tenantId: sessionRow.tenant_id,
      sessionId: sessionRow.id,
      operationId,
      operationKind: "write",
      decision: "allow",
      reasonCode: "idempotency_replay",
      toolName: "memory_write",
      scopeHash: sessionRow.scope_hash,
      scopeIdentity: effectiveScope,
      requestHash,
      responseHash: existing.response_hash,
      transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
      durationMs: 0,
      provenance: { existing_idempotency_id: existing.id, replay_count: existing.replay_count + 1 },
      recordedAt,
    });
    return {
      kind: "replayed",
      sessionId: sessionRow.id,
      canonicalMemoryId: existing.canonical_memory_id ?? `canon-${existing.response_hash.slice(0, 16)}`,
      canonicalHash: existing.response_hash,
      replayCount: existing.replay_count + 1,
      operationId,
      recordedAt,
    };
  }

  const canonicalHash = computeCanonicalHash(contentText, (effectiveScope as MsiqScopeIdentity).purpose, {
    tenantId: (effectiveScope as MsiqScopeIdentity).tenantId,
    userId: (effectiveScope as MsiqScopeIdentity).userId,
    spaceId: (effectiveScope as MsiqScopeIdentity).spaceId,
  });
  const canonicalMemoryId = `canon-${canonicalHash.slice(0, 16)}`;
  const responsePayload = {
    canonicalMemoryId,
    canonicalHash,
    contentHash: requestHash,
    policyVersion: POLICY_VERSION,
    policyDecision: policyDecision.decision,
  };
  const responseHash = sha256String(stableJson(responsePayload));
  const provenanceHash = sha256String(stableJson({
    scopeHash: sessionRow.scope_hash,
    requestHash,
    responseHash,
    policyVersion: POLICY_VERSION,
    injection,
  }));

  const idempotencyId = `idem-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO msiq_adapter_idempotency
      (id, tenant_id, session_id, idempotency_key, scope_hash, request_payload, request_hash,
       response_payload, response_hash, canonical_memory_id, provenance_hash, conflict, replay_count,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(
    idempotencyId,
    sessionRow.tenant_id,
    sessionRow.id,
    init.idempotencyKey,
    sessionRow.scope_hash,
    stableJson(init.payload),
    requestHash,
    stableJson(responsePayload),
    responseHash,
    canonicalMemoryId,
    provenanceHash,
    recordedAt,
    recordedAt,
  );

  recordOperation(db, {
    tenantId: sessionRow.tenant_id,
    sessionId: sessionRow.id,
    operationId,
    operationKind: "write",
    decision: "allow",
    reasonCode: "idempotency_first_write",
    toolName: "memory_write",
    scopeHash: sessionRow.scope_hash,
    scopeIdentity: effectiveScope,
    requestHash,
    responseHash,
    transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
    durationMs: 0,
    provenance: {
      canonical_memory_id: canonicalMemoryId,
      canonical_hash: canonicalHash,
      policy_version: POLICY_VERSION,
      injection_rules: injection.matchedRules,
      injection_score: injection.score,
    },
    recordedAt,
  });

  return {
    kind: "applied",
    sessionId: sessionRow.id,
    canonicalMemoryId,
    canonicalHash,
    contentHash: requestHash,
    requestHash,
    responseHash,
    scopeHash: sessionRow.scope_hash,
    policyVersion: POLICY_VERSION,
    policyDecision: "allow",
    injection,
    replayed: false,
    operationId,
    recordedAt,
  };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// readViaMsiqAdapter
// ---------------------------------------------------------------------------

export function readViaMsiqAdapter(
  db: Database.Database,
  init: MsiqReadInit,
  backend: MsiqReadBackend = defaultReadBackend(),
): MsiqReadOutcome {
  const recordedAt = new Date().toISOString();
  const operationId = "mop-" + crypto.randomUUID();
  const injectionMode = init.injectionMode ?? "omitted";

  const sessionRow = resolveSession(db, init.sessionToken);
  if (!sessionRow) {
    return recordReadDenial(operationId, "session_not_found", "session token not found");
  }
  if (sessionRow.status !== "active") {
    return recordReadDenial(
      operationId,
      sessionRow.status === "expired" ? "session_expired" : "session_closed",
      "session is " + sessionRow.status,
    );
  }

  const toolResolution = resolveRegisteredTool({
    tools: parseTools(sessionRow.tool_manifest_json),
    name: "memory_search",
    requestedScope: ["tenantId","userId","agentId","spaceId","label","purpose","beliefStage"],
    requestedCapabilities: ["memory.search","memory.read"],
  });
  if (!toolResolution.ok) {
    return recordReadDenial(operationId, "incomplete_scope", "tool resolution failed: " + toolResolution.detail);
  }


  const queryInjection = detectInjection(init.query, injectionMode);
  if (queryInjection.disposition.kind === "omitted" || queryInjection.disposition.kind === "quarantined") {
    return recordReadDenial(operationId, "injection_blocked", "injection " + queryInjection.disposition.kind);
  }

  const label = parseLabel(sessionRow.label_json);
  const scope: MsiqScopeIdentity = {
    tenantId: sessionRow.tenant_id,
    userId: sessionRow.actor_id,
    agentId: sessionRow.agent_id ?? "anonymous",
    spaceId: sessionRow.space_id ?? "",
    label,
    purpose: "memory_search",
    beliefStage: "silver_candidate_claim",
  };
  const policyDecision = authorizeMemoryUse({
    actor: actorFromScope(scope),
    purpose: scope.purpose,
    label: scope.label,
  });
  if (policyDecision.decision !== "allow") {
    return recordReadDenial(operationId, "policy_denied", policyDecision.reason);
  }

  const rawResults = backend.search({query: init.query, limit: 50});
  const scopeHash = sessionRow.scope_hash;

  const results = [] as MsiqReadResult[];
  for (const candidate of rawResults) {

    const contentText = typeof candidate.content === "string" ? candidate.content : JSON.stringify(candidate);
    const candInjection = detectInjection(contentText, injectionMode);
    if (candInjection.disposition.kind === "omitted" || candInjection.disposition.kind === "quarantined") {
      continue;
    }

    results.push({
      id: candidate.id,
      content: contentText,
      score: candidate.score,
      scopeHash: scopeHash,
      policyVersion: POLICY_VERSION,
      policyDecision: "allow",
      injection: candInjection,
      canonicalHash: computeCanonicalHash(contentText, scope.purpose, { tenantId: scope.tenantId, spaceId: scope.spaceId }),
    });
  }


  recordOperation(db, {
    tenantId: sessionRow.tenant_id,
    sessionId: sessionRow.id,
    operationId,
    operationKind: "search",
    decision: "allow",
    reasonCode: "adapter_search_applied",
    toolName: "memory_search",
    scopeHash,
    scopeIdentity: scope,
    requestHash: sha256String(stableJson({ query: init.query, limit: init.limit })),
    responseHash: sha256String(stableJson({ resultCount: results.length })),
    transcriptHash: sessionRow.discovery_transcript ? sha256String(sessionRow.discovery_transcript) : null,
    durationMs: 0,
    provenance: { query_injection_rules: queryInjection.matchedRules, result_count: results.length },
    recordedAt,
  });


  return {
    kind: "applied",
    sessionId: sessionRow.id,
    results,
    resultCount: results.length,
    scopeHash,
    operationId,
    injection: queryInjection,
    recordedAt,
  };
}

// closeMsiqSession
// ---------------------------------------------------------------------------

export function closeMsiqSession(db: Database.Database, sessionToken: string): MsiqCloseOutcome {
  const closedAt = new Date().toISOString();
  const row = resolveSession(db, sessionToken);
  if (!row) {
    return { sessionId: "msiq-unknown", closedAt };
  }
  if (row.status === "active") {
    db.prepare(
      `UPDATE msiq_adapter_sessions
       SET status = 'closed', closed_at = ?
       WHERE id = ? AND status = 'active'`
    ).run(closedAt, row.id);
  }
  return { sessionId: row.id, closedAt };
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

function resolveSession(db: Database.Database, sessionToken: string): SessionRow | null {
  const row = db
    .prepare(
      `SELECT id, tenant_id, session_token, actor_id, actor_role, agent_id, space_id,
              scope_hash, tool_manifest_json, capability_flags_json, discovery_transcript,
              status, opened_at, closed_at, expires_at, label_json
       FROM msiq_adapter_sessions WHERE session_token = ?`
    )
    .get(sessionToken) as SessionRow | undefined;
  if (!row) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString() && row.status === "active") {
    db.prepare(
      `UPDATE msiq_adapter_sessions SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'active'`
    ).run(new Date().toISOString(), row.id);
    row.status = "expired";
    row.closed_at = new Date().toISOString();
  }
  return row;
}

function resolveEffectiveScope(
  override: Partial<MsiqScopeIdentity> | undefined,
  session: SessionRow,
): unknown {
  if (!override) {
    return {
      tenantId: session.tenant_id,
      userId: session.actor_id,
      agentId: session.agent_id ?? "anonymous",
      spaceId: session.space_id ?? "",
      label: parseLabel(session.label_json),
      purpose: "memory-promotion",
      beliefStage: "silver_candidate_claim",
    };
  }
  return normalizeScopeIdentity({
    tenantId: override.tenantId,
    userId: override.userId,
    agentId: override.agentId,
    spaceId: override.spaceId,
    label: override.label,
    purpose: override.purpose,
    beliefStage: override.beliefStage,
  });
}

function parseTools(json: string): McpToolDescriptor[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is McpToolDescriptor =>
      !!t && typeof t === "object" && typeof (t as McpToolDescriptor).name === "string"
    );
  } catch {
    return [];
  }
}

function parseLabel(labelJson: string): MsiqScopeIdentity["label"] {
  try {
    const parsed = JSON.parse(labelJson);
    if (parsed && typeof parsed === "object" && typeof parsed.visibility === "string" && typeof parsed.policy === "string") {
      return {
        visibility: parsed.visibility,
        policy: parsed.policy,
        domain: parsed.domain ?? null,
        sensitivity: parsed.sensitivity ?? null,
      };
    }
  } catch {}
  return { visibility: "private", policy: "agent_visible" };
}

function actorFromScope(scope: MsiqScopeIdentity): MemoryUseActor {
  return {
    id: scope.userId,
    role: "agent",
    capability: scope.agentId,
    tenantId: scope.tenantId,
  };
}

function sha256String(value: string): string {
  return "sha256:" + crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeStable(v)]),
    );
  }
  return value;
}

function expiryFromNow(now: Date): string {
  const exp = new Date(now.getTime() + 30 * 60 * 1000);
  return exp.toISOString();
}

function defaultReadBackend(): MsiqReadBackend {
  return { search: () => [] };
}

function defaultCapabilities(): McpCapabilityDescriptor[] {
  return [
    { name: "memory.read", version: "1", source: "self-hosted-mcp" },
    { name: "memory.write", version: "1", source: "self-hosted-mcp" },
    { name: "memory.search", version: "1", source: "self-hosted-mcp" },
    { name: "tools.list", version: "1", source: "self-hosted-mcp" },
  ];
}

function defaultTools(): McpToolDescriptor[] {
  return [
    { name: "memory_read", description: "Read a memory record by canonical id.", requiredScope: ["tenantId","userId","agentId","spaceId"], requiredCapabilities: ["memory.read"] },
    { name: "memory_write", description: "Write an idempotent memory record.", requiredScope: ["tenantId","userId","agentId","spaceId","label","purpose"], requiredCapabilities: ["memory.write"] },
    { name: "memory_search", description: "Search for memory records.", requiredScope: ["tenantId","userId","agentId","spaceId","label","purpose"], requiredCapabilities: ["memory.search","memory.read"] },
  ];
}

// ---------------------------------------------------------------------------
// Audit emission helpers
// ---------------------------------------------------------------------------

interface SessionAuditArgs {
  tenantId: string;
  actorId: string;
  sessionId: string | null;
  decision: "allow" | "deny" | "unavailable";
  reason: string;
  metadata: Record<string, unknown>;
}

function emitSessionAudit(db: Database.Database, args: SessionAuditArgs): void {
  try {
    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: args.actorId,
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_MSIQ_ADAPTER_SESSION,
        entity_type: ENTITY_TYPES.MSIQ_ADAPTER_SESSION,
        entity_id: args.sessionId ? "msiq_adapter_session:" + args.sessionId : "msiq_adapter_session:none",
        reason: args.reason,
        metadata_json: args.metadata,
      },
      db,
    );
  } catch {
    // ignore
  }
}

interface OperationAuditArgs {
  tenantId: string;
  sessionId: string;
  operationId: string;
  operationKind: "initialize" | "tools_list" | "write" | "read" | "search" | "close";
  decision: "allow" | "deny" | "redact" | "conflict" | "unavailable" | "error" | "review-required";
  reasonCode: string;
  toolName: string | null;
  scopeHash: string;
  scopeIdentity: unknown;
  requestHash: string | null;
  responseHash: string | null;
  transcriptHash: string | null;
  durationMs: number;
  provenance: Record<string, unknown>;
  recordedAt: string;
}

function recordOperation(db: Database.Database, args: OperationAuditArgs): void {
  try {
    db.prepare(
      `INSERT INTO msiq_adapter_operations
        (id, tenant_id, session_id, operation_kind, decision, reason_code, tool_name,
         scope_hash, scope_identity_json, request_hash, response_hash, transcript_hash,
         duration_ms, provenance_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      args.operationId,
      args.tenantId,
      args.sessionId,
      args.operationKind,
      args.decision,
      args.reasonCode,
      args.toolName,
      args.scopeHash,
      stableJson(args.scopeIdentity),
      args.requestHash,
      args.responseHash,
      args.transcriptHash,
      args.durationMs,
      stableJson(args.provenance),
      args.recordedAt,
    );
  } catch {
    // ignore
  }

  try {
    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: "system",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_MSIQ_ADAPTER_OPERATION,
        entity_type: ENTITY_TYPES.MSIQ_ADAPTER_SESSION,
        entity_id: "msiq_adapter_op:" + args.operationId,
        reason: args.reasonCode,
        metadata_json: {
          session_id: args.sessionId,
          operation_kind: args.operationKind,
          decision: args.decision,
          reason_code: args.reasonCode,
          tool_name: args.toolName,
          scope_hash: args.scopeHash,
          scope_identity: args.scopeIdentity,
          request_hash: args.requestHash,
          response_hash: args.responseHash,
          transcript_hash: args.transcriptHash,
          duration_ms: args.durationMs,
          provenance: args.provenance,
        },
      },
      db,
    );
  } catch {
    // ignore
  }
}


function recordWriteDenial(
  db: Database.Database,
  init: MsiqWriteInit,
  operationId: string,
  reason: MsiqWriteDenialReason,
  detail: string,
  recordedAt: string,
  injectionMode: InjectionPolicyMode,
): MsiqWriteOutcome {
  void injectionMode;
  try {
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: "system",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ORCH_MSIQ_ADAPTER_OPERATION,
        entity_type: ENTITY_TYPES.MSIQ_ADAPTER_SESSION,
        entity_id: "msiq_adapter_op:" + operationId,
        reason: "write_denied:" + reason,
        metadata_json: {
          reason_code: reason,
          idempotency_key: init.idempotencyKey,
          detail,
        },
      },
      db,
    );
  } catch {
    // ignore
  }
  return {
    kind: "denied",
    reason,
    detail,
    operationId,
  };
}

function recordReadDenial(
  operationId: string,
  reason: MsiqWriteDenialReason,
  detail: string,
): MsiqReadOutcome {
  return {
    kind: "denied",
    reason,
    detail,
    operationId,
  };
}

// Re-exports for downstream tests / receipts.
export { computeCanonicalHash };
export function scopeRecord(scope: MsiqScopeIdentity): Record<string, unknown> {
  return scopeIdentityRecord(scope);
}

export type { McpJsonRpcRequest, McpJsonRpcResponse };
