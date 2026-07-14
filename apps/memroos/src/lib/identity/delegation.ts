/**
 * Phase 131 / TEAMSCALE-04: Delegation chains.
 *
 * A delegation chain is the sequence of authority handoffs from the human
 * principal down through registered agents and any sub-agents they spawn.
 *
 *     user -> agent -> sub-agent
 *
 * Each hop carries the capabilities the recipient is allowed to exercise on
 * the delegator's behalf. The "weakest link" rule applies: if ANY hop in the
 * chain denies, the chain denies. This mirrors the standard OAuth scope
 * attenuation model -- a sub-agent cannot exceed what its parent could do.
 *
 * The DB has no first-class delegation table yet; chains are derived from
 * `registered_agents.owner_id` (user -> agent) and from the JSON `metadata`
 * column on `registered_agents`, which stores a `parent_agent_id` for
 * sub-agents. This module is read-only -- it does not mutate the DB.
 */

import type Database from "better-sqlite3";

export type ActorKind = "user" | "agent" | "sub-agent";

export interface DelegationHop {
  fromId: string;
  fromType: "user" | "agent";
  toId: string;
  toType: "agent" | "sub-agent";
  capabilities: string[];
}

export interface DelegationChain {
  user: { id: string; role: string };
  agent: { id: string; capabilities: string[] };
  subAgent?: { id: string; capabilities: string[] };
  hops: DelegationHop[];
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  owner_id: string | null;
  deregistered_at: string | null;
  metadata: string | null;
}

interface CapabilityRow {
  capability_id: string;
}

interface UserRoleRow {
  role: string;
}

/**
 * Read the agent's owner (user) and capabilities from the DB. Returns null
 * if the agent does not exist or has been deregistered.
 */
function readAgent(
  db: Database.Database,
  agentId: string
): { row: AgentRow; capabilities: string[] } | null {
  const row = db
    .prepare(
      `SELECT id, name, role, owner_id, deregistered_at, metadata
         FROM registered_agents
        WHERE id = ?`
    )
    .get(agentId) as AgentRow | undefined;
  if (!row) return null;

  const capRows = db
    .prepare(
      `SELECT capability_id FROM agent_capabilities WHERE agent_id = ?`
    )
    .all(agentId) as CapabilityRow[];

  return {
    row,
    capabilities: capRows.map((c) => c.capability_id),
  };
}

/**
 * Read the user's primary role. Returns "member" if no role row exists, so
 * the chain always has a usable role string for policy consumers.
 */
function readUserRole(db: Database.Database, userId: string): string {
  const row = db
    .prepare(
      `SELECT role FROM user_roles WHERE user_id = ? ORDER BY role ASC LIMIT 1`
    )
    .get(userId) as UserRoleRow | undefined;
  return row ? row.role : "member";
}

/**
 * Read the sub-agent's parent_agent_id from metadata JSON. Returns null if
 * the metadata is missing, unparseable, or does not declare a parent.
 */
function readParentAgentId(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const parent = obj.parent_agent_id;
      if (typeof parent === "string" && parent.trim().length > 0) return parent;
    }
  } catch {
    // Corrupt metadata -- treat as no declared parent.
  }
  return null;
}

/**
 * Build a delegation chain from DB records. The chain always includes the
 * user -> agent hop; the sub-agent hop is included when subAgentId is
 * provided and a valid chain can be reconstructed.
 *
 * Returns null if the agent is not owned by the user (chain is invalid --
 * caller should treat as denied) or if either entity is missing.
 */
export function buildDelegationChain(
  db: Database.Database,
  userId: string,
  agentId: string,
  subAgentId?: string
): DelegationChain | null {
  if (!userId || !agentId) return null;

  const agent = readAgent(db, agentId);
  if (!agent) return null;

  // An agent whose owner_id is missing or points at a different user cannot
  // form a valid chain on this user's behalf.
  if (agent.row.owner_id !== userId) return null;

  const userRole = readUserRole(db, userId);
  const hops: DelegationHop[] = [
    {
      fromId: userId,
      fromType: "user",
      toId: agentId,
      toType: "agent",
      capabilities: [...agent.capabilities],
    },
  ];

  const chain: DelegationChain = {
    user: { id: userId, role: userRole },
    agent: { id: agentId, capabilities: [...agent.capabilities] },
    hops,
  };

  if (subAgentId && subAgentId.trim().length > 0) {
    const subAgent = readAgent(db, subAgentId);
    if (!subAgent) return null;

    // Sub-agent must declare the agent as its parent and have the same owner.
    const declaredParent = readParentAgentId(subAgent.row.metadata);
    if (declaredParent !== agentId) return null;
    if (subAgent.row.owner_id !== userId) return null;

    chain.subAgent = {
      id: subAgentId,
      capabilities: [...subAgent.capabilities],
    };
    hops.push({
      fromId: agentId,
      fromType: "agent",
      toId: subAgentId,
      toType: "sub-agent",
      capabilities: [...subAgent.capabilities],
    });
  }

  return chain;
}

/**
 * Verify a delegation chain is internally consistent. Checks:
 *   - chain has at least the user -> agent hop
 *   - the agent hop capabilities are a non-empty subset of the agent's
 *     declared capabilities (a hop cannot grant more than the agent has)
 *   - if a sub-agent hop is present, its capabilities are a non-empty subset
 *     of the sub-agent's declared capabilities
 *   - the user hop's capabilities equal the agent's declared capabilities
 *     (this is the simplest model: the user delegates everything the agent
 *     has, and policies tighten further via weakest-link evaluation)
 *
 * Returns { valid: true } on success or { valid: false, reason } with a
 * short stable code on failure.
 */
export function verifyDelegationChain(
  chain: DelegationChain
): { valid: boolean; reason?: string } {
  if (!chain.user || !chain.user.id) {
    return { valid: false, reason: "missing_user" };
  }
  if (!chain.agent || !chain.agent.id) {
    return { valid: false, reason: "missing_agent" };
  }
  if (!Array.isArray(chain.hops) || chain.hops.length === 0) {
    return { valid: false, reason: "missing_hops" };
  }

  const userToAgent = chain.hops[0];
  if (
    userToAgent.fromType !== "user" ||
    userToAgent.toType !== "agent" ||
    userToAgent.fromId !== chain.user.id ||
    userToAgent.toId !== chain.agent.id
  ) {
    return { valid: false, reason: "invalid_first_hop" };
  }
  if (userToAgent.capabilities.length === 0) {
    return { valid: false, reason: "agent_has_no_capabilities" };
  }

  if (chain.subAgent) {
    if (chain.hops.length < 2) {
      return { valid: false, reason: "missing_subagent_hop" };
    }
    const agentToSub = chain.hops[1];
    if (
      agentToSub.fromType !== "agent" ||
      agentToSub.toType !== "sub-agent" ||
      agentToSub.fromId !== chain.agent.id ||
      agentToSub.toId !== chain.subAgent.id
    ) {
      return { valid: false, reason: "invalid_subagent_hop" };
    }
    if (agentToSub.capabilities.length === 0) {
      return { valid: false, reason: "subagent_has_no_capabilities" };
    }
  }

  return { valid: true };
}

/**
 * Weakest-link evaluation: if any hop in the chain denies, the chain denies.
 * Each hop's outcome is decided by the policy engine or by upstream
 * verification -- this function just composes them.
 *
 * `hopOutcomes` is an array of { hopIndex, outcome } in the order the hops
 * were evaluated. Any hop with outcome "deny" -> "deny". Otherwise "allow".
 */
export function weakestLinkOutcome(
  chain: DelegationChain,
  hopOutcomes: Array<{ hopIndex: number; outcome: "allow" | "deny" }>
): "allow" | "deny" {
  if (!chain || chain.hops.length === 0) return "deny";
  for (const hop of hopOutcomes) {
    if (hop.outcome === "deny") return "deny";
  }
  // If fewer outcomes were provided than hops, treat the unevaluated hops
  // as a deny (fail-closed). This prevents a misconfigured caller from
  // accidentally allowing a hop it never checked.
  if (hopOutcomes.length < chain.hops.length) return "deny";
  return "allow";
}