"use client";

import { useQuery } from "@tanstack/react-query";
import { POLL_INTERVALS } from "./constants";
import type {
  Agent,
  HealthStatus,
  KnowledgeCollection,
  MemoryEntry,
  PaperclipFleetResponse,
  ToolAttentionResponse,
} from "@/types";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () =>
      fetchJSON<{ agents: Agent[]; timestamp: string }>("/api/agents"),
    refetchInterval: POLL_INTERVALS.agents,
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
  });
}

export function useModelUsage() {
  return useQuery({
    queryKey: ["model-usage"],
    queryFn: () =>
      fetchJSON<{ usage: import("@/lib/parsers").ModelUsage; timestamp: string }>(
        "/api/model-usage"
      ),
    refetchInterval: POLL_INTERVALS.tokens,
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

export function useKnowledge() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: () =>
      fetchJSON<{
        collections: KnowledgeCollection[];
        totalDocs: number;
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
        proposals: Array<{
          id: string;
          filename: string;
          skill: string;
          subsystem: string;
          timestamp: string;
          content: string;
          status: "pending" | "archived";
        }>;
        stats: {
          lastRun: string | null;
          totalProposals: number;
          pendingProposals: number;
          archivedProposals: number;
          recentLogLines: string[];
        };
        timestamp: string;
      }>("/api/apo"),
    refetchInterval: 30000, // 30s
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

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () =>
      fetchJSON<{
        totalSkills: number;
        allSkills: string[];
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
    queryKey: ["hive-feed"],
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

export function useMemoryStats() {
  return useQuery({
    queryKey: ["memory-stats"],
    queryFn: () =>
      fetchJSON<{
        lastRun: {
          completed_at: string;
          batch_size: number;
          insights_written: number;
          status: string;
        } | null;
        pendingUnconsolidated: number;
        tierStats: Array<{
          tier: string;
          count: number;
          avg_score: number;
        }>;
        consolidationModel: string;
        sources: Array<{ agent_id: string; cnt: number }>;
        timestamp: string;
      }>("/api/memory-stats"),
    refetchInterval: 30000,
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
            kitchen: {
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
