import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { checkEvidence, computedManifestHash, SLO } from "../check-runtime-bottleneck-evidence.mjs";

const hash = (letter) => `sha256:${letter.repeat(64)}`;
const healthy = { qdrant: "healthy", neo4j: "healthy", ollama: "healthy", llm: "healthy", sqliteQueue: "healthy" };
const measured = (value) => ({ status: "measured", value, reason: null });
const unavailable = (reason = "not instrumented") => ({ status: "unavailable", value: null, reason });

function pathsFor(dir) {
  return {
    manifest: path.join(dir, "reports/operator-load/runtime-bottleneck/suite-manifest.json"),
    operatorDir: path.join(dir, "reports/operator-load/runtime-bottleneck"),
    retrievalDir: path.join(dir, "evals/comparative-retrieval/results/runtime-bottleneck"),
    decision: path.join(dir, ".planning/decisions/runtime-bottleneck.json"),
  };
}
function manifest() {
  const value = {
    schemaVersion: "1", fixtureHash: hash("b"), operatorWorkloadHash: hash("c"), retrievalWorkloadHash: hash("d"), operatorConfigurationHash: hash("e"), retrievalConfigurationHash: hash("f"),
    gitRevision: "0123456789abcdef", host: { cpu: "test CPU", memoryBytes: 1024 }, runtimeVersions: { node: process.version }, targetUrl: "http://operator.example.test", operatorRequestMethod: "GET", dependencyHealth: healthy, degradedMode: false,
  };
  return { ...value, suiteManifestHash: computedManifestHash(value) };
}
function operator(overrides = {}) {
  return { schemaVersion: "1", status: "pass", suiteManifestHash: manifest().suiteManifestHash, fixtureHash: hash("b"), operatorWorkloadHash: hash("c"), operatorConfigurationHash: hash("e"), gitRevision: "0123456789abcdef", targetUrl: "http://operator.example.test", dependencyHealth: healthy, degradedMode: false, durationMs: 300000, totalRequests: 500, errors: 0, errorRate: 0, p50Ms: 1, p95Ms: 1, p99Ms: 1, throughputRps: 1.6667, configuredAgents: 10, maxInFlight: 5, requestMethod: "GET", ...overrides };
}
function retrieval(overrides = {}) {
  const dependencies = Object.fromEntries(["qdrantMs", "neo4jMs", "ollamaMs", "llmMs", "sqliteQueueMs", "applicationCpuMs", "applicationHeapMs", "unknownMs"].map((key) => [key, unavailable()]));
  return { schemaVersion: "1", suiteManifestHash: manifest().suiteManifestHash, fixtureHash: hash("b"), retrievalWorkloadHash: hash("d"), retrievalConfigurationHash: hash("f"), seed: 0, taskCount: 25, precisionAtK: 1, recallAtK: 1, mrr: 1, falsePositiveRate: 0, answerSupportedRate: 1, p50LatencyMs: 12, p95LatencyMs: 24, completedTaskCount: 25, failedTaskCount: 0, tokenAccounting: { retrieval: unavailable(), rerank: unavailable(), pack: unavailable(), judge: unavailable() }, dependencyTiming: dependencies, ...overrides };
}
function attribution(overrides = {}) {
  return { endToEndP95Ms: 1, components: { qdrantMs: measured(0), neo4jMs: measured(0), ollamaMs: measured(0), llmMs: measured(0), sqliteQueueMs: measured(0), applicationCpuMs: measured(0.6), applicationHeapMs: measured(0), indexingMs: measured(0), unknownMs: measured(0.4) }, ...overrides };
}
function links(paths) {
  const rel = (file) => path.relative(process.cwd(), file).split(path.sep).join("/");
  return {
    suiteManifest: rel(paths.manifest),
    operatorRuns: ["run-01", "run-02"].map((id) => rel(path.join(paths.operatorDir, `${id}.json`))),
    retrievalRuns: ["run-01", "run-02"].map((id) => rel(path.join(paths.retrievalDir, `${id}.json`))),
    profiles: ["run-01", "run-02"].map((id) => rel(path.join(paths.operatorDir, "profiles", `${id}.cpu.json`))),
    heaps: ["run-01", "run-02"].map((id) => rel(path.join(paths.operatorDir, "profiles", `${id}.heap.json`))),
    traces: ["run-01", "run-02"].map((id) => rel(path.join(paths.operatorDir, "traces", `${id}.json`))),
    attribution: ["run-01", "run-02"].map((id) => rel(path.join(paths.operatorDir, "attribution", `${id}.json`))),
  };
}
function decision(paths, result = "keep", overrides = {}) {
  return { schemaVersion: "1", decision: result, evidence: links(paths), thresholds: { ...SLO }, ...overrides };
}
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); }
function fixture(mutator = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-evidence-"));
  const paths = pathsFor(dir);
  write(paths.manifest, manifest());
  for (const id of ["run-01", "run-02"]) {
    write(path.join(paths.operatorDir, `${id}.json`), operator());
    write(path.join(paths.retrievalDir, `${id}.json`), retrieval());
    write(path.join(paths.operatorDir, "profiles", `${id}.cpu.json`), { nodes: [{ id: 1, callFrame: { functionName: "observed" } }], samples: [1] });
    write(path.join(paths.operatorDir, "profiles", `${id}.heap.json`), { head: { callFrame: { functionName: "observed" }, children: [] } });
    write(path.join(paths.operatorDir, "traces", `${id}.json`), { schemaVersion: "1", suiteManifestHash: manifest().suiteManifestHash, runId: id, requestMethod: "GET", targetUrl: "http://operator.example.test", requests: Array.from({ length: 500 }, (_, index) => ({ kind: "load", method: "GET", startedAt: new Date(index === 499 ? 299999 : 0).toISOString(), finishedAt: new Date(index === 499 ? 300000 : 1).toISOString(), latencyMs: 1, status: 200, error: null, inFlightAtStart: index < 5 ? index + 1 : 1 })) });
    write(path.join(paths.operatorDir, "attribution", `${id}.json`), attribution());
  }
  write(paths.decision, decision(paths));
  mutator(paths);
  return { paths, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function change(file, fn) { const value = read(file); fn(value); write(file, value); }
function setTraceLatency(paths, id, latencyMs) {
  change(path.join(paths.operatorDir, "traces", `${id}.json`), (trace) => { trace.requests.forEach((request) => { if (request.kind === "load") request.latencyMs = latencyMs; }); });
  change(path.join(paths.operatorDir, `${id}.json`), (run) => { run.p50Ms = latencyMs; run.p95Ms = latencyMs; run.p99Ms = latencyMs; });
}
function expectFail(mutator, needle) {
  const test = fixture(mutator);
  try { const result = checkEvidence(test.paths); assert.equal(result.ok, false); assert.ok(result.errors.some((error) => error.includes(needle)), result.errors.join("\n")); }
  finally { test.cleanup(); }
}

describe("runtime bottleneck evidence gate", () => {
  const failBothLatency = (paths, component = measured(300), unknown = measured(180)) => {
    for (const id of ["run-01", "run-02"]) {
      setTraceLatency(paths, id, 600);
      change(path.join(paths.operatorDir, `attribution/${id}.json`), (value) => { value.endToEndP95Ms = 600; value.components.sqliteQueueMs = measured(120); value.components.applicationCpuMs = component; value.components.unknownMs = unknown; });
    }
  };
  it("accepts complete keep evidence", () => { const test = fixture(); try { assert.deepEqual(checkEvidence(test.paths), { ok: true, errors: [], selectedDecision: "keep" }); } finally { test.cleanup(); } });
  it("accepts completed fail evidence and selects optimize", () => { const test = fixture((paths) => { failBothLatency(paths); for (const id of ["run-01", "run-02"]) change(path.join(paths.operatorDir, `${id}.json`), (run) => { run.status = "fail"; }); change(paths.decision, (value) => { value.decision = "optimize-current-stack"; value.limitingComponent = "applicationCpuMs"; value.currentStackChange = "tune queue"; }); }); try { assert.equal(checkEvidence(test.paths).ok, true); } finally { test.cleanup(); } });
  it("rejects unavailable tokens encoded as zero", () => expectFail((paths) => change(path.join(paths.retrievalDir, "run-01.json"), (run) => { run.tokenAccounting.retrieval = { status: "unavailable", value: 0, reason: "not instrumented" }; }), "unavailable value must be null"));
  it("rejects attribution that leaves unreconciled time outside measured unknown", () => expectFail((paths) => change(path.join(paths.operatorDir, "attribution/run-01.json"), (value) => { value.components.unknownMs = measured(10); }), "plus unknownMs does not reconcile"));
  it("reconciles every operator aggregate against the immutable trace", () => {
    const test = fixture((paths) => change(path.join(paths.operatorDir, "run-01.json"), (run) => { run.durationMs = 299999; run.totalRequests = 499; run.errors = 1; run.errorRate = 0.002; run.p50Ms = 2; run.p95Ms = 2; run.p99Ms = 2; run.throughputRps = 1; run.maxInFlight = 4; }));
    try {
      const errors = checkEvidence(test.paths).errors.join("\n");
      for (const field of ["totalRequests", "errors", "errorRate", "p50Ms", "p95Ms", "p99Ms", "throughputRps", "maxInFlight", "durationMs"]) assert.match(errors, new RegExp(field));
    } finally { test.cleanup(); }
  });
  it("rejects a copied operator percentile instead of the trace value", () => expectFail((paths) => change(path.join(paths.operatorDir, "run-01.json"), (run) => { run.p95Ms = 2; }), "p95Ms does not reconcile"));
  it("rejects a copied operator concurrency instead of the trace maximum", () => expectFail((paths) => change(path.join(paths.operatorDir, "run-01.json"), (run) => { run.maxInFlight = 4; }), "maxInFlight does not reconcile"));
  it("rejects traces without exact measured concurrency", () => expectFail((paths) => change(path.join(paths.operatorDir, "traces/run-01.json"), (trace) => { delete trace.requests[0].inFlightAtStart; }), "exact inFlightAtStart"));
  it("rejects retrieval evidence below the committed 25-task floor", () => expectFail((paths) => change(path.join(paths.retrievalDir, "run-01.json"), (run) => { run.taskCount = 24; run.completedTaskCount = 24; }), "25-task fixture floor"));
  it("rejects retrieval evidence with failed or incomplete tasks", () => expectFail((paths) => change(path.join(paths.retrievalDir, "run-01.json"), (run) => { run.completedTaskCount = 24; run.failedTaskCount = 1; }), "all tasks must be completed"));
  it("does not select extraction when the named local component is unavailable", () => expectFail((paths) => { failBothLatency(paths, unavailable("CPU profiler unavailable"), measured(480)); change(paths.decision, (value) => { value.decision = "bounded-shadow-extraction"; value.limitingComponent = "applicationCpuMs"; value.boundedInterface = "x"; value.shadowOnlyBoundary = "y"; value.rollbackCriteria = "z"; value.comparisonMetrics = ["p95"]; }); }, "expected optimize-current-stack"));
  it("rejects absent raw artifacts", () => expectFail((paths) => fs.rmSync(path.join(paths.operatorDir, "traces/run-02.json")), "raw artifact missing"));
  it("rejects missing or degraded dependencies", () => expectFail((paths) => change(paths.manifest, (value) => { value.dependencyHealth.qdrant = "degraded"; }), "dependency health"));
  it("rejects optimize when only one run fails", () => expectFail((paths) => { setTraceLatency(paths, "run-01", 600); change(path.join(paths.operatorDir, "attribution/run-01.json"), (value) => { value.endToEndP95Ms = 600; value.components.sqliteQueueMs = measured(120); value.components.applicationCpuMs = measured(360); value.components.unknownMs = measured(120); }); change(paths.decision, (value) => { value.decision = "optimize-current-stack"; value.limitingComponent = "applicationCpuMs"; value.currentStackChange = "tune queue"; }); }, "expected keep"));
  it("rejects bounded extraction when local share is below sixty percent", () => expectFail((paths) => { failBothLatency(paths, measured(300), measured(180)); change(paths.decision, (value) => { value.decision = "bounded-shadow-extraction"; value.limitingComponent = "applicationCpuMs"; value.boundedInterface = "x"; value.shadowOnlyBoundary = "y"; value.rollbackCriteria = "z"; value.comparisonMetrics = ["p95"]; }); }, "expected optimize-current-stack"));
  it("rejects bounded extraction when remote plus unknown is at least forty percent", () => expectFail((paths) => { failBothLatency(paths, measured(360), measured(120)); for (const id of ["run-01", "run-02"]) change(path.join(paths.operatorDir, `attribution/${id}.json`), (value) => { value.components.sqliteQueueMs = measured(0); value.components.unknownMs = measured(240); }); change(paths.decision, (value) => { value.decision = "bounded-shadow-extraction"; value.limitingComponent = "applicationCpuMs"; value.boundedInterface = "x"; value.shadowOnlyBoundary = "y"; value.rollbackCriteria = "z"; value.comparisonMetrics = ["p95"]; }); }, "expected optimize-current-stack"));
  it("rejects bounded extraction when the named component is positive but not the dominant local component", () => expectFail((paths) => { failBothLatency(paths, measured(360), measured(120)); change(paths.decision, (value) => { value.decision = "bounded-shadow-extraction"; value.limitingComponent = "sqliteQueueMs"; value.boundedInterface = "x"; value.shadowOnlyBoundary = "y"; value.rollbackCriteria = "z"; value.comparisonMetrics = ["p95"]; }); }, "limitingComponent must be"));
  it("rejects an incomplete bounded shadow decision", () => expectFail((paths) => { failBothLatency(paths); change(paths.decision, (value) => { value.decision = "bounded-shadow-extraction"; value.limitingComponent = "applicationCpuMs"; }); }, "bounded extraction requires boundedInterface"));
});
