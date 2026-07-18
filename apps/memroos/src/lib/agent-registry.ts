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
    capabilities: capabilitiesForAgent(row.id),
    metadata: parseObject(row.metadata),
    host: row.host,
    port: row.port,
    healthEndpoint: row.health_endpoint,
    tunnelUrl: row.tunnel_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deregisteredAt: row.deregistered_at,
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

export function registerAgent(input: RegisterAgentInput): RegisterAgentResult {
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

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO registered_agents (
         id, name, role, company, platform, protocol, status, current_task,
         last_heartbeat_at, location, host, port, health_endpoint, tunnel_url,
         latency_ms, metadata, created_at, updated_at, deregistered_at
       )
       VALUES (
         @id, @name, @role, @company, @platform, @protocol, 'dormant', NULL,
         NULL, @location, @host, @port, @healthEndpoint, @tunnelUrl,
         NULL, @metadata, @timestamp, @timestamp, NULL
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
         deregistered_at = NULL`
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
    });

    // Only replace capabilities when the caller explicitly sends them.
    // `capabilities ?? []` wiped durable write caps on re-register heartbeats.
    if (input.capabilities !== undefined) {
      replaceCapabilities(input.id, input.capabilities);
    }
  });
  tx();

  const apiKey = input.issueApiKey ? createAgentApiKey(input.id) : undefined;
  const agent = getRegisteredAgent(input.id);
  if (!agent) {
    throw new Error(`Failed to register agent ${input.id}`);
  }
  return apiKey ? { agent, apiKey } : { agent };
}

export function listRegisteredAgents(options: ListAgentsOptions = {}): RegisteredAgent[] {
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

export function getRegisteredAgent(
  agentId: string,
  options: ListAgentsOptions = {}
): RegisteredAgent | null {
  const row = getAgentRow(agentId, options.includeDeregistered ?? false);
  return row ? rowToRegisteredAgent(row) : null;
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
  getDb()
    .prepare(
      `INSERT INTO agent_api_keys (agent_id, key_prefix, key_hash)
       VALUES (?, ?, ?)`
    )
    .run(agentId, key.slice(0, 12), hashKey(key));
  return key;
}

export function authenticateAgentKey(rawKey: string, agentIdHint?: string): RegisteredAgent | null {
  const keyHash = hashKey(rawKey);
  const row = getDb()
    .prepare(
      `SELECT agent_id, key_hash
       FROM agent_api_keys
       WHERE key_hash = ? AND revoked_at IS NULL`
    )
    .get(keyHash) as AgentApiKeyRow | undefined;

  if (!row) return null;
  if (agentIdHint && row.agent_id !== agentIdHint) return null;

  const agent = getRegisteredAgent(row.agent_id);
  if (!agent) return null;

  getDb()
    .prepare("UPDATE agent_api_keys SET last_used_at = ? WHERE key_hash = ?")
    .run(nowIso(), keyHash);
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
): void {
  const db = getDb();
  const metadata = payload.metadata ?? {};
  const dedupHash = memoryWriteDedupHash(payload);
  const priorWrite = priorMemoryWritePayload(dedupHash);
  const createdAt = normalizeIsoSeconds(nowIso());

  db
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
    },
  });
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

export function getRemoteAgents(): RemoteAgentConfig[] {
  return listRegisteredAgents()
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
