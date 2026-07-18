import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  useHiveFeed: vi.fn(),
}));

vi.mock("@/lib/api-client", () => apiMock);

vi.mock("@/components/shared/charts", () => ({
  Heatmap: ({ data }: { data: number[][] }) => (
    <div data-testid="heatmap" data-max-cell={String(Math.max(...data.flat()))} />
  ),
  Donut: ({ value, label }: { value: number; label: string }) => (
    <div data-testid="donut">
      {value}:{label}
    </div>
  ),
}));

import { ActivityHeatmap } from "../activity-heatmap";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
  apiMock.useHiveFeed.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActivityHeatmap", () => {
  it("renders fixed 7-day hive activity context and today's load", () => {
    apiMock.useHiveFeed.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        actions: [
          { timestamp: "2026-07-18T01:00:00.000Z" },
          { timestamp: "2026-07-18T01:30:00.000Z" },
          { timestamp: "2026-07-17T02:00:00.000Z" },
          { timestamp: "invalid" },
          { timestamp: "2026-07-10T02:00:00.000Z" },
        ],
      },
    });

    render(<ActivityHeatmap filters={{ window: "7d", workspace: "ops" }} />);

    expect(apiMock.useHiveFeed).toHaveBeenCalledWith(500);
    expect(screen.getByText("When agents work")).toBeInTheDocument();
    expect(screen.getByText(/window=7d and workspace=ops filters do not partition/i)).toBeInTheDocument();
    expect(screen.getByText("2 actions today across the loaded hive window.")).toBeInTheDocument();
    expect(screen.getByTestId("donut").textContent).toContain("4:of loaded-window p95");
    expect(screen.getByTestId("heatmap")).toHaveAttribute("data-max-cell", "1");
  });

  it("shows truthful empty, loading, and failed states", () => {
    apiMock.useHiveFeed.mockReturnValue({ isLoading: false, isError: false, data: { actions: [] } });
    const { rerender } = render(<ActivityHeatmap />);
    expect(screen.getByText("No hive actions recorded in the loaded 7-day window.")).toBeInTheDocument();
    expect(screen.getByText(/window=24h and workspace=all/i)).toBeInTheDocument();

    apiMock.useHiveFeed.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    rerender(<ActivityHeatmap />);
    expect(screen.getByText("No hive actions recorded in the loaded 7-day window.")).toBeInTheDocument();

    apiMock.useHiveFeed.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    rerender(<ActivityHeatmap />);
    expect(screen.getByText("Failed to load /api/hive.")).toBeInTheDocument();
  });
});
