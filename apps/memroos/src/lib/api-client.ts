"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLL_INTERVALS } from "./ui-constants";
import type { NocFilters, NocWorkspace } from "./noc-filters";
import type {
  HealthStatus,
  KnowledgeCollection,
  MemoryEntry,
  ApoCycleStats,
  ApoProposal,
  PaperclipFleetResponse,
  AgentProtocol,
  AgentStatus,
  RegisterAgentInput,
  RegisterAgentResult,
  RegisteredAgent,
  SimilarTaskResponse,
  ToolAttentionContextPack,
  ToolAttentionResponse,
} from "@/types";

export interface RegisterA2aAgentCardInput {
  cardUrl: string;
  source?: "adk" | "a2a" | "manual";
  requestedId?: string;
  issueApiKey?: boolean;
}

export interface CreateAgentOnboardingInviteInput {
  agentId?: string;
  name?: string;
  role?: string;
  platform?: RegisterAgentInput["platform"];
  protocol?: RegisterAgentInput["protocol"];
  ttlMinutes?: number;
  memroosUrl?: string;
  mcpUrl?: string;
  mcpTarget?: string;
  operatorKey?: string;
}

export interface AgentOnboardingInviteResult {
  ok: boolean;
  token: string;
  expiresAt: string;
  command: string;
  mcpUrl: string;
  timestamp: string;
}

export interface OrchestrationHilDecision {
  id: string;
  runId: string;
  taskSummary: string;
  selectedAgentId: string | null;
  correlationId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ResolveOrchestrationHilInput {
  id: string;
  decision: "approve" | "reject";
}

export interface MemoryTierHealth {
  tier: "vector" | "graph" | "episodic";
  backend: string;
  status: "up" | "degraded" | "down" | "not_configured";
  detail?: string;
  count?: number | null;
  lastWrite?: string | null;
}

export interface ContextSourceHealth {
  id: string;
  type: "qmd" | "gmail" | "spark" | "mem0" | "local-folder";
  status: "ok" | "stale" | "missing" | "degraded" | "disabled";
  enabled: boolean;
  lastRun: string | null;
  ageMinutes: number | null;
  documentCount: number;
  qmdCollection: string | null;
  lastIndexedMarker: string | null;
  lastError: string | null;
  repairHint: string;
  safeAnswerPolicy: "source_required" | "degrade_with_warning" | "optional";
}

export interface ContextHealthResponse {
  sources: ContextSourceHealth[];
  timestamp: string;
}

export function useContextSourceHealth() {
  return useQuery({
    queryKey: ["context", "health"],
    queryFn: () => fetchJSON<ContextHealthResponse>("/api/context/health"),
    refetchInterval: 60_000,
  });
}

export type NocPanelStatus = "live" | "empty" | "degraded" | "missing";

import type { MetricEnvelope, MetricScope, MetricStatus } from "@/lib/metric-status";

export type { MetricEnvelope, MetricScope, MetricStatus } from "@/lib/metric-status";

export interface OperationsNocPanel {
  status: NocPanelStatus;
  source: string;
  lastUpdated: string | null;
  warnings: string[];
}

export interface OperationsNocEfficiencyMetrics {
  totalEvents: number;
  retrievalEvents: number;
  retrievalUsedInFirstResponse: number;
  retrievalBeforeWorkRate: number | null;
  sourceReadEvents: number;
  repeatedSourceReads: number;
  tokenLedgerEvents: number;
  rawContextTokens: number;
  cachedTokens: number;
  totalTokens: number;
  rawContextTokenShare: number | null;
  operatorQuestions: number;
  operatorReasks: number;
  operatorReaskRate: number | null;
  memoryWrites: number;
  rediscoveredWrites: number;
  rediscoveredFactRate: number | null;
  recollection: {
    totalDecisions: number;
    searchRequired: number;
    searchSkipped: number;
    injectedMemories: number;
    ignoredCandidates: number;
    policyDeniedCandidates: number;
    belowThresholdCandidates: number;
    skipReasons: Record<string, number>;
    beliefStageCounts: {
      bronze_raw_source: number;
      silver_candidate_claim: number;
      gold_operational_truth: number;
    };
    relianceCounts: {
      direct_truth: number;
      caveated_claim: number;
      source_evidence_only: number;
    };
    latestDecisions: Array<{
      id: number;
      taskId: string | null;
      agentId: string | null;
      decision: "search_required" | "search_skipped";
      timing: string | null;
      reasons: string[];
      skipReason: string | null;
      createdAt: string;
    }>;
  };
  streams: {
    retrieval_trace: number;
    source_read: number;
    token_ledger: number;
    operator_question: number;
    memory_write: number;
  };
  lastUpdated: string | null;
}

export interface OperationsNocResponse {
  ok: boolean;
  filters: NocFilters & { since: string };
  generatedAt: string;
  metrics: {
    memoryRows: MetricEnvelope<number>;
    hiveActions: MetricEnvelope<number>;
    activeDispatches: MetricEnvelope<number>;
    failedWork: MetricEnvelope<number>;
    governanceEvents: MetricEnvelope<number>;
    enabledSkills: MetricEnvelope<number>;
    cronWarnings: MetricEnvelope<number>;
    localFootprint: MetricEnvelope<number>;
    efficiency: MetricEnvelope<OperationsNocEfficiencyMetrics>;
  };
  panels: Record<string, OperationsNocPanel> & {
    efficiency: OperationsNocPanel;
  };
  localFootprint?: unknown;
}

export interface MultiMemorySearchResult {
  id: string;
  tier: "vector" | "graph" | "episodic";
  title: string;
  content: string;
  source?: string;
  score?: number;
  metadata?: unknown;
}

export interface MultiMemorySearchTier {
  tier: "vector" | "graph" | "episodic";
  ok: boolean;
  count: number;
  error?: string;
  /** Truthful metric envelope for the tier (status, source, observedAt, scope, reason). */
  metric?: {
    value: number | null;
    status: string;
    source: string;
    observedAt: string | null;
    freshnessMs: number | null;
    scope: { window: string; workspace: string };
    reason: string | null;
  };
}

export interface MultiMemorySearchResponse {
  ok: boolean;
  query: string;
  tiers: MultiMemorySearchTier[];
  results: MultiMemorySearchResult[];
  timestamp: string;
}

export type MemoryInventoryCategoryId =
  | "vector_memory"
  | "ingested_message"
  | "consolidated_insight"
  | "episodic_write"
  | "graph_fact"
  | "knowledge_file";

export type MemoryInventoryStatus =
  | "live"
  | "zero"
  | "empty"
  | "stale"
  | "blocked"
  | "unavailable"
  | "degraded"
  | "error";

export interface TruthfulMetricEnvelope {
  value: number | null;
  status: MemoryInventoryStatus | string;
  source: string;
  observedAt: string | null;
  freshnessMs: number | null;
  scope: { window: string; workspace: string };
  reason: string | null;
}

export interface MemoryInventoryCategory {
  id: MemoryInventoryCategoryId;
  label: string;
  description: string;
  count: number | null;
  backend: string;
  sourceOfTruth: string;
  status: MemoryInventoryStatus;
  lastUpdated: string | null;
  warnings: string[];
  metric?: TruthfulMetricEnvelope;
}

export interface MemoryInventoryRow {
  id: string;
  category: MemoryInventoryCategoryId;
  label: string;
  content: string;
  backend: string;
  source: string;
  project: string | null;
  workspace: string | null;
  timestamp: string | null;
  securityLabel: {
    visibility: string | null;
    domain: string | null;
    sensitivity: string | null;
    policy: string | null;
  };
  consolidationState: "pending" | "consolidated" | "not_applicable" | "unknown";
  salienceScore: number | null;
  accessCount: number | null;
  evidencePointer: string | null;
  degradedReason: string | null;
  provenance: {
    sourceTable: string;
    sourceId: string | number;
    sourceTimestamp: string | null;
  };
}

export interface MemoryInventoryResponse {
  categories: MemoryInventoryCategory[];
  rows: MemoryInventoryRow[];
  filters: {
    categories: MemoryInventoryCategoryId[];
    backends: string[];
    agents: string[];
    projects: string[];
    sources: string[];
    workspaces: string[];
    consolidationStates: MemoryInventoryRow["consolidationState"][];
    degradedStates: MemoryInventoryStatus[];
  };
  definitions: Record<MemoryInventoryCategoryId, string>;
  timestamp: string;
}

export interface MemoryEvalRunSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  p95LatencyMs: number;
  tierFailures: Array<"vector" | "graph" | "episodic" | "qmd">;
}

export interface MemoryEvalLatestResponse {
  ok: boolean;
  run: {
    id: string;
    mode: "canary" | "gold" | "full";
    status: "passed" | "failed";
    startedAt: string;
    completedAt: string;
    summary: MemoryEvalRunSummary;
    results: unknown[];
  } | null;
  timestamp: string;
}

export interface SecurityReportResponse {
  summary: {
    status: "clear" | "watch" | "attention";
    securityEvents: number;
    auditEvents?: number;
    highSeverity: number;
    mediumSeverity: number;
    blockedAttempts: number;
    lastEventAt: string | null;
    lastAuditAt?: string | null;
    topActors: Array<{ actor: string; count: number }>;
  };
  controls: Array<{ id: string; label: string; status: string }>;
  timeline: Array<{
    id: number;
    actor: string;
    action: string;
    target: string;
    detail: string | null;
    severity: string;
    timestamp: string;
    blocked: boolean;
  }>;
  auditActivity?: Array<{
    id: number;
    actor: string;
    action: string;
    target: string;
    detail: string | null;
    severity: string;
    timestamp: string;
    blocked: boolean;
    securityEvent: boolean;
  }>;
  timestamp: string;
}

export interface SecurityCapabilitiesPoliciesView {
  defaultMode: string;
  dispatchPolicy: string;
  a2aPolicy: string;
  memoryWritePolicy: string;
  metric: MetricEnvelope<number>;
}

export interface SecurityCapabilitiesSummaryMetrics {
  totalAgents: MetricEnvelope<number>;
  strictAgents: MetricEnvelope<number>;
  standardAgents: MetricEnvelope<number>;
  permissiveAgents: MetricEnvelope<number>;
  agentsWithSecurityCapabilities: MetricEnvelope<number>;
}

export interface SecurityCapabilitiesResponse {
  summary: {
    totalAgents: number;
    strictAgents: number;
    standardAgents: number;
    permissiveAgents: number;
    agentsWithSecurityCapabilities: number;
    metrics: SecurityCapabilitiesSummaryMetrics;
  };
  policies: SecurityCapabilitiesPoliciesView;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    protocol: AgentProtocol;
    status: AgentStatus;
    securityMode: "strict" | "standard" | "permissive";
    securityCapabilities: string[];
    readinessScore: number;
    lastHeartbeat: string | null;
    liveness: AgentLivenessObservation;
  }>;
  timestamp: string;
}

export interface ModelRoutingRecommendation {
  provider: string;
  model: string;
  label: string;
  strengths: string[];
  taskTypes: string[];
  taskType: string;
  strategy: "balanced" | "cost" | "quality" | "latency";
  score: number;
  observations: number;
  successRate: number | null;
  averageQuality: number | null;
  averageLatencyMs: number | null;
}

export interface ModelRoutingDashboardResponse {
  events: Array<{
    id: number;
    taskType: string;
    agentId: string | null;
    provider: string;
    model: string;
    strategy: string;
    latencyMs: number | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
    success: boolean;
    qualityScore: number | null;
    contextTags: string[];
    promptHash: string | null;
    error: string | null;
    createdAt: string;
  }>;
  summary: {
    totalRuns: number;
    successfulRuns: number;
    successRate: number | null;
    averageQuality: number | null;
    averageLatencyMs: number | null;
  };
  timestamp: string;
}

export type SkillWorkflowStage = "agent-limited" | "general" | "enterprise";
export type SkillReviewStatus =
  | "unreviewed"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "enterprise-ready";

export interface SkillWorkflowItem {
  name: string;
  title: string;
  path: string;
  description: string;
  bodyPreview: string;
  stage: SkillWorkflowStage;
  reviewStatus: SkillReviewStatus;
  reviewNotes: string;
  draftBody: string;
  changeReason: string;
  owner: string;
  tags: string[];
  health: "ready" | "coverage-gap" | "needs-source" | "stale";
  lastActivityAt: string | null;
  maturityScore: number;
  updatedAt: string | null;
  approvedAt: string | null;
  usageCount: number;
}

export interface SkillReviewInput {
  skillName: string;
  action: "save-draft" | "request-changes" | "approve-general" | "promote-enterprise";
  notes?: string;
  draftBody?: string;
  changeReason?: string;
}

export interface ModelRoutingEvalsResponse {
  dimensions: Array<{ id: string; label: string; rubric: string }>;
  referenceTasks: Array<{ id: string; taskType: string; strategy: string }>;
  summary: ModelRoutingDashboardResponse["summary"];
  timestamp: string;
}

export interface CacheStatsResponse {
  stats: {
    entries: number;
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
    memoryBytes: number;
    maxEntries: number;
  };
  performance: {
    ok: boolean;
    routes: Array<{
      route: string;
      p95Ms: number;
      budgetMs: number;
      status: "pass" | "fail";
    }>;
  };
  timestamp: string;
}

export interface EvalConfigResponse {
  config: import("@/lib/evals/types").EvalConfig;
  yaml: string;
  timestamp: string;
}

export interface EvalRunResponse {
  ok: boolean;
  result: import("@/lib/evals/types").EvalRunResult;
  timestamp: string;
}

export interface EvalHistoryResponse {
  runs: Array<import("@/lib/evals/types").EvalRunResult & {
    examples: import("@/lib/evals/types").EvalDriftGuardResult["examples"];
  }>;
  timestamp: string;
}

export interface SealProposal {
  id: string;
  traceId: string;
  runId: string;
  agentId: string;
  proposalType: string;
  status: "pending" | "approved" | "rejected" | "applied" | "rolled_back";
  diff: Record<string, unknown>;
  rationale: string;
  forecastWDelta: number;
  baselineW: number;
  baselineRunId: string;
  baselineLayers: Record<string, { score: number; weight: number }>;
  createdAt: string;
  updatedAt: string;
  /** ID of the latest behavioral eval job for this proposal, if any. */
  latestJobId?: string | null;
  /** Status of the latest behavioral eval job, if any. */
  latestJobStatus?: EvalJobStatus | null;
}

export interface SealAuditLogEntry {
  id: string;
  proposalId: string;
  event: "proposed" | "approved" | "rejected" | "apply_started" | "apply_succeeded" | "apply_failed" | "rolled_back";
  baselineW: number | null;
  postApplyW: number | null;
  deltaL1: number | null;
  deltaL2: number | null;
  deltaL3: number | null;
  deltaComposite: number | null;
  detail: Record<string, unknown>;
  timestamp: string;
}

export interface SealProposalsResponse {
  proposals: SealProposal[];
  timestamp: string;
}

export interface SealProposalResponse {
  proposal: SealProposal;
  timestamp: string;
}

export interface SealAuditLogResponse {
  entries: SealAuditLogEntry[];
  timestamp: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function mutateJSON<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `${res.status}`;
    throw new Error(`${url}: ${detail}`);
  }
  return res.json();
}

export function useOperationsNoc(filters: NocFilters = { window: "24h", workspace: "all" }) {
  const params = new URLSearchParams();
  params.set("window", filters.window);
  params.set("workspace", filters.workspace);
  return useQuery({
    queryKey: ["operations", "noc", filters.window, filters.workspace],
    queryFn: () => fetchJSON<OperationsNocResponse>(`/api/operations/noc?${params}`),
    refetchInterval: POLL_INTERVALS.health,
  });
}

export interface AgentLivenessObservation {
  state: "live" | "stale" | "never" | "missing" | "error";
  observedAt: string | null;
  freshnessMs: number | null;
  source: string;
  reason: string;
}

export interface AgentWithLiveness extends RegisteredAgent {
  liveness: AgentLivenessObservation;
}

export interface AgentsSummaryView {
  total: import("@/lib/metric-status").MetricEnvelope<number>;
  active: import("@/lib/metric-status").MetricEnvelope<number>;
  idle: import("@/lib/metric-status").MetricEnvelope<number>;
  dormant: import("@/lib/metric-status").MetricEnvelope<number>;
  error: import("@/lib/metric-status").MetricEnvelope<number>;
}

export interface AgentsProtocolView {
  rest: import("@/lib/metric-status").MetricEnvelope<number>;
  a2a: import("@/lib/metric-status").MetricEnvelope<number>;
  ui: import("@/lib/metric-status").MetricEnvelope<number>;
  local: import("@/lib/metric-status").MetricEnvelope<number>;
}

export interface AgentsReadinessView {
  average: import("@/lib/metric-status").MetricEnvelope<number | null>;
  withCapabilities: import("@/lib/metric-status").MetricEnvelope<number>;
}

export interface AgentsLocalRuntimeView {
  ok: boolean;
  metric: import("@/lib/metric-status").MetricEnvelope<number>;
}

export interface AgentsResponse {
  agents: AgentWithLiveness[];
  summary: AgentsSummaryView;
  liveness: import("@/lib/metric-status").MetricEnvelope<number>;
  readiness: AgentsReadinessView;
  protocols: AgentsProtocolView;
  localRuntime: AgentsLocalRuntimeView;
  timestamp: string;
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => fetchJSON<AgentsResponse>("/api/agents"),
    refetchInterval: POLL_INTERVALS.agents,
  });
}

export function useRegisteredAgents() {
  return useAgents();
}

export function registerAgent(input: RegisterAgentInput) {
  return mutateJSON<RegisterAgentResult & { ok: boolean; timestamp: string }>(
    "/api/agents/register",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function registerA2aAgentCard(input: RegisterA2aAgentCardInput) {
  return mutateJSON<RegisterAgentResult & { ok: boolean; timestamp: string }>(
    "/api/a2a/agents/register",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function createAgentOnboardingInvite(input: CreateAgentOnboardingInviteInput) {
  const { operatorKey, ...body } = input;
  return mutateJSON<AgentOnboardingInviteResult>("/api/onboarding/invite", {
    method: "POST",
    headers: operatorKey ? { "x-memroos-operator-key": operatorKey } : undefined,
    body: JSON.stringify(body),
  });
}

export function deregisterAgent(agentId: string) {
  return mutateJSON<{ ok: boolean; agent: RegisteredAgent; timestamp: string }>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE" }
  );
}

export function useRegisterAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useRegisterA2aAgentCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerA2aAgentCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useCreateAgentOnboardingInviteMutation() {
  return useMutation({
    mutationFn: createAgentOnboardingInvite,
  });
}

export function useDeregisterAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deregisterAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useTokenStats() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: () =>
      fetchJSON<{ stats: Record<string, unknown>; timestamp: string }>(
        "/api/tokens"
      ),
    refetchInterval: POLL_INTERVALS.tokens,
    retry: false,
  });
}

export function useModelUsage(since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return useQuery({
    queryKey: ["model-usage", since ?? "all"],
    queryFn: () =>
      fetchJSON<{ usage: import("@/lib/parsers").ModelUsage; timestamp: string }>(
        `/api/model-usage${qs}`
      ),
    refetchInterval: POLL_INTERVALS.tokens,
  });
}

export function useEvalConfig() {
  return useQuery({
    queryKey: ["evals", "config"],
    queryFn: () => fetchJSON<EvalConfigResponse>("/api/evals/config"),
    staleTime: 15_000,
  });
}

export function updateEvalConfig(config: import("@/lib/evals/types").EvalConfig) {
  return mutateJSON<EvalConfigResponse & { ok: boolean }>("/api/evals/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export function useUpdateEvalConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateEvalConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evals"] });
    },
  });
}

export function runEvalTrace(trace: import("@/lib/evals/types").AgentEvalTrace) {
  return mutateJSON<EvalRunResponse>("/api/evals/run", {
    method: "POST",
    body: JSON.stringify({ trace }),
  });
}

export function useRunEvalTraceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runEvalTrace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evals", "history"] });
    },
  });
}

export function useEvalHistory(limit = 25) {
  return useQuery({
    queryKey: ["evals", "history", limit],
    queryFn: () => fetchJSON<EvalHistoryResponse>(`/api/evals/history?limit=${limit}`),
    refetchInterval: 30_000,
  });
}

export function useSealProposals(status?: SealProposal["status"]) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["seal", "proposals", status ?? "all"],
    queryFn: () => fetchJSON<SealProposalsResponse>(`/api/seal/proposals${qs ? `?${qs}` : ""}`),
    refetchInterval: 30_000,
  });
}

export function useSealProposal(id: string | null) {
  return useQuery({
    queryKey: ["seal", "proposal", id],
    queryFn: () => fetchJSON<SealProposalResponse>(`/api/seal/proposals/${encodeURIComponent(id as string)}`),
    enabled: Boolean(id),
  });
}

export function useSealAuditLog(proposalId?: string) {
  const params = new URLSearchParams();
  if (proposalId) params.set("proposalId", proposalId);
  const qs = params.toString();
  return useQuery({
    queryKey: ["seal", "audit", proposalId ?? "all"],
    queryFn: () => fetchJSON<SealAuditLogResponse>(`/api/seal/audit${qs ? `?${qs}` : ""}`),
    refetchInterval: 30_000,
  });
}

function decideSealProposal(input: { id: string; action: "approve" | "reject" | "apply"; reasoning?: string }) {
  return mutateJSON<SealProposalResponse & { ok: boolean }>(`/api/seal/proposals/${encodeURIComponent(input.id)}`, {
    method: "POST",
    body: JSON.stringify({ action: input.action, reasoning: input.reasoning }),
  });
}

export function useApproveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reasoning?: string }) => decideSealProposal({ ...input, action: "approve" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seal"] }),
  });
}

export function useRejectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reasoning?: string }) => decideSealProposal({ ...input, action: "reject" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seal"] }),
  });
}

export function useApplyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reasoning?: string }) => decideSealProposal({ ...input, action: "apply" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seal"] }),
  });
}

export function useMemory(source?: string, query?: string) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (query) params.set("q", query);
  return useQuery({
    queryKey: ["memory", source, query],
    queryFn: () =>
      fetchJSON<{
        claude?: MemoryEntry[];
        mem0?: unknown;
        timestamp: string;
      }>(`/api/memory?${params}`),
    refetchInterval: POLL_INTERVALS.memory,
  });
}

export function useMultiMemorySearch(query: string, limit = 8) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));
  return useQuery({
    queryKey: ["memory", "multi-search", query, limit],
    queryFn: () => fetchJSON<MultiMemorySearchResponse>(`/api/memory/multi-search?${params}`),
    enabled: query.trim().length > 0,
    staleTime: 15_000,
  });
}

export interface MemoryInventoryParams {
  category?: MemoryInventoryCategoryId | "all";
  backend?: string;
  agent?: string;
  project?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  label?: string;
  consolidationState?: MemoryInventoryRow["consolidationState"] | "all";
  degraded?: MemoryInventoryStatus | "all";
}

export function useMemoryInventory(params: MemoryInventoryParams = {}) {
  const search = new URLSearchParams();
  if (params.category && params.category !== "all") search.set("category", params.category);
  if (params.backend) search.set("backend", params.backend);
  if (params.agent) search.set("agent", params.agent);
  if (params.project) search.set("project", params.project);
  if (params.source) search.set("source", params.source);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  if (params.label) search.set("label", params.label);
  if (params.consolidationState && params.consolidationState !== "all") search.set("consolidationState", params.consolidationState);
  if (params.degraded && params.degraded !== "all") search.set("degraded", params.degraded);
  const query = search.toString();

  return useQuery({
    queryKey: ["memory", "inventory", params],
    queryFn: () => fetchJSON<MemoryInventoryResponse>(`/api/memory-inventory${query ? `?${query}` : ""}`),
    refetchInterval: POLL_INTERVALS.memory,
  });
}

export function useKnowledge() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: () =>
      fetchJSON<{
        collections: KnowledgeCollection[];
        totalDocs: number;
        totalFiles: number;
        totalCollections: number;
        timestamp: string;
      }>("/api/knowledge"),
    refetchInterval: POLL_INTERVALS.knowledge,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () =>
      fetchJSON<{ services: HealthStatus[]; timestamp: string }>("/api/health"),
    refetchInterval: POLL_INTERVALS.health,
  });
}

export function useRemoteAgents() {
  return useQuery({
    queryKey: ["remote-agents"],
    queryFn: () =>
      fetchJSON<{
        agents: Array<{
          id: string;
          name: string;
          role: string;
          platform: string;
          location: string;
          host: string;
          port: number;
          status: string;
          latencyMs: number | null;
          healthData: Record<string, unknown> | null;
        }>;
        timestamp: string;
      }>("/api/remote-agents"),
    refetchInterval: POLL_INTERVALS.health,
  });
}

export function useGitNexus() {
  return useQuery({
    queryKey: ["gitnexus"],
    queryFn: () => fetchJSON<{
      repos: Array<{
        name: string;
        path: string;
        files: number;
        symbols: number;
        edges: number;
        clusters: number;
        processes: number;
        lastIndexed: string | null;
      }>;
      timestamp: string;
    }>("/api/gitnexus"),
    refetchInterval: 60000,
  });
}

export function useApo() {
  return useQuery({
    queryKey: ["apo"],
    queryFn: () =>
      fetchJSON<{
        proposals: ApoProposal[];
        stats: ApoCycleStats;
        timestamp: string;
      }>("/api/apo"),
    refetchInterval: 30000, // 30s
  });
}

export function approveApoProposal(proposalId: string) {
  return mutateJSON<{
    ok: boolean;
    proposalId: string;
    skillId: string;
    executorCli: string;
    queued: boolean;
    workerCommand: string;
    approvedAt: string;
  }>("/api/apo", {
    method: "POST",
    body: JSON.stringify({ action: "approve", proposalId }),
  });
}

export function useApproveApoProposalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveApoProposal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apo"] });
    },
  });
}

export function useDevToolsStatus() {
  return useQuery({
    queryKey: ["devtools-status"],
    queryFn: () =>
      fetchJSON<{
        tools: Array<{
          id: string;
          name: string;
          mem0: "connected" | "partial" | "not-wired";
          qmd: "connected" | "partial" | "not-wired";
          overall: "connected" | "partial" | "not-wired";
        }>;
        mem0Reachable: boolean;
        timestamp: string;
      }>("/api/devtools-status"),
    refetchInterval: 30000,
  });
}

export interface SkillRegistryItem {
  id: number;
  name: string;
  description: string | null;
  owner: string | null;
  source_harness: string;
  risk_tier: string;
  dispatch_status: "enabled" | "incomplete" | "disabled";
  version: string | null;
  completeness_pct: number;
  missing_fields: string[];
  missing_fields_json: string | null;
  verification_checks_list: string[];
  verification_checks: string | null;
  imported_by: string;
  imported_at: string;
}

export interface SkillRegistryResponse {
  ok: boolean;
  items: SkillRegistryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SkillSuggestion {
  id: string;
  name: string;
  slug: string;
  sourcePattern: string;
  recommendation: string;
  confidence: number;
  evidence: string[];
  comparedHarnesses: Record<string, { exists: boolean; path: string | null }>;
  status: "proposed" | "approved" | "promoted" | "dismissed";
}

export interface SkillSuggestionsResponse {
  ok: boolean;
  windowDays: number;
  suggestions: SkillSuggestion[];
  timestamp: string;
}

export function useSkillRegistry(opts?: {
  offset?: number;
  limit?: number;
  source_harness?: string;
  dispatch_status?: string;
}) {
  const { offset = 0, limit = 20, source_harness, dispatch_status } = opts ?? {};
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  if (source_harness) params.set("source_harness", source_harness);
  if (dispatch_status) params.set("dispatch_status", dispatch_status);

  return useQuery({
    queryKey: ["skill-registry", offset, limit, source_harness, dispatch_status],
    queryFn: () =>
      fetchJSON<SkillRegistryResponse>(`/api/skills/import?${params.toString()}`),
    staleTime: 30_000,
  });
}

export function useSkillSuggestions(days = 30) {
  return useQuery({
    queryKey: ["skill-suggestions", days],
    queryFn: () =>
      fetchJSON<SkillSuggestionsResponse>(`/api/skills/suggestions?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => fetchJSON<{
      events: Array<{
        id: string;
        timestamp: string;
        node: string;
        type: string;
        message: string;
        severity: string;
      }>;
      nodeActivity: Record<string, number>;
      timestamp: string;
    }>("/api/activity"),
    refetchInterval: 15000, // refresh every 15s
  });
}

export function useOrchestrationHil() {
  return useQuery({
    queryKey: ["orchestration-hil"],
    queryFn: () =>
      fetchJSON<{
        decisions: OrchestrationHilDecision[];
        timestamp: string;
      }>("/api/orchestration/hil"),
    refetchInterval: 10000,
    retry: false,
  });
}

export function resolveOrchestrationHil(input: ResolveOrchestrationHilInput) {
  return mutateJSON<OrchestrationHilDecision & { ok: boolean; resumed?: boolean; timestamp: string }>(
    `/api/orchestration/hil/${encodeURIComponent(input.id)}`,
    { method: "POST", body: JSON.stringify({ decision: input.decision }) }
  );
}

export function useResolveOrchestrationHilMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveOrchestrationHil,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orchestration-hil"] });
    },
  });
}

export interface EditOrchestrationHilInput {
  id: string;
  patch: {
    taskSummary?: string | null;
    requiredCapability?: string | null;
    selectedAgentId?: string | null;
    requiresApproval?: boolean | null;
  };
}

export interface EditOrchestrationHilSuccess {
  ok: true;
  editedFields: string[];
}

export interface EditOrchestrationHilValidationError {
  ok: false;
  validationError: true;
  status: 422;
  detail: unknown;
}

export type EditOrchestrationHilResult =
  | EditOrchestrationHilSuccess
  | EditOrchestrationHilValidationError;

async function editOrchestrationHilFn(
  input: EditOrchestrationHilInput
): Promise<EditOrchestrationHilResult> {
  const res = await fetch(
    `/api/orchestration/hil/${encodeURIComponent(input.id)}/edit`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.patch),
    }
  );
  if (res.status === 422) {
    const detail = await res.json().catch(() => null);
    return { ok: false, validationError: true, status: 422, detail };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `${res.status}`;
    throw new Error(`/api/orchestration/hil edit: ${detail}`);
  }
  return res.json();
}

export function useEditOrchestrationHilMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: editOrchestrationHilFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orchestration-hil"] });
    },
  });
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () =>
      fetchJSON<{
        totalSkills: number;
        allSkills: string[];
        skillDetails: SkillWorkflowItem[];
        contributedByHermes: number;
        contributedByGwen: number;
        recentContributions: Array<{
          skill: string;
          contributor: string;
          timestamp: string;
          action: string;
        }>;
        lastPruned: string | null;
        staleCandidates: number;
        coverageGaps: string[];
        coverageTelemetryStatus: "tracked" | "untracked";
        lastUpdated: string | null;
        failuresByAgent: Record<string, number>;
        failuresByErrorType: Record<string, number>;
        contributionHistory: Array<{ skill: string; date: string; count: number }>;
        skillBudget: {
          status: "ok" | "watch" | "over";
          budgetTokens: number;
          metadataTokens: number;
          metadataChars: number;
          utilization: number;
          totalSkills: number;
          uniqueSkills: number;
          duplicateSkills: string[];
          averageDescriptionChars: number;
          longestDescriptions: Array<{ name: string; chars: number; sourceId: string }>;
          sources: Array<{
            id: string;
            path: string;
            type: "runtime" | "source" | "plugin" | "configured";
            skillCount: number;
            metadataChars: number;
            averageDescriptionChars: number;
          }>;
          recommendations: string[];
        };
        timestamp: string;
      }>("/api/skills"),
    refetchInterval: POLL_INTERVALS.skills,
  });
}

export function updateSkillReview(input: SkillReviewInput) {
  return mutateJSON<{
    ok: boolean;
    skillName: string;
    review: {
      stage: SkillWorkflowStage;
      status: SkillReviewStatus;
      notes: string;
      draftBody: string;
      updatedAt: string;
      updatedBy: string;
      approvedAt?: string | null;
    };
    timestamp: string;
  }>("/api/skills/review", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function useUpdateSkillReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSkillReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useToolAttention(query?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  return useQuery({
    queryKey: ["tool-attention", query],
    queryFn: () =>
      fetchJSON<ToolAttentionResponse>(`/api/tool-attention?${params}`),
    refetchInterval: 30000,
  });
}

export function useSimilarTaskRecommendations(context: ToolAttentionContextPack = {}) {
  const params = new URLSearchParams();
  if (context.task_type) params.set("task_type", context.task_type);
  if (context.repo) params.set("repo", context.repo);
  if (context.agent_id) params.set("agent_id", context.agent_id);
  if (context.tags?.length) params.set("tags", context.tags.join(","));
  return useQuery({
    queryKey: ["tool-attention-similar", context],
    queryFn: () =>
      fetchJSON<SimilarTaskResponse>(`/api/tool-attention/similar?${params}`),
    refetchInterval: 60000,
  });
}

export function useRecallStats() {
  return useQuery({
    queryKey: ["recall-stats"],
    queryFn: () =>
      fetchJSON<{
        rowCount: number;
        lastIngest: string | null;
        lastRecallQuery: string | null;
        dbSizeBytes: number;
        timestamp: string;
      }>("/api/recall/stats"),
    // No auto-refresh — manual via "Run Ingest" button
  });
}

export function useHiveFeed(limit = 20) {
  return useQuery({
    queryKey: ["hive-feed", limit],
    queryFn: () =>
      fetchJSON<{
        actions: Array<{
          id: number;
          agent_id: string;
          action_type: string;
          summary: string;
          artifacts: string | null;
          timestamp: string;
        }>;
        timestamp: string;
      }>(`/api/hive?limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,
  });
}

export function usePaperclipFleet() {
  return useQuery({
    queryKey: ["paperclip-fleet"],
    queryFn: () => fetchJSON<PaperclipFleetResponse>("/api/paperclip"),
    refetchInterval: POLL_INTERVALS.paperclip,
  });
}

export function useAgentPeers(windowMinutes = 60) {
  return useQuery({
    queryKey: ["agent-peers", windowMinutes],
    queryFn: () =>
      fetchJSON<{
        peers: Array<{
          agent_id: string;
          current_task: string;
          status: string;
          last_seen: string;
        }>;
        window_minutes: number;
        timestamp: string;
      }>(`/api/agent-peers?window=${windowMinutes}`),
    refetchInterval: POLL_INTERVALS.hive, // 5000ms -- same as hive feed
  });
}

export function useAuditLog(limit = 20) {
  return useQuery({
    queryKey: ["audit-log", limit],
    queryFn: () =>
      fetchJSON<{
        entries: Array<{
          id: number;
          actor: string;
          action: string;
          target: string;
          detail: string | null;
          severity: string;
          timestamp: string;
        }>;
        timestamp: string;
      }>(`/api/audit-log?limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,
  });
}

export function useSecurityReport(limit = 20) {
  return useQuery({
    queryKey: ["security-report", limit],
    queryFn: () => fetchJSON<SecurityReportResponse>(`/api/security/report?limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,
  });
}

export function useSecurityCapabilities() {
  return useQuery({
    queryKey: ["security-capabilities"],
    queryFn: () => fetchJSON<SecurityCapabilitiesResponse>("/api/security/capabilities"),
    refetchInterval: POLL_INTERVALS.agents,
  });
}

export function useCacheStats() {
  return useQuery({
    queryKey: ["cache-stats"],
    queryFn: () => fetchJSON<CacheStatsResponse>("/api/cache/stats"),
    refetchInterval: 30000,
  });
}

export function usePurgeCacheMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tag?: string) =>
      mutateJSON<{ ok: boolean; purged: number; tag: string | null; timestamp: string }>(
        "/api/cache/purge",
        { method: "POST", body: JSON.stringify(tag ? { tag } : {}) }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
    },
  });
}

export function useModelRoutingDashboard(limit = 30) {
  return useQuery({
    queryKey: ["model-routing-dashboard", limit],
    queryFn: () =>
      fetchJSON<ModelRoutingDashboardResponse>(
        `/api/model-routing/telemetry?limit=${limit}`
      ),
    refetchInterval: POLL_INTERVALS.tokens,
  });
}

export function useModelRoutingRecommendations(taskType = "engineering", strategy = "balanced") {
  const params = new URLSearchParams();
  params.set("taskType", taskType);
  params.set("strategy", strategy);
  return useQuery({
    queryKey: ["model-routing-recommendations", taskType, strategy],
    queryFn: () =>
      fetchJSON<{
        taskType: string;
        strategy: string;
        recommendations: ModelRoutingRecommendation[];
        timestamp: string;
      }>(`/api/model-routing/recommendations?${params}`),
    refetchInterval: POLL_INTERVALS.tokens,
  });
}

export function useModelRoutingEvals() {
  return useQuery({
    queryKey: ["model-routing-evals"],
    queryFn: () => fetchJSON<ModelRoutingEvalsResponse>("/api/model-routing/evals"),
    refetchInterval: POLL_INTERVALS.tokens,
  });
}

export function useVoiceStatus() {
  return useQuery({
    queryKey: ["voice-status"],
    queryFn: () => fetchJSON<{
      active: boolean;
      session_id: string | null;
      started_at: string | null;
      duration_secs: number | null;
      error?: string;
    }>("/api/voice-status"),
    refetchInterval: POLL_INTERVALS.voice,
  });
}

export interface MemoryStatsParams {
  window?: TimeSeriesWindow;
  workspace?: NocWorkspace;
}

export function useMemoryStats(params: MemoryStatsParams = {}) {
  const workspace = params.workspace ?? "all";
  const search = new URLSearchParams();
  if (params.window) search.set("window", params.window);
  if (params.workspace) search.set("workspace", params.workspace);
  const query = search.toString();

  return useQuery({
    queryKey: ["memory-stats", params.window ?? "all-time", workspace],
    queryFn: () =>
      fetchJSON<{
        lastRun: {
          started_at: string;
          completed_at: string | null;
          batch_size: number;
          insights_written: number;
          status: string;
          error_message: string | null;
        } | null;
        pendingUnconsolidated: number;
        tierStats: Array<{
          tier: string;
          count: number;
          avg_score: number;
        }>;
        consolidationModel: string;
        sources: Array<{ agent_id: string; cnt: number }>;
        recentFailures24h: number;
        timestamp: string;
      }>(`/api/memory-stats${query ? `?${query}` : ""}`),
    refetchInterval: 30000,
  });
}

export function useMemoryTierHealth() {
  return useQuery({
    queryKey: ["memory-tier-health"],
    queryFn: () =>
      fetchJSON<{
        tiers: MemoryTierHealth[];
        timestamp: string;
      }>("/api/memory/health"),
    refetchInterval: 30000,
  });
}

export function useMemoryEvalLatest() {
  return useQuery({
    queryKey: ["memory-eval-latest"],
    queryFn: () => fetchJSON<MemoryEvalLatestResponse>("/api/memory/evals/latest"),
    refetchInterval: 60000,
  });
}

export type TimeSeriesMetric =
  | "docs_ingested"
  | "memory_writes"
  | "recall_queries"
  | "collection_growth"
  | "skill_executions"
  | "skill_failures";

export type TimeSeriesWindow = "day" | "week" | "month";

export function useTimeSeries(metric: TimeSeriesMetric, window: TimeSeriesWindow) {
  return useQuery({
    queryKey: ["time-series", metric, window],
    queryFn: () =>
      fetchJSON<{
        points: Array<{ bucket: string; value: number }>;
        metric: string;
        window: string;
        timestamp: string;
      }>(`/api/time-series?metric=${metric}&window=${window}`),
    refetchInterval: POLL_INTERVALS.knowledge, // 60s -- analytics don't need real-time
  });
}

export interface CollectionTrend {
  name: string;
  category: KnowledgeCollection["category"];
  totalFiles: number;
  recentFiles: number;
  lastUpdated: string | null;
  points: Array<{ bucket: string; value: number; cumulative: number }>;
}

export function useKnowledgeTrends(window: TimeSeriesWindow, limit = 12) {
  return useQuery({
    queryKey: ["knowledge-trends", window, limit],
    queryFn: () =>
      fetchJSON<{
        collections: CollectionTrend[];
        window: TimeSeriesWindow;
        buckets: string[];
        timestamp: string;
      }>(`/api/knowledge/trends?window=${window}&limit=${limit}`),
    refetchInterval: POLL_INTERVALS.knowledge,
  });
}

export function useDelegations(limit = 50) {
  return useQuery({
    queryKey: ["delegations", limit],
    queryFn: () =>
      fetchJSON<{
        delegations: Array<{
          task_id: string;
          from_agent: string;
          to_agent: string;
          task_summary: string;
          priority: number;
          status: string;
          created_at: string;
          updated_at: string;
        }>;
        timestamp: string;
      }>(`/api/hive?type=delegation&limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,
  });
}

export function useLineage(taskId: string | null) {
  return useQuery({
    queryKey: ["lineage", taskId],
    queryFn: () =>
      fetchJSON<{
        task_id: string;
        context_id: string | null;
        delegation: Record<string, unknown> | null;
        actions: Array<{
          id: number;
          agent_id: string;
          action_type: string;
          summary: string;
          artifacts: Record<string, unknown> | null;
          timestamp: string;
        }>;
        timestamp: string;
      }>(`/api/hive?task_id=${taskId}`),
    enabled: !!taskId,
  });
}

// ---------------------------------------------------------------------------
// Memory autogen — proposals and policy lab
// ---------------------------------------------------------------------------

export interface MemoryProposalTypeMeta {
  label: string;
  description: string;
}

export interface MemoryProposalsResponse {
  proposals: SealProposal[];
  types: Record<string, MemoryProposalTypeMeta>;
  timestamp: string;
}

export interface PolicyRankResult {
  rank: number;
  name: string;
  compositeW: number;
  layerScores: { l1: number; l2: number; l3: number };
  variantConfig: Record<string, unknown>;
  evalRunId: string;
}

export interface PolicyLabResponse {
  ok: boolean;
  goldenSetId: string;
  ranked: PolicyRankResult[];
  timestamp: string;
}

export interface MemoryPolicyVariant {
  name: string;
  config: Record<string, unknown>;
}

export function useMemoryProposals(status?: string) {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: ["memory-proposals", status],
    queryFn: () => fetchJSON<MemoryProposalsResponse>(`/api/memory/proposals${params}`),
    refetchInterval: 15000,
  });
}

export function useRunPolicyLabMutation() {
  return useMutation({
    mutationFn: (payload: { variants: MemoryPolicyVariant[]; goldenSetId?: string }) =>
      mutateJSON<PolicyLabResponse>("/api/memory/policy-lab", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

// ---------------------------------------------------------------------------
// Eval preset selector hooks (Phase 60)
// ---------------------------------------------------------------------------

export interface AgentProposal {
  id: string;
  traceId: string;
  runId: string;
  agentId: string;
  proposalType: "agent_instruction_patch" | "skill_addition" | "tool_routing_update";
  status: SealProposal["status"];
  diff: Record<string, unknown>;
  rationale: string;
  forecastWDelta: number;
  baselineW: number;
  createdAt: string;
}

export interface AgentProposalsResponse {
  proposals: AgentProposal[];
  timestamp: string;
}

export function useEvalPresets() {
  return useQuery({
    queryKey: ["evals", "presets"],
    queryFn: () => fetchJSON<EvalConfigResponse>("/api/evals/config").then((r) => ({
      presets: r.config.weightPresets ?? {},
      activePreset: r.config.activePreset ?? null,
    })),
    staleTime: 15_000,
  });
}

function setActivePreset(activePreset: string | null) {
  return mutateJSON<EvalConfigResponse & { ok: boolean }>("/api/evals/config", {
    method: "POST",
    body: JSON.stringify({ active_preset: activePreset }),
  });
}

export function useSetActivePresetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setActivePreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evals"] });
    },
  });
}

export function useAgentProposals(status?: AgentProposal["status"]) {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: ["agent-proposals", status ?? "all"],
    queryFn: () => fetchJSON<AgentProposalsResponse>(`/api/agents/proposals${params}`),
    refetchInterval: 30_000,
  });
}

function triggerAgentReflection(agentId: string) {
  return mutateJSON<{ ok: boolean; proposals: AgentProposal[]; timestamp: string }>(
    "/api/agents/proposals",
    { method: "POST", body: JSON.stringify({ action: "reflect", agentId }) }
  );
}

export function useTriggerAgentReflectionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerAgentReflection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-proposals"] });
    },
  });
}

export function useMemoryProposalActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject" | "apply";
    }) =>
      mutateJSON<{
        ok: boolean;
        proposal: SealProposal;
        timestamp: string;
      }>(`/api/seal/proposals/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memory-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["seal"] });
    },
  });
}

export function useAgentCards() {
  return useQuery({
    queryKey: ["agent-cards"],
    queryFn: () =>
      fetchJSON<{
        cards: Array<{
          name: string;
          description: string;
          version: string;
          url: string;
          capabilities: Record<string, boolean>;
          authentication: { schemes: string[] };
          skills: Array<{
            id: string;
            name: string;
            description: string;
            tags: string[];
          }>;
          extensions: {
            memroos: {
              id: string;
              platform: string;
              location: string;
              role: string;
            };
          };
        }>;
        timestamp: string;
      }>("/api/agents/cards"),
    refetchInterval: POLL_INTERVALS.health,
  });
}

// ---------------------------------------------------------------------------
// Phase 61 — Business-Ops Outcome Layer (L3) hooks
// ---------------------------------------------------------------------------

export interface BusinessOutcomeEventRow {
  id: number;
  tenantId: string;
  correlationId: string;
  sourceSystem: "crm" | "helpdesk" | "finance";
  adapter: string;
  eventType: string;
  kpiKey: string;
  kpiValue: number;
  rawJson: string;
  agentId?: string;
  polledAt: string;
  createdAt: string;
}

export interface BusinessOutcomeEventsResponse {
  events: BusinessOutcomeEventRow[];
  count: number;
  timestamp: string;
}

export interface BusinessOpsPollSummary {
  ok: boolean;
  totalEventsWritten: number;
  errors: string[];
  adapterResults: Array<{
    adapter: string;
    category: string;
    eventsPolled: number;
    eventsWritten: number;
    error: string | null;
  }>;
  polledAt: string;
  timestamp: string;
}

export interface BusinessOutcomeEventsFilter {
  correlationId?: string;
  agentId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export function useBusinessOutcomeEvents(filter: BusinessOutcomeEventsFilter = {}) {
  const params = new URLSearchParams();
  if (filter.correlationId) params.set("correlationId", filter.correlationId);
  if (filter.agentId) params.set("agentId", filter.agentId);
  if (filter.since) params.set("since", filter.since);
  if (filter.until) params.set("until", filter.until);
  if (filter.limit) params.set("limit", String(filter.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: ["l3-events", filter],
    queryFn: () => fetchJSON<BusinessOutcomeEventsResponse>(`/api/l3/events${qs ? `?${qs}` : ""}`),
    refetchInterval: 30_000,
  });
}

function triggerAdapterPoll(input: { since?: string; adapters?: string[] }) {
  return mutateJSON<BusinessOpsPollSummary>("/api/l3/poll", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function useTriggerAdapterPollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerAdapterPoll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["l3-events"] });
    },
  });
}

// ---- Phase 64: Audit Log + HIL Escalations hooks ----

export interface AuditEntriesFilter {
  agentId?: string;
  eventType?: string;
  actorId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditEntriesResponse {
  entries: import("@/lib/audit/schema").AuditEntry[];
  nextCursor?: string;
  total: number;
}

export interface EscalationsFilter {
  status?: "open" | "resolved" | "sla_breached" | "all";
  tenantId?: string;
  limit?: number;
}

export interface EscalationWithCountdown {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  escalation_type: "agent_escalate" | "seal_approval" | "eval_below_threshold";
  sla_seconds: number;
  sla_deadline: string;
  status: "open" | "resolved" | "sla_breached";
  assigned_to?: string | null;
  opened_by: string;
  resolved_by?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
  isOverdue: boolean;
  slaRemainingMs: number;
}

export interface EscalationsResponse {
  escalations: EscalationWithCountdown[];
  timestamp: string;
}

/** Queries paginated audit entries with filter support. */
export function useAuditEntries(filter: AuditEntriesFilter = {}) {
  const params = new URLSearchParams();
  if (filter.agentId) params.set("agentId", filter.agentId);
  if (filter.eventType) params.set("eventType", filter.eventType);
  if (filter.actorId) params.set("actorId", filter.actorId);
  if (filter.tenantId) params.set("tenantId", filter.tenantId);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.cursor) params.set("cursor", filter.cursor);
  const qs = params.toString();
  return useQuery({
    queryKey: ["audit-entries", filter],
    queryFn: () => fetchJSON<AuditEntriesResponse>(`/api/audit${qs ? `?${qs}` : ""}`),
  });
}

/**
 * Returns a download URL for the audit export endpoint.
 * Triggers a browser download when assigned to window.location.href.
 */
export function useAuditExportUrl(filter: AuditEntriesFilter, format: "ndjson" | "csv"): string {
  const params = new URLSearchParams({ format });
  if (filter.agentId) params.set("agentId", filter.agentId);
  if (filter.eventType) params.set("eventType", filter.eventType);
  if (filter.actorId) params.set("actorId", filter.actorId);
  if (filter.tenantId) params.set("tenantId", filter.tenantId);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  return `/api/audit/export?${params.toString()}`;
}

/** Queries HIL escalations; auto-refreshes every 30s for SLA countdown freshness. */
export function useEscalations(filter: EscalationsFilter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.tenantId) params.set("tenantId", filter.tenantId);
  if (filter.limit) params.set("limit", String(filter.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: ["escalations", filter],
    queryFn: () => fetchJSON<EscalationsResponse>(`/api/escalations${qs ? `?${qs}` : ""}`),
    refetchInterval: 30_000,
  });
}

function resolveEscalationFn(input: { id: string; note?: string }) {
  return mutateJSON<{ escalation: import("@/lib/audit/schema").HilEscalation; timestamp: string }>(
    `/api/escalations/${encodeURIComponent(input.id)}/resolve`,
    { method: "POST", body: JSON.stringify({ note: input.note }) }
  );
}

/** Mutation for resolving a HIL escalation. Invalidates escalations query on success. */
export function useResolveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveEscalationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalations"] });
      queryClient.invalidateQueries({ queryKey: ["audit-entries"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 72 Plan 03 — Behavioral eval job status and evidence polling
// ---------------------------------------------------------------------------

export type EvalJobStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "rolled_back"
  | "canceled";

export interface EvalJobRow {
  id: string;
  proposalId: string;
  proposalType: string;
  agentId: string;
  status: EvalJobStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvalJobResponse {
  job: EvalJobRow;
  timestamp: string;
}

export interface RecordedToolCall {
  toolName: string;
  inputs: Record<string, unknown>;
  denied: boolean;
  denyReason?: string;
  output?: unknown;
}

export interface PromotionMetadata {
  modelVersion: string | null;
  promptTemplateVersion: string | null;
  datasetSeed: string | null;
  passRate: number | null;
  configHash: string | null;
}

export interface EvidenceBundleRow {
  jobId: string;
  proposalId: string;
  agentId: string;
  taskSampleId: string | null;
  toolCallTranscript: RecordedToolCall[];
  verificationChecks: string[];
  unverifiedAssumptions: string[];
  residualRisks: string[];
  sourcesConsumed: string[];
  replayHandle: string | null;
  rollbackHandle: string | null;
  promotionMetadata: PromotionMetadata | null;
  preApplyBaselineW: number;
  postApplyW: number | null;
}

export interface EvidenceBundleResponse {
  evidence: EvidenceBundleRow;
  timestamp: string;
}

/**
 * Polls a behavioral eval job's current status.
 * Callers should refetch every ~5s until status is terminal
 * (passed | failed | rolled_back | canceled).
 */
export function useSealJob(jobId: string | null) {
  return useQuery({
    queryKey: ["seal", "job", jobId],
    queryFn: () =>
      fetchJSON<EvalJobResponse>(
        `/api/seal/jobs/${encodeURIComponent(jobId as string)}`
      ),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (!status) return 5_000;
      // Stop polling once terminal
      if (["passed", "failed", "rolled_back", "canceled"].includes(status)) {
        return false;
      }
      return 5_000;
    },
  });
}

/**
 * Fetches the evidence bundle for a completed behavioral eval job.
 * Returns null (404) when the bundle is not yet available.
 */
export function useSealJobEvidence(jobId: string | null) {
  return useQuery({
    queryKey: ["seal", "job-evidence", jobId],
    queryFn: async () => {
      const res = await fetch(
        `/api/seal/jobs/${encodeURIComponent(jobId as string)}/evidence`
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`/api/seal/jobs/${jobId}/evidence: ${res.status}`);
      return res.json() as Promise<EvidenceBundleResponse>;
    },
    enabled: Boolean(jobId),
    refetchInterval: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Phase 72 Plan 04 — Library freshness (QMD index recency vs source mtime)
// ---------------------------------------------------------------------------

export type FreshnessState = "live" | "empty" | "updating" | "stale" | "degraded" | "missing";

export interface CollectionFreshnessRow {
  collection: string;
  state: FreshnessState;
  /** Age of the index in ms relative to now; null when indexTimestamp is unknown */
  ageMs: number | null;
  sourceMtime: string | null;
  indexTimestamp: string | null;
}

export interface LibraryFreshnessResponse {
  collections: CollectionFreshnessRow[];
  timestamp: string;
  isUpdating: boolean;
}

export function useLibraryFreshness() {
  return useQuery({
    queryKey: ["library", "freshness"],
    queryFn: () => fetchJSON<LibraryFreshnessResponse>("/api/library/freshness"),
    refetchInterval: 60_000,
  });
}

export type QmdUpdateEvent =
  | { type: "started"; pid: number | null }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "completed"; exitCode: number }
  | { type: "failed"; error: string };

/**
 * useTriggerQmdUpdate — streams SSE events from POST /api/library/qmd-update.
 *
 * Returns { events, isStreaming, trigger, reset }.
 * Only POST fires; fetch + ReadableStream reader parses `data: {...}` frames.
 */
export function useTriggerQmdUpdate() {
  const [events, setEvents] = useState<QmdUpdateEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  async function trigger() {
    setEvents([]);
    setIsStreaming(true);
    try {
      const res = await fetch("/api/library/qmd-update", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        setEvents([{ type: "failed", error: `HTTP ${res.status}: ${detail}` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          try {
            const parsed = JSON.parse(payload) as QmdUpdateEvent;
            setEvents((prev) => [...prev, parsed]);
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [
        ...prev,
        { type: "failed", error: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function reset() {
    setEvents([]);
    setIsStreaming(false);
  }

  return { events, isStreaming, trigger, reset };
}
