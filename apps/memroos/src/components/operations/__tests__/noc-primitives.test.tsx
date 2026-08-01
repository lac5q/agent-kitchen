import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetricEnvelope } from "@/lib/metric-status";
import {
  Delta,
  EnvelopeCaption,
  Eyebrow,
  formatFreshness,
  formatObservedAt,
  Legend,
  Mono,
  NocCard,
  NocPanelHeader,
  PillBtn,
  severityColor,
  SourceStatusBadge,
  statusBadgeColor,
} from "../noc-primitives";

function envelope(
  overrides: Partial<MetricEnvelope<unknown>> = {},
): MetricEnvelope<unknown> {
  return {
    value: null,
    status: "live",
    source: "sqlite://test",
    observedAt: "2026-07-20T12:00:00.000Z",
    freshnessMs: 45_000,
    scope: { window: "24h", workspace: "all" },
    reason: null,
    ...overrides,
  };
}

describe("noc-primitives helpers", () => {
  it("formatObservedAt handles null, invalid, and valid timestamps", () => {
    expect(formatObservedAt(null)).toBe("—");
    expect(formatObservedAt("not-a-date")).toBe("not-a-date");
    expect(formatObservedAt("2026-07-20T12:00:00.000Z")).toBe("2026-07-20 12:00:00Z");
  });

  it("formatFreshness scales seconds, minutes, hours, and days", () => {
    expect(formatFreshness(null)).toBe("—");
    expect(formatFreshness(NaN)).toBe("—");
    expect(formatFreshness(30_000)).toBe("30s");
    expect(formatFreshness(90_000)).toBe("2m");
    expect(formatFreshness(3_600_000)).toBe("1h");
    expect(formatFreshness(86_400_000)).toBe("1d");
  });

  it("statusBadgeColor maps every metric status", () => {
    expect(statusBadgeColor("live").color).toBeTruthy();
    expect(statusBadgeColor("zero").color).toBeTruthy();
    expect(statusBadgeColor("empty").color).toBeTruthy();
    expect(statusBadgeColor("stale").color).toBeTruthy();
    expect(statusBadgeColor("blocked").color).toBeTruthy();
    expect(statusBadgeColor("unavailable").color).toBeTruthy();
    expect(statusBadgeColor("degraded").color).toBeTruthy();
    expect(statusBadgeColor("error").color).toBeTruthy();
  });

  it("severityColor distinguishes high, med, low, and info", () => {
    expect(severityColor("high")).not.toBe(severityColor("info"));
    expect(severityColor("med")).not.toBe(severityColor("low"));
  });
});

describe("noc-primitives components", () => {
  it("SourceStatusBadge renders custom label and status attribute", () => {
    render(<SourceStatusBadge status="blocked" label="BLOCKED" />);
    const badge = screen.getByText("BLOCKED");
    expect(badge).toHaveAttribute("data-status", "blocked");
  });

  it("EnvelopeCaption shows placeholder when envelope is missing", () => {
    render(<EnvelopeCaption envelope={null} />);
    expect(screen.getByText(/source: —/)).toBeInTheDocument();
  });

  it("EnvelopeCaption surfaces reason, scope, and freshness for non-live envelopes", () => {
    render(
      <EnvelopeCaption
        envelope={envelope({
          status: "error",
          reason: "upstream timeout",
          freshnessMs: 120_000,
        })}
        showScope
      />,
    );
    expect(screen.getByText(/upstream timeout/)).toBeInTheDocument();
    expect(screen.getByText(/scope: window=24h, workspace=all/)).toBeInTheDocument();
    expect(screen.getByText(/observed:/)).toBeInTheDocument();
    expect(screen.getByText(/2m/)).toBeInTheDocument();
  });

  it("EnvelopeCaption hides freshness when showFreshness is false", () => {
    render(
      <EnvelopeCaption
        envelope={envelope({ status: "live" })}
        showFreshness={false}
      />,
    );
    expect(screen.queryByText(/age /)).not.toBeInTheDocument();
  });

  it("NocCard and NocPanelHeader render children and optional hint/right slot", () => {
    render(
      <NocCard>
        <NocPanelHeader title="Panel title" hint="hint text" right={<span>right slot</span>} />
        <Eyebrow>Eyebrow label</Eyebrow>
        <Mono size={12}>mono text</Mono>
      </NocCard>,
    );
    expect(screen.getByText("Panel title")).toBeInTheDocument();
    expect(screen.getByText("hint text")).toBeInTheDocument();
    expect(screen.getByText("right slot")).toBeInTheDocument();
    expect(screen.getByText("Eyebrow label")).toBeInTheDocument();
    expect(screen.getByText("mono text")).toBeInTheDocument();
  });

  it("Delta colors positive, negative, and neutral values", () => {
    const { rerender } = render(<Delta value="+12%" />);
    expect(screen.getByText("+12%")).toBeInTheDocument();
    rerender(<Delta value="-8%" />);
    expect(screen.getByText("-8%")).toBeInTheDocument();
    rerender(<Delta value="0%" />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("Legend pairs a color swatch with a label", () => {
    render(<Legend color="#ff0000" label="Live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("PillBtn renders anchor navigation and button onClick variants", () => {
    const onClick = vi.fn();
    const { rerender } = render(<PillBtn href="/seal">Open seal</PillBtn>);
    const link = screen.getByRole("link", { name: "Open seal" });
    expect(link).toHaveAttribute("href", "/seal");
    expect(link).toHaveAttribute("data-navigation-element", "anchor");

    rerender(<PillBtn onClick={onClick}>Click me</PillBtn>);
    fireEvent.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalled();
  });
});
