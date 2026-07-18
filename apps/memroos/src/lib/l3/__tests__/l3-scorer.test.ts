// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { buildDefaultEvalConfig } from "@/lib/evals/config";
import { createEvalScorerRegistry, scoreTraceWithEvalEngine } from "@/lib/evals/engine";
import type { AgentEvalTrace, GoldenSetExample } from "@/lib/evals/types";
import type { BusinessOutcomeEvent } from "../types";
import {
  aggregateKpis,
  businessOpsL3Scorer,
  computeWeightedScore,
  readEventsForCorrelation,
} from "../l3-scorer";

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function insertEvent(db: Database.Database, event: Partial<BusinessOutcomeEvent> & { correlationId: string }): void {
  db.prepare(
    `INSERT OR IGNORE INTO business_outcome_events
       (tenant_id, correlation_id, source_system, adapter, event_type, kpi_key, kpi_value, raw_json, polled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.tenantId ?? "default-tenant",
    event.correlationId,
    event.sourceSystem ?? "crm",
    event.adapter ?? "hubspot",
    event.eventType ?? "deal_advance",
    event.kpiKey ?? "completion_rate",
    event.kpiValue ?? 1,
    event.rawJson ?? "{}",
    event.polledAt ?? new Date().toISOString()
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock getDb to use the test in-memory DB
// ──────────────────────────────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

beforeEach(() => {
  testDb = makeDb();
});

afterEach(() => {
  testDb.close();
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: null-sentinel when no events
// ──────────────────────────────────────────────────────────────────────────────

describe("businessOpsL3Scorer — null-sentinel path", () => {
  it("returns unavailable=true and score=0 when no events for correlationId", () => {
    const trace: AgentEvalTrace = {
      traceId: "trace-no-events",
      agentId: "agent-1",
      agentModelFamily: "openai",
      input: "Do the thing",
      output: "Done",
    };
    const config = buildDefaultEvalConfig();
    const context = {
      config,
      judge: {
        score: 0.8,
        rubricScores: { faithful: 0.8, useful: 0.9, policy: 1.0 },
        model: "claude-haiku",
        provider: "anthropic",
        modelFamily: "anthropic",
        promptTemplateVersion: "v1",
        promptHash: "abc",
        positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
      },
      goldenSet: [],
    };

    const result = businessOpsL3Scorer.score(trace, context);
    expect(result.score).toBe(0);
    expect(result.metadata?.unavailable).toBe(true);
    expect(result.scorerId).toBe("business_ops_l3");
    expect(result.layer).toBe("l3");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: happy path with fixture events
// ──────────────────────────────────────────────────────────────────────────────

describe("businessOpsL3Scorer — happy path", () => {
  it("computes correct KPI score from fixture events", () => {
    insertEvent(testDb, {
      correlationId: "trace-happy",
      kpiKey: "completion_rate",
      kpiValue: 1.0,
      eventType: "deal_advance",
    });
    insertEvent(testDb, {
      correlationId: "trace-happy",
      kpiKey: "escalation_rate",
      kpiValue: 1.0, // no escalation => 1
      eventType: "escalation",
    });
    insertEvent(testDb, {
      correlationId: "trace-happy",
      kpiKey: "approval_rate",
      kpiValue: 1.0,
      eventType: "lead_disposition",
    });

    const trace: AgentEvalTrace = {
      traceId: "trace-happy",
      agentId: "agent-1",
      agentModelFamily: "openai",
      input: "Do the thing",
      output: "Done",
    };
    const config = buildDefaultEvalConfig();
    const context = {
      config,
      judge: {
        score: 0.8,
        rubricScores: { faithful: 0.8, useful: 0.9, policy: 1.0 },
        model: "claude-haiku",
        provider: "anthropic",
        modelFamily: "anthropic",
        promptTemplateVersion: "v1",
        promptHash: "abc",
        positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
      },
      goldenSet: [],
    };

    const result = businessOpsL3Scorer.score(trace, context);
    expect(result.metadata?.unavailable).toBeFalsy();
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    // With 3 KPIs all at 1.0, normalized weighted score should be close to 1.
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("reads from in-memory DB via readEventsForCorrelation", () => {
    insertEvent(testDb, { correlationId: "trace-read-test", kpiKey: "completion_rate", kpiValue: 0.75 });
    const events = readEventsForCorrelation("trace-read-test");
    expect(events).toHaveLength(1);
    expect(events[0].kpiValue).toBe(0.75);
    expect(events[0].correlationId).toBe("trace-read-test");
  });

  it("filters business outcome events by tenant when trace metadata carries tenantId", () => {
    insertEvent(testDb, {
      tenantId: "tenant-alpha",
      correlationId: "trace-shared",
      kpiKey: "completion_rate",
      kpiValue: 1.0,
      eventType: "deal_advance",
    });
    insertEvent(testDb, {
      tenantId: "tenant-beta",
      correlationId: "trace-shared",
      kpiKey: "completion_rate",
      kpiValue: 0.1,
      eventType: "deal_advance",
    });

    const events = readEventsForCorrelation("trace-shared", "tenant-alpha");
    expect(events).toHaveLength(1);
    expect(events[0].tenantId).toBe("tenant-alpha");

    const trace: AgentEvalTrace = {
      traceId: "trace-shared",
      agentId: "agent-1",
      agentModelFamily: "openai",
      input: "Do the thing",
      output: "Done",
      metadata: { tenantId: "tenant-alpha" },
    };
    const context = {
      config: buildDefaultEvalConfig(),
      judge: {
        score: 0.8,
        rubricScores: { faithful: 0.8, useful: 0.9, policy: 1.0 },
        model: "claude-haiku",
        provider: "anthropic",
        modelFamily: "anthropic",
        promptTemplateVersion: "v1",
        promptHash: "abc",
        positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
      },
      goldenSet: [],
    };
    const result = businessOpsL3Scorer.score(trace, context);
    expect(result.metadata?.tenantId).toBe("tenant-alpha");
    expect(result.metadata?.eventCount).toBe(1);
  });

  it("uses tenant_id metadata and company-specific L3 sub-weights", () => {
    insertEvent(testDb, {
      tenantId: "tenant-alpha",
      correlationId: "trace-company",
      kpiKey: "completion_rate",
      kpiValue: 1.0,
      eventType: "completion",
      polledAt: "2026-07-18T10:00:00.000Z",
    });
    insertEvent(testDb, {
      tenantId: "tenant-alpha",
      correlationId: "trace-company",
      kpiKey: "cost_per_task",
      kpiValue: 0.25,
      eventType: "task_cost",
      polledAt: "2026-07-18T10:00:01.000Z",
    });
    insertEvent(testDb, {
      tenantId: "tenant-beta",
      correlationId: "trace-company",
      kpiKey: "cost_per_task",
      kpiValue: 1.0,
      eventType: "task_cost",
      polledAt: "2026-07-18T10:00:02.000Z",
    });

    const config = buildDefaultEvalConfig();
    config.companies.acme = {
      l3_sub_weights: {
        completion_rate: 0,
        escalation_rate: 0,
        ttr_p50: 0,
        operator_approval_rate: 0,
        cost_per_task: 1,
      } as typeof config.companies.default.l3_sub_weights,
    };
    const result = businessOpsL3Scorer.score(
      {
        traceId: "trace-company",
        agentId: "agent-1",
        agentModelFamily: "openai",
        input: "Do the thing",
        output: "Done",
        metadata: { tenant_id: "tenant-alpha", company_id: "acme" },
      },
      {
        config,
        judge: {
          score: 0.8,
          rubricScores: { faithful: 0.8, useful: 0.9, policy: 1.0 },
          model: "claude-haiku",
          provider: "anthropic",
          modelFamily: "anthropic",
          promptTemplateVersion: "v1",
          promptHash: "abc",
          positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
        },
        goldenSet: [],
      }
    );

    expect(result.score).toBe(0.25);
    expect(result.metadata).toMatchObject({
      tenantId: "tenant-alpha",
      companyId: "acme",
      eventCount: 2,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: aggregateKpis helper
// ──────────────────────────────────────────────────────────────────────────────

describe("aggregateKpis", () => {
  it("returns all-null signal for empty event array", () => {
    const kpis = aggregateKpis([]);
    expect(kpis.completionRate).toBeNull();
    expect(kpis.escalationRate).toBeNull();
    expect(kpis.ttrP50Ms).toBeNull();
    expect(kpis.approvalRate).toBeNull();
    expect(kpis.costPerTask).toBeNull();
  });

  it("averages values for the same kpi_key across multiple events", () => {
    const events: BusinessOutcomeEvent[] = [
      { correlationId: "c", tenantId: "t", sourceSystem: "crm", adapter: "hubspot", eventType: "deal_advance", kpiKey: "completion_rate", kpiValue: 0.8, rawJson: "{}", polledAt: "" },
      { correlationId: "c", tenantId: "t", sourceSystem: "crm", adapter: "hubspot", eventType: "deal_advance", kpiKey: "completion_rate", kpiValue: 1.0, rawJson: "{}", polledAt: "" },
    ];
    const kpis = aggregateKpis(events);
    expect(kpis.completionRate).toBeCloseTo(0.9);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: computeWeightedScore helper
// ──────────────────────────────────────────────────────────────────────────────

describe("computeWeightedScore", () => {
  it("returns 0.5 when all KPI values are null", () => {
    const kpis = { completionRate: null, escalationRate: null, ttrP50Ms: null, approvalRate: null, costPerTask: null };
    const weights = { completion_rate: 0.35, escalation_rate: 0.25, ttr_p50: 0.2, approval_rate: 0.1, cost_per_task: 0.1 };
    expect(computeWeightedScore(kpis, weights)).toBe(0.5);
  });

  it("computes weighted average ignoring null KPIs", () => {
    const kpis = { completionRate: 1.0, escalationRate: null, ttrP50Ms: null, approvalRate: null, costPerTask: null };
    // Only completion_rate available with weight 0.35; normalized: 1.0 * 0.35 / 0.35 = 1.0
    const weights = { completion_rate: 0.35, escalation_rate: 0.25, ttr_p50: 0.2, approval_rate: 0.1, cost_per_task: 0.1 };
    expect(computeWeightedScore(kpis, weights)).toBeCloseTo(1.0);
  });

  it("clamps result to [0, 1]", () => {
    const kpis = { completionRate: 1.5, escalationRate: null, ttrP50Ms: null, approvalRate: null, costPerTask: null };
    const weights = { completion_rate: 1.0, escalation_rate: 0, ttr_p50: 0, approval_rate: 0, cost_per_task: 0 };
    expect(computeWeightedScore(kpis, weights)).toBe(1.0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: Null-L3 path in engine produces normalized W in [0,1]
// ──────────────────────────────────────────────────────────────────────────────

describe("Engine null-L3 path", () => {
  it("produces W in [0,1] when all L3 scorers are unavailable", () => {
    const trace: AgentEvalTrace = {
      traceId: "trace-null-l3",
      agentId: "agent-2",
      agentModelFamily: "openai",
      input: "Hello",
      output: "World",
      expectedFacts: ["World"],
    };

    const config = buildDefaultEvalConfig();
    // Override l3 outcome to only use business_ops_l3 (which will be unavailable since no DB events)
    config.scorers.l3Outcome = ["business_ops_l3"];

    const goldenSet: GoldenSetExample[] = [
      {
        id: "g1",
        input: "Hello",
        expectedOutput: "World",
        humanScore: 0.8,
        trace,
      },
    ];

    const registry = createEvalScorerRegistry();
    const result = scoreTraceWithEvalEngine({ trace, config, goldenSet, registry });

    expect(result.compositeW).toBeGreaterThanOrEqual(0);
    expect(result.compositeW).toBeLessThanOrEqual(1);
    // Since L3 is all-unavailable, compositeW should be L1/L2 renormalized
    // L3 layer score should still be in the breakdown
    expect(result.layers.l3).toBeDefined();
    expect(result.layers.l3.scorers[0].metadata?.unavailable).toBe(true);
  });
});
