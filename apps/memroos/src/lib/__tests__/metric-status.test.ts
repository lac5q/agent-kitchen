// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  classifyScalar,
  describeMetricEnvelope,
  isTruthfulZeroEnvelope,
  type MetricEnvelope,
  type MetricScope,
  type MetricStatus,
  metricEnvelope,
  normalizeScope,
  panelStatusToMetricStatus,
  withSourceMeta,
} from "@/lib/metric-status";

const scope: MetricScope = { window: "24h", workspace: "all" };

describe("metric-status contract", () => {
  it("exposes the canonical truthful statuses", () => {
    const allowed: MetricStatus[] = [
      "live",
      "zero",
      "empty",
      "stale",
      "blocked",
      "unavailable",
      "degraded",
      "error",
    ];
    expect(allowed).toEqual([
      "live",
      "zero",
      "empty",
      "stale",
      "blocked",
      "unavailable",
      "degraded",
      "error",
    ]);
  });

  it("metricEnvelope builds a zero status with full source metadata", () => {
    const env = metricEnvelope({
      value: 0,
      status: "zero",
      source: "sqlite://messages",
      observedAt: "2026-07-13T12:00:00Z",
      scope,
      reason: "0 successful rows in the selected window",
    });

    expect(env.value).toBe(0);
    expect(env.status).toBe("zero");
    expect(env.source).toBe("sqlite://messages");
    expect(env.observedAt).toBe("2026-07-13T12:00:00Z");
    expect(env.freshnessMs).toBeNull();
    expect(env.scope).toEqual(scope);
    expect(env.reason).toBe("0 successful rows in the selected window");
  });

  it("metricEnvelope exposes null value when the source failed", () => {
    const env = metricEnvelope({
      value: null,
      status: "error",
      source: "sqlite://messages",
      observedAt: null,
      scope,
      reason: "SQLITE_BUSY: database is locked",
    });

    expect(env.value).toBeNull();
    expect(env.status).toBe("error");
    expect(env.observedAt).toBeNull();
    expect(env.reason).toContain("SQLITE_BUSY");
  });

  it("distinguishes empty from zero with the truthful status field", () => {
    const zero = metricEnvelope({
      value: 0,
      status: "zero",
      source: "sqlite://messages",
      observedAt: "2026-07-13T12:00:00Z",
      scope,
    });
    const empty = metricEnvelope({
      value: null,
      status: "empty",
      source: "sqlite://messages",
      observedAt: "2026-07-13T12:00:00Z",
      scope,
      reason: "Healthy source with no events in the selected window",
    });

    expect(zero.value).toBe(0);
    expect(zero.status).toBe("zero");
    expect(empty.value).toBeNull();
    expect(empty.status).toBe("empty");
    expect(empty.reason).toContain("no events");
  });

  it("preserves scope, freshness, source and reason through helper functions", () => {
    const merged = withSourceMeta(
      metricEnvelope({
        value: 12,
        status: "live",
        source: "sqlite://hive_delegations",
        observedAt: "2026-07-13T11:59:30Z",
        scope,
      }),
      { freshnessMs: 30_000, reason: "delegations counted for window=24h, workspace=all" }
    );

    expect(merged.freshnessMs).toBe(30_000);
    expect(merged.reason).toContain("window=24h");
  });

  it("classifyScalar returns empty when the underlying query is healthy with no rows", () => {
    expect(
      classifyScalar({ rowCount: 0, sourceOk: true, latestAt: null, freshnessMs: 30_000 }).status
    ).toBe("empty");
  });

  it("classifyScalar returns zero only when a healthy source actually counted zero", () => {
    expect(
      classifyScalar({ rowCount: 0, sourceOk: true, latestAt: "2026-07-13T12:00:00Z", freshnessMs: 30_000 }).status
    ).toBe("zero");
  });

  it("classifyScalar never collapses a query failure to zero", () => {
    expect(
      classifyScalar({ rowCount: 0, sourceOk: false, latestAt: null, freshnessMs: null }).status
    ).toBe("error");
  });

  it("classifyScalar marks stale observations older than the freshness threshold", () => {
    const result = classifyScalar({
      rowCount: 4,
      sourceOk: true,
      latestAt: "2026-07-13T11:00:00Z",
      freshnessMs: 4 * 60 * 60 * 1000,
      freshnessThresholdMs: 30 * 60 * 1000,
      now: new Date("2026-07-13T12:00:00Z").getTime(),
    });
    expect(result.status).toBe("stale");
  });

  it("panelStatusToMetricStatus maps the legacy panel contract faithfully", () => {
    expect(panelStatusToMetricStatus("live", { sourceOk: true, rowCount: 5 })).toBe("live");
    expect(panelStatusToMetricStatus("empty", { sourceOk: true, rowCount: 0 })).toBe("empty");
    expect(panelStatusToMetricStatus("degraded", { sourceOk: false, rowCount: 0 })).toBe("error");
    expect(panelStatusToMetricStatus("missing", { sourceOk: false, rowCount: 0 })).toBe("unavailable");
  });

  it("describeMetricEnvelope surfaces the correct human-readable state", () => {
    expect(describeMetricEnvelope(metricEnvelope({
      value: 0,
      status: "zero",
      source: "sqlite://messages",
      observedAt: "2026-07-13T12:00:00Z",
      scope,
    })).label).toBe("measured zero");

    expect(describeMetricEnvelope(metricEnvelope({
      value: null,
      status: "empty",
      source: "sqlite://messages",
      observedAt: "2026-07-13T12:00:00Z",
      scope,
      reason: "no rows in window",
    })).label).toBe("empty");

    expect(describeMetricEnvelope(metricEnvelope({
      value: null,
      status: "error",
      source: "sqlite://messages",
      observedAt: null,
      scope,
      reason: "SQLITE_BUSY",
    })).label).toBe("error");
  });

  it("isTruthfulZeroEnvelope only returns true when the source measured zero", () => {
    expect(
      isTruthfulZeroEnvelope(
        metricEnvelope({ value: 0, status: "zero", source: "x", observedAt: "2026-07-13T12:00:00Z", scope })
      )
    ).toBe(true);

    expect(
      isTruthfulZeroEnvelope(
        metricEnvelope({ value: 0, status: "empty", source: "x", observedAt: null, scope })
      )
    ).toBe(false);

    expect(
      isTruthfulZeroEnvelope(
        metricEnvelope({ value: 0, status: "error", source: "x", observedAt: null, scope, reason: "boom" })
      )
    ).toBe(false);
  });

  it("normalizeScope falls back to defaults when values are empty", () => {
    const normalized = normalizeScope({ window: "", workspace: undefined }, "24h", "all");
    expect(normalized.window).toBe("24h");
    expect(normalized.workspace).toBe("all");
  });

  it("normalizeScope preserves non-empty window/workspace values", () => {
    const normalized = normalizeScope({ window: "7d", workspace: "local" }, "24h", "all");
    expect(normalized.window).toBe("7d");
    expect(normalized.workspace).toBe("local");
  });

  it("envelope reason field is always set for non-live statuses", () => {
    const env = metricEnvelope({
      value: null,
      status: "blocked",
      source: "policy://operator-load",
      observedAt: null,
      scope,
    });
    expect(env.reason).toBeTruthy();
    expect(env.reason).toContain("blocked");
  });

  it("preserves source, observedAt, freshness, scope, reason verbatim", () => {
    const env: MetricEnvelope<number> = metricEnvelope({
      value: 5,
      status: "live",
      source: "durable://efficiency_events",
      observedAt: "2026-07-13T12:00:00Z",
      freshnessMs: 1500,
      scope: { window: "7d", workspace: "local" },
      reason: "Aggregated from 5 efficiency_events rows in window=7d workspace=local",
    });

    expect(env.source).toBe("durable://efficiency_events");
    expect(env.observedAt).toBe("2026-07-13T12:00:00Z");
    expect(env.freshnessMs).toBe(1500);
    expect(env.scope).toEqual({ window: "7d", workspace: "local" });
    expect(env.reason).toContain("window=7d");
  });
});
