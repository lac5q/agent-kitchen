import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  useMemoryStats: vi.fn(),
  useMemoryTierHealth: vi.fn(),
  useMemoryEvalLatest: vi.fn(),
}));

import { MemoryIntelligencePanel } from "../memory-intelligence-panel";
import { useMemoryEvalLatest, useMemoryStats, useMemoryTierHealth } from "@/lib/api-client";

const mockUseMemoryStats = vi.mocked(useMemoryStats);
const mockUseMemoryTierHealth = vi.mocked(useMemoryTierHealth);
const mockUseMemoryEvalLatest = vi.mocked(useMemoryEvalLatest);

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("MemoryIntelligencePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockUseMemoryStats.mockReturnValue({
      data: {
        lastRun: null,
        pendingUnconsolidated: 0,
        tierStats: [],
        consolidationModel: "test-model",
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-05-05T00:00:00.000Z",
      },
      isLoading: false,
    } as ReturnType<typeof useMemoryStats>);
    mockUseMemoryTierHealth.mockReturnValue({
      data: {
        tiers: [
          { tier: "vector", backend: "mem0-qdrant", status: "up" },
          { tier: "graph", backend: "neo4j", status: "up" },
          { tier: "episodic", backend: "sqlite", status: "up", count: 3 },
        ],
        timestamp: "2026-05-05T00:00:00.000Z",
      },
      isLoading: false,
    } as ReturnType<typeof useMemoryTierHealth>);
    mockUseMemoryEvalLatest.mockReturnValue({
      data: {
        ok: true,
        run: {
          id: "run-1",
          mode: "gold",
          status: "passed",
          startedAt: "2026-05-15T00:00:00.000Z",
          completedAt: "2026-05-15T00:01:00.000Z",
          summary: { totalCases: 12, passedCases: 11, failedCases: 1, passRate: 0.9167, p95LatencyMs: 1800, tierFailures: ["vector"] },
          results: [],
        },
        timestamp: "2026-05-15T00:01:00.000Z",
      },
      isLoading: false,
    } as ReturnType<typeof useMemoryEvalLatest>);
  });

  it("shows vector, graph, and episodic tier health", () => {
    render(<MemoryIntelligencePanel />, { wrapper });

    expect(screen.getByText("Tier Health")).toBeTruthy();
    expect(screen.getByText("mem0-qdrant")).toBeTruthy();
    expect(screen.getByText("neo4j")).toBeTruthy();
    expect(screen.getByText("sqlite")).toBeTruthy();
  });

  it("shows memory eval quality status separately from tier health", () => {
    render(<MemoryIntelligencePanel />, { wrapper });

    expect(screen.getByText("Recall Quality")).toBeTruthy();
    expect(screen.getByText("91.7%")).toBeTruthy();
    expect(screen.getByText("11/12 passing")).toBeTruthy();
    expect(screen.getAllByText("vector").length).toBeGreaterThan(1);
  });

  it("surfaces degraded memory tier details", () => {
    mockUseMemoryTierHealth.mockReturnValue({
      data: {
        tiers: [
          {
            tier: "vector",
            backend: "mem0-qdrant",
            status: "degraded",
            detail: "3 queued memory saves",
          },
        ],
        timestamp: "2026-05-05T00:00:00.000Z",
      },
      isLoading: false,
    } as ReturnType<typeof useMemoryTierHealth>);

    render(<MemoryIntelligencePanel />, { wrapper });

    expect(screen.getByText("degraded")).toBeTruthy();
    expect(screen.getByText("3 queued memory saves")).toBeTruthy();
  });

  it("shows the loading spinner and placeholder KPI values while memory stats load", () => {
    mockUseMemoryStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useMemoryStats>);
    mockUseMemoryTierHealth.mockReturnValue({
      data: { tiers: [], timestamp: "2026-05-05T00:00:00.000Z" },
      isLoading: false,
    } as ReturnType<typeof useMemoryTierHealth>);

    render(<MemoryIntelligencePanel />, { wrapper });

    expect(screen.getByText("Memory Intelligence")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Recall Quality")).toBeNull();
  });

  it("surfaces failed consolidation status, fallback eval copy, and indexed sources", () => {
    mockUseMemoryStats.mockReturnValue({
      data: {
        lastRun: {
          id: "run-failed",
          status: "failed",
          started_at: new Date(Date.now() - 90_000).toISOString(),
          completed_at: null,
          insights_written: 0,
          batch_size: 7,
          error_message: "provider timed out\nwhile writing insights",
        },
        pendingUnconsolidated: 4,
        tierStats: [{ tier: "episodic", count: 9, avg_score: 0.42 }],
        consolidationModel: null,
        sources: [{ agent_id: "claude", cnt: 12 }],
        recentFailures24h: 3,
        timestamp: "2026-05-05T00:00:00.000Z",
      },
      isLoading: false,
    } as ReturnType<typeof useMemoryStats>);
    mockUseMemoryEvalLatest.mockReturnValue({
      data: { ok: true, run: null, timestamp: "2026-05-15T00:01:00.000Z" },
      isLoading: false,
    } as ReturnType<typeof useMemoryEvalLatest>);

    render(<MemoryIntelligencePanel />, { wrapper });

    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.getByText(/Latest error: provider timed out while writing insights/)).toBeTruthy();
    expect(screen.getByText(/3 failures recorded in the last 24h/)).toBeTruthy();
    expect(screen.getByText("No eval run recorded yet.")).toBeTruthy();
    expect(screen.getByText("Indexed Sources")).toBeTruthy();
    expect(screen.getByText("claude")).toBeTruthy();
    expect(screen.getAllByText("episodic").length).toBeGreaterThan(0);
    expect(screen.getByText(/42%/)).toBeTruthy();
  });

  it("runs consolidation on demand and reports retryable failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryIntelligencePanel />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Run Now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/memory-consolidate", { method: "POST" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Run Now" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Failed — click to retry/i })).toBeTruthy();
    });
  });
});
