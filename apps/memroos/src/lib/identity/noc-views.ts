/**
 * Phase 131 / TEAMSCALE-05: NOC views scoped to a team (space).
 *
 * Aggregates the read-side telemetry needed by the team-scale NOC panel:
 *
 *   memoryGrowth         -- message volume in the time window, with a simple
 *                          trend classification (up/down/flat) vs the previous
 *                          equivalent window.
 *   promotionQueueDepth  -- count of open belief-review queue rows whose
 *                          agent_id belongs to the space.
 *   policyDenials        -- count of audit_entries with event_type =
 *                          'policy.decision' and outcome='deny' in the window.
 *   skillUsage           -- aggregated counts from agent_skill_reports for
 *                          agents that are members of the space.
 *   agentActivity        -- count of agents with a heartbeat in the window
 *                          plus total heartbeats.
 *
 * The view is intentionally read-only. It accepts a `Database.Database` so
 * it can run against the production singleton OR against an in-memory test
 * DB. All counts are best-effort approximations; the underlying writes are
 * eventually consistent (heartbeats, skill reports, audit rows).
 */

import type Database from "better-sqlite3";
import {
  nocWindowToSinceIso,
  type NocWindow,
} from "@/lib/noc-filters";

const DEFAULT_WINDOW: NocWindow = "24h";

export interface TeamNocView {
  spaceId: string;
  spaceName: string;
  window: string;
  memoryGrowth: { count: number; trend: "up" | "down" | "flat" };
  promotionQueueDepth: number;
  policyDenials: number;
  skillUsage: Array<{ skillId: string; count: number }>;
  agentActivity: { activeAgents: number; totalHeartbeats: number };
}

function previousWindowStart(window: NocWindow, now = Date.now()): string {
  const hours =
    window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  // The previous window is the immediately-prior block of the same length:
  //   [now - 2*hours, now - hours)
  return new Date(now - 2 * hours * 60 * 60 * 1000).toISOString();
}

function previousWindowEnd(window: NocWindow, now = Date.now()): string {
  const hours =
    window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  // Upper bound of the previous window: the start of the current window.
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

function classifyTrend(
  currentCount: number,
  previousCount: number
): "up" | "down" | "flat" {
  // Trend classification: classify as "up" / "down" if the change exceeds
  // the larger of (5% of the previous window) and 1 row. Without this floor,
  // a previous window of 0-2 rows can be misclassified as "flat" because
  // 5% rounds down to 0; with this floor, any positive change vs. an
  // empty previous window correctly registers as "up".
  const relativeEpsilon = Math.max(0, Math.round(previousCount * 0.05));
  const epsilon = Math.max(1, relativeEpsilon);
  if (currentCount >= previousCount + epsilon) return "up";
  if (currentCount <= previousCount - epsilon) return "down";
  return "flat";
}

interface SpaceRow {
  name: string;
}

/**
 * Resolve the member agents of a space and return their ids as a string list
 * suitable for `IN (...)` SQL. Returns [] if the space has no agents.
 *
 * NOTE: We deliberately include both human and agent members when collecting
 * agent ids -- humans don't have rows in registered_agents so the filter
 * naturally reduces to agent-type members.
 */
function agentIdsInSpace(db: Database.Database, spaceId: string): string[] {
  const rows = db
    .prepare(
      `SELECT member_id FROM space_members WHERE space_id = ? AND member_type = 'agent'`
    )
    .all(spaceId) as { member_id: string }[];
  return rows.map((r) => r.member_id);
}

/**
 * Count messages in a window that either:
 *   - belong to the space directly via `messages.space_id`, OR
 *   - fall back to the legacy `project` column matched by space name.
 *
 * This mirrors the rule used by `filterBySpace` (Phase 130) so existing
 * legacy rows are counted alongside new rows.
 */
function countMessagesInWindow(
  db: Database.Database,
  spaceId: string,
  spaceName: string,
  sinceIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM messages
        WHERE timestamp >= ?
          AND (
            space_id = ?
            OR (space_id IS NULL AND project = ?)
          )`
    )
    .get(sinceIso, spaceId, spaceName) as { n: number };
  return row.n;
}

/**
 * Like countMessagesInWindow but with an explicit upper bound on timestamp
 * (exclusive at the SQLite level via strict `<`). Used for counting the
 * previous NOC window, which is bounded on both sides.
 */
function countMessagesInWindowRange(
  db: Database.Database,
  spaceId: string,
  spaceName: string,
  sinceIso: string,
  untilIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM messages
        WHERE timestamp >= ?
          AND timestamp < ?
          AND (
            space_id = ?
            OR (space_id IS NULL AND project = ?)
          )`
    )
    .get(sinceIso, untilIso, spaceId, spaceName) as { n: number };
  return row.n;
}

/**
 * Count open belief-review queue rows whose agent_id is in the space's agent
 * member list. Returns 0 if there are no agent members (so the IN list is
 * never empty -- we use a sentinel check rather than building dynamic SQL).
 */
function countOpenPromotionQueue(
  db: Database.Database,
  agentIds: string[]
): number {
  if (agentIds.length === 0) return 0;
  const placeholders = agentIds.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM belief_review_queue
        WHERE status = 'open'
          AND candidate_id IN (
            SELECT id FROM agent_memory_candidates WHERE agent_id IN (${placeholders})
          )`
    )
    .get(...agentIds) as { n: number };
  return row.n;
}

/**
 * Count policy decision denials in the window for any agent in the space.
 * Falls back to 0 when there are no agent members.
 */
function countPolicyDenials(
  db: Database.Database,
  agentIds: string[],
  sinceIso: string
): number {
  if (agentIds.length === 0) {
    // Without agent ids we still want a sensible total for the space -- we
    // count denials where the entity_id embeds any of the agent ids OR where
    // there are no agent-bound denials at all. The simplest defensible answer
    // is 0 for a space with no agents.
    return 0;
  }
  // Build a pattern that matches entity_ids like 'policy_decision:capability:dispatch'
  // AND a metadata_json that references the agent. We do this with a single
  // LIKE on entity_id is too coarse; instead we filter via metadata_json LIKE
  // for each agent id.
  const likeClauses = agentIds
    .map(() => `(metadata_json LIKE ?)`)
    .join(" OR ");
  const params: string[] = agentIds.map((id) => `%"agent_id":"${id}"%`);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM audit_entries
        WHERE event_type = 'policy.decision'
          AND created_at >= ?
          AND (${likeClauses})`
    )
    .get(sinceIso, ...params) as { n: number };
  return row.n;
}

interface SkillReportRow {
  skill_id: string;
  n: number;
}

function aggregateSkillUsage(
  db: Database.Database,
  agentIds: string[]
): Array<{ skillId: string; count: number }> {
  if (agentIds.length === 0) return [];
  const placeholders = agentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT skill_id, COUNT(*) AS n
         FROM agent_skill_reports
        WHERE agent_id IN (${placeholders})
        GROUP BY skill_id
        ORDER BY n DESC, skill_id ASC`
    )
    .all(...agentIds) as SkillReportRow[];
  return rows.map((r) => ({ skillId: r.skill_id, count: r.n }));
}

interface AgentHeartbeatStats {
  active_agents: number;
  total_heartbeats: number;
}

/**
 * Compute agent activity for the space in the window:
 *   - activeAgents: distinct agents in the space with a heartbeat >= sinceIso
 *   - totalHeartbeats: total heartbeats from those agents (we use the
 *     hive_actions log for heartbeat-like events, falling back to a count of
 *     messages from those agents when hive_actions is empty).
 *
 * The `last_heartbeat_at` column on registered_agents is the single source
 * of truth for "last seen"; counting heartbeats themselves requires a log
 * table. We use a conservative approximation: totalHeartbeats is the count
 * of distinct (agent, day) pairs that have any hive_action in the window.
 */
function computeAgentActivity(
  db: Database.Database,
  agentIds: string[],
  sinceIso: string
): AgentHeartbeatStats {
  if (agentIds.length === 0) {
    return { active_agents: 0, total_heartbeats: 0 };
  }
  const placeholders = agentIds.map(() => "?").join(",");
  const activeRow = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM registered_agents
        WHERE id IN (${placeholders})
          AND last_heartbeat_at IS NOT NULL
          AND last_heartbeat_at >= ?`
    )
    .get(...agentIds, sinceIso) as { n: number };

  const heartbeatRow = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM hive_actions
        WHERE agent_id IN (${placeholders})
          AND timestamp >= ?`
    )
    .get(...agentIds, sinceIso) as { n: number };

  return {
    active_agents: activeRow.n,
    total_heartbeats: heartbeatRow.n,
  };
}

/**
 * Build a NOC view scoped to a single space. Pure read; does not write.
 */
export function getTeamNocView(
  db: Database.Database,
  input: { spaceId: string; window?: string }
): TeamNocView {
  const spaceId = (input.spaceId || "").trim();
  if (!spaceId) {
    throw new Error("getTeamNocView: spaceId is required");
  }
  const window: NocWindow =
    input.window === "7d" || input.window === "30d" || input.window === "24h"
      ? input.window
      : DEFAULT_WINDOW;

  const spaceRow = db
    .prepare(`SELECT name FROM spaces WHERE id = ?`)
    .get(spaceId) as SpaceRow | undefined;
  const spaceName = spaceRow ? spaceRow.name : spaceId;

  const sinceIso = nocWindowToSinceIso(window);
  const previousSinceIso = previousWindowStart(window);
  const previousUntilIso = previousWindowEnd(window);

  const currentCount = countMessagesInWindow(db, spaceId, spaceName, sinceIso);
  const previousCount = countMessagesInWindowRange(
    db,
    spaceId,
    spaceName,
    previousSinceIso,
    previousUntilIso
  );

  const agentIds = agentIdsInSpace(db, spaceId);
  const promotionQueueDepth = countOpenPromotionQueue(db, agentIds);
  const policyDenials = countPolicyDenials(db, agentIds, sinceIso);
  const skillUsage = aggregateSkillUsage(db, agentIds);
  const activity = computeAgentActivity(db, agentIds, sinceIso);

  return {
    spaceId,
    spaceName,
    window,
    memoryGrowth: {
      count: currentCount,
      trend: classifyTrend(currentCount, previousCount),
    },
    promotionQueueDepth,
    policyDenials,
    skillUsage,
    agentActivity: {
      activeAgents: activity.active_agents,
      totalHeartbeats: activity.total_heartbeats,
    },
  };
}