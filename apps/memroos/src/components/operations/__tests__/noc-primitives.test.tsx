import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  Delta,
  EnvelopeCaption,
  Legend,
  Mono,
  NocCard,
  NocPanelHeader,
  PillBtn,
  SourceStatusBadge,
  formatFreshness,
  formatObservedAt,
  severityColor,
  statusBadgeColor,
} from "../noc-primitives";

describe("noc-primitives", () => {
  it("formats observed timestamps and freshness values safely", () => {
    expect(formatObservedAt(null)).toBe("—");
    expect(formatObservedAt("not-a-date")).toBe("not-a-date");
    expect(formatObservedAt("2026-07-18T12:34:56.789Z")).toBe("2026-07-18 12:34:56Z");

    expect(formatFreshness(null)).toBe("—");
    expect(formatFreshness(Number.NaN)).toBe("—");
    expect(formatFreshness(-500)).toBe("0s");
    expect(formatFreshness(59_500)).toBe("60s");
    expect(formatFreshness(30 * 60_000)).toBe("30m");
    expect(formatFreshness(3 * 60 * 60_000)).toBe("3h");
    expect(formatFreshness(3 * 24 * 60 * 60_000)).toBe("3d");
  });

  it("maps metric statuses and signal severities to distinct colors", () => {
    for (const status of ["live", "zero", "empty", "stale", "blocked", "unavailable", "degraded", "error"] as const) {
      expect(statusBadgeColor(status)).toEqual({
        background: expect.any(String),
        color: expect.any(String),
      });
    }

    expect(new Set([
      severityColor("high"),
      severityColor("med"),
      severityColor("low"),
      severityColor("info"),
    ]).size).toBe(4);
  });

  it("renders source badges, envelopes, card headers, legends, mono text, and deltas", () => {
    render(
      <NocCard pad={8} style={{ marginTop: 2 }}>
        <NocPanelHeader title="Panel title" hint="Helpful hint" right={<SourceStatusBadge status="error" label="bad" />} />
        <EnvelopeCaption
          showScope
          envelope={{
            value: null,
            status: "stale",
            source: "api",
            observedAt: "2026-07-18T12:00:00.000Z",
            freshnessMs: 120_000,
            scope: { window: "24h", workspace: "ops" },
            reason: "late data",
          }}
        />
        <EnvelopeCaption envelope={null} />
        <Mono>mono text</Mono>
        <Delta value="+12%" />
        <Delta value="-4%" />
        <Delta value="0%" />
        <Legend color="#123456" label="legend label" />
      </NocCard>,
    );

    expect(screen.getByText("Panel title")).toBeInTheDocument();
    expect(screen.getByText("Helpful hint")).toBeInTheDocument();
    expect(screen.getByText("bad")).toHaveAttribute("data-status", "error");
    expect(screen.getByText("late data")).toBeInTheDocument();
    expect(screen.getByText("source:")).toBeInTheDocument();
    expect(screen.getByText("scope: window=24h, workspace=ops")).toBeInTheDocument();
    expect(screen.getByText(/observed: 2026-07-18 12:00:00Z/)).toBeInTheDocument();
    expect(screen.getByText("mono text")).toBeInTheDocument();
    expect(screen.getByText("+12%")).toBeInTheDocument();
    expect(screen.getByText("-4%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("legend label")).toBeInTheDocument();
  });

  it("renders navigation anchors and clickable buttons for pill controls", () => {
    const onClick = vi.fn();
    render(
      <>
        <PillBtn href="/ledger">Open ledger</PillBtn>
        <PillBtn onClick={onClick} variant="solid">Run action</PillBtn>
      </>,
    );

    expect(screen.getByRole("link", { name: "Open ledger" })).toHaveAttribute("data-navigation-element", "anchor");
    expect(screen.getByRole("link", { name: "Open ledger" })).toHaveAttribute("href", "/ledger");
    fireEvent.click(screen.getByRole("button", { name: "Run action" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
