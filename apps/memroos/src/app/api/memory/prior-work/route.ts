import crypto from "crypto";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { authenticateUser } from "@/lib/auth/session";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { authorizeRegistryWriteStrict } from "@/lib/operator-auth";
import { getDb } from "@/lib/db";
import { recallByKeyword, type RecallResult } from "@/lib/db-ingest";
import { queryGraphMemory, searchVectorMemory } from "@/lib/memory/backends";
import {
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  filterAuthorizedMessageRows,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import {
  assembleRecollectionContextPack,
  evaluateRecollectionTrigger,
  planRecollectionQueries,
  rankRecollectionCandidates,
  type RecollectionCandidate,
  type RecollectionContextPack,
  type RecollectionReason,
  type RecollectionReliance,
  type RecollectionTier,
  type RecollectionTrigger,
  type RecollectionTriggerReceipt,
} from "@/lib/memory/recollection";
import { recordMemoryTrace } from "@/lib/memory/trace-observability";

export const dynamic = "force-dynamic";

const SEARCH_TIERS: RecollectionTier[] = ["episodic", "vector", "graph"];
const MAX_QUERY_LENGTH = 500;
const MAX_ITEMS = 5;
const MAX_RESPONSE_BYTES = 2048;

interface PriorWorkInput {
  task: string;
  repo?: string;
  project?: string;
  entities?: string[];
  timing?: "before_plan" | "before_dispatch" | "before_tool_use" | "before_final";
  recency?: number;
  recency_days?: number;
  runId?: string;
  taskId?: string | null;
  enabled?: boolean;
  candidateProjectIds?: string[];
  crossProjectAllowlist?: string[];
}

interface TierStatus {
  status: "ok" | "empty" | "degraded" | "unavailable";
  count: number;
}

interface DigestItem {
  title: string;
  one_liner: string;
  belief_stage: "bronze_raw_source" | "silver_candidate_claim" | "gold_operational_truth";
  age: number;
  salience: number;
  fetch_ref: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function asBody(value: unknown): PriorWorkInput | null {
  if (!isRecord(value)) return null;
  const task = asString(value.task) ?? asString(value.taskText);
  if (!task) return null;
  const timing = value.timing;
  const validTiming = timing === "before_plan" || timing === "before_dispatch" || timing === "before_tool_use" || timing === "before_final"
    ? timing
    : undefined;
  const entityValues = Array.isArray(value.entities)
    ? value.entities
    : typeof value.entity === "string"
      ? [value.entity]
      : [];
  const entities = entityValues
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 20);
  return {
    task: task.slice(0, MAX_QUERY_LENGTH),
    repo: asString(value.repo)?.slice(0, 200),
    project: asString(value.project)?.slice(0, 120),
    entities,
    timing: validTiming,
    recency: asNumber(value.recency),
    recency_days: asNumber(value.recency_days),
    runId: asString(value.runId)?.slice(0, 200),
    taskId: typeof value.taskId === "string" ? value.taskId.slice(0, 200) : null,
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
    candidateProjectIds: Array.isArray(value.candidateProjectIds)
      ? value.candidateProjectIds.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 20)
      : undefined,
    crossProjectAllowlist: Array.isArray(value.crossProjectAllowlist)
      ? value.crossProjectAllowlist.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 20)
      : undefined,
  };
}

function externalItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const key of ["results", "memories", "data"]) {
    if (Array.isArray(raw[key])) return raw[key] as unknown[];
  }
  return [];
}

function graphItems(raw: unknown): unknown[] {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return [];
  return raw.results.flatMap((result) => {
    if (!isRecord(result) || !Array.isArray(result.data)) return [];
    return result.data;
  });
}

function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  for (const key of ["memory", "content", "text", "body", "summary", "description"]) {
    const text = asString(value[key]);
    if (text) return text;
  }
  return "";
}

function idFrom(value: unknown, tier: RecollectionTier, index: number): string {
  if (isRecord(value)) {
    for (const key of ["id", "memory_id", "uuid", "key"]) {
      const id = asString(value[key]);
      if (id) return `${tier}:${id}`;
    }
  }
  return `${tier}:${index}`;
}

function metadataFrom(value: unknown): Record<string, string | number | boolean | null> {
  if (!isRecord(value) || !isRecord(value.metadata)) return {};
  return Object.fromEntries(
    Object.entries(value.metadata).filter(([, entry]) =>
      entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
    )
  ) as Record<string, string | number | boolean | null>;
}

function candidateFromExternal(value: unknown, tier: RecollectionTier, index: number): RecollectionCandidate | null {
  const text = textFrom(value);
  if (!text) return null;
  const record = isRecord(value) ? value : {};
  const metadata = metadataFrom(value);
  const observedAt = asString(record.created_at) ?? asString(record.createdAt) ?? asString(record.timestamp)
    ?? asString(metadata.createdAt) ?? asString(metadata.timestamp);
  const importance = asNumber(record.importance) ?? asNumber(metadata.importance) ?? asNumber(record.salience) ?? asNumber(metadata.salience);
  const relevance = asNumber(record.score) ?? asNumber(record.similarity) ?? asNumber(metadata.score);
  const stage = asString(metadata.beliefStage) ?? asString(metadata.belief_stage);
  const beliefStage = stage === "bronze_raw_source" || stage === "gold_operational_truth" || stage === "silver_candidate_claim"
    ? stage
    : undefined;
  return {
    id: idFrom(value, tier, index),
    text,
    content: text,
    tier,
    relevance,
    importance,
    salience: asNumber(record.salience) ?? asNumber(metadata.salience),
    priorUsefulness: asNumber(record.priorUsefulness) ?? asNumber(metadata.priorUsefulness),
    observedAt,
    updatedAt: asString(record.updated_at) ?? asString(record.updatedAt),
    sourceUpdatedAt: asString(metadata.sourceUpdatedAt),
    sourceStale: metadata.sourceStale === true,
    beliefStage,
    projectId: asString(record.project) ?? asString(metadata.project) ?? undefined,
    authorization: "allowed",
    metadata,
    provenance: `${tier}:backend`,
  };
}

function lexicalRelevance(task: string, text: string): number {
  const taskTokens = new Set(task.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []);
  const contentTokens = new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []);
  if (taskTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of taskTokens) if (contentTokens.has(token)) overlap += 1;
  return clamp01(overlap / taskTokens.size);
}

function actorFor(agent: { id: string } | null, session: { userId: string; role: string; tenantId: string } | null): MemoryUseActor {
  if (agent) return { id: agent.id, role: "agent", capability: "memory_prior_work" };
  const role = session?.role === "admin" || session?.role === "operator" || session?.role === "reviewer" ? session.role : "operator";
  return { id: session?.userId ?? "prior-work-operator", role, capability: "memory_prior_work", tenantId: session?.tenantId };
}

async function searchTier(
  db: ReturnType<typeof getDb>,
  tier: RecollectionTier,
  query: string,
  limit: number,
  actor: MemoryUseActor,
): Promise<RecollectionCandidate[]> {
  if (tier === "episodic") {
    const rows = recallByKeyword(db, query, limit) as RecallResult[];
    const authorized = filterAuthorizedMessageRows(db, rows, actor, "recall");
    return authorized.map((row) => ({
      id: `episodic:${row.id}`,
      text: row.snippet,
      content: row.snippet,
      tier,
      projectId: row.project || undefined,
      relevance: lexicalRelevance(query, row.snippet),
      importance: 0.5,
      observedAt: row.timestamp,
      authorization: "allowed",
      beliefStage: "silver_candidate_claim",
      provenance: `messages:${row.id}`,
    }));
  }

  const raw = tier === "vector" ? await searchVectorMemory(query, limit) : await queryGraphMemory(query, limit);
  const values = tier === "graph" ? graphItems(raw) : externalItems(raw);
  const authorized = filterAuthorizedMemoryItems(
    db,
    values,
    actor,
    "memory_search",
    (item) => extractMemoryLabelSnapshot(item),
    (item, index) => `${tier}:${idFrom(item, tier, index)}`,
  );
  return authorized.flatMap((item, index) => {
    const candidate = candidateFromExternal(item, tier, index);
    if (!candidate) return [];
    candidate.relevance = candidate.relevance ?? lexicalRelevance(query, candidateText(candidate));
    return [candidate];
  });
}

function candidateText(candidate: RecollectionCandidate): string {
  return candidate.text ?? candidate.content ?? "";
}

function mapTriggerReason(trigger: RecollectionTrigger): RecollectionReason {
  switch (trigger) {
    case "entity_rich_task": return "task_has_stable_entities";
    case "source_reference":
    case "source_changed": return "task_has_source_ref";
    case "unresolved_handoff": return "project_has_recent_handoff";
    case "operator_reask":
    case "rediscovered_fact_risk": return "rediscovery_risk";
    case "high_salience_recent_fact": return "task_has_recency_ref";
    case "final_answer_citation_gap": return "explicit_memory_request";
    case "explicit_memory_request": return "explicit_memory_request";
  }
}

function digestTitle(candidate: RecollectionCandidate): string {
  const title = candidate.metadata?.title;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : `Prior ${candidate.tier} work`;
}

function digestOneLiner(candidate: RecollectionCandidate): string {
  const oneLiner = candidate.metadata?.one_liner ?? candidate.metadata?.oneLiner;
  return typeof oneLiner === "string" && oneLiner.trim()
    ? oneLiner.trim().replace(/\s+/g, " ").slice(0, 160)
    : `Bounded ${candidate.tier} recollection matched the requested topic.`;
}

function ageDays(candidate: RecollectionCandidate, now: number): number {
  const raw = candidate.observedAt ?? candidate.updatedAt;
  const timestamp = raw === undefined ? NaN : new Date(raw).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 86_400_000)) : 0;
}

function digestFromPack(pack: RecollectionContextPack, ranked: RecollectionCandidate[], now: number): DigestItem[] {
  const byId = new Map(ranked.map((candidate) => [candidate.id, candidate]));
  return pack.entries.slice(0, MAX_ITEMS).flatMap((entry) => {
    const candidate = byId.get(entry.id);
    if (!candidate) return [];
    const beliefStage = candidate.beliefStage ?? "silver_candidate_claim";
    return [{
      title: digestTitle(candidate),
      one_liner: digestOneLiner(candidate),
      belief_stage: beliefStage,
      age: ageDays(candidate, now),
      salience: Number(clamp01(candidate.salience ?? candidate.importance ?? entry.score).toFixed(3)),
      fetch_ref: `memory://prior-work/${encodeURIComponent(candidate.id)}`,
    }];
  });
}

function fitDigest(items: DigestItem[], headline: string): { items: DigestItem[]; truncated: boolean } {
  let fitted = items.slice(0, MAX_ITEMS);
  let truncated = items.length > fitted.length;
  while (JSON.stringify({ headline, items: fitted }).length > MAX_RESPONSE_BYTES && fitted.length > 0) {
    fitted = fitted.slice(0, -1);
    truncated = true;
  }
  return { items: fitted, truncated };
}

function tierStatusReceipt(statuses: Record<string, TierStatus>): Record<string, TierStatus> {
  return Object.fromEntries(SEARCH_TIERS.map((tier) => [tier, statuses[tier] ?? { status: "unavailable", count: 0 }]));
}

function traceTiming(timing: PriorWorkInput["timing"]): "before_plan" | "before_tool" | "before_final" {
  if (timing === "before_final") return "before_final";
  if (timing === "before_tool_use" || timing === "before_dispatch") return "before_tool";
  return "before_plan";
}

function recordProbeTrace(args: {
  db: ReturnType<typeof getDb>;
  body: PriorWorkInput;
  agentId: string | null;
  tenantId: string;
  decision: "search_required" | "search_skipped" | "search_failed";
  trigger: RecollectionTriggerReceipt;
  reasons: RecollectionReason[];
  skipReason: string | null;
  ranked: ReturnType<typeof rankRecollectionCandidates>;
  pack: RecollectionContextPack | null;
  statuses: Record<string, TierStatus>;
  truncated: boolean;
  reasonCode?: string;
}): void {
  const injectedIds = new Set(args.pack?.entries.map((entry) => entry.id) ?? []);
  const injected = args.ranked.filter((candidate) => injectedIds.has(candidate.id)).map((candidate) => ({
    id: candidate.id,
    tier: candidate.tier === "qmd_source" ? "qmd" : candidate.tier,
    beliefStage: candidate.beliefStage ?? "silver_candidate_claim",
    reliance: (candidate.beliefStage === "gold_operational_truth" ? "direct_truth" : candidate.beliefStage === "bronze_raw_source" ? "source_evidence_only" : "caveated_claim") as RecollectionReliance,
    score: candidate.score,
  }));
  const ignored = args.ranked.filter((candidate) => !injectedIds.has(candidate.id)).map((candidate) => ({
    id: candidate.id,
    reason: candidate.ignoredReason === "policy_denied" ? "policy_denied" as const : "below_threshold" as const,
    score: candidate.score,
  }));
  recordMemoryTrace(args.db, {
    tenantId: args.tenantId,
    taskId: args.body.taskId ?? null,
    agentId: args.agentId,
    runId: args.body.runId ?? `prior-work:${crypto.randomUUID()}`,
    causalPath: {
      contextAssembly: "prior_work_probe",
      retrievalQuery: args.body.task,
      // Receipts deliberately carry ids and scores only. Candidate text never
      // crosses into the durable trace or efficiency event.
      retrievedCandidates: args.ranked.map((candidate) => ({ id: candidate.id, content: "", score: candidate.score })),
      policyFilters: args.ranked.map((candidate) => ({
        id: candidate.id,
        decision: injectedIds.has(candidate.id) ? "allow" as const : candidate.ignoredReason === "policy_denied" ? "deny" as const : "redact" as const,
        reason: injectedIds.has(candidate.id) ? "threshold_and_policy_allowed" : candidate.ignoredReason ?? "below_threshold",
      })),
      retrievalTokensUsed: 0,
      timingGate: traceTiming(args.body.timing),
      promptInclusion: false,
      recollection: {
        decision: args.decision,
        timing: args.trigger.timing === "before_dispatch" ? "before_tool_use" : args.trigger.timing,
        reasons: args.reasons,
        skipReason: args.skipReason,
        injected,
        ignored,
        tiersSearched: SEARCH_TIERS,
        tierStatuses: tierStatusReceipt(args.statuses),
        truncated: args.truncated,
        reasonCode: args.reasonCode,
      },
    },
  });
}

export async function POST(request: Request) {
  const rateLimited = checkAuthRateLimit(request, "memory-prior-work", 30);
  if (rateLimited) return rateLimited;

  const body = asBody(await request.json().catch(() => null));
  if (!body) return Response.json({ ok: false, error: "task is required" }, { status: 400 });

  const agentIdHint = request.headers.get("x-agent-id") ?? undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  const session = agent ? null : await authenticateUser(request).catch(() => null);
  const operatorAuthorized = !agent && !session && authorizeRegistryWriteStrict(request);
  if (!agent && !session && !operatorAuthorized) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const actor = actorFor(agent, session);
  const project = body.project;
  const sourceRefs = body.repo ? [{ id: body.repo, kind: "other" as const }] : [];
  const trigger = evaluateRecollectionTrigger({
    timing: body.timing ?? "before_plan",
    taskText: body.task,
    projectId: project,
    sourceRefs,
    entities: body.entities,
    enabled: body.enabled,
    candidateProjectIds: body.candidateProjectIds,
    crossProjectAllowlist: body.crossProjectAllowlist,
  });
  const triggerReasons = trigger.triggers.map(mapTriggerReason).filter((reason, index, all) => all.indexOf(reason) === index);
  const statuses: Record<string, TierStatus> = {};

  if (trigger.action === "skip") {
    const headline = "No prior work found (search skipped)";
    const pack: RecollectionContextPack = {
      injected: [],
      ignored: [],
      entries: [],
      context: "",
      receipt: {
        action: "skip",
        timing: trigger.timing,
        triggerScore: trigger.score,
        triggers: trigger.triggers,
        authorization: trigger.authorization,
        reason: trigger.reason,
        retrievedCount: 0,
        injectedCount: 0,
        ignoredCount: 0,
        queryIds: [],
        injectedIds: [],
        ignored: [],
        telemetry: { efftel01RetrievalBeforeWork: false, efftel04RediscoveredFactGuard: false, efftel05OperatorReaskGuard: false },
      },
    };
    recordProbeTrace({
      db,
      body,
      agentId: agent?.id ?? null,
      tenantId: session?.tenantId ?? "default-tenant",
      decision: "search_skipped",
      trigger,
      reasons: triggerReasons.length > 0 ? triggerReasons : ["low_memory_need", "no_stable_entities"],
      skipReason: trigger.skipReason,
      ranked: [],
      pack,
      statuses,
      truncated: false,
      reasonCode: trigger.skipReason ?? "low_signal",
    });
    return Response.json({
      ok: true,
      decision: "search_skipped",
      headline,
      items: [],
      skip_reason_code: trigger.skipReason ?? "low_signal",
      receipt: { action: "skip", reason_code: trigger.skipReason ?? "low_signal", tiers_searched: [] },
    });
  }

  const plans = planRecollectionQueries({
    taskText: body.task,
    projectId: project,
    sourceRefs,
    decision: trigger,
    tiers: SEARCH_TIERS,
    recencyDays: body.recency_days ?? body.recency,
    maxQueries: 3,
    maxTermsPerQuery: 8,
  });
  const query = plans.map((plan) => plan.query).filter(Boolean).join(" ").slice(0, MAX_QUERY_LENGTH) || body.task;
  const results = await Promise.all(SEARCH_TIERS.map(async (tier) => {
    try {
      const candidates = await searchTier(db, tier, query, 8, actor);
      statuses[tier] = { status: candidates.length > 0 ? "ok" : "empty", count: candidates.length };
      return candidates;
    } catch {
      statuses[tier] = { status: "unavailable", count: 0 };
      return [];
    }
  }));
  const allCandidates = results.flat();
  const allowedProjects = new Set(trigger.allowedProjectIds);
  const candidates = allCandidates.filter((candidate) => {
    if (project) return candidate.projectId === project || (candidate.projectId ? allowedProjects.has(candidate.projectId) : false);
    if ((body.candidateProjectIds?.length ?? 0) > 0) return candidate.projectId ? allowedProjects.has(candidate.projectId) : false;
    return true;
  });
  const unavailableCount = SEARCH_TIERS.filter((tier) => statuses[tier]?.status === "unavailable").length;
  const allUnavailable = unavailableCount === SEARCH_TIERS.length;
  const degraded = unavailableCount > 0;
  const ranked = rankRecollectionCandidates(candidates, { now: new Date() });
  const effectiveReasons = degraded ? [...triggerReasons, "tier_degraded" as const] : triggerReasons;

  if (allUnavailable) {
    const failedTrigger: RecollectionTriggerReceipt = {
      ...trigger,
      reason: "All configured recollection tiers were unavailable; the probe failed open with a receipt.",
    };
    recordProbeTrace({
      db,
      body,
      agentId: agent?.id ?? null,
      tenantId: session?.tenantId ?? "default-tenant",
      decision: "search_failed",
      trigger: failedTrigger,
      reasons: ["all_tiers_unavailable"],
      skipReason: "all_tiers_unavailable",
      ranked,
      pack: null,
      statuses,
      truncated: false,
      reasonCode: "all_tiers_unavailable",
    });
    return Response.json({
      ok: true,
      decision: "search_failed",
      headline: `No prior work found (tiers searched: ${SEARCH_TIERS.join(", ")})`,
      items: [],
      receipt: {
        action: "search_failed",
        reason_code: "all_tiers_unavailable",
        tiers_searched: SEARCH_TIERS,
        tier_statuses: tierStatusReceipt(statuses),
        degraded: true,
      },
    });
  }

  const pack = assembleRecollectionContextPack({
    decision: trigger,
    plans,
    rankedCandidates: ranked,
    maxItems: MAX_ITEMS,
    maxChars: 2400,
    scoreThreshold: 0.62,
  });
  const rawItems = digestFromPack(pack, ranked, Date.now());
  const preliminaryHeadline = rawItems.length > 0
    ? `Related prior work exists: ${rawItems.length} items`
    : `No prior work found (tiers searched: ${SEARCH_TIERS.join(", ")})`;
  const fitted = fitDigest(rawItems, preliminaryHeadline);
  const headline = fitted.items.length > 0
    ? `Related prior work exists: ${fitted.items.length} items`
    : `No prior work found (tiers searched: ${SEARCH_TIERS.join(", ")})`;
  recordProbeTrace({
    db,
    body,
    agentId: agent?.id ?? null,
    tenantId: session?.tenantId ?? "default-tenant",
    decision: "search_required",
    trigger,
    reasons: effectiveReasons,
    skipReason: null,
    ranked,
    pack,
    statuses,
    truncated: fitted.truncated || pack.entries.length > fitted.items.length,
    reasonCode: degraded ? "tier_degraded" : undefined,
  });

  return Response.json({
    ok: true,
    decision: "search_required",
    headline,
    items: fitted.items,
    receipt: {
      action: "search",
      tiers_searched: SEARCH_TIERS,
      tier_statuses: tierStatusReceipt(statuses),
      degraded,
      truncated: fitted.truncated || pack.entries.length > fitted.items.length,
      reasons: effectiveReasons,
    },
  });
}
