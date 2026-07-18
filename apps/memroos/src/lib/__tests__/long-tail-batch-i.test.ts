// @vitest-environment node
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { checkRateLimit } from "@/lib/public-api/rate-limiter";
import {
  loadEnabledMeetingCollections,
  searchMeetingCollections,
  type ExecFileAsync,
} from "@/lib/meeting-qmd-recall";
import {
  forbiddenUnderstandResponse,
  hasValidUnderstandGraphToken,
  makeUnderstandJsonRoute,
} from "@/lib/understand-graph";
import { createBuiltInScorers } from "@/lib/evals/scorers";
import { mergeFederatedPack } from "@/lib/federation/merge";
import type { FederationSourceOutcome } from "@/lib/federation/retrieval";
import { analyzeTelemetry, logFailure } from "@/lib/skillforge/analyzer";
import { DEFAULT_SKILLFORGE_CONFIG, type SkillForgeIntakeEntry } from "@/lib/skillforge/types";
import { ensureProposalType, registryEntryFor } from "@/lib/seal/proposal-registry";
import { collectLocalFootprintInventory, defaultLocalStoreProfiles } from "@/lib/cloud-offload/footprint";
import { decideRecollection, planRecollectionQueries } from "@/lib/recollection-policy";
import { getGsdModelRoutingPolicy, routeGsdModel } from "@/lib/gsd/model-routing-policy";
import { runBoundedDiscussCouncil } from "@/lib/gsd/discuss";
import { hashSyntheticSmoke, loadSyntheticSmoke } from "@/lib/retrieval-bench/adapters/synthetic";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("long-tail coverage batch I utility edges", () => {
  it("rate limits tenants after burst capacity and reports retry timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T00:00:00.000Z"));
    const tenantId = "batch-i-rate-limit";
    const config = { requestsPerMinute: 60, burst: 1 };

    expect(checkRateLimit(tenantId, config)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = checkRateLimit(tenantId, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    vi.advanceTimersByTime(1000);
    expect(checkRateLimit(tenantId, config).allowed).toBe(true);
  });

  it("loads meeting QMD collections with home expansion and normalizes mixed search hits", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-qmd-"));
    const configPath = path.join(root, "meeting-sources.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        sources: [
          { enabled: true, qmdCollections: ["alpha", "alpha", "beta"] },
          { enabled: false, qmdCollections: ["disabled"] },
        ],
      }),
      "utf8",
    );

    await expect(loadEnabledMeetingCollections(configPath)).resolves.toEqual(["alpha", "beta"]);

    const execFileAsync: ExecFileAsync = vi.fn(async (_file, args) => {
      const collection = args[args.indexOf("-c") + 1];
      if (collection === "beta") throw new Error("missing collection");
      return {
        stdout: JSON.stringify({
          results: [
            "plain hit",
            { file: "/notes/meeting.md", snippet: "meeting snippet", score: 0.8 },
            { id: "doc-1", content: "content fallback" },
          ],
        }),
        stderr: "",
      };
    });

    const result = await searchMeetingCollections(" roadmap ", 3, ["alpha", "beta"], execFileAsync);
    expect(result.ok).toBe(true);
    expect(result.hits.map((hit) => hit.title)).toEqual(["alpha hit", "meeting.md", "doc-1"]);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("guards understand graph routes with a constant-length token digest", async () => {
    vi.stubEnv("UNDERSTAND_GRAPH_TOKEN", "secret-token");

    expect(hasValidUnderstandGraphToken(new Request("https://memroos.test/understand?token=secret-token"))).toBe(true);
    expect(hasValidUnderstandGraphToken(new Request("https://memroos.test/understand?token=wrong"))).toBe(false);
    await expect(forbiddenUnderstandResponse().json()).resolves.toEqual({ error: "Forbidden: missing or invalid token" });

    const GET = makeUnderstandJsonRoute(async () => ({ graph: true }));
    const denied = await GET(new Request("https://memroos.test/understand"));
    expect(denied.status).toBe(403);
    const allowed = await GET(new Request("https://memroos.test/understand?token=secret-token"));
    await expect(allowed.json()).resolves.toEqual({ graph: true });
  });

  it("scores built-in eval traces across neutral, plain-text, and memory recall branches", () => {
    const scorers = createBuiltInScorers();
    const byId = Object.fromEntries(scorers.map((scorer) => [scorer.id, scorer]));
    const trace = {
      id: "trace-1",
      agentId: "agent",
      role: "engineer",
      task: "return status",
      output: "The deployment is green",
      expectedFacts: ["deployment", "green"],
      toolCalls: [],
      memory: { expectedFacts: ["alpha", "beta"], retrievedFacts: ["ALPHA"] },
    } as never;

    expect(byId.tool_call_schema.score(trace).score).toBe(0.75);
    expect(byId.json_valid.score(trace).detail).toContain("plain text");
    expect(byId.on_task.score(trace).score).toBe(1);
    expect(byId.memory_recall_l1.score(trace).score).toBe(0.5);
  });

  it("dedupes, bounds, and ranks federated merge packs without letting denied duplicates in", () => {
    const db = new Database(":memory:");
    const outcome = (id: string, outcome: FederationSourceOutcome["outcome"], sourceHandle: string): FederationSourceOutcome => ({
      outcomeId: id,
      federationRunId: "run-1",
      sourceId: `source-${id}`,
      sourceHandle,
      sourceKind: "memory",
      outcome,
      reasonCode: outcome,
      policyDecision: outcome === "denied"
        ? { kind: "deny", reason: "denied", policyVersion: "test" }
        : { kind: "allow", reason: "allow", policyVersion: "test" },
      policyVersion: "test",
      resultCount: 1,
      resultBytes: 1,
      durationMs: 1,
      requestHash: null,
      responseHash: null,
      payloadHash: null,
      scopeHash: "scope",
      metadata: {},
    });
    const itemsByOutcome = new Map([
      ["allow-a", [{ id: "a", canonicalHash: "hash-a", content: "alpha", score: 0.5 }]],
      ["allow-b", [{ id: "b", canonicalHash: "hash-b", content: "beta", score: 0.9 }]],
      ["allow-c", [{ id: "c", canonicalHash: "hash-c", content: "gamma", score: 0.7 }]],
      ["deny-a", [{ id: "denied-a", canonicalHash: "hash-a", content: "alpha denied", score: 1 }]],
    ]);

    const result = mergeFederatedPack(db, {
      tenantId: "tenant",
      federationRunId: "run-1",
      outcomes: [
        outcome("allow-a", "success", "zeta"),
        outcome("allow-b", "success", "alpha"),
        outcome("allow-c", "success", "beta"),
        outcome("deny-a", "denied", "omega"),
      ],
      scopeHash: "scope",
      budget: { maxItems: 1, maxBytes: 100, hopCount: 2 },
      itemsByOutcome,
    });

    expect(result.boundStatus).toBe("partial_bounded");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ canonicalHash: "hash-b", rank: 1 });
    db.close();
  });

  it("analyzes SkillForge telemetry fallbacks and tolerates missing failure-log tables", () => {
    const now = new Date("2026-05-05T00:00:00.000Z");
    const entry = (id: string, payload: Record<string, unknown>): SkillForgeIntakeEntry => ({
      id,
      skillId: "skill-1",
      skillName: "Skill One",
      traceType: "failure",
      payload,
      securityLabels: [],
      timestamp: now,
    });

    const [result] = analyzeTelemetry(
      [
        entry("a", { query: "Do thing", dispatchStatus: "incomplete", actual: "ok" }),
        entry("b", { input: "Do thing", expected: "yes", actual: "no" }),
        entry("c", { passed: false, actual: "fallback answer" }),
        entry("d", { freeform: { nested: true }, actual: "json fallback" }),
      ],
      DEFAULT_SKILLFORGE_CONFIG,
    );

    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.testCases.length).toBeGreaterThan(0);

    const db = new Database(":memory:");
    expect(() =>
      logFailure(db, {
        operation: "op",
        input: "input",
        deterministicResult: null,
        llmResult: "fallback",
        pattern: "pat",
        skillId: "skill-1",
      }),
    ).not.toThrow();
    db.close();
  });

  it("enforces the closed SEAL proposal registry and builds formatted drafts", () => {
    expect(ensureProposalType("memory_rewrite")).toBe("memory_rewrite");
    expect(() => ensureProposalType("plugin_escape")).toThrow(/Unknown SEAL proposal type/);

    const draft = registryEntryFor("noop_test").buildDraft({
      traceId: "trace-1",
      runId: "run-1",
      agentId: "agent-1",
      baselineW: 0.12345,
      baselineLayers: { l1: 0.1, l2: 0.2, l3: 0.3 } as never,
    });
    expect(draft.rationale).toContain("0.123");
    expect(registryEntryFor("query_hint").applyShadow({ hint: "alias" })).toMatchObject({ pendingWrite: true });
  });

  it("collects local footprint inventory for files, directories, and missing stores", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "footprint-"));
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "conversations.db"), "sqlite", "utf8");
    fs.mkdirSync(path.join(root, "services", "memory", "logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "services", "memory", "logs", "app.log"), "log", "utf8");

    const profiles = defaultLocalStoreProfiles(root);
    expect(profiles.some((profile) => profile.path.includes(".cache/qmd"))).toBe(true);

    const inventory = collectLocalFootprintInventory(root);
    expect(inventory.totalBytes).toBeGreaterThanOrEqual("sqlitelog".length);
    expect(inventory.pressure).toBe("ok");
    expect(inventory.stores.some((store) => store.exists && store.sizeBytes > 0)).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("plans recollection only when task text carries recall signals", () => {
    expect(planRecollectionQueries({ taskText: "", requestedLimit: 10 })).toEqual([]);
    expect(decideRecollection({ taskText: "format this JSON", project: "", entities: [] })).toMatchObject({
      decision: "search_skipped",
      skipReason: expect.stringContaining("mechanical"),
    });

    const required = decideRecollection({
      taskText: "Find the latest deployment handoff for billing",
      project: "MemRoOS",
      entities: ["Oracle"],
      sourceRefs: ["incident-log"],
      handoffState: { hasPendingHandoff: true },
      rediscoveryRisk: true,
      requestedLimit: 99,
    });

    expect(required.decision).toBe("search_required");
    expect(required.reasons).toEqual(
      expect.arrayContaining([
        "task_has_recency_ref",
        "task_has_project_ref",
        "task_has_source_ref",
        "task_has_stable_entities",
        "project_has_recent_handoff",
        "rediscovery_risk",
        "explicit_memory_request",
      ]),
    );
    expect(required.queries[0]).toMatchObject({
      limit: 8,
      scope: { project: "memroos", sources: ["incident-log"], timeWindowDays: 14 },
    });
  });

  it("routes GSD model policy defaults, overrides, and high-risk validator tasks", () => {
    const db = new Database(":memory:");
    initSchema(db);

    expect(getGsdModelRoutingPolicy().some((entry) => entry.taskClass === "hard_reasoning")).toBe(true);
    expect(routeGsdModel(db, { taskClass: "unknown_task", actualCostUsd: 0.12 })).toMatchObject({
      tier: "frontier",
      provider: "anthropic",
      estimatedCostUsd: 0.12,
      overrideApplied: false,
    });
    expect(routeGsdModel(db, { taskClass: "classification", highRisk: true, qualityScore: 0.99 })).toMatchObject({
      tier: "validator",
      qualityScore: 0.99,
    });
    expect(routeGsdModel(db, { taskClass: "classification", overrideTier: "vision", overrideReason: "image evidence" })).toMatchObject({
      tier: "vision",
      overrideApplied: true,
      reason: expect.stringContaining("Override: image evidence"),
    });

    db.close();
  });

  it("blocks bounded discuss councils before DB writes when validation fails", () => {
    const db = new Database(":memory:");
    expect(() =>
      runBoundedDiscussCouncil(db, {
        goalId: "",
        actorAgentId: "agent",
        topic: "topic",
        roles: [],
        taskBudget: { maxRounds: 1, maxAgents: 2 },
        verdict: { decision: "continue", summary: "ok", validatorPass: true },
      }),
    ).toThrow("goalId is required");

    const blocked = runBoundedDiscussCouncil(db, {
      goalId: "goal",
      actorAgentId: "agent",
      topic: "Bounded topic",
      roles: [{ role: "critic" as never, agentId: "agent-1", label: "Critic" }],
      taskBudget: { maxRounds: 6, maxAgents: 1 },
      verdict: { decision: "continue", summary: "", validatorPass: false },
      now: () => new Date("2026-05-05T00:00:00.000Z"),
    });

    expect(blocked.ledgerReceiptId).toBe(0);
    expect(blocked.blockedReasons).toEqual(
      expect.arrayContaining([
        "taskBudget.maxRounds must be between 1 and 5 for bounded council.",
        "taskBudget.maxAgents must be between 2 and 6 for bounded council.",
        "invalid roles: critic",
        "validator role is required.",
        "verdict.summary is required.",
        "validator pass is required before ledgering council output.",
      ]),
    );
    db.close();
  });

  it("loads synthetic smoke fixtures with clone stamping and typed fixture errors", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-fixtures-"));
    expect(loadSyntheticSmoke({ fixturesDir: root }).reason).toMatch(/fixture_file_not_found/);

    const fixturePath = path.join(root, "memroos-public-smoke.json");
    fs.writeFileSync(fixturePath, "{not-json", "utf8");
    expect(loadSyntheticSmoke({ fixturesDir: root }).reason).toMatch(/fixture_json_malformed/);

    fs.writeFileSync(fixturePath, JSON.stringify({ not: "array" }), "utf8");
    expect(loadSyntheticSmoke({ fixturesDir: root })).toMatchObject({ ok: false, reason: "fixture_root_not_array" });

    const rawTask = {
      id: "task-1",
      dataset: "memroos_public_synthetic",
      task_type: "single_hop",
      corpus: [{ id: "mem-1", text: "raw" }],
      question: "What?",
      expected_answer: "Answer",
      evidence_spans: ["mem-1"],
    };
    fs.writeFileSync(fixturePath, JSON.stringify([rawTask, "primitive"]), "utf8");
    const loaded = loadSyntheticSmoke({ fixturesDir: root, limit: 1 });
    expect(loaded).toMatchObject({ ok: true, truncated: true, totalAvailable: 2 });
    expect(loaded.tasks?.[0]).toMatchObject({ license: "MIT", citation: "MemroOS internal synthetic benchmark." });
    expect(hashSyntheticSmoke(loaded.tasks ?? [])).toMatch(/^sha256:/);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
