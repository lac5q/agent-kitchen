/**
 * Phase 131 / TEAMSCALE-02..04: Identity lifecycle (joiner, leaver, orphan scan).
 *
 * Three atomic primitives drive the team-scale identity plane:
 *
 *   onboardUser      -- atomic joiner. Creates the user row, the user's role,
 *                       every space membership, the agent registry row, and the
 *                       initial agent API key in a single transaction. Returns
 *                       a receipt so callers can hand the new human their
 *                       credentials + agent key in one shot.
 *
 *   offboardUser     -- atomic leaver. Revokes all user-level credentials,
 *                       deregisters every agent the user owned, reassigns the
 *                       user's artifacts (messages) to a system placeholder,
 *                       and opens a MEMLIFE erasure review via hil_escalations.
 *
 *   scanOrphanedAgents -- introspection helper. Returns the agents whose owner
 *                       has been revoked/deleted but whose API keys are still
 *                       live. The owner-gate is a separate safety net for
 *                       individual asset access; this scan flags the agents
 *                       themselves so ops can rotate or disable them.
 *
 * INVARIANTS
 * ----------
 * - All three functions accept a `Database.Database` rather than calling
 *   `getDb()` so they can be exercised by tests against an in-memory DB.
 * - onboardUser / offboardUser run inside `db.transaction(...)` so a failure
 *   halfway through leaves the DB unchanged. We never want a joiner to end up
 *   with a user but no agent, or a leaver with revoked keys but live agents.
 * - audit_entries writes use `writeAuditEntry(entry, db)` so the audit row
 *   is part of the same transaction (and therefore rolls back atomically).
 *
 * This module does NOT call `registerAgent` / `deregisterAgent` /
 * `createAgentApiKey` directly -- those bind to the singleton `getDb()` and
 * are out-of-scope for unit tests. Lifecycle writes the registry rows and
 * the API-key row directly, mirroring the same column shapes used by
 * agent-registry.ts.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { writeAuditEntry } from "@/lib/audit/write";

const TENANT_ID = "default-tenant";
const AGENT_API_KEY_DEFAULT_TTL_DAYS = 90;

function agentApiKeyExpiresAt(from: Date): string {
  const raw = process.env.MEMROOS_AGENT_API_KEY_TTL_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const days =
    Number.isFinite(parsed) && parsed > 0 ? parsed : AGENT_API_KEY_DEFAULT_TTL_DAYS;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export interface OnboardingReceipt {
  userId: string;
  agentId: string;
  agentApiKey: string;
  spaceIds: string[];
  role: string;
  skills: string[];
  createdAt: string;
}

export interface OffboardingReceipt {
  userId: string;
  revokedApiKeys: number;
  revokedRefreshTokens: number;
  deregisteredAgents: number;
  reassignedArtifacts: number;
  memlifeReviewItemId: string;
  createdAt: string;
}

export interface OrphanedAgent {
  agentId: string;
  agentName: string;
  ownerId: string | null;
  hasLiveKey: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateAgentApiKey(agentId: string): string {
  return `ak_${agentId}_${crypto.randomBytes(32).toString("base64url")}`;
}

/**
 * Read the user's primary role from the user_roles table. Returns the first
 * row if there are multiple (the schema does not enforce a single primary).
 */
function readUserRole(
  db: Database.Database,
  userId: string
): string | null {
  const row = db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role ASC LIMIT 1")
    .get(userId) as { role: string } | undefined;
  return row ? row.role : null;
}

/**
 * Atomic joiner: create user + role + space memberships + agent + API key.
 *
 * Steps (single transaction):
 *   1. Insert into `users` (email, display_name, password_hash = placeholder,
 *      tenant_id).
 *   2. Insert into `user_roles`.
 *   3. For each spaceId, insert into `space_members` as a human member.
 *   4. Insert into `registered_agents` with `owner_id` set to the new user.
 *   5. Insert into `agent_capabilities` for every supplied capability.
 *   6. Insert into `agent_api_keys` (raw key returned in the receipt, hash stored).
 *   7. Insert the agent into `space_members` as an agent member in each space.
 *   8. Write an `admin.compliance_updated` audit row to record the joiner.
 *
 * The agent's `protocol` defaults to `local` and `platform` to the kit input
 * (or `custom`). Capabilities and skills are persisted both into
 * `agent_capabilities` (rows) and onto the receipt's `skills` field.
 */
export function onboardUser(
  db: Database.Database,
  input: {
    email: string;
    displayName: string;
    role: "admin" | "operator" | "reviewer";
    spaceIds: string[];
    agentKit: {
      name: string;
      platform?: string;
      skills?: string[];
      capabilities?: Array<{ id: string; name?: string; description?: string }>;
    };
  }
): OnboardingReceipt {
  if (!input.email || !input.email.trim()) {
    throw new Error("onboardUser: email is required");
  }
  if (!input.displayName || !input.displayName.trim()) {
    throw new Error("onboardUser: displayName is required");
  }
  if (!input.agentKit || !input.agentKit.name || !input.agentKit.name.trim()) {
    throw new Error("onboardUser: agentKit.name is required");
  }

  const userId = generateId("usr");
  const agentId = generateId("agt");
  const createdAt = nowIso();
  const apiKey = generateAgentApiKey(agentId);
  const keyHash = hashKey(apiKey);
  const platform = (input.agentKit.platform ?? "custom").trim() || "custom";
  const skills = input.agentKit.skills ?? [];
  const capabilities = input.agentKit.capabilities ?? [];

  const tx = db.transaction(() => {
    // 1. users row.
    db.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, tenant_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      input.email.trim(),
      input.displayName.trim(),
      // Placeholder hash -- the user must complete onboarding before the
      // account is usable. Kept deterministic so tests can assert on it.
      "pending-onboarding",
      TENANT_ID,
      createdAt
    );

    // 2. user_roles row.
    db.prepare(
      `INSERT INTO user_roles (user_id, role) VALUES (?, ?)`
    ).run(userId, input.role);

    // 3. space memberships (human).
    const insertHumanMember = db.prepare(
      `INSERT INTO space_members (space_id, member_id, member_type, role, created_at)
       VALUES (?, ?, 'human', ?, ?)`
    );
    for (const spaceId of input.spaceIds) {
      const trimmed = (spaceId || "").trim();
      if (!trimmed) continue;
      // Idempotent: re-adding the same (space_id, member_id) is a no-op.
      const existing = db
        .prepare(
          `SELECT 1 AS one FROM space_members WHERE space_id = ? AND member_id = ?`
        )
        .get(trimmed, userId) as { one: number } | undefined;
      if (existing) continue;
      insertHumanMember.run(trimmed, userId, "member", createdAt);
    }

    // 4. registered_agents row. We persist `owner_id` so offboardUser can
    // find this agent during the leaver flow. protocol is forced to 'local'
    // because onboarding is the in-product bootstrap path; remote agents are
    // registered later via agent-registry.ts.
    db.prepare(
      `INSERT INTO registered_agents (
         id, name, role, platform, protocol, status,
         location, metadata, owner_id, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, 'local', 'dormant', 'local', ?, ?, ?, ?)`
    ).run(
      agentId,
      input.agentKit.name.trim(),
      input.role,
      platform,
      JSON.stringify({ onboarded: true, skills }),
      userId,
      createdAt,
      createdAt
    );

    // 5. agent_capabilities rows.
    const insertCap = db.prepare(
      `INSERT INTO agent_capabilities
         (agent_id, capability_id, name, description, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', ?, ?)`
    );
    for (const capability of capabilities) {
      if (!capability.id) continue;
      insertCap.run(
        agentId,
        capability.id,
        capability.name ?? capability.id,
        capability.description ?? "",
        createdAt,
        createdAt
      );
    }

    // 6. agent_api_keys row.
    const expiresAt = agentApiKeyExpiresAt(new Date(createdAt));
    db.prepare(
      `INSERT INTO agent_api_keys (agent_id, key_prefix, key_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(agentId, apiKey.slice(0, 12), keyHash, createdAt, expiresAt);

    // 7. agent membership in each space (so the NOC sees the agent there).
    const insertAgentMember = db.prepare(
      `INSERT INTO space_members (space_id, member_id, member_type, role, created_at)
       VALUES (?, ?, 'agent', ?, ?)`
    );
    for (const spaceId of input.spaceIds) {
      const trimmed = (spaceId || "").trim();
      if (!trimmed) continue;
      const existing = db
        .prepare(
          `SELECT 1 AS one FROM space_members WHERE space_id = ? AND member_id = ?`
        )
        .get(trimmed, agentId) as { one: number } | undefined;
      if (existing) continue;
      insertAgentMember.run(trimmed, agentId, "member", createdAt);
    }

    // 8. Audit row. Entity id format mirrors audit/write.ts convention.
    writeAuditEntry(
      {
        tenant_id: TENANT_ID,
        actor_id: userId,
        actor_role: "admin",
        event_type: "admin.compliance_updated",
        entity_type: "compliance_control",
        entity_id: `user:${userId}`,
        reason: "user_onboarded",
        metadata_json: {
          email: input.email.trim(),
          role: input.role,
          agent_id: agentId,
          space_ids: input.spaceIds,
          skills,
        },
        created_at: createdAt,
      },
      db
    );
  });
  tx();

  return {
    userId,
    agentId,
    agentApiKey: apiKey,
    spaceIds: [...input.spaceIds],
    role: input.role,
    skills: [...skills],
    createdAt,
  };
}

/**
 * Atomic leaver: revoke credentials + deregister agents + reassign artifacts
 * + open MEMLIFE review.
 *
 * Steps (single transaction):
 *   1. Revoke all `user_api_keys` for the user (set revoked_at).
 *   2. Revoke all `user_refresh_tokens` for the user.
 *   3. Find all agents owned by the user and deregister them (set
 *      `deregistered_at`, status='dormant') and revoke their live API keys.
 *   4. Reassign `messages` rows the user authored to the system placeholder
 *      by clearing `agent_id` to NULL. We do NOT delete the content --
 *      erasure review (step 6) is what authorizes removal.
 *   5. Open a MEMLIFE erasure review via `hil_escalations`. We map the
 *      MEMLIFE semantics onto `escalation_type = 'agent_escalate'` (one of
 *      the schema's CHECK-allowed values) with `entity_type =
 *      'meMlife_erasure_review'` so the review is grep-able by its subtype.
 *   6. Write audit rows for each phase.
 */
export function offboardUser(
  db: Database.Database,
  userId: string
): OffboardingReceipt {
  if (!userId || !userId.trim()) {
    throw new Error("offboardUser: userId is required");
  }

  const userRow = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(userId) as { id: string } | undefined;
  if (!userRow) {
    throw new Error(`offboardUser: user ${userId} not found`);
  }

  const createdAt = nowIso();
  // MEMLIFE erasure SLA: 24h. Long enough for a human reviewer to triage
  // before artifacts are erased, short enough to bound risk.
  const memlifeSlaSeconds = 24 * 60 * 60;

  let revokedApiKeys = 0;
  let revokedRefreshTokens = 0;
  let deregisteredAgents = 0;
  let reassignedArtifacts = 0;
  let memlifeReviewItemId = "";

  const tx = db.transaction(() => {
    // 1. Revoke user_api_keys.
    const apiKeyResult = db
      .prepare(
        `UPDATE user_api_keys
         SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`
      )
      .run(createdAt, userId);
    revokedApiKeys = apiKeyResult.changes;

    // 2. Revoke user_refresh_tokens.
    const tokenResult = db
      .prepare(
        `UPDATE user_refresh_tokens
         SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`
      )
      .run(createdAt, userId);
    revokedRefreshTokens = tokenResult.changes;

    // 3. Find agents owned by this user and deregister each.
    const ownedAgents = db
      .prepare(
        `SELECT id FROM registered_agents WHERE owner_id = ? AND deregistered_at IS NULL`
      )
      .all(userId) as { id: string }[];

    const deregAgent = db.prepare(
      `UPDATE registered_agents
       SET deregistered_at = ?, status = 'dormant', updated_at = ?
       WHERE id = ? AND deregistered_at IS NULL`
    );
    const revokeAgentKey = db.prepare(
      `UPDATE agent_api_keys
       SET revoked_at = ?
       WHERE agent_id = ? AND revoked_at IS NULL`
    );
    for (const { id: agentId } of ownedAgents) {
      deregAgent.run(createdAt, createdAt, agentId);
      revokeAgentKey.run(createdAt, agentId);
      deregisteredAgents += 1;
    }

    // 4. Reassign messages. We CANNOT NULL agent_id (NOT NULL constraint),
    //    so we substitute a stable system placeholder ("system"). The row
    //    remains in the conversation store with its audit trail intact; the
    //    MEMLIFE erasure review (step 5) is what authorizes deletion. The
    //    placeholder keeps FK-style joins working and lets the NOC view
    //    continue to count the row without attributing it to the leaver.
    //
    //    Reassignment targets:
    //      (a) any message where agent_id == userId (legacy rows where the
    //          user was the agent)
    //      (b) any message where agent_id is one of the agents owned by
    //          this user (the agent is deregistered above, so its prior
    //          conversation history now belongs to the system placeholder)
    const ownedAgentIds = ownedAgents.map((a) => a.id);
    const allAgentIds = [userId, ...ownedAgentIds];
    const placeholders = allAgentIds.map(() => "?").join(",");
    const reassignResult = db
      .prepare(
        `UPDATE messages
         SET agent_id = 'system'
         WHERE agent_id IN (${placeholders})`
      )
      .run(...allAgentIds);
    reassignedArtifacts = reassignResult.changes;

    // 5. MEMLIFE erasure review. Insert with escalation_type='agent_escalate'
    //    (a CHECK-allowed value) and entity_type='meMlife_erasure_review'
    //    so the semantics are grep-able without changing the schema.
    memlifeReviewItemId = `memlife_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO hil_escalations
         (id, tenant_id, entity_type, entity_id, escalation_type,
          sla_seconds, sla_deadline, status, assigned_to, opened_by, created_at)
       VALUES (?, ?, 'meMlife_erasure_review', ?, 'agent_escalate',
               ?, ?, 'open', NULL, ?, ?)`
    ).run(
      memlifeReviewItemId,
      TENANT_ID,
      `user:${userId}`,
      memlifeSlaSeconds,
      new Date(Date.now() + memlifeSlaSeconds * 1000).toISOString(),
      userId,
      createdAt
    );

    // 6. Audit rows.
    writeAuditEntry(
      {
        tenant_id: TENANT_ID,
        actor_id: userId,
        actor_role: "system",
        event_type: "admin.compliance_updated",
        entity_type: "compliance_control",
        entity_id: `user:${userId}`,
        reason: "user_offboarded",
        metadata_json: {
          revoked_api_keys: revokedApiKeys,
          revoked_refresh_tokens: revokedRefreshTokens,
          deregistered_agents: deregisteredAgents,
          reassigned_artifacts: reassignedArtifacts,
          memlife_review_item_id: memlifeReviewItemId,
        },
        created_at: createdAt,
      },
      db
    );

    // Separate audit entry for the MEMLIFE review so it's filterable by
    // event_type while still appearing in the user's timeline.
    writeAuditEntry(
      {
        tenant_id: TENANT_ID,
        actor_id: userId,
        actor_role: "system",
        event_type: "hil.created",
        entity_type: "hil_escalation",
        entity_id: `hil_escalation:${memlifeReviewItemId}`,
        reason: "MEMLIFE erasure review opened",
        metadata_json: {
          escalation_id: memlifeReviewItemId,
          escalation_type: "agent_escalate",
          entity_type: "meMlife_erasure_review",
          entity_id: `user:${userId}`,
          sla_seconds: memlifeSlaSeconds,
          source_user_id: userId,
        },
        created_at: createdAt,
      },
      db
    );
  });
  tx();

  return {
    userId,
    revokedApiKeys,
    revokedRefreshTokens,
    deregisteredAgents,
    reassignedArtifacts,
    memlifeReviewItemId,
    createdAt,
  };
}

/**
 * Scan for orphaned agents: registered_agents whose owner_id is set to a user
 * whose row is gone (or whose owner_id is NULL but who has a live API key).
 *
 * "Orphaned" here means:
 *   - owner_id references a users.id that no longer exists, OR
 *   - deregistered_at IS NOT NULL but a live (non-revoked) API key still exists.
 *
 * Returns an array of { agentId, agentName, ownerId, hasLiveKey }.
 */
export function scanOrphanedAgents(db: Database.Database): OrphanedAgent[] {
  // Case 1: owner_id is set but the users row is gone (FK ON DELETE SET NULL
  // would normally null this, but the user row may have been deleted before
  // that path was wired -- we still surface the orphan defensively).
  // We detect this by LEFT JOINing users and filtering on u.id IS NULL.
  const rowsWithMissingOwner = db
    .prepare(
      `SELECT a.id AS agent_id, a.name AS agent_name, a.owner_id AS owner_id,
              EXISTS(
                SELECT 1 FROM agent_api_keys k
                WHERE k.agent_id = a.id AND k.revoked_at IS NULL
              ) AS has_live_key
         FROM registered_agents a
         LEFT JOIN users u ON u.id = a.owner_id
        WHERE a.owner_id IS NOT NULL AND u.id IS NULL`
    )
    .all() as {
    agent_id: string;
    agent_name: string;
    owner_id: string;
    has_live_key: number;
  }[];

  // Case 2: agent has been deregistered but still has live API keys. This is
  // a separate class of orphan -- the agent row exists but the credentials
  // outlived the deregistration. Surface it so ops can revoke the keys.
  const rowsWithLiveKeyAfterDereg = db
    .prepare(
      `SELECT a.id AS agent_id, a.name AS agent_name, a.owner_id AS owner_id,
              1 AS has_live_key
         FROM registered_agents a
        WHERE a.deregistered_at IS NOT NULL
          AND EXISTS(
            SELECT 1 FROM agent_api_keys k
            WHERE k.agent_id = a.id AND k.revoked_at IS NULL
          )`
    )
    .all() as {
    agent_id: string;
    agent_name: string;
    owner_id: string;
    has_live_key: number;
  }[];

  const merged = new Map<string, OrphanedAgent>();
  const ingest = (row: {
    agent_id: string;
    agent_name: string;
    owner_id: string | null;
    has_live_key: number;
  }): void => {
    merged.set(row.agent_id, {
      agentId: row.agent_id,
      agentName: row.agent_name,
      ownerId: row.owner_id,
      hasLiveKey: row.has_live_key === 1,
    });
  };
  for (const row of rowsWithMissingOwner) ingest(row);
  for (const row of rowsWithLiveKeyAfterDereg) ingest(row);

  // Stable ordering so tests can assert exact contents.
  return [...merged.values()].sort((a, b) =>
    a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0
  );
}

/**
 * Read the user's role, falling back to a synthetic "member" role if the
 * user has no rows in user_roles. Useful for tests and for read-side code
 * that needs a non-null role.
 */
export function getUserRoleOrDefault(
  db: Database.Database,
  userId: string
): string {
  const role = readUserRole(db, userId);
  return role ?? "member";
}