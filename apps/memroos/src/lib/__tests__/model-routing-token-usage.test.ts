// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  aggregateModelRoutingTokenUsage,
  recordModelRoutingEvent,
} from "@/lib/model-routing";
import { aggregateEfficiencyTokenLedger } from "@/lib/efficiency-telemetry";
import { mergeModelUsageSources } from "@/lib/efficiency-telemetry";

describe("aggregateModelRoutingTokenUsage", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(db);
  });

  it("rolls input/output tokens by provider/model", () => {
    recordModelRoutingEvent(db, {
      taskType: "engineering",
      provider: "openai",
      model: "gpt-5.4-mini",
      inputTokens: 1000,
      outputTokens: 250,
      success: true,
    });
    recordModelRoutingEvent(db, {
      taskType: "engineering",
      provider: "openai",
      model: "gpt-5.4-mini",
      inputTokens: 500,
      outputTokens: 50,
      success: true,
    });
    recordModelRoutingEvent(db, {
      taskType: "research",
      provider: "anthropic",
      model: "claude-sonnet",
      inputTokens: 200,
      outputTokens: 100,
      success: true,
    });

    const usage = aggregateModelRoutingTokenUsage(db);
    expect(usage.models).toHaveLength(2);
    expect(usage.models[0]).toMatchObject({
      id: "openai/gpt-5.4-mini",
      inputTokens: 1500,
      outputTokens: 300,
      requests: 2,
      totalTokens: 1800,
    });
    expect(usage.total.inputTokens).toBe(1700);
    expect(usage.total.outputTokens).toBe(400);
    expect(usage.total.requests).toBe(3);
  });

  it("ignores zero-token routing rows", () => {
    recordModelRoutingEvent(db, {
      taskType: "engineering",
      provider: "local",
      model: "noop",
      inputTokens: 0,
      outputTokens: 0,
      success: true,
    });
    expect(aggregateModelRoutingTokenUsage(db).models).toHaveLength(0);
  });

  it("must not be merged with token_ledger from the same routing write (double-count)", () => {
    recordModelRoutingEvent(db, {
      taskType: "engineering",
      provider: "openai",
      model: "gpt-5.4-mini",
      inputTokens: 1000,
      outputTokens: 250,
      rawContextTokens: 300,
      cachedTokens: 50,
      success: true,
    });

    const ledger = aggregateEfficiencyTokenLedger(db);
    const routing = aggregateModelRoutingTokenUsage(db);
    expect(ledger.models.length).toBeGreaterThan(0);
    expect(routing.models.length).toBeGreaterThan(0);

    // Production path: prefer ledger when present; routing is fallback only.
    const durable = ledger.models.length > 0 ? ledger : routing;
    const merged = mergeModelUsageSources(durable);
    const double = mergeModelUsageSources(ledger, routing);

    expect(merged.total.requests).toBe(1);
    expect(double.total.requests).toBe(2);
  });
});
