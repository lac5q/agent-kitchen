import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemoryConsumption } from "../memory-consumption";

const api = vi.hoisted(() => ({
  useMemoryStats: vi.fn(),
  useTimeSeries: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useMemoryStats: api.useMemoryStats,
  useTimeSeries: api.useTimeSeries,
}));

function tsMockReturn(values: number[]) {
  const points = values.map((value, idx) => ({
    bucket: `2026-07-${(13 + Math.floor(idx / 4)).toString().padStart(2, "0")}`,
    value,
  }));
  return {
    data: { points, metric: "memory_writes", window: "24h", timestamp: "2026-07-13T12:00:00Z" },
    isLoading: false,
    isError: false,
  };
}

function emptyTs() {
  return {
    data: { points: [], metric: "memory_writes", window: "24h", timestamp: "2026-07-13T12:00:00Z" },
    isLoading: false,
    isError: false,
  };
}

describe("MemoryConsumption truthful rendering", () => {
  it("renders scope-disclosure text and live status for healthy sources", () => {
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: { status: "completed", batch_size: 12, started_at: "2026-07-13T11:59:00Z", error_message: null },
        pendingUnconsolidated: 0,
        tierStats: [
          { tier: "high", count: 2 },
          { tier: "pinned", count: 1 },
          { tier: "low", count: 4 },
        ],
        sources: [{ agent_id: "codex", cnt: 5 }],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useTimeSeries.mockReturnValue(tsMockReturn([1, 2, 3, 4]));

    render(<MemoryConsumption filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getAllByText(/last 24 hours/i).length).toBeGreaterThan(0);
    // Discloses fixed/cumulative scope on each submetric
    const tierRows = screen.getByText("Tier rows").closest("[data-submetric]");
    expect(tierRows).not.toBeNull();
    if (tierRows) {
      expect(within(tierRows).getByText(/cumulative/i)).toBeInTheDocument();
    }
    const consolidation = screen.getByText("Pending consolidation").closest("[data-submetric]");
    expect(consolidation).not.toBeNull();
    if (consolidation) {
      expect(within(consolidation).getByText(/current snapshot/i)).toBeInTheDocument();
      expect(within(consolidation).getByText(/window=24h/i)).toBeInTheDocument();
    }
  });

  it("renders an empty-state block and the series stays visibly empty rather than fabricated", () => {
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: { status: "completed", batch_size: 0, started_at: null, error_message: null },
        pendingUnconsolidated: 0,
        tierStats: [],
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useTimeSeries.mockReturnValue(emptyTs());

    render(<MemoryConsumption filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText(/No memory write or recall buckets recorded/i)).toBeInTheDocument();
    expect(screen.getAllByText(/last 24 hours/i).length).toBeGreaterThan(0);
  });

  it("renders a banner with reason when memory-stats fails", () => {
    api.useMemoryStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch"),
    });
    api.useTimeSeries.mockReturnValue(emptyTs());

    render(<MemoryConsumption filters={{ window: "7d", workspace: "local" }} />);

    expect(screen.getAllByText(/api\/memory-stats.*failed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/last 7 days/i).length).toBeGreaterThan(0);
  });
});
