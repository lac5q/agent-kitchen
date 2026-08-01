import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetricEnvelope } from "@/lib/metric-status";

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }) => (
    <div data-testid="x-axis-labels">
      {[1_500_000, 12_000, 42].map((value) => (
        <span key={value}>{tickFormatter?.(value)}</span>
      ))}
    </div>
  ),
  YAxis: () => null,
  Tooltip: ({ content }: { content?: React.ReactElement }) =>
    content
      ? React.cloneElement(content, {
          active: true,
          label: "test",
          payload: [
            { name: "Tokens Used", value: 1_500_000, color: "#336699" },
            { name: "Tokens Saved", value: 12_000, color: "#22aa55" },
          ],
        })
      : null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SavingsChart } from "../savings-chart";

function envelope(
  status: MetricEnvelope<number>["status"],
  reason?: string
): MetricEnvelope<number> {
  return {
    value: null,
    status,
    source: "/api/tokens?section=custom",
    observedAt: null,
    freshnessMs: null,
    scope: { window: "week", workspace: "default" },
    reason: reason ?? null,
  };
}

describe("SavingsChart", () => {
  it("renders default source attribute", () => {
    const { container } = render(<SavingsChart data={[]} />);
    expect(container.querySelector("[data-savings-source]")?.getAttribute("data-savings-source")).toBe(
      "/api/tokens?section=commandBreakdown"
    );
  });

  it("shows empty-state copy for healthy sources with no data", () => {
    render(<SavingsChart data={[]} envelope={envelope("zero")} />);
    expect(screen.getByText(/no per-command savings available/i)).toBeInTheDocument();
  });

  it("shows blocked and error empty-state messages", () => {
    const { rerender } = render(<SavingsChart data={[]} envelope={envelope("blocked")} />);
    expect(screen.getByText(/loading savings breakdown/i)).toBeInTheDocument();

    rerender(<SavingsChart data={[]} envelope={envelope("error")} />);
    expect(screen.getByText(/savings breakdown unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/error/i)).toBeInTheDocument();

    rerender(
      <SavingsChart
        data={[]}
        envelope={envelope("unavailable", "RTK CLI is optional and unavailable on this host")}
      />
    );
    expect(screen.getByText(/savings breakdown unavailable/i)).toBeInTheDocument();
    expect(document.querySelector('[data-savings-status="unavailable"]')).toBeTruthy();
    expect(screen.queryByText(/no per-command savings available/i)).not.toBeInTheDocument();
  });

  it("renders non-live status banner with custom source", () => {
    const { container } = render(
      <SavingsChart
        data={[]}
        envelope={envelope("degraded", "partial rollup")}
      />
    );
    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("partial rollup")).toBeInTheDocument();
    expect(container.querySelector("[data-savings-source]")?.getAttribute("data-savings-source")).toBe(
      "/api/tokens?section=custom"
    );
  });

  it("renders bar chart when data is present", () => {
    render(
      <SavingsChart
        data={[
          { command: "test", tokensUsed: 1200, tokensSaved: 800 },
          { command: "lint", tokensUsed: 50, tokensSaved: 10 },
        ]}
        envelope={envelope("live")}
      />
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.getByText("Tokens Used: 1.5M")).toBeInTheDocument();
    expect(screen.getByText("Tokens Saved: 12K")).toBeInTheDocument();
    expect(screen.getByText("1.5M")).toBeInTheDocument();
    expect(screen.getByText("12K")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
