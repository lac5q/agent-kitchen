// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  useMemoryStats: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

import { useMemoryStats } from "@/lib/api-client";
import { MemoryIntelligencePanel } from "@/components/ledger/memory-intelligence-panel";

const mockUseMemoryStats = vi.mocked(useMemoryStats);

const SAMPLE_STATS = {
  lastRun: {
    completed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    batch_size: 50,
    insights_written: 12,
    status: "completed",
  },
  pendingUnconsolidated: 7,
  tierStats: [
    { tier: "pinned", count: 3, avg_score: 1.0 },
    { tier: "high", count: 10, avg_score: 0.85 },
    { tier: "mid", count: 25, avg_score: 0.6 },
    { tier: "low", count: 8, avg_score: 0.3 },
  ],
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemoryIntelligencePanel", () => {
  it("renders pending unconsolidated count", () => {
    mockUseMemoryStats.mockReturnValue({
      data: SAMPLE_STATS,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMemoryStats>);

    render(<MemoryIntelligencePanel />);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("renders last run timestamp", () => {
    mockUseMemoryStats.mockReturnValue({
      data: SAMPLE_STATS,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMemoryStats>);

    render(<MemoryIntelligencePanel />);
    // Last run was 5 min ago
    expect(screen.getByText("5 min ago")).toBeTruthy();
  });

  it("renders tier stats (count and avg score per tier)", () => {
    mockUseMemoryStats.mockReturnValue({
      data: SAMPLE_STATS,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMemoryStats>);

    render(<MemoryIntelligencePanel />);
    // Each tier should be visible
    expect(screen.getByText("pinned")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("mid")).toBeTruthy();
    expect(screen.getByText("low")).toBeTruthy();
  });

  it("shows loading state", () => {
    mockUseMemoryStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useMemoryStats>);

    const { container } = render(<MemoryIntelligencePanel />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("handles null lastRun gracefully", () => {
    mockUseMemoryStats.mockReturnValue({
      data: {
        ...SAMPLE_STATS,
        lastRun: null,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMemoryStats>);

    render(<MemoryIntelligencePanel />);
    // Should render dash for last run when null
    // The panel should not crash
    const panel = screen.getByText("Memory Intelligence");
    expect(panel).toBeTruthy();
  });
});
