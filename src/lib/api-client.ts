"use client";

import { useQuery } from "@tanstack/react-query";
import { POLL_INTERVALS } from "./constants";
import type {
  Agent,
  HealthStatus,
  KnowledgeCollection,
  MemoryEntry,
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
