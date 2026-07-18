import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  useAuditLog: vi.fn(),
  useHiveFeed: vi.fn(),
  useToolAttention: vi.fn(),
  useMemoryStats: vi.fn(),
  useMemoryTierHealth: vi.fn(),
  useModelUsage: vi.fn(),
  useDelegations: vi.fn(),
  useOperationsNoc: vi.fn(),
  useSkills: vi.fn(),
  useUpdateSkillReviewMutation: vi.fn(),
}));

vi.mock("@/lib/api-client", () => api);

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/shared/charts", () => ({
  Spark: ({ values }: { values: number[] }) => <div data-testid="spark">{values.join(",")}</div>,
}));

vi.mock("@/components/skill-heatmap", () => ({
  SkillHeatmap: ({ contributionHistory }: { contributionHistory: unknown[] }) => (
    <div data-testid="skill-heatmap">{contributionHistory.length}</div>
  ),
}));

import { AgentRegistryDrawer } from "@/components/agents/agent-registry-drawer";
import { AgentRegistrationForm } from "@/components/agents/agent-registration-form";
import { ToolAttentionPanel } from "@/components/cookbooks/tool-attention-panel";
import { NodeDetailPanel } from "@/components/flow/node-detail-panel";
import { PaperclipFleetPanel } from "@/components/flow/paperclip-fleet-panel";
import { MemoryNotDigested } from "@/components/operations/memory-not-digested";
import { PulseStrip } from "@/components/operations/pulse-strip";

function baseAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    name: "Agent One",
    role: "ops",
    platform: "unknown-platform",
    protocol: "rest",
    status: "idle",
    capabilities: [],
    currentTask: null,
    lastHeartbeat: null,
    metadata: {},
    ...overrides,
  } as never;
}

function envelope(status: string, value: number | null = null) {
  return {
    value,
    status,
    source: "/api/source",
    observedAt: null,
    freshnessMs: null,
    scope: { window: "24h", workspace: "all" },
    reason: `${status} reason`,
  };
}

describe("Batch N branch-focused component coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    api.useAuditLog.mockReturnValue({ data: { entries: [] }, isLoading: false });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isLoading: false, isError: false });
    api.useToolAttention.mockReturnValue({
      data: {
        summary: { totalCapabilities: 0, topLevelTools: 0, workspaces: 0, recentOutcomes: 0 },
        capabilities: [],
        recommendations: [],
        health: { messages: [] },
      },
      isLoading: false,
    });
    api.useMemoryStats.mockReturnValue({ data: { sources: [], pendingUnconsolidated: 0, lastRun: null }, isError: false });
    api.useMemoryTierHealth.mockReturnValue({ data: { tiers: [] } });
    api.useModelUsage.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    api.useDelegations.mockReturnValue({ data: { delegations: [] }, isLoading: false, isError: false });
    api.useOperationsNoc.mockReturnValue({ data: { metrics: {} }, isError: false });
    api.useSkills.mockReturnValue({
      data: {
        totalSkills: 0,
        coverageGaps: [],
        failuresByAgent: {},
        contributionHistory: [],
      },
    });
    api.useUpdateSkillReviewMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ content: null }) }) as Response);
  });

  it("renders tool attention loading, empty, health, status, and search branches", () => {
    api.useToolAttention.mockReturnValueOnce({ data: undefined, isLoading: true });
    const loading = render(<ToolAttentionPanel />);
    expect(screen.getByText(/loading capabilities/i)).toBeInTheDocument();
    loading.unmount();

    api.useToolAttention.mockReturnValue({
      isLoading: false,
      data: {
        summary: { totalCapabilities: 2, topLevelTools: 1, workspaces: 1, recentOutcomes: 1 },
        health: { messages: ["registry stale"] },
        capabilities: [
          {
            id: "c1",
            name: "Search",
            description: "Find things",
            type: "tool",
            status: "candidate",
            topLevel: true,
            outcomeSummary: { uses: 2, score: 0.7 },
          },
          {
            id: "c2",
            name: "Legacy",
            description: "Old",
            type: "mcp",
            status: "retired",
            topLevel: false,
          },
        ],
        recommendations: [{ capabilityId: "c1", title: "Load search", reason: "high utility" }],
      },
    });
    render(<ToolAttentionPanel />);
    expect(screen.getByText("registry stale")).toBeInTheDocument();
    expect(screen.getByText("top-level")).toBeInTheDocument();
    expect(screen.getByText("score 0.7")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/search tool capabilities/i), { target: { value: "legacy" } });
    expect(api.useToolAttention).toHaveBeenLastCalledWith("legacy");
  });

  it("renders agent registry drawer metadata fallbacks and A2A redaction branches", () => {
    expect(render(<AgentRegistryDrawer agent={null} open onOpenChange={vi.fn()} />).container).toBeEmptyDOMElement();

    render(<AgentRegistryDrawer agent={baseAgent()} open onOpenChange={vi.fn()} />);
    expect(screen.getByText("None declared")).toBeInTheDocument();
    expect(screen.getByText("unknown-platform")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();

    render(
      <AgentRegistryDrawer
        agent={baseAgent({
          id: "a2a-1",
          name: "A2A Agent",
          protocol: "a2a",
          platform: "cursor",
          capabilities: [{ id: "cap", name: "Cap", description: "", tags: [] }],
          metadata: {
            a2a: {
              endpointUrl: "http://user:secret@example.com/rpc",
              cardUrl: "not a url //token@example",
              securitySchemes: { apiKey: { type: "apiKey", in: "header" } },
              inputModes: ["text", 123],
              outputModes: null,
              streaming: false,
              source: "adk",
            },
          },
        })}
        liveness={{ state: "live", observedAt: "2026-01-01T00:00:00.000Z", freshnessMs: 2_000, source: "heartbeat", reason: "ok" }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("apiKey header")).toBeInTheDocument();
    expect(screen.getByText("not declared")).toBeInTheDocument();
    expect(screen.getAllByText("ADK").length).toBeGreaterThan(0);
  });

  it("drives Paperclip fleet loading, offline, dispatch error, and unknown status branches", async () => {
    const loading = render(<PaperclipFleetPanel fleet={null} isLoading />);
    expect(screen.getByText(/loading fleet/i)).toBeInTheDocument();
    loading.unmount();

    const offline = render(<PaperclipFleetPanel fleet={null} isLoading={false} />);
    expect(screen.getByText(/fleet offline/i)).toBeInTheDocument();
    offline.unmount();

    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error("bad json"); } }));
    global.fetch = fetchMock as never;
    render(
      <PaperclipFleetPanel
        isLoading={false}
        fleet={{
          summary: { fleetStatus: "offline", activeAgents: 0, totalAgents: 1, activeTasks: 0, pausedRecoveries: 0 },
          agents: [
            {
              id: "a",
              name: "Agent",
              status: "unknown",
              autonomyMode: "Hybrid",
              activeTask: null,
              lastHeartbeat: null,
            },
          ],
          operations: [
            {
              sessionId: "session-with-a-long-id",
              status: "waiting",
              completedSteps: ["one"],
              resumeFrom: "checkpoint",
            },
          ],
        } as never}
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: /dispatch task/i }).closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/task summary/i), { target: { value: "  Ship it  " } });
    fireEvent.click(screen.getByRole("button", { name: /dispatch task/i }));
    await waitFor(() => expect(screen.getByText(/dispatch failed \(500\)/i)).toBeInTheDocument());
  });

  it("renders memory digestion failed runs, tier failures, and source links", () => {
    api.useMemoryStats.mockReturnValue({
      isError: true,
      data: { sources: [], pendingUnconsolidated: 0, lastRun: null },
    });
    const failed = render(<MemoryNotDigested />);
    expect(screen.getByText(/failed to load \/api\/memory-stats/i)).toBeInTheDocument();
    failed.unmount();

    api.useMemoryStats.mockReturnValue({
      isError: false,
      data: {
        pendingUnconsolidated: 3,
        recentFailures24h: 2,
        lastRun: { status: "failed", started_at: "2026-01-01T00:00:00.000Z", batch_size: 10, error_message: "multi\nline error" },
        sources: [{ agent_id: "agent source", cnt: 7 }],
      },
    });
    api.useMemoryTierHealth.mockReturnValue({
      data: { tiers: [{ tier: "vector", status: "down", detail: null, backend: "qdrant", count: null }] },
    });
    render(<MemoryNotDigested filters={{ window: "7d", workspace: "ops" }} />);
    expect(screen.getByText("Consolidation blocked")).toBeInTheDocument();
    expect(screen.getByText("multi line error")).toBeInTheDocument();
    expect(screen.getByText("vector backend down")).toBeInTheDocument();
    expect(screen.getByText("agent source")).toBeInTheDocument();
  });

  it("renders node detail A2A helper fallbacks and heartbeat fetch failures", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    render(
      <NodeDetailPanel
        nodeId="agent-a2a"
        nodeLabel="A2A Node"
        nodeIcon="A"
        nodeStats={{ Count: 1 }}
        events={[{ id: "e1", node: "agent-a2a", type: "other", severity: "info", message: "hello", timestamp: new Date().toISOString() }]}
        onClose={vi.fn()}
        registeredAgents={[
          {
            id: "a2a",
            name: "A2A",
            status: "active",
            latencyMs: null,
            location: "remote",
            protocol: "a2a",
            currentTask: "working",
            metadata: { a2a: { endpointUrl: "not a url //token@example", securitySchemes: {}, inputModes: ["text", 7], outputModes: [], streaming: true, source: "manual", latestTaskState: "submitted" } },
          },
        ]}
      />,
    );

    expect(screen.getByText("A2A connection")).toBeInTheDocument();
    expect(screen.getByText(/not a url/)).toBeInTheDocument();
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(1);
    expect(screen.getByText("supported")).toBeInTheDocument();
    expect(screen.getByText("MANUAL")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/loading state/i)).not.toBeInTheDocument());
  });

  it("covers registration form optional invite and A2A/manual submit branches", () => {
    const onSubmit = vi.fn();
    const onA2aSubmit = vi.fn();
    const onCreateInvite = vi.fn();
    render(<AgentRegistrationForm onSubmit={onSubmit} onA2aSubmit={onA2aSubmit} onCreateInvite={onCreateInvite} />);

    fireEvent.click(screen.getByRole("button", { name: /copy invite/i }));
    expect(onCreateInvite).toHaveBeenCalledWith(expect.objectContaining({ ttlMinutes: 60, mcpTarget: "auto" }));
    fireEvent.click(screen.getByRole("button", { name: /advanced/i }));

    fireEvent.submit(screen.getByRole("button", { name: /^register$/i }).closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: " Agent One! " } });
    fireEvent.change(screen.getByLabelText(/agent role/i), { target: { value: " Operator " } });
    fireEvent.change(screen.getByLabelText(/agent capabilities/i), { target: { value: "Search, ,Audit Logs" } });
    fireEvent.click(screen.getByRole("button", { name: /^register$/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      id: "agent-one",
      name: "Agent One!",
      capabilities: [
        { id: "search", name: "Search", description: "", tags: [] },
        { id: "audit-logs", name: "Audit Logs", description: "", tags: [] },
      ],
    }));

    fireEvent.click(screen.getByRole("button", { name: /a2a card url/i }));
    fireEvent.submit(screen.getByRole("button", { name: /register a2a agent/i }).closest("form")!);
    expect(onA2aSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/a2a agent-card url/i), { target: { value: " http://agent/card " } });
    fireEvent.change(screen.getByLabelText(/a2a source/i), { target: { value: "manual" } });
    fireEvent.click(screen.getByRole("button", { name: /register a2a agent/i }));
    expect(onA2aSubmit).toHaveBeenCalledWith({ cardUrl: "http://agent/card", source: "manual" });
  });

  it("renders pulse strip model-usage error, empty, live, and missing envelope states", () => {
    api.useOperationsNoc.mockReturnValue({
      isError: true,
      data: {
        metrics: {
          memoryRows: envelope("zero", 0),
          activeDispatches: envelope("live", 2),
          failedWork: envelope("error"),
        },
      },
    });
    api.useHiveFeed.mockReturnValue({ data: { actions: [{ action_type: "error" }, { action_type: "continue" }] }, isLoading: false, isError: false });
    api.useDelegations.mockReturnValue({ data: { delegations: [{ status: "active" }, { status: "failed" }] }, isLoading: false, isError: false });
    api.useModelUsage.mockReturnValue({
      isError: true,
      isLoading: false,
      error: "not an Error",
      data: undefined,
    });

    const { rerender } = render(<PulseStrip filters={{ window: "24h", workspace: "remote" }} />);
    expect(screen.getByText(/failed to load \/api\/operations\/noc/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no source/i).length).toBeGreaterThan(0);

    api.useOperationsNoc.mockReturnValue({ isError: false, data: { metrics: { hiveActions: envelope("empty") } } });
    api.useModelUsage.mockReturnValue({
      isError: false,
      isLoading: false,
      data: { timestamp: "bad-date", usage: { total: { inputTokens: 0, outputTokens: 0, cacheRead: 0 }, models: [] } },
    });
    rerender(<PulseStrip filters={{ window: "7d", workspace: "local" }} />);
    expect(screen.getByText(/healthy \/api\/model-usage returned no token usage/i)).toBeInTheDocument();

    api.useModelUsage.mockReturnValue({
      isError: false,
      isLoading: false,
      data: { timestamp: new Date().toISOString(), usage: { total: { inputTokens: 2, outputTokens: 3, cacheRead: 5 }, models: [{ totalTokens: 10 }, { totalTokens: 20 }] } },
    });
    rerender(<PulseStrip filters={{ window: "7d", workspace: "local" }} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
