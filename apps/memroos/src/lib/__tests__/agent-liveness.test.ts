import { describe, expect, it } from "vitest";

import {
  buildLivenessEnvelope,
  classifyLiveness,
  EMPTY_LIVENESS_COUNTS,
  LIVENESS_STATES,
  summarizeLivenessStates,
  summarizeReadiness,
} from "@/lib/agent-liveness";

describe("classifyLiveness", () => {
  it("returns never when no observation is recorded anywhere", () => {
    const obs = classifyLiveness({ lastHeartbeat: null, now: 0 });
    expect(obs.state).toBe("never");
    expect(obs.observedAt).toBeNull();
    expect(obs.freshnessMs).toBeNull();
    expect(obs.reason.toLowerCase()).toContain("never");
  });

  it("returns live when the heartbeat is within the freshness threshold", () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const obs = classifyLiveness({
      lastHeartbeat: "2026-07-15T11:45:00.000Z",
      freshnessThresholdMs: 30 * 60 * 1000,
      now,
    });
    expect(obs.state).toBe("live");
    expect(obs.observedAt).toBe("2026-07-15T11:45:00.000Z");
    expect(obs.freshnessMs).toBe(15 * 60 * 1000);
  });

  it("returns stale when the heartbeat is older than the threshold", () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const obs = classifyLiveness({
      lastHeartbeat: "2026-07-15T11:00:00.000Z",
      freshnessThresholdMs: 30 * 60 * 1000,
      now,
    });
    expect(obs.state).toBe("stale");
    expect(obs.observedAt).toBe("2026-07-15T11:00:00.000Z");
    expect(obs.freshnessMs).toBe(60 * 60 * 1000);
    expect(obs.reason).toMatch(/3600s old/);
  });

  it("treats hive action as fresh signal when it is newer than heartbeat", () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const obs = classifyLiveness({
      lastHeartbeat: "2026-07-15T09:00:00.000Z",
      hiveActivityAt: "2026-07-15T11:55:00.000Z",
      freshnessThresholdMs: 30 * 60 * 1000,
      now,
    });
    expect(obs.state).toBe("live");
    expect(obs.source).toBe("sqlite://hive_actions.timestamp");
  });

  it("downgrades to stale when only local runtime is recent but heartbeat is missing", () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const obs = classifyLiveness({
      lastHeartbeat: null,
      hiveActivityAt: null,
      localRuntimeAt: "2026-07-15T11:58:00.000Z",
      freshnessThresholdMs: 30 * 60 * 1000,
      now,
    });
    expect(obs.state).toBe("live");
    expect(obs.source).toBe("host://local-agent-runtime.scan");
  });

  it("ignores heartbeat without parseable timestamp", () => {
    const obs = classifyLiveness({ lastHeartbeat: "not-a-date", now: 0 });
    expect(obs.state).toBe("never");
  });
});

describe("summarizeLivenessStates", () => {
  it("aggregates per-state counts", () => {
    const counts = summarizeLivenessStates([
      { state: "live", observedAt: null, freshnessMs: null, source: "x", reason: "x" },
      { state: "live", observedAt: null, freshnessMs: null, source: "x", reason: "x" },
      { state: "stale", observedAt: null, freshnessMs: null, source: "x", reason: "x" },
      { state: "never", observedAt: null, freshnessMs: null, source: "x", reason: "x" },
    ]);
    expect(counts).toEqual({
      live: 2,
      stale: 1,
      never: 1,
      missing: 0,
      error: 0,
      total: 4,
    });
  });

  it("returns EMPTY_LIVENESS_COUNTS when no observations are provided", () => {
    expect(summarizeLivenessStates([])).toEqual(EMPTY_LIVENESS_COUNTS);
  });
});

describe("buildLivenessEnvelope", () => {
  const scope = { window: "24h", workspace: "all" } as const;

  it("returns error envelope when source probe failed", () => {
    const env = buildLivenessEnvelope({
      counts: EMPTY_LIVENESS_COUNTS,
      scope,
      observedAt: null,
      freshnessMs: null,
      sourceOk: false,
      sourceError: "SQLITE_BUSY",
    });
    expect(env.status).toBe("error");
    expect(env.value).toBeNull();
    expect(env.reason).toContain("SQLITE_BUSY");
  });

  it("returns empty envelope when no agents are registered", () => {
    const env = buildLivenessEnvelope({
      counts: EMPTY_LIVENESS_COUNTS,
      scope,
      observedAt: null,
      freshnessMs: null,
      sourceOk: true,
    });
    expect(env.status).toBe("empty");
    expect(env.value).toBeNull();
    expect(env.reason.toLowerCase()).toContain("empty");
  });

  it("returns live when every registered agent is fresh", () => {
    const env = buildLivenessEnvelope({
      counts: { live: 3, stale: 0, never: 0, missing: 0, error: 0, total: 3 },
      scope,
      observedAt: "2026-07-15T12:00:00.000Z",
      freshnessMs: 1000,
      sourceOk: true,
    });
    expect(env.status).toBe("live");
    expect(env.value).toBe(3);
  });

  it("returns degraded when some agents are stale or never and at least one is live", () => {
    const env = buildLivenessEnvelope({
      counts: { live: 1, stale: 1, never: 1, missing: 0, error: 0, total: 3 },
      scope,
      observedAt: "2026-07-15T12:00:00.000Z",
      freshnessMs: 1000,
      sourceOk: true,
    });
    expect(env.status).toBe("degraded");
    expect(env.value).toBe(1);
    expect(env.reason).toMatch(/1 live/);
    expect(env.reason).toMatch(/1 stale/);
    expect(env.reason).toMatch(/1 never/);
  });

  it("returns stale when every registered agent is stale", () => {
    const env = buildLivenessEnvelope({
      counts: { live: 0, stale: 4, never: 0, missing: 0, error: 0, total: 4 },
      scope,
      observedAt: "2026-07-15T12:00:00.000Z",
      freshnessMs: 60 * 60 * 1000,
      sourceOk: true,
    });
    expect(env.status).toBe("stale");
    expect(env.value).toBe(0);
  });

  it("returns degraded when at least one classification failed", () => {
    const env = buildLivenessEnvelope({
      counts: { live: 1, stale: 0, never: 0, missing: 0, error: 1, total: 2 },
      scope,
      observedAt: "2026-07-15T12:00:00.000Z",
      freshnessMs: 1000,
      sourceOk: true,
    });
    expect(env.status).toBe("degraded");
    expect(env.reason).toMatch(/failed liveness classification/);
  });
});

describe("summarizeReadiness", () => {
  it("returns nulls for empty input", () => {
    expect(summarizeReadiness([])).toEqual({
      average: null,
      min: null,
      max: null,
      withCapabilities: 0,
      total: 0,
    });
  });

  it("computes average/min/max and counts agents with capabilities", () => {
    const summary = summarizeReadiness([0, 55, 80, 100]);
    expect(summary.average).toBe(59);
    expect(summary.min).toBe(0);
    expect(summary.max).toBe(100);
    expect(summary.withCapabilities).toBe(3);
    expect(summary.total).toBe(4);
  });
});

describe("LIVENESS_STATES export", () => {
  it("lists all canonical liveness states", () => {
    expect(LIVENESS_STATES).toEqual([
      "live",
      "stale",
      "never",
      "missing",
      "error",
    ]);
  });
});
