import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetricEnvelope } from "@/lib/metric-status";

vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  Tooltip: ({ content }: { content?: React.ReactElement }) =>
    content
      ? React.cloneElement(content, {
          active: true,
          payload: [{ name: "gpt-4", value: 1200, payload: { percent: 0.6 } }],
        })
      : null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ModelMixChart } from "../model-mix-chart";

function envelope(
  status: MetricEnvelope<number>["status"],
  reason?: string
): MetricEnvelope<number> {
  return {
    value: null,
    status,
    source: "/api/custom-model-usage",
    observedAt: null,
    freshnessMs: null,
    scope: { window: "week", workspace: "default" },
    reason: reason ?? null,
  };
}

describe("ModelMixChart", () => {
  it("renders default source attribute", () => {
    const { container } = render(<ModelMixChart data={[]} />);
    expect(container.querySelector("[data-model-mix-source]")?.getAttribute("data-model-mix-source")).toBe(
      "/api/model-usage"
    );
  });

  it("shows empty-state copy for healthy sources with no data", () => {
    render(<ModelMixChart data={[]} envelope={envelope("live")} />);
    expect(screen.getByText(/no model usage recorded/i)).toBeInTheDocument();
    expect(document.querySelector("[data-model-mix-empty]")).toBeTruthy();
  });

  it("shows blocked and error empty-state messages", () => {
    const { rerender } = render(<ModelMixChart data={[]} envelope={envelope("blocked")} />);
    expect(screen.getByText(/loading model mix/i)).toBeInTheDocument();

    rerender(<ModelMixChart data={[]} envelope={envelope("error")} />);
    expect(screen.getByText(/model mix unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it("renders non-live status banner with reason", () => {
    render(
      <ModelMixChart
        data={[]}
        envelope={envelope("stale", "upstream lag")}
      />
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("upstream lag")).toBeInTheDocument();
  });

  it("renders pie chart when data is present", () => {
    render(
      <ModelMixChart
        data={[
          { name: "gpt-4", value: 10 },
          { name: "claude", value: 5 },
        ]}
        envelope={envelope("live")}
      />
    );
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText(/1,200 calls \(60.0%\)/)).toBeInTheDocument();
  });
});
