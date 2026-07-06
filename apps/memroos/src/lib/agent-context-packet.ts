import crypto from "crypto";
import type Database from "better-sqlite3";

export type AgentContextLane =
  | "research"
  | "code"
  | "memory"
  | "deployment"
  | "email_doc"
  | "gtm"
  | "safety"
  | "ops";

export type AgentContextGoalStatus = "planned" | "active" | "blocked" | "complete";
export type AgentContextReceiptStatus = "included" | "denied" | "skipped" | "stale" | "below_threshold";
export type AgentContextAuthorization = "allowed" | "redacted" | "denied";
export type AgentContextBeliefStage = "bronze_raw_source" | "silver_candidate_claim" | "gold_operational_truth";

export interface AgentContextPacket {
  packetId: string;
  packetHash: string;
  generatedAt: string;
  actor: {
    agentId: string;
    userId?: string;
    delegatedChain?: string[];
  };
  goal: {
    id: string;
    title: string;
    status: AgentContextGoalStatus;
    acceptanceCriteria: string[];
    lane: AgentContextLane;
  };
  scope: {
    project?: string;
    repo?: string;
    client?: string;
    cwd?: string;
  };
  constraints: {
    requiredVerification: string[];
    forbiddenActions: string[];
    approvalRequired: string[];
    policyNotes: string[];
  };
  memories: Array<{
    id: string;
    title?: string;
    beliefStage: AgentContextBeliefStage;
    provenance: string[];
    authorization: AgentContextAuthorization;
    whyIncluded: string;
    caveat?: string;
  }>;
  decisions: Array<{
    id: string;
    summary: string;
    source: string;
  }>;
  recentRunState: {
    latestEvents: string[];
    pendingApprovals: string[];
    latestProofReceipts: string[];
    handoff?: string;
  };
  receipts: Array<{
    source: string;
    status: AgentContextReceiptStatus;
    reason: string;
    pointer?: string;
  }>;
}

export interface AgentRunLedger {
  goalId: string;
  generatedAt: string;
  tasks: Array<{
    id: string;
    lane: AgentContextLane;
    owner: string;
    status: string;
    acceptanceCriteria: string[];
    createdAt: string;
    updatedAt: string;
  }>;
  events: Array<{
    id: string;
    actor: string;
    actionType: string;
    summary: string;
    source: string;
    timestamp: string;
  }>;
  artifacts: Array<{
    id: string;
    kind: string;
    source: string;
    hash?: string;
  }>;
  approvals: Array<{
    id: string;
    status: "requested" | "approved" | "denied" | "bypassed";
    reason?: string;
    actor?: string;
    createdAt: string;
  }>;
  costs: Array<{
    id: string;
    provider?: string;
    model?: string;
    routeReason?: string;
    estimate?: number;
    actual?: number;
    createdAt: string;
  }>;
  verifications: Array<{
    id: string;
    lane: AgentContextLane;
    requiredProof: string;
    proofStatus: string;
    source: string;
  }>;
  handoffs: Array<{
    id: string;
    resumeMarker: string;
    lastKnownBlocker?: string;
    nextAction?: string;
    createdAt: string;
  }>;
}

export interface BuildAgentContextPacketInput {
  goalId: string;
  actorAgentId: string;
  tenantId?: string;
  userId?: string;
  delegatedChain?: string[];
  lane?: AgentContextLane;
  goalTitle?: string;
  acceptanceCriteria?: string[];
  scope?: AgentContextPacket["scope"];
  constraints?: Partial<AgentContextPacket["constraints"]>;
  now?: () => Date;
}

type Row = Record<string, unknown>;

function safeJson(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeStable(entryValue)])
    );
  }
  return value;
}

function hashJson(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function maybeAll(db: Database.Database, sql: string, params: Record<string, unknown>): Row[] {
  try {
    return db.prepare(sql).all(params) as Row[];
  } catch {
    return [];
  }
}

function maybeGet(db: Database.Database, sql: string, params: Record<string, unknown>): Row | null {
  try {
    return (db.prepare(sql).get(params) as Row | undefined) ?? null;
  } catch {
    return null;
  }
}

function metadataTitle(metadata: Record<string, unknown>, fallback: string): string {
  return asString(metadata.title) ?? asString(metadata.summary) ?? fallback;
}

function beliefStageFor(row: Row): AgentContextBeliefStage {
  const stage = asString(row.belief_stage);
  if (stage === "bronze_raw_source" || stage === "silver_candidate_claim" || stage === "gold_operational_truth") {
    return stage;
  }
  return row.status === "promoted" ? "gold_operational_truth" : "silver_candidate_claim";
}

function authorizationFor(metadata: Record<string, unknown>, status: unknown): AgentContextAuthorization {
  const value = asString(metadata.authorization) ?? asString(metadata.authz);
  if (value === "denied" || status === "rejected") return "denied";
  if (value === "redacted") return "redacted";
  return "allowed";
}

function statusFor(delegation: Row | null, checkpoint: Row | null): AgentContextGoalStatus {
  const delegationStatus = asString(delegation?.status);
  if (delegationStatus === "completed") return "complete";
  if (delegationStatus === "failed" || delegationStatus === "canceled") return "blocked";
  if (delegationStatus === "active" || delegationStatus === "paused") return "active";
  if (checkpoint) return "active";
  return "planned";
}

function requiredVerificationFrom(checkpoint: Row | null, explicit: string[]): string[] {
  if (explicit.length > 0) return explicit;
  const state = asRecord(safeJson(checkpoint?.verification_state_json));
  const keys = Object.keys(state);
  return keys.length > 0 ? keys : ["focused tests", "typecheck"];
}

function decisionsFrom(checkpoint: Row | null): AgentContextPacket["decisions"] {
  const decisions = asRecord(safeJson(checkpoint?.decisions_json));
  return Object.entries(decisions).map(([id, value]) => ({
    id,
    summary: typeof value === "string" ? value : stableJson(value),
    source: `agent_checkpoints:${String(checkpoint?.id ?? "latest")}`,
  }));
}

function artifactEntriesFromJson(raw: unknown, source: string): AgentRunLedger["artifacts"] {
  const value = safeJson(raw);
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry, index) => {
    if (typeof entry === "string") {
      return [{ id: entry, kind: "path", source }];
    }
    const record = asRecord(entry);
    const id = asString(record.id) ?? asString(record.path) ?? asString(record.url) ?? `${source}:artifact:${index}`;
    return [{
      id,
      kind: asString(record.kind) ?? (record.url ? "url" : "artifact"),
      source,
      hash: asString(record.hash) ?? asString(record.contentHash) ?? asString(record.content_hash),
    }];
  });
}

function traceReceipts(rows: Row[]): AgentContextPacket["receipts"] {
  return rows.flatMap((row) => {
    const path = asRecord(safeJson(row.causal_path_json));
    const filters = Array.isArray(path.policyFilters) ? path.policyFilters : [];
    const receipts: AgentContextPacket["receipts"] = filters.map((filter, index) => {
      const record = asRecord(filter);
      const decision = asString(record.decision);
      return {
        source: "agent_memory_traces",
        status: decision === "deny" ? "denied" : "included",
        reason: asString(record.reason) ?? `policy filter ${index}`,
        pointer: `agent_memory_traces:${String(row.id)}#policyFilters/${index}`,
      };
    });
    if (receipts.length > 0) return receipts;
    return [{
      source: "agent_memory_traces",
      status: "skipped" as const,
      reason: "trace had no policy filter receipts",
      pointer: `agent_memory_traces:${String(row.id)}`,
    }];
  });
}

function efficiencyReceipts(rows: Row[]): AgentContextPacket["receipts"] {
  return rows.map((row) => {
    const payload = asRecord(safeJson(row.payload));
    const eventType = asString(row.event_type) ?? "efficiency_event";
    if (eventType === "retrieval_trace") {
      const sources = Array.isArray(payload.sources) ? payload.sources.length : 0;
      return {
        source: "efficiency_events",
        status: sources > 0 ? "included" as const : "below_threshold" as const,
        reason: sources > 0 ? `retrieval trace recorded ${sources} source references` : "retrieval trace had no source references",
        pointer: `efficiency_events:${String(row.id)}`,
      };
    }
    return {
      source: "efficiency_events",
      status: "included" as const,
      reason: `${eventType} receipt recorded`,
      pointer: `efficiency_events:${String(row.id)}`,
    };
  });
}

export function readAgentRunLedger(
  db: Database.Database,
  input: { goalId: string; tenantId?: string; lane?: AgentContextLane; now?: () => Date }
): AgentRunLedger {
  const tenantId = input.tenantId ?? "default-tenant";
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const params = { goalId: input.goalId, tenantId };
  const lane = input.lane ?? "ops";

  const delegations = maybeAll(
    db,
    `SELECT * FROM hive_delegations
     WHERE task_id = @goalId OR context_id = @goalId
     ORDER BY updated_at DESC, id DESC
     LIMIT 25`,
    params
  );
  const actions = maybeAll(
    db,
    `SELECT * FROM hive_actions
     WHERE json_extract(artifacts, '$.task_id') = @goalId
        OR json_extract(artifacts, '$.taskId') = @goalId
        OR json_extract(artifacts, '$.goal_id') = @goalId
        OR json_extract(artifacts, '$.goalId') = @goalId
     ORDER BY timestamp DESC, id DESC
     LIMIT 50`,
    params
  );
  const checkpoints = maybeAll(
    db,
    `SELECT * FROM agent_checkpoints
     WHERE tenant_id = @tenantId AND run_id = @goalId
     ORDER BY created_at DESC
     LIMIT 10`,
    params
  );
  const efficiencyRows = maybeAll(
    db,
    `SELECT * FROM efficiency_events
     WHERE tenant_id = @tenantId AND task_id = @goalId
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    params
  );
  const auditRows = maybeAll(
    db,
    `SELECT * FROM audit_entries
     WHERE tenant_id = @tenantId
       AND (
         entity_id = @goalId
         OR entity_id LIKE '%' || @goalId || '%'
         OR json_extract(metadata_json, '$.goalId') = @goalId
         OR json_extract(metadata_json, '$.runId') = @goalId
       )
     ORDER BY created_at DESC
     LIMIT 25`,
    params
  );
  const handoffRows = maybeAll(
    db,
    `SELECT * FROM agent_handoff_packs
     WHERE tenant_id = @tenantId AND task_id = @goalId
     ORDER BY created_at DESC
     LIMIT 10`,
    params
  );

  const artifacts = [
    ...checkpoints.flatMap((row) => artifactEntriesFromJson(row.artifact_refs_json, `agent_checkpoints:${String(row.id)}`)),
    ...actions.flatMap((row) => artifactEntriesFromJson(row.artifacts, `hive_actions:${String(row.id)}`)),
    ...handoffRows.map((row) => ({
      id: String(row.id),
      kind: "handoff_pack",
      source: "agent_handoff_packs",
      hash: hashJson({ id: row.id, contextPack: row.context_pack_json }),
    })),
  ];

  return {
    goalId: input.goalId,
    generatedAt,
    tasks: delegations.map((row) => ({
      id: String(row.task_id),
      lane,
      owner: String(row.to_agent ?? row.from_agent ?? "unknown"),
      status: String(row.status ?? "pending"),
      acceptanceCriteria: [],
      createdAt: String(row.created_at ?? generatedAt),
      updatedAt: String(row.updated_at ?? row.created_at ?? generatedAt),
    })),
    events: [
      ...actions.map((row) => ({
        id: `hive_actions:${String(row.id)}`,
        actor: String(row.agent_id ?? "unknown"),
        actionType: String(row.action_type ?? "event"),
        summary: String(row.summary ?? ""),
        source: "hive_actions",
        timestamp: String(row.timestamp ?? generatedAt),
      })),
      ...checkpoints.map((row) => ({
        id: `agent_checkpoints:${String(row.id)}`,
        actor: String(row.owner_agent_id ?? "unknown"),
        actionType: "checkpoint",
        summary: String(row.objective ?? "Checkpoint persisted"),
        source: "agent_checkpoints",
        timestamp: String(row.created_at ?? generatedAt),
      })),
    ].slice(0, 50),
    artifacts,
    approvals: auditRows.map((row) => {
      const eventType = String(row.event_type ?? "");
      const status = eventType.includes("denied")
        ? "denied"
        : eventType.includes("approved") || eventType.includes("promoted")
          ? "approved"
          : eventType.includes("bypass")
            ? "bypassed"
            : "requested";
      return {
        id: String(row.id),
        status,
        reason: asString(row.reason),
        actor: asString(row.actor_id),
        createdAt: String(row.created_at ?? generatedAt),
      };
    }),
    costs: efficiencyRows
      .filter((row) => row.event_type === "token_ledger")
      .map((row) => {
        const payload = asRecord(safeJson(row.payload));
        return {
          id: `efficiency_events:${String(row.id)}`,
          model: asString(payload.modelId),
          actual: typeof payload.totalTokens === "number" ? payload.totalTokens : undefined,
          createdAt: String(row.created_at ?? generatedAt),
        };
      }),
    verifications: checkpoints.flatMap((row) => {
      const verification = asRecord(safeJson(row.verification_state_json));
      return Object.entries(verification).map(([key, value]) => ({
        id: `agent_checkpoints:${String(row.id)}:${key}`,
        lane,
        requiredProof: key,
        proofStatus: typeof value === "string" ? value : stableJson(value),
        source: "agent_checkpoints",
      }));
    }),
    handoffs: handoffRows.map((row) => {
      const pack = asRecord(safeJson(row.context_pack_json));
      return {
        id: String(row.id),
        resumeMarker: asString(pack.resumeMarker) ?? asString(pack.resume_marker) ?? String(row.title ?? row.id),
        lastKnownBlocker: asString(pack.lastKnownBlocker) ?? asString(pack.last_known_blocker),
        nextAction: asString(pack.nextAction) ?? asString(pack.next_action),
        createdAt: String(row.created_at ?? generatedAt),
      };
    }),
  };
}

export function buildAgentContextPacket(
  db: Database.Database,
  input: BuildAgentContextPacketInput
): { packet: AgentContextPacket; ledger: AgentRunLedger } {
  if (!input.goalId.trim()) throw new Error("goalId is required");
  if (!input.actorAgentId.trim()) throw new Error("actorAgentId is required");

  const tenantId = input.tenantId ?? "default-tenant";
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const params = { goalId: input.goalId, tenantId };
  const latestCheckpoint = maybeGet(
    db,
    `SELECT * FROM agent_checkpoints
     WHERE tenant_id = @tenantId AND run_id = @goalId
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  );
  const latestDelegation = maybeGet(
    db,
    `SELECT * FROM hive_delegations
     WHERE task_id = @goalId OR context_id = @goalId
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    params
  );
  const candidateRows = maybeAll(
    db,
    `SELECT id, memory_type, content_hash, status, metadata_json, belief_stage, created_at
     FROM agent_memory_candidates
     WHERE tenant_id = @tenantId
       AND (
         json_extract(metadata_json, '$.goalId') = @goalId
         OR json_extract(metadata_json, '$.goal_id') = @goalId
         OR json_extract(metadata_json, '$.taskId') = @goalId
         OR json_extract(metadata_json, '$.task_id') = @goalId
       )
     ORDER BY created_at DESC
     LIMIT 25`,
    params
  );
  const traceRows = maybeAll(
    db,
    `SELECT * FROM agent_memory_traces
     WHERE tenant_id = @tenantId AND (run_id = @goalId OR task_id = @goalId)
     ORDER BY created_at DESC
     LIMIT 25`,
    params
  );
  const efficiencyRows = maybeAll(
    db,
    `SELECT * FROM efficiency_events
     WHERE tenant_id = @tenantId AND task_id = @goalId
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    params
  );
  const messageRows = maybeAll(
    db,
    `SELECT id, thread_id, correlation_id, message_type, status, subject, context_refs, artifacts, saved_memory_id, created_at
     FROM agent_context_messages
     WHERE thread_id = @goalId
        OR correlation_id = @goalId
        OR context_refs LIKE '%' || @goalId || '%'
     ORDER BY created_at DESC
     LIMIT 25`,
    params
  );

  const ledger = readAgentRunLedger(db, { goalId: input.goalId, tenantId, lane: input.lane, now: input.now });
  const explicitRequiredVerification = input.constraints?.requiredVerification ?? [];
  const requiredVerification = requiredVerificationFrom(latestCheckpoint, explicitRequiredVerification);
  const latestEvents = ledger.events.slice(0, 8).map((event) => `${event.actionType}: ${event.summary}`);
  const proofReceipts = [
    ...traceRows.map((row) => `agent_memory_traces:${String(row.id)}`),
    ...efficiencyRows.map((row) => `efficiency_events:${String(row.id)}`),
    ...messageRows.map((row) => `agent_context_messages:${String(row.id)}`),
  ].slice(0, 25);

  const packetWithoutHash: Omit<AgentContextPacket, "packetHash"> = {
    packetId: `acp_${crypto.createHash("sha256").update(`${input.goalId}:${input.actorAgentId}:${generatedAt}`).digest("hex").slice(0, 24)}`,
    generatedAt,
    actor: {
      agentId: input.actorAgentId,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.delegatedChain?.length ? { delegatedChain: input.delegatedChain } : {}),
    },
    goal: {
      id: input.goalId,
      title:
        input.goalTitle ??
        asString(latestDelegation?.task_summary) ??
        asString(latestCheckpoint?.objective) ??
        input.goalId,
      status: statusFor(latestDelegation, latestCheckpoint),
      acceptanceCriteria: input.acceptanceCriteria ?? requiredVerification,
      lane: input.lane ?? "ops",
    },
    scope: input.scope ?? {},
    constraints: {
      requiredVerification,
      forbiddenActions: input.constraints?.forbiddenActions ?? [
        "do not include raw sensitive payloads in context packet receipts",
      ],
      approvalRequired: input.constraints?.approvalRequired ?? [],
      policyNotes: input.constraints?.policyNotes ?? [
        "receipts expose ids, hashes, statuses, and reasons only",
      ],
    },
    memories: candidateRows.map((row) => {
      const metadata = asRecord(safeJson(row.metadata_json));
      const authorization = authorizationFor(metadata, row.status);
      const isDenied = authorization === "denied";
      return {
        id: String(row.id),
        title: isDenied
          ? String(row.memory_type ?? "memory candidate")
          : metadataTitle(metadata, String(row.memory_type ?? "memory candidate")),
        beliefStage: beliefStageFor(row),
        provenance: [
          `agent_memory_candidates:${String(row.id)}`,
          ...(asString(row.content_hash) ? [`content_hash:${String(row.content_hash)}`] : []),
          ...(isDenied ? [] : asStringArray(metadata.provenance)),
        ],
        authorization,
        whyIncluded:
          isDenied
            ? "candidate matched goal but content is denied; exposing receipt only"
            : asString(metadata.whyIncluded) ?? "candidate metadata matched goal or task id",
        ...(!isDenied && asString(metadata.caveat) ? { caveat: asString(metadata.caveat) } : {}),
      };
    }),
    decisions: decisionsFrom(latestCheckpoint),
    recentRunState: {
      latestEvents,
      pendingApprovals: ledger.approvals.filter((approval) => approval.status === "requested").map((approval) => approval.id),
      latestProofReceipts: proofReceipts,
      ...(ledger.handoffs[0] ? { handoff: ledger.handoffs[0].resumeMarker } : {}),
    },
    receipts: [
      ...traceReceipts(traceRows),
      ...efficiencyReceipts(efficiencyRows),
      ...messageRows.map((row) => ({
        source: "agent_context_messages",
        status: "included" as const,
        reason: `message ${String(row.message_type)} ${String(row.status)}; body omitted`,
        pointer: `agent_context_messages:${String(row.id)}`,
      })),
      ...(traceRows.length === 0 ? [{
        source: "agent_memory_traces",
        status: "skipped" as const,
        reason: "no memory trace rows matched this goal",
      }] : []),
    ],
  };

  return {
    packet: {
      ...packetWithoutHash,
      packetHash: hashJson(packetWithoutHash),
    },
    ledger,
  };
}
