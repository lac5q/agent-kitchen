import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { ROLE_RANK } from "@/lib/auth/middleware-roles";
import { scanContent } from "@/lib/content-scanner";
import { scanIrisPreflight } from "@/lib/iris-scanner";
import { authorizeRegistryWrite } from "@/lib/operator-auth";
import { checkDispatchPolicy } from "@/lib/security-policy";
import { writeAuditLog } from "@/lib/audit";
import { authenticateAgentHeaders, getRemoteAgents, listAllAgentsUnscoped } from "@/lib/agent-registry";
import { selectAdapter } from "@/lib/dispatch/adapter-factory";
import {
  lookupSkillContract,
  buildSkillEvidence,
  parseTrustLevel,
  type SkillLookupResult,
} from "@/lib/dispatch/skill-lookup";
import { getAgentVersionPin } from "@/lib/skills/skill-sync-governance";
import {
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import type { DispatchTask } from "@/lib/dispatch/types";
import type { RegisteredAgent, RemoteAgentConfig } from "@/types";

export const dynamic = "force-dynamic";

const DispatchBodySchema = z.object({
  task_summary: z.string().min(1),
  to_agent: z.string().min(1),
  input: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().optional(),
  skill_name: z.string().optional(),
  /**
   * SKILLTRUST-01 (continued) / VAL-SKILL-018: explicit harness binding for
   * the requested skill name. When omitted the dispatcher treats the request
   * as ambiguous and refuses to silently select a harness.
   */
  source_harness: z.string().optional(),
  /**
   * SKILLTRUST-01 (continued) / VAL-SKILL-017: explicit version binding.
   * When supplied the dispatcher denies mismatched versions rather than
   * silently picking a different version.
   */
  skill_version: z.string().optional(),
  task_id: z.string().optional(),
  context_id: z.string().optional(),
  from_agent: z.string().optional(),
});

async function deriveDispatchActor(req: NextRequest | Request): Promise<
  | { ok: true; actorId: string }
  | { ok: false; response: Response }
> {
  const session = await authenticateUser(req).catch(() => null);
  if (session) {
    if (ROLE_RANK[session.role] < ROLE_RANK.operator) {
      return { ok: false, response: Response.json({ ok: false, error: "insufficient permissions", code: "FORBIDDEN" }, { status: 403 }) };
    }
    return { ok: true, actorId: `user:${session.userId}` };
  }

  const agent = authenticateAgentHeaders(req.headers, req.headers?.get("x-agent-id") ?? undefined);
  if (agent) return { ok: true, actorId: `agent:${agent.id}` };

  if (authorizeRegistryWrite(req)) return { ok: true, actorId: "memroos" };

  return {
    ok: false,
    response: Response.json({ ok: false, error: "authentication required", code: "AUTH_REQUIRED" }, { status: 401 }),
  };
}

function agentToDispatchConfig(agent: RegisteredAgent, remote?: RemoteAgentConfig): RemoteAgentConfig {
  if (remote) return remote;

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    platform: agent.platform,
    protocol: agent.protocol,
    location: agent.location ?? "local",
    host: agent.host ?? "localhost",
    port: agent.port ?? 0,
    healthEndpoint: agent.healthEndpoint ?? "/health",
    tunnelUrl: agent.tunnelUrl ?? undefined,
    metadata: agent.metadata,
    skills: agent.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      tags: capability.tags,
      inputModes: ["text"],
      outputModes: ["text"],
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dispatchMemoryActor(actorId: string): MemoryUseActor {
  if (actorId.startsWith("agent:")) {
    return { id: actorId, role: "agent", capability: "dispatch" };
  }
  if (actorId.startsWith("user:")) {
    return { id: actorId, role: "operator", capability: "dispatch" };
  }
  return { id: actorId, role: "system", capability: "dispatch" };
}

function gateDispatchMemoryInput(
  db: ReturnType<typeof getDb>,
  input: unknown,
  actor: MemoryUseActor
): Record<string, unknown> | undefined {
  if (!isRecord(input)) return undefined;

  const memoryKeys = [
    "memory",
    "memories",
    "memory_context",
    "memoryContext",
    "context_pack",
    "contextPack",
  ];
  const next = { ...input };

  for (const key of memoryKeys) {
    const value = next[key];
    if (!Array.isArray(value)) continue;
    next[key] = filterAuthorizedMemoryItems(
      db,
      value,
      actor,
      "dispatch",
      extractMemoryLabelSnapshot,
      (item, index) => {
        if (isRecord(item) && (typeof item.id === "string" || typeof item.id === "number")) {
          return `dispatch:${key}:${item.id}`;
        }
        return `dispatch:${key}:${index}`;
      }
    );
  }

  return next;
}

export async function POST(req: NextRequest | Request) {
  const bodyRaw: unknown = await req.json().catch(() => null);

  const rateLimited = checkAuthRateLimit(req, "dispatch", 20);
  if (rateLimited) return rateLimited;

  const parsed = DispatchBodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; "), code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const actor = await deriveDispatchActor(req);
  if (!actor.ok) return actor.response;

  const priority = parsed.data.priority != null ? Number(parsed.data.priority) : 5;
  if (priority < 1 || priority > 9) {
    return Response.json(
      { ok: false, error: "priority must be 1-9", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  // Unscoped: dispatch routes between agents on an agent-authenticated call.
  // There is no human viewer here, and a scoped lookup would silently drop
  // deliveries to agents the sender does not own.
  const registeredAgent = listAllAgentsUnscoped().find((a) => a.id === parsed.data.to_agent);
  if (!registeredAgent) {
    return Response.json(
      { ok: false, error: `Unknown agent: ${parsed.data.to_agent}`, code: "UNKNOWN_AGENT" },
      { status: 404 }
    );
  }
  const remoteAgent = getRemoteAgents().find((a) => a.id === parsed.data.to_agent);
  const agent = agentToDispatchConfig(registeredAgent, remoteAgent);

  const db = getDb();
  const from_agent = actor.actorId;
  const irisScan = scanIrisPreflight(parsed.data.task_summary);

  if (irisScan.blocked) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_blocked",
      target: "dispatch",
      detail: JSON.stringify(irisScan.findings.map((finding) => finding.ruleId)),
      severity: "high",
    });
    return Response.json(
      { ok: false, error: "Content blocked by security scanner", code: "CONTENT_BLOCKED" },
      { status: 403 }
    );
  }

  const scan = scanContent(parsed.data.task_summary);

  if (scan.blocked) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_blocked",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "high",
    });
    return Response.json(
      { ok: false, error: "Content blocked by security scanner", code: "CONTENT_BLOCKED" },
      { status: 403 }
    );
  }
  if (scan.matches.length > 0) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_flagged",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "medium",
    });
  }

  const policy = checkDispatchPolicy(from_agent, agent);
  if (!policy.allowed) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "policy_denied",
      target: "dispatch",
      detail: JSON.stringify({ code: policy.code, ...(policy.detail ?? {}) }),
      severity: "high",
    });
    return Response.json(
      {
        ok: false,
        error: policy.message ?? "Action denied by security policy",
        code: "POLICY_DENIED",
        detail: { code: policy.code },
      },
      { status: 403 }
    );
  }

  // Skill governance check (SKILL-03): look up registry before per-agent instruction fallback.
  // Fail closed: incomplete, disabled, or risk-unknown contracts deny dispatch.
  // No skill_name in request → fallback (normal dispatch proceeds unchanged).
  //
  // Phase 148 SKILLTRUST-02: optionally enforce a minimum trust tier via
  // MEMROOS_MIN_SKILL_TRUST_LEVEL env var. Accepted values:
  //   - 'unsigned' | 'signed' | 'verified' (case-insensitive)
  //   - unset / unknown → no threshold (backward-compatible fail-open for trust)
  //
  // Dispatch policy flag MEMROOS_REQUIRE_SIGNED_SKILLS=true (1/yes/on) restricts
  // dispatch to signed skills via an extra SQL predicate (VAL-SIGN-008).
  const skillName: string | undefined = parsed.data.skill_name;
  const minTrustLevel = parseTrustLevel(process.env["MEMROOS_MIN_SKILL_TRUST_LEVEL"]);
  const requireSignedRaw = (process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"] ?? "")
    .trim()
    .toLowerCase();
  const requireSigned =
    requireSignedRaw === "true" ||
    requireSignedRaw === "1" ||
    requireSignedRaw === "yes" ||
    requireSignedRaw === "on";
  // SKILLTRUST-04 / VAL-SKILL-031: when the requesting agent has a
  // version pin for this skill, the pinned (source_harness, version,
  // content_hash) tuple wins over the unpinned latest row. The pin
  // lookup happens after auth so an anonymous caller cannot probe
  // other agents' pins. agent_id prefix is stripped from from_agent
  // because agent identifiers in the audit chain are stored as
  // 'agent:<id>'.
  let pinned: {
    agent_id: string;
    source_harness: string;
    current_version: string;
    current_content_hash: string;
    skill_id: number | null;
  } | null = null;
  const fromAgentId = from_agent.startsWith("agent:")
    ? from_agent.slice("agent:".length)
    : from_agent;
  if (skillName && fromAgentId) {
    const agentPin = getAgentVersionPin(db, fromAgentId, skillName);
    if (agentPin) {
      // The pin does not store source_harness directly; the registry
      // row pointed at by skill_id is authoritative for the harness
      // identity. When skill_id is missing (legacy pin) we fall back
      // to looking up the row by name. The dispatch lookup will then
      // verify the pinned content_hash matches the registry row, so a
      // mismatched or missing row fails closed.
      let pinHarness: string | null = null;
      if (agentPin.skill_id !== null) {
        const regRow = db
          .prepare<[number], { source_harness: string }>(
            `SELECT source_harness FROM skill_registry WHERE id = ? LIMIT 1`
          )
          .get(agentPin.skill_id);
        pinHarness = regRow?.source_harness ?? null;
      }
      if (!pinHarness) {
        // Fall back to the most recent enabled+complete row with the
        // matching name. This is used only to derive source_harness
        // for the pin override — the dispatch lookup then enforces
        // the pinned content_hash.
        const namedRow = db
          .prepare<[string], { source_harness: string }>(
            `SELECT source_harness FROM skill_registry
              WHERE name = ?
                AND dispatch_status = 'enabled'
                AND completeness_pct = 100
              ORDER BY imported_at DESC
              LIMIT 1`
          )
          .get(skillName);
        pinHarness = namedRow?.source_harness ?? null;
      }
      if (pinHarness) {
        pinned = {
          agent_id: agentPin.agent_id,
          source_harness: pinHarness,
          current_version: agentPin.current_version,
          current_content_hash: agentPin.current_content_hash,
          skill_id: agentPin.skill_id,
        };
      }
    }
  }
  let skillContract: SkillLookupResult | null = lookupSkillContract(db, skillName, {
    minTrustLevel,
    requireSigned,
    sourceHarness: parsed.data.source_harness ?? null,
    version: parsed.data.skill_version ?? null,
    pinned,
  });
  // A pin is an immutable artifact identity, not a harness preference. Keep
  // this route-level guard in addition to the lookup's SQL-bound checks so a
  // future lookup implementation cannot turn version or hash drift into an
  // adapter invocation.
  if (
    pinned &&
    skillContract?.kind === "hit" &&
    (
      skillContract.skill.source_harness !== pinned.source_harness ||
      skillContract.skill.version !== pinned.current_version ||
      (skillContract.skill.content_hash ?? "").toLowerCase() !==
        pinned.current_content_hash.toLowerCase()
    )
  ) {
    skillContract = {
      kind: "denied",
      skill_name: skillName ?? "",
      source_harness: pinned.source_harness,
      reason: `Pinned skill identity mismatch for agent '${pinned.agent_id}'`,
      dispatch_status: skillContract.skill.dispatch_status,
      trust_level: skillContract.skill.trust_level,
    };
  }
  const skillEvidence = buildSkillEvidence(skillContract, minTrustLevel);

  // Ambiguity denial: same-name skills from multiple harnesses cannot be
  // silently selected. The caller must supply source_harness to dispatch.
  // VAL-SKILL-017 / VAL-SKILL-018.
  if (skillContract?.kind === "ambiguous") {
    writeAuditLog(db, {
      actor: from_agent,
      action: "policy_denied",
      target: "dispatch",
      detail: JSON.stringify({
        code: "SKILL_AMBIGUOUS",
        skill_name: skillContract.skill_name,
        reason: skillContract.reason,
        candidate_harnesses: skillContract.candidate_harnesses,
      }),
      severity: "high",
    });
    return Response.json(
      {
        ok: false,
        error: `Skill ambiguity: ${skillContract.reason}`,
        code: "SKILL_AMBIGUOUS",
        detail: skillEvidence,
      },
      { status: 409 }
    );
  }

  if (skillContract?.kind === "denied") {
    writeAuditLog(db, {
      actor: from_agent,
      action: "policy_denied",
      target: "dispatch",
      detail: JSON.stringify({
        code: "SKILL_GOVERNANCE_DENIED",
        skill_name: skillContract.skill_name,
        reason: skillContract.reason,
        dispatch_status: skillContract.dispatch_status,
        trust_level: skillContract.trust_level ?? null,
        required_trust_level: minTrustLevel ?? null,
      }),
      severity: "high",
    });
    return Response.json(
      {
        ok: false,
        error: `Skill governance denied: ${skillContract.reason}`,
        code: "SKILL_GOVERNANCE_DENIED",
        detail: skillEvidence,
      },
      { status: 403 }
    );
  }

  const task_id: string = parsed.data.task_id ?? crypto.randomUUID();
  const context_id: string = parsed.data.context_id ?? crypto.randomUUID();
  const dispatched_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, context_id, result)
     VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, 'pending', NULL, @context_id, NULL)
     ON CONFLICT(task_id) DO NOTHING`
  ).run({ task_id, from_agent, to_agent: parsed.data.to_agent, task_summary: scan.cleanContent, priority, context_id });

  const adapter = selectAdapter(agent);

  db.prepare(
    `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
     VALUES (@agent_id, 'trigger', @summary, @artifacts)`
  ).run({
    agent_id: from_agent,
    summary: `Dispatch: ${scan.cleanContent.slice(0, 120)}`,
    artifacts: JSON.stringify({ task_id, context_id, to_agent: parsed.data.to_agent, adapter: adapter.name, direction: "outbound" }),
  });

  const task: DispatchTask = {
    task_id,
    context_id,
    from_agent,
    to_agent: parsed.data.to_agent,
    task_summary: scan.cleanContent,
    input: gateDispatchMemoryInput(db, parsed.data.input, dispatchMemoryActor(from_agent)),
    priority,
    dispatched_at,
    skill_name: skillName,
    source_harness: parsed.data.source_harness ?? undefined,
    skill_version: parsed.data.skill_version ?? undefined,
  };
  const result = await adapter.dispatch(task, agent);

  // Merge skill governance evidence into dispatch result evidence
  const mergedEvidence = { ...(result.evidence ?? {}), ...skillEvidence };

  if (!result.accepted) {
    db.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agent_id, 'error', @summary, @artifacts)`
    ).run({
      agent_id: from_agent,
      summary: result.detail,
      artifacts: JSON.stringify({ task_id, adapter: adapter.name }),
    });
    db.prepare(
      `UPDATE hive_delegations SET status='failed', result=@result, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE task_id=@task_id`
    ).run({ result: result.detail, task_id });
    return Response.json(
      { ok: false, error: result.detail, code: "ADAPTER_REJECTED", detail: mergedEvidence },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, task_id, context_id, to_agent: parsed.data.to_agent, adapter: adapter.name, mode: result.mode, dispatched_at, evidence: mergedEvidence });
}
