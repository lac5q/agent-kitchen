import crypto from "crypto";
import type {
  AgentCardSkill,
  AgentHeartbeatInput,
  AgentLocation,
  AgentPlatform,
  AgentProtocol,
  AgentStatus,
  RegisterAgentInput,
  RegisterAgentResult,
  RegisteredAgent,
  RegisteredAgentCapability,
  RemoteAgentConfig,
} from "@/types";
import { getDb } from "@/lib/db";
import { recordEfficiencyEvent, type MemoryWritePayload } from "@/lib/efficiency-telemetry";
import { getAdapters } from "@/lib/memory/registry";
import { ensureMemorySalience, reinforceMemorySalience, salienceTargetsFromMetadata } from "@/lib/memory/salience";

export class AgentRegistrationError extends Error {
  constructor(readonly code: "agent_revoked", message: string) {
    super(message);
    this.name = "AgentRegistrationError";
  }
}

interface RegisteredAgentRow {
  id: string;
  name: string;
  role: string;
  company: string | null;
  platform: AgentPlatform;
  protocol: AgentProtocol;
  status: AgentStatus;
  current_task: string | null;
  last_heartbeat_at: string | null;
  location: AgentLocation;
  host: string | null;
  port: number | null;
  health_endpoint: string | null;
  tunnel_url: string | null;
  latency_ms: number | null;
  metadata: string;
  created_at: string;
  updated_at: string;
  deregistered_at: string | null;
  is_shared: number;
  owner_id?: string | null;
}

interface AgentCapabilityRow {
  capability_id: string;
  name: string;
  description: string;
  tags: string;
}

interface AgentApiKeyRow {
  agent_id: string;
  key_hash: string;
  expires_at: string | null;
}

/** Default agent API key lifetime. Override with MEMROOS_AGENT_API_KEY_TTL_DAYS. */
export const AGENT_API_KEY_DEFAULT_TTL_DAYS = 90;

export function agentApiKeyExpiresAt(now = new Date()): string {
  const raw = process.env.MEMROOS_AGENT_API_KEY_TTL_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const days =
    Number.isFinite(parsed) && parsed > 0 ? parsed : AGENT_API_KEY_DEFAULT_TTL_DAYS;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

interface ListAgentsOptions {
  includeDeregistered?: boolean;
}

interface SkillReportInput {
  skillId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

interface MemoryWriteInput {
  type?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

interface ToolOutcomeInput {
  toolId: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_HEALTH_ENDPOINT = "/health";

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyJson(value: Record<string, unknown> | unknown[]): string {
  return JSON.stringify(value);
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey(agentId: string): string {
  return `ak_${agentId}_${crypto.randomBytes(32).toString("base64url")}`;
}

function contentHash(content: string | undefined): string | null {
  if (!content) return null;
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizeIsoSeconds(value: string): string {
  return value.replace(/\.\d{3}Z$/, "Z");
}

function metadataString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function sourceReadHash(metadata: Record<string, unknown>): string | null {
  const explicitHash = metadataString(metadata, ["sourceHash", "source_hash"]);
  if (explicitHash) return explicitHash;

  const sourceText = metadataString(metadata, ["sourceContent", "sourceText", "rawContent"]);
  const hash = contentHash(sourceText ?? undefined);
  return hash ? `sha256:${hash}` : null;
}

function memoryWriteDedupHash(payload: MemoryWriteInput): string {
  const contentDigest = contentHash(payload.content);
  if (contentDigest) return `sha256:${contentDigest}`;

  const fallback = JSON.stringify({
    type: payload.type ?? null,
    metadata: payload.metadata ?? {},
  });
  return `sha256:${crypto.createHash("sha256").update(fallback).digest("hex")}`;
}

function priorMemoryWritePayload(
  dedupHash: string
): { payload: MemoryWritePayload; createdAt: string } | null {
  const rows = getDb()
    .prepare(
      `SELECT payload, created_at
       FROM efficiency_events
       WHERE tenant_id = 'default-tenant'
         AND event_type = 'memory_write'
       ORDER BY created_at ASC, id ASC`
    )
    .all() as { payload: string; created_at: string }[];

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as MemoryWritePayload;
      if (payload.dedupHash === dedupHash) {
        return { payload, createdAt: row.created_at };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function capabilitiesForAgent(agentId: string): RegisteredAgentCapability[] {
  const rows = getDb()
    .prepare(
      `SELECT capability_id, name, description, tags
       FROM agent_capabilities
       WHERE agent_id = ?
       ORDER BY name COLLATE NOCASE`
    )
    .all(agentId) as AgentCapabilityRow[];

  return rows.map((row) => ({
    id: row.capability_id,
    name: row.name,
    description: row.description,
    tags: parseTags(row.tags),
  }));
}

function rowToRegisteredAgent(row: RegisteredAgentRow): RegisteredAgent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    company: row.company ?? undefined,
    platform: row.platform,
    protocol: row.protocol,
    status: row.status,
    lastHeartbeat: row.last_heartbeat_at,
    currentTask: row.current_task,
    lessonsCount: 0,
    todayMemoryCount: 0,
    location: row.location,
    isRemote: row.location !== "local",
    latencyMs: row.latency_ms,
    isShared: row.is_shared === 1,
    capabilities: capabilitiesForAgent(row.id),
    metadata: parseObject(row.metadata),
    host: row.host,
    port: row.port,
    healthEndpoint: row.health_endpoint,
    tunnelUrl: row.tunnel_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deregisteredAt: row.deregistered_at,
    ownerId: row.owner_id ?? null,
  };
}

function getAgentRow(agentId: string, includeDeregistered = false): RegisteredAgentRow | null {
  const row = getDb()
    .prepare(
      `SELECT *
       FROM registered_agents
       WHERE id = ?
       ${includeDeregistered ? "" : "AND deregistered_at IS NULL"}`
    )
    .get(agentId) as RegisteredAgentRow | undefined;
  return row ?? null;
}

/**
 * Replaces the capability rows for an agent. VAL-SKILL-021: agent capability
 * names NEVER become skill_registry rows. This helper only touches the
 * agent_capabilities table; an agent named like a skill (or with a
 * capability named like a skill) cannot create, enable, or trust a registry
 * skill via this path. Skill governance flows through /api/skills/import,
 * /api/skills/quarantine/*, and /api/skills/pins, never through agent
 * registration.
 */
function replaceCapabilities(agentId: string, capabilities: RegisteredAgentCapability[]): void {
  const db = getDb();
  db.prepare("DELETE FROM agent_capabilities WHERE agent_id = ?").run(agentId);

  const insert = db.prepare(
    `INSERT INTO agent_capabilities
       (agent_id, capability_id, name, description, tags, updated_at)
     VALUES
       (@agentId, @capabilityId, @name, @description, @tags, @updatedAt)`
  );

  for (const capability of capabilities) {
    insert.run({
      agentId,
      capabilityId: capability.id,
      name: capability.name,
      description: capability.description,
      tags: stringifyJson(capability.tags ?? []),
      updatedAt: nowIso(),
    });
  }
}

export function registerAgent(
  input: RegisterAgentInput,
  options: { beforePersist?: () => void } = {}
): RegisterAgentResult {
  // VAL-SKILL-021: registerAgent NEVER inserts into skill_registry, never
  // updates skill_registry.dispatch_status, never touches skill_quarantine
  // or skill_version_pins. An agent or capability named like a skill cannot
  // bypass skill governance. Skill flow is exclusively through
  // /api/skills/import + /api/skills/quarantine/* + /api/skills/pins.
  const db = getDb();
  const timestamp = nowIso();
  const metadata = input.metadata ?? {};
  const location = input.location ?? "local";
  const healthEndpoint = input.healthEndpoint ?? (location === "local" ? null : DEFAULT_HEALTH_ENDPOINT);

  /**
   * Never write an owner that does not exist.
   *
   * owner_id has a foreign key, so a stale or unknown id fails the whole
   * registration — an agent would fail to register because of an ownership edge
   * case, which is the wrong thing to break. Registering unowned is safe: it is
   * admin-only and surfaces as "needs an owner" to be claimed.
   */
  const ownerId =
    input.ownerId &&
    db.prepare("SELECT 1 FROM users WHERE id = ?").get(input.ownerId)
      ? input.ownerId
      : null;

  const priorRow = db
    .prepare("SELECT owner_id, deregistered_at FROM registered_agents WHERE id = ?")
    .get(input.id) as { owner_id: string | null; deregistered_at: string | null } | undefined;
  const existedBefore = Boolean(priorRow);
  const ownerBefore = priorRow?.owner_id ?? null;

  if (priorRow?.deregistered_at) {
    throw new AgentRegistrationError("agent_revoked", `Agent ${input.id} is revoked`);
  }

  const tx = db.transaction(() => {
    options.beforePersist?.();
    db.prepare(
      `INSERT INTO registered_agents (
         id, name, role, company, platform, protocol, status, current_task,
         last_heartbeat_at, location, host, port, health_endpoint, tunnel_url,
         latency_ms, metadata, created_at, updated_at, deregistered_at, owner_id
       )
       VALUES (
         @id, @name, @role, @company, @platform, @protocol, 'dormant', NULL,
         NULL, @location, @host, @port, @healthEndpoint, @tunnelUrl,
         NULL, @metadata, @timestamp, @timestamp, NULL, @ownerId
       )
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         role = excluded.role,
         company = excluded.company,
         platform = excluded.platform,
         protocol = excluded.protocol,
         location = excluded.location,
         host = excluded.host,
         port = excluded.port,
         health_endpoint = excluded.health_endpoint,
         tunnel_url = excluded.tunnel_url,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at,
         deregistered_at = NULL,
         -- The EXISTING owner always wins. Written the other way round, any
        -- caller who could reach registerAgent could re-register someone else's
        -- agent id and become its owner — and, with issueApiKey defaulting true,
        -- walk away with a working credential for it. Ownership changes only
        -- through transferAgentOwnership, which is authorization-checked.
        owner_id = COALESCE(registered_agents.owner_id, excluded.owner_id)`
    ).run({
      id: input.id,
      name: input.name,
      role: input.role,
      company: input.company ?? null,
      platform: input.platform,
      protocol: input.protocol,
      location,
      host: input.host ?? null,
      port: input.port ?? null,
      healthEndpoint,
      tunnelUrl: input.tunnelUrl ?? null,
      metadata: stringifyJson(metadata),
      timestamp,
      ownerId,
    });

    // Only replace capabilities when the caller explicitly sends them.
    // `capabilities ?? []` wiped durable write caps on re-register heartbeats.
    if (input.capabilities !== undefined) {
      replaceCapabilities(input.id, input.capabilities);
    }
  });
  tx();

  // Registration is how an agent is *created*. Re-running it against an id that
  // already exists must not mint a credential for it unless the caller has
  // established the right to hold one — see allowRekeyExisting.
  // A previously unowned agent gaining an owner is a claim worth recording —
  // it is the moment an anonymous row became someone's responsibility.
  if (ownerId && !ownerBefore) {
    recordOwnershipEvent({ agentId: input.id, ownerId, event: "claimed", actorId: ownerId });
  }

  const mayIssue = input.issueApiKey && (!existedBefore || input.allowRekeyExisting === true);
  const apiKey = mayIssue ? createAgentApiKey(input.id) : undefined;
  const agent = getRegisteredAgent(input.id);
  if (!agent) {
    throw new Error(`Failed to register agent ${input.id}`);
  }
  return apiKey ? { agent, apiKey } : { agent };
}

/** Who is asking. */
export interface AgentViewer {
  userId: string;
  role: "admin" | "operator" | "reviewer";
}

/**
 * Agents this person may see.
 *
 *   their own  ∪  agents explicitly marked shared  ∪  (everything, if admin)
 *
 * Private by default, per operator decision 2026-08-02. Team membership
 * deliberately does **not** grant visibility: agents and humans share one
 * membership table, so letting a shared team imply a shared agent would mean
 * "private" silently stops being true as soon as two people join the same team.
 * Sharing is an act the owner takes, not a consequence of org structure.
 *
 * Visibility is scope, not rank — `operator` sees no more than `reviewer`. The
 * role ladder governs what you may *do*; only `admin` is a visibility role, and
 * only because administering a fleet you cannot see is impossible.
 *
 * Unowned agents are admin-only. They predate ownership and have no accountable
 * human, so they surface as something to claim rather than defaulting to public.
 */
export function listAgentsVisibleTo(
  viewer: AgentViewer,
  options: ListAgentsOptions = {}
): RegisteredAgent[] {
  if (viewer.role === "admin") return listAllAgentsUnscoped(options);

  const rows = getDb()
    .prepare(
      `SELECT * FROM registered_agents
        WHERE (owner_id = @userId OR is_shared = 1)
          ${options.includeDeregistered ? "" : "AND deregistered_at IS NULL"}
        ORDER BY name COLLATE NOCASE`
    )
    .all({ userId: viewer.userId }) as RegisteredAgentRow[];

  return rows.map(rowToRegisteredAgent);
}

/**
 * Owner display details for a set of agents, in one query.
 *
 * The list returns owner ids, but a person cannot recognise
 * `cb14b24ce3b9e3894c47`. Resolving server-side means a reviewer sees who owns a
 * shared agent without needing the admin-only /api/users route.
 */
export function ownerDisplayFor(
  agentIds: string[]
): Record<string, { ownerId: string; email: string; displayName: string } | null> {
  if (agentIds.length === 0) return {};
  const placeholders = agentIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT a.id AS agent_id, u.id AS user_id, u.email, u.display_name
         FROM registered_agents a
         LEFT JOIN users u ON u.id = a.owner_id
        WHERE a.id IN (${placeholders})`
    )
    .all(...agentIds) as Array<{
      agent_id: string;
      user_id: string | null;
      email: string | null;
      display_name: string | null;
    }>;

  const out: Record<string, { ownerId: string; email: string; displayName: string } | null> = {};
  for (const r of rows) {
    out[r.agent_id] =
      r.user_id && r.email
        ? { ownerId: r.user_id, email: r.email, displayName: r.display_name ?? r.email }
        : null;
  }
  return out;
}

/** True when this agent is within the viewer's scope. */
export function canViewAgent(viewer: AgentViewer, agentId: string): boolean {
  if (viewer.role === "admin") return true;
  const row = getDb()
    .prepare(
      "SELECT owner_id, is_shared FROM registered_agents WHERE id = ?"
    )
    .get(agentId) as { owner_id: string | null; is_shared: number } | undefined;
  if (!row) return false;
  return row.owner_id === viewer.userId || row.is_shared === 1;
}

/**
 * May this person change the agent — share it, transfer it, edit it?
 *
 * Owner or admin. Narrower than visibility on purpose: seeing a shared agent
 * must not imply being able to reassign it.
 */
export function canManageAgent(viewer: AgentViewer, agentId: string): boolean {
  if (viewer.role === "admin") return true;
  const row = getDb()
    .prepare("SELECT owner_id FROM registered_agents WHERE id = ?")
    .get(agentId) as { owner_id: string | null } | undefined;
  return Boolean(row && row.owner_id === viewer.userId);
}

/** Mark an agent shared, or make it private again. Owner or admin only. */
export function setAgentShared(agentId: string, shared: boolean): void {
  getDb()
    .prepare("UPDATE registered_agents SET is_shared = ?, updated_at = ? WHERE id = ?")
    .run(shared ? 1 : 0, nowIso(), agentId);
}

/** Hand an agent to another person. Owner or admin. */
/**
 * Record an ownership event so the trail outlives the agent.
 *
 * Written before the mutation where the *previous* owner matters, so the row
 * captures who was responsible rather than who is about to be.
 */
export function recordOwnershipEvent(input: {
  agentId: string;
  ownerId: string | null;
  event: "claimed" | "transferred" | "released" | "agent_deleted";
  actorId?: string | null;
  note?: string | null;
}): void {
  const db = getDb();
  const agent = db
    .prepare("SELECT name FROM registered_agents WHERE id = ?")
    .get(input.agentId) as { name: string } | undefined;
  const owner = input.ownerId
    ? (db.prepare("SELECT email FROM users WHERE id = ?").get(input.ownerId) as
        | { email: string }
        | undefined)
    : undefined;

  db.prepare(
    `INSERT INTO agent_ownership_history
       (agent_id, agent_name, owner_id, owner_email, event, actor_id, note, recorded_at)
     VALUES (@agentId, @agentName, @ownerId, @ownerEmail, @event, @actorId, @note, @recordedAt)`
  ).run({
    agentId: input.agentId,
    agentName: agent?.name ?? null,
    ownerId: input.ownerId,
    // Denormalised: the point of this table is to survive the user row being
    // deleted, at which point owner_id goes null and only the email is left.
    ownerEmail: owner?.email ?? null,
    event: input.event,
    actorId: input.actorId ?? null,
    note: input.note ?? null,
    recordedAt: nowIso(),
  });
}

export function agentOwnershipHistory(agentId: string): Array<{
  ownerEmail: string | null;
  event: string;
  note: string | null;
  recordedAt: string;
}> {
  return getDb()
    .prepare(
      `SELECT owner_email AS ownerEmail, event, note, recorded_at AS recordedAt
         FROM agent_ownership_history WHERE agent_id = ? ORDER BY recorded_at DESC, id DESC`
    )
    .all(agentId) as Array<{
    ownerEmail: string | null;
    event: string;
    note: string | null;
    recordedAt: string;
  }>;
}

export function transferAgentOwnership(
  agentId: string,
  newOwnerUserId: string,
  actorId?: string | null
): void {
  const previous = (
    getDb().prepare("SELECT owner_id FROM registered_agents WHERE id = ?").get(agentId) as
      | { owner_id: string | null }
      | undefined
  )?.owner_id ?? null;

  if (previous) {
    recordOwnershipEvent({ agentId, ownerId: previous, event: "released", actorId, note: "transferred away" });
  }
  getDb()
    .prepare("UPDATE registered_agents SET owner_id = ?, updated_at = ? WHERE id = ?")
    .run(newOwnerUserId, nowIso(), agentId);
  recordOwnershipEvent({ agentId, ownerId: newOwnerUserId, event: "transferred", actorId });
}

/**
 * Permanently remove an agent.
 *
 * Deregistering keeps the row so history and keys stay attached; this is the
 * separate, irreversible action for a row that should not exist at all. The
 * ownership trail is written first and lives in its own table, so "who used to
 * own this?" survives the delete.
 */
export function deleteAgent(agentId: string, actorId?: string | null): boolean {
  const db = getDb();
  const existing = db
    .prepare("SELECT owner_id FROM registered_agents WHERE id = ?")
    .get(agentId) as { owner_id: string | null } | undefined;
  if (!existing) return false;

  recordOwnershipEvent({
    agentId,
    ownerId: existing.owner_id,
    event: "agent_deleted",
    actorId,
    note: existing.owner_id ? null : "was unowned at deletion",
  });
  db.prepare("DELETE FROM agent_api_keys WHERE agent_id = ?").run(agentId);
  db.prepare("DELETE FROM registered_agents WHERE id = ?").run(agentId);
  return true;
}

export function listAllAgentsUnscoped(options: ListAgentsOptions = {}): RegisteredAgent[] {
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM registered_agents
       ${options.includeDeregistered ? "" : "WHERE deregistered_at IS NULL"}
       ORDER BY name COLLATE NOCASE`
    )
    .all() as RegisteredAgentRow[];

  return rows.map(rowToRegisteredAgent);
}

/** Queryable defect state for agents that have no accountable human owner. */
export function listUnownedAgents(options: ListAgentsOptions = {}): RegisteredAgent[] {
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM registered_agents
       WHERE owner_id IS NULL
         ${options.includeDeregistered ? "" : "AND deregistered_at IS NULL"}
       ORDER BY name COLLATE NOCASE`
    )
    .all() as RegisteredAgentRow[];

  return rows.map(rowToRegisteredAgent);
}

export function getRegisteredAgent(
  agentId: string,
  options: ListAgentsOptions = {}
): RegisteredAgent | null {
  const row = getAgentRow(agentId, options.includeDeregistered ?? false);
  return row ? rowToRegisteredAgent(row) : null;
}

// `listRegisteredAgents` deliberately no longer exists. It was ambiguous about
// scoping, and that ambiguity is exactly how a reviewer came to see the whole
// fleet: a call site that did not think about the viewer got the unscoped list
// by default. Every caller now has to say which it means —
// `listAgentsVisibleTo(viewer)` or `listAllAgentsUnscoped()`.

/** Fields an operator may edit by hand from the Agents UI. */
export interface AgentEditableFields {
  name?: string;
  role?: string;
  company?: string | null;
}

/**
 * Rename or re-describe an agent.
 *
 * Deliberately narrow: only the display fields. Host, port, platform and
 * protocol describe where the agent actually is — editing those by hand would
 * let the registry disagree with reality, which is the failure this whole area
 * has been fighting. `scripts/sync-host-agents.sh` re-detects on every run and
 * pointedly does NOT overwrite name/role, so an operator rename survives.
 */
export function updateAgentDetails(
  agentId: string,
  fields: AgentEditableFields
): RegisteredAgent | null {
  const existing = getRegisteredAgent(agentId, { includeDeregistered: true });
  if (!existing) return null;

  const name = fields.name?.trim();
  const role = fields.role?.trim();
  if (name !== undefined && name.length === 0) {
    throw new Error("name cannot be empty");
  }
  if (role !== undefined && role.length === 0) {
    throw new Error("role cannot be empty");
  }

  const timestamp = nowIso();
  getDb()
    .prepare(
      `UPDATE registered_agents
       SET name = ?, role = ?, company = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      name ?? existing.name,
      role ?? existing.role,
      fields.company === undefined ? existing.company : fields.company,
      timestamp,
      agentId
    );

  return getRegisteredAgent(agentId, { includeDeregistered: true });
}

export function deregisterAgent(agentId: string): RegisteredAgent | null {
  const timestamp = nowIso();
  getDb()
    .prepare(
      `UPDATE registered_agents
       SET deregistered_at = ?, status = 'dormant', updated_at = ?
       WHERE id = ? AND deregistered_at IS NULL`
    )
    .run(timestamp, timestamp, agentId);
  getDb()
    .prepare(
      `UPDATE agent_api_keys
       SET revoked_at = ?
       WHERE agent_id = ? AND revoked_at IS NULL`
    )
    .run(timestamp, agentId);
  return getRegisteredAgent(agentId, { includeDeregistered: true });
}

export function createAgentApiKey(agentId: string): string {
  const agent = getAgentRow(agentId, true);
  if (!agent || agent.deregistered_at) {
    throw new Error(`Cannot create API key for unknown or deregistered agent ${agentId}`);
  }

  const key = generateApiKey(agentId);
  const expiresAt = agentApiKeyExpiresAt();
  getDb()
    .prepare(
      `INSERT INTO agent_api_keys (agent_id, key_prefix, key_hash, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(agentId, key.slice(0, 12), hashKey(key), expiresAt);
  return key;
}

export function authenticateAgentKey(rawKey: string, agentIdHint?: string): RegisteredAgent | null {
  const keyHash = hashKey(rawKey);
  const now = nowIso();
  const row = getDb()
    .prepare(
      `SELECT agent_id, key_hash, expires_at
       FROM agent_api_keys
       WHERE key_hash = ? AND revoked_at IS NULL`
    )
    .get(keyHash) as AgentApiKeyRow | undefined;

  if (!row) return null;
  // Fail closed: missing expires_at is treated as expired (Phase 199).
  if (!row.expires_at || row.expires_at <= now) return null;
  if (agentIdHint && row.agent_id !== agentIdHint) return null;

  const agent = getRegisteredAgent(row.agent_id);
  if (!agent) return null;

  getDb()
    .prepare("UPDATE agent_api_keys SET last_used_at = ? WHERE key_hash = ?")
    .run(now, keyHash);
  return agent;
}

export function authenticateAgentHeaders(headers: Headers, agentIdHint?: string): RegisteredAgent | null {
  const authorization = headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return authenticateAgentKey(match[1], agentIdHint);
}

export function recordHeartbeat(agentId: string, payload: AgentHeartbeatInput): RegisteredAgent {
  const existing = getAgentRow(agentId);
  if (!existing) {
    throw new Error(`Unknown agent ${agentId}`);
  }

  const timestamp = nowIso();
  const mergedMetadata = {
    ...parseObject(existing.metadata),
    ...(payload.metadata ?? {}),
  };

  getDb()
    .prepare(
      `UPDATE registered_agents
       SET status = @status,
           current_task = @currentTask,
           last_heartbeat_at = @lastHeartbeatAt,
           latency_ms = @latencyMs,
           metadata = @metadata,
           updated_at = @updatedAt
       WHERE id = @agentId`
    )
    .run({
      agentId,
      status: payload.status ?? "active",
      currentTask: payload.currentTask ?? existing.current_task,
      lastHeartbeatAt: timestamp,
      latencyMs: payload.latencyMs ?? existing.latency_ms,
      metadata: stringifyJson(mergedMetadata),
      updatedAt: timestamp,
    });

  const agent = getRegisteredAgent(agentId);
  if (!agent) throw new Error(`Failed to record heartbeat for ${agentId}`);
  return agent;
}

export function recordSkillReport(agentId: string, payload: SkillReportInput): void {
  getDb()
    .prepare(
      `INSERT INTO agent_skill_reports (agent_id, skill_id, action, metadata)
       VALUES (?, ?, ?, ?)`
    )
    .run(agentId, payload.skillId, payload.action, stringifyJson(payload.metadata ?? {}));
}

export function recordMemoryWrite(
  agentId: string,
  payload: MemoryWriteInput,
  result: Record<string, unknown> = {}
): number {
  const db = getDb();
  const metadata = payload.metadata ?? {};
  const dedupHash = memoryWriteDedupHash(payload);
  const priorWrite = priorMemoryWritePayload(dedupHash);
  const createdAt = normalizeIsoSeconds(nowIso());

  const insertResult = db
    .prepare(
      `INSERT INTO agent_memory_writes (agent_id, memory_type, content_hash, metadata, result)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      agentId,
      payload.type ?? null,
      contentHash(payload.content),
      stringifyJson(payload.metadata ?? {}),
      stringifyJson(result)
    );

  const qualityReport = result.saveQuality;
  const enrichment = result.enrichment;
  const enrichmentRecord = enrichment && typeof enrichment === "object" && !Array.isArray(enrichment)
    ? enrichment as Record<string, unknown>
    : {};
  const qualityScore = qualityReport && typeof qualityReport === "object" && !Array.isArray(qualityReport)
    && typeof (qualityReport as Record<string, unknown>).score === "number"
    ? (qualityReport as Record<string, number>).score
    : undefined;

  recordEfficiencyEvent(db, {
    eventType: "memory_write",
    taskId: metadataString(metadata, ["taskId", "task_id"]) ?? null,
    agentId,
    createdAt,
    payload: {
      source: metadataString(metadata, ["source", "sourceId", "source_id"]) ?? payload.type ?? "agent_memory",
      firstSeenAt: priorWrite?.payload.firstSeenAt ?? priorWrite?.createdAt ?? createdAt,
      dedupHash,
      isRediscovery: priorWrite !== null,
      phase: "capture",
      enrichmentStatus:
        enrichmentRecord.status === "pending" || enrichmentRecord.status === "running" || enrichmentRecord.status === "completed" || enrichmentRecord.status === "retrying"
          ? enrichmentRecord.status
          : undefined,
      queueDepth: typeof enrichmentRecord.queueDepth === "number" ? enrichmentRecord.queueDepth : undefined,
      extractionLagMs: typeof enrichmentRecord.extractionLagMs === "number" ? enrichmentRecord.extractionLagMs : null,
      qualityScore,
    },
  });

  const writeId = Number(insertResult.lastInsertRowid);
  ensureMemorySalience(db, "agent_memory_write", String(writeId), qualityScore ?? 1);

  // MEMX-3: route the write to the matching tier adapter so vector/graph tiers
  // actually persist, not just the audit row. Fire-and-forget; mem0 queue
  // buffers failures. Opt-in via env so existing tests stay green.
  if (process.env.MEMROOS_MEMORY_WRITE_PUSH_ADAPTER === "1" && result.deferAdapterPush !== true && payload.type) {
    const tier = payload.type as Parameters<typeof getAdapters>[0];
    const adapter = getAdapters(tier)[0];
    if (adapter && typeof payload.content === "string" && payload.content.length > 0) {
      void adapter
        .write({ agent_id: agentId, content: payload.content, metadata })
        .catch((err: unknown) => {
          console.warn("[recordMemoryWrite] adapter push failed", tier, err);
      });
    }
  }
  return writeId;
}

export function recordToolOutcome(agentId: string, payload: ToolOutcomeInput): void {
  const db = getDb();
  const metadata = payload.metadata ?? {};

  db
    .prepare(
      `INSERT INTO agent_tool_outcomes (agent_id, tool_id, outcome, metadata)
       VALUES (?, ?, ?, ?)`
    )
    .run(agentId, payload.toolId, payload.outcome, stringifyJson(metadata));

  reinforceMemorySalience(db, salienceTargetsFromMetadata(metadata), payload.outcome);

  const sourceId = metadataString(metadata, ["sourceId", "source_id"]);
  const sourceHash = sourceReadHash(metadata);
  if (!sourceId || !sourceHash) return;

  recordEfficiencyEvent(db, {
    eventType: "source_read",
    taskId: metadataString(metadata, ["taskId", "task_id"]),
    agentId,
    payload: {
      sourceId,
      sourceHash,
      toolId: payload.toolId,
    },
  });
}

function toRemoteAgentConfig(agent: RegisteredAgent): RemoteAgentConfig | null {
  const endpointRaw =
    agent.metadata.a2a &&
    typeof agent.metadata.a2a === "object" &&
    !Array.isArray(agent.metadata.a2a) &&
    typeof (agent.metadata.a2a as Record<string, unknown>).endpointUrl === "string"
      ? ((agent.metadata.a2a as Record<string, unknown>).endpointUrl as string)
      : null;
  const endpointUrl = endpointRaw
    ? (() => {
        try {
          return new URL(endpointRaw);
        } catch {
          return null;
        }
      })()
    : null;

  if (
    (agent.protocol !== "a2a" && agent.location !== "tailscale" && agent.location !== "cloudflare") ||
    (!agent.host && !endpointUrl) ||
    (!agent.port && !endpointUrl)
  ) {
    return null;
  }

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    platform: agent.platform,
    protocol: agent.protocol,
    location: agent.location ?? "local",
    host: agent.host ?? endpointUrl!.hostname,
    port: agent.port ?? (endpointUrl!.port ? Number(endpointUrl!.port) : endpointUrl!.protocol === "https:" ? 443 : 80),
    healthEndpoint: agent.healthEndpoint ?? DEFAULT_HEALTH_ENDPOINT,
    tunnelUrl: agent.tunnelUrl ?? undefined,
    metadata: agent.metadata,
    skills: agent.capabilities.map(
      (capability): AgentCardSkill => ({
        id: capability.id,
        name: capability.name,
        description: capability.description,
        tags: capability.tags,
        inputModes: ["text"],
        outputModes: ["text"],
      })
    ),
  };
}

/**
 * Remote agents for polling. Unscoped on purpose: liveness is a property of the
 * fleet, not of any viewer, and this feeds machine health checks rather than a
 * user-facing list.
 */
export function getRemoteAgents(): RemoteAgentConfig[] {
  return listAllAgentsUnscoped()
    .map(toRemoteAgentConfig)
    .filter((agent): agent is RemoteAgentConfig => Boolean(agent));
}

export async function pollRemoteAgent(agent: RemoteAgentConfig): Promise<{
  id: string;
  reachable: boolean;
  latencyMs: number | null;
  data: Record<string, unknown> | null;
}> {
  const url =
    agent.location === "cloudflare" && agent.tunnelUrl
      ? `${agent.tunnelUrl}${agent.healthEndpoint}`
      : `http://${agent.host}:${agent.port}${agent.healthEndpoint}`;

  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { id: agent.id, reachable: res.ok, latencyMs: Date.now() - start, data };
  } catch {
    return { id: agent.id, reachable: false, latencyMs: null, data: null };
  }
}

export async function pollAllRemoteAgents() {
  const agents = getRemoteAgents();
  return Promise.all(agents.map(pollRemoteAgent));
}
