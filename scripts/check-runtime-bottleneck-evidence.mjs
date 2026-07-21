#!/usr/bin/env node
/** Fail-closed Phase 175 runtime-bottleneck evidence gate (Node built-ins only). */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const HASH = /^(sha256:)?[a-f0-9]{64}$/;
const RUN_IDS = ["run-01", "run-02"];
const LOCAL_COMPONENTS = ["applicationCpuMs", "applicationHeapMs", "sqliteQueueMs", "indexingMs"];
const REMOTE_COMPONENTS = ["qdrantMs", "neo4jMs", "ollamaMs", "llmMs"];
const ATTRIBUTION_COMPONENTS = [...REMOTE_COMPONENTS, ...LOCAL_COMPONENTS, "unknownMs"];
const REQUIRED_DEPENDENCIES = ["qdrantMs", "neo4jMs", "ollamaMs", "llmMs", "sqliteQueueMs", "applicationCpuMs", "applicationHeapMs", "unknownMs"];
const SLO = Object.freeze({ p95MaxMs: 500, errorRateMax: 0.001, localShareMin: 0.6, remoteAndUnknownShareMax: 0.4 });

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function rel(file) { return path.relative(repoRoot, file).split(path.sep).join("/"); }
function canonicalHash(value) { return typeof value === "string" && HASH.test(value); }
function canonicalize(value) { return Array.isArray(value) ? value.map(canonicalize) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value; }
function computedManifestHash(manifest) { const { suiteManifestHash: _ignored, ...unsigned } = manifest; return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(unsigned))).digest("hex")}`; }
function readJson(file, errors, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { errors.push(`${label}: cannot read JSON (${error instanceof Error ? error.message : String(error)})`); return null; }
}
function requireFields(value, fields, errors, label) {
  if (!isObject(value)) { errors.push(`${label}: must be an object`); return false; }
  for (const field of fields) if (!(field in value)) errors.push(`${label}: missing ${field}`);
  return true;
}
function validateAvailability(value, errors, label) {
  if (!requireFields(value, ["status", "value", "reason"], errors, label)) return false;
  if (value.status === "measured") {
    if (!finite(value.value) || value.value < 0) errors.push(`${label}: measured value must be a non-negative finite number`);
    if (value.reason !== null) errors.push(`${label}: measured reason must be null`);
    return finite(value.value) && value.value >= 0 && value.reason === null;
  }
  if (value.status === "unavailable") {
    if (value.value !== null) errors.push(`${label}: unavailable value must be null (zero is not unavailable)`);
    if (!nonEmpty(value.reason)) errors.push(`${label}: unavailable reason must be non-empty`);
    return value.value === null && nonEmpty(value.reason);
  }
  errors.push(`${label}: status must be measured or unavailable`);
  return false;
}
function healthyDependencies(dependencies) {
  return isObject(dependencies) && Object.keys(dependencies).length > 0 && Object.values(dependencies).every((entry) => entry === "healthy" || (isObject(entry) && entry.status === "healthy"));
}
function validateManifest(manifest, errors) {
  const required = ["schemaVersion", "suiteManifestHash", "fixtureHash", "operatorWorkloadHash", "retrievalWorkloadHash", "operatorConfigurationHash", "retrievalConfigurationHash", "gitRevision", "host", "runtimeVersions", "targetUrl", "operatorRequestMethod", "dependencyHealth", "degradedMode"];
  if (!requireFields(manifest, required, errors, "suite manifest")) return;
  if (manifest.schemaVersion !== "1") errors.push("suite manifest: schemaVersion must be 1");
  for (const field of ["suiteManifestHash", "fixtureHash", "operatorWorkloadHash", "retrievalWorkloadHash", "operatorConfigurationHash", "retrievalConfigurationHash"]) if (!canonicalHash(manifest[field])) errors.push(`suite manifest: ${field} must be a SHA-256 hash`);
  if (canonicalHash(manifest.suiteManifestHash) && manifest.suiteManifestHash !== computedManifestHash(manifest)) errors.push("suite manifest: suiteManifestHash does not match its canonical contents");
  if (!nonEmpty(manifest.gitRevision)) errors.push("suite manifest: gitRevision missing");
  if (!isObject(manifest.host) || !nonEmpty(manifest.host.cpu) || !finite(manifest.host.memoryBytes)) errors.push("suite manifest: host CPU and numeric memoryBytes required");
  if (!isObject(manifest.runtimeVersions) || Object.keys(manifest.runtimeVersions).length === 0) errors.push("suite manifest: runtimeVersions required");
  if (!nonEmpty(manifest.targetUrl)) errors.push("suite manifest: targetUrl required");
  if (manifest.operatorRequestMethod !== "GET") errors.push("suite manifest: operatorRequestMethod must be GET for non-mutating evidence");
  if (manifest.degradedMode !== false) errors.push("suite manifest: degradedMode evidence is invalid");
  if (!healthyDependencies(manifest.dependencyHealth)) errors.push("suite manifest: dependency health is missing or degraded");
}
function validateOperatorRun(run, manifest, errors, label) {
  const required = ["schemaVersion", "status", "suiteManifestHash", "fixtureHash", "operatorWorkloadHash", "operatorConfigurationHash", "gitRevision", "targetUrl", "dependencyHealth", "degradedMode", "durationMs", "totalRequests", "errors", "errorRate", "p50Ms", "p95Ms", "p99Ms", "throughputRps", "configuredAgents", "maxInFlight", "requestMethod"];
  if (!requireFields(run, required, errors, label)) return false;
  if (run.schemaVersion !== "1") errors.push(`${label}: schemaVersion must be 1`);
  if (run.status !== "pass" && run.status !== "fail") errors.push(`${label}: status must be pass or fail; unreachable or incomplete evidence is not accepted`);
  for (const field of ["suiteManifestHash", "fixtureHash", "operatorWorkloadHash", "operatorConfigurationHash"]) if (run[field] !== manifest[field]) errors.push(`${label}: ${field} drift`);
  if (run.gitRevision !== manifest.gitRevision || run.targetUrl !== manifest.targetUrl) errors.push(`${label}: revision or target URL drift`);
  if (run.requestMethod !== "GET" || run.requestMethod !== manifest.operatorRequestMethod) errors.push(`${label}: requestMethod must be the manifest's non-mutating GET`);
  if (run.degradedMode !== false || !healthyDependencies(run.dependencyHealth)) errors.push(`${label}: dependencies missing or degraded`);
  for (const field of ["durationMs", "totalRequests", "errors", "errorRate", "p50Ms", "p95Ms", "p99Ms", "throughputRps", "configuredAgents", "maxInFlight"]) if (!finite(run[field])) errors.push(`${label}: ${field} must be numeric`);
  if (!(run.durationMs >= 300000)) errors.push(`${label}: duration must be at least 300 seconds`);
  if (!(run.totalRequests >= 500)) errors.push(`${label}: at least 500 requests required`);
  if (!(run.maxInFlight >= 5)) errors.push(`${label}: maxInFlight must be at least 5`);
  if (!(run.errorRate >= 0 && run.errorRate <= 1)) errors.push(`${label}: invalid error rate`);
  return errors.length === 0;
}
function validateRetrievalRun(run, manifest, errors, label) {
  const required = ["schemaVersion", "suiteManifestHash", "fixtureHash", "retrievalWorkloadHash", "retrievalConfigurationHash", "seed", "taskCount", "precisionAtK", "recallAtK", "mrr", "falsePositiveRate", "answerSupportedRate", "p50LatencyMs", "p95LatencyMs", "completedTaskCount", "failedTaskCount", "tokenAccounting", "dependencyTiming"];
  if (!requireFields(run, required, errors, label)) return false;
  if (run.schemaVersion !== "1") errors.push(`${label}: schemaVersion must be 1`);
  for (const field of ["suiteManifestHash", "fixtureHash", "retrievalWorkloadHash", "retrievalConfigurationHash"]) if (run[field] !== manifest[field]) errors.push(`${label}: ${field} drift`);
  for (const field of ["seed", "taskCount", "precisionAtK", "recallAtK", "mrr", "falsePositiveRate", "answerSupportedRate", "p50LatencyMs", "p95LatencyMs", "completedTaskCount", "failedTaskCount"]) if (!finite(run[field])) errors.push(`${label}: ${field} must be numeric`);
  if (!(run.taskCount >= 25)) errors.push(`${label}: committed 25-task fixture floor required`);
  if (run.completedTaskCount !== run.taskCount || run.failedTaskCount !== 0) errors.push(`${label}: all tasks must be completed with zero failed tasks`);
  for (const field of ["precisionAtK", "recallAtK", "mrr", "falsePositiveRate", "answerSupportedRate"]) if (!(run[field] >= 0 && run[field] <= 1)) errors.push(`${label}: ${field} must be between zero and one`);
  if (!isObject(run.tokenAccounting)) errors.push(`${label}: tokenAccounting required`);
  else for (const field of ["retrieval", "rerank", "pack", "judge"]) validateAvailability(run.tokenAccounting[field], errors, `${label}: tokenAccounting.${field}`);
  if (!isObject(run.dependencyTiming)) errors.push(`${label}: dependencyTiming required`);
  else for (const field of REQUIRED_DEPENDENCIES) validateAvailability(run.dependencyTiming[field], errors, `${label}: dependencyTiming.${field}`);
  return errors.length === 0;
}
function readAttribution(file, errors, label) {
  const attribution = readJson(file, errors, label);
  if (!attribution || !requireFields(attribution, ["endToEndP95Ms", "components"], errors, label)) return null;
  if (!finite(attribution.endToEndP95Ms) || attribution.endToEndP95Ms < 0) { errors.push(`${label}: endToEndP95Ms must be a non-negative measured number`); return null; }
  if (!isObject(attribution.components)) { errors.push(`${label}: components required`); return null; }
  const values = {};
  for (const key of ATTRIBUTION_COMPONENTS) {
    const evidence = attribution.components[key];
    if (validateAvailability(evidence, errors, `${label}: components.${key}`)) values[key] = evidence;
  }
  const unknown = values.unknownMs;
  if (!unknown || unknown.status !== "measured") errors.push(`${label}: unknownMs must be measured and absorb all unreconciled time`);
  const observedTotal = Object.values(values).reduce((sum, evidence) => sum + (evidence.status === "measured" ? evidence.value : 0), 0);
  const tolerance = Math.max(5, attribution.endToEndP95Ms * 0.1);
  if (Math.abs(observedTotal - attribution.endToEndP95Ms) > tolerance) errors.push(`${label}: measured component time plus unknownMs does not reconcile to end-to-end p95 (tolerance ${tolerance}ms)`);
  return { endToEndP95Ms: attribution.endToEndP95Ms, values };
}
function nonEmptyJsonArtifact(file, errors, label) {
  if (!fs.existsSync(file)) { errors.push(`raw artifact missing: ${rel(file)}`); return null; }
  const value = readJson(file, errors, label);
  if (Array.isArray(value) && value.length > 0) return value;
  if (isObject(value) && Object.keys(value).length > 0) return value;
  errors.push(`${label}: artifact must contain observed data, not an empty placeholder`);
  return null;
}
function tracePercentile(sortedNumbers, p) {
  const rank = (p / 100) * (sortedNumbers.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return low === high ? sortedNumbers[low] : sortedNumbers[low] + (sortedNumbers[high] - sortedNumbers[low]) * (rank - low);
}
function traceMetric(value, places) { return Number(value.toFixed(places)); }
function validateProfilesAndTrace(paths, id, operator, manifest, errors) {
  const base = paths.operatorDir;
  const cpu = nonEmptyJsonArtifact(path.join(base, "profiles", `${id}.cpu.json`), errors, `cpu profile ${id}`);
  if (cpu && (!Array.isArray(cpu.nodes) || cpu.nodes.length === 0 || !Array.isArray(cpu.samples) || cpu.samples.length === 0)) errors.push(`cpu profile ${id}: expected non-empty observed nodes and samples`);
  const heap = nonEmptyJsonArtifact(path.join(base, "profiles", `${id}.heap.json`), errors, `heap profile ${id}`);
  if (heap && !isObject(heap.head) && !isObject(heap.snapshot)) errors.push(`heap profile ${id}: expected an observed heap profile head or snapshot`);
  const trace = nonEmptyJsonArtifact(path.join(base, "traces", `${id}.json`), errors, `trace ${id}`);
  if (!trace || !operator || !manifest) return;
  if (trace.schemaVersion !== "1" || trace.runId !== id || trace.suiteManifestHash !== manifest.suiteManifestHash) errors.push(`trace ${id}: schema, run ID, or suite manifest drift`);
  if (trace.requestMethod !== "GET" || trace.targetUrl !== operator.targetUrl) errors.push(`trace ${id}: must record the operator run's non-mutating GET target`);
  if (!Array.isArray(trace.requests)) { errors.push(`trace ${id}: requests array required`); return; }
  const loadRequests = trace.requests.filter((request) => isObject(request) && request.kind === "load");
  if (loadRequests.length !== operator.totalRequests) errors.push(`trace ${id}: per-request load observations must match totalRequests`);
  if (loadRequests.length === 0 || loadRequests.some((request) => request.method !== "GET" || !finite(request.latencyMs) || !finite(request.status) || !Number.isInteger(request.inFlightAtStart) || request.inFlightAtStart < 1 || !Number.isFinite(Date.parse(request.startedAt)) || !Number.isFinite(Date.parse(request.finishedAt)) || Date.parse(request.finishedAt) < Date.parse(request.startedAt))) {
    errors.push(`trace ${id}: each load observation requires GET status, latency, timestamps, and exact inFlightAtStart`);
    return;
  }
  const errorsFromTrace = loadRequests.filter((request) => request.status >= 400 || request.error).length;
  const latencies = loadRequests.map((request) => request.latencyMs).sort((a, b) => a - b);
  const traceDurationMs = Math.max(...loadRequests.map((request) => Date.parse(request.finishedAt))) - Math.min(...loadRequests.map((request) => Date.parse(request.startedAt)));
  if (operator.durationMs !== traceDurationMs) errors.push(`trace ${id}: durationMs does not reconcile to immutable per-request timestamps`);
  const expected = {
    errors: errorsFromTrace,
    errorRate: traceMetric(errorsFromTrace / loadRequests.length, 6),
    p50Ms: traceMetric(tracePercentile(latencies, 50), 2),
    p95Ms: traceMetric(tracePercentile(latencies, 95), 2),
    p99Ms: traceMetric(tracePercentile(latencies, 99), 2),
    throughputRps: traceDurationMs > 0 ? traceMetric(loadRequests.length / (traceDurationMs / 1000), 4) : 0,
    maxInFlight: Math.max(...loadRequests.map((request) => request.inFlightAtStart)),
  };
  for (const [field, value] of Object.entries(expected)) if (operator[field] !== value) errors.push(`trace ${id}: ${field} does not reconcile to immutable per-request observations`);
}
function expectedEvidenceLinks(paths) {
  return {
    suiteManifest: rel(paths.manifest),
    operatorRuns: RUN_IDS.map((id) => rel(path.join(paths.operatorDir, `${id}.json`))),
    retrievalRuns: RUN_IDS.map((id) => rel(path.join(paths.retrievalDir, `${id}.json`))),
    profiles: RUN_IDS.map((id) => rel(path.join(paths.operatorDir, "profiles", `${id}.cpu.json`))),
    heaps: RUN_IDS.map((id) => rel(path.join(paths.operatorDir, "profiles", `${id}.heap.json`))),
    traces: RUN_IDS.map((id) => rel(path.join(paths.operatorDir, "traces", `${id}.json`))),
    attribution: RUN_IDS.map((id) => rel(path.join(paths.operatorDir, "attribution", `${id}.json`))),
  };
}
function samePaths(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((entry, index) => entry === expected[index]); }
function validateDecisionShape(decision, expectedLinks, errors) {
  if (!requireFields(decision, ["schemaVersion", "decision", "evidence", "thresholds"], errors, "decision")) return;
  if (decision.schemaVersion !== "1") errors.push("decision: schemaVersion must be 1");
  if (!["keep", "optimize-current-stack", "bounded-shadow-extraction"].includes(decision.decision)) errors.push("decision: invalid result");
  for (const [key, value] of Object.entries(SLO)) if (!decision.thresholds || decision.thresholds[key] !== value) errors.push(`decision: threshold ${key} must equal contract`);
  const evidence = decision.evidence;
  if (!isObject(evidence)) errors.push("decision: evidence links missing");
  else for (const key of ["suiteManifest", "operatorRuns", "retrievalRuns", "profiles", "heaps", "traces", "attribution"]) {
    const valid = key === "suiteManifest" ? evidence[key] === expectedLinks[key] : samePaths(evidence[key], expectedLinks[key]);
    if (!valid) errors.push(`decision: ${key} links must be canonical and complete`);
  }
  if (decision.decision === "optimize-current-stack" && (!nonEmpty(decision.limitingComponent) || !nonEmpty(decision.currentStackChange))) errors.push("decision: optimize requires limitingComponent and currentStackChange");
  if (decision.decision === "bounded-shadow-extraction") {
    for (const key of ["limitingComponent", "boundedInterface", "shadowOnlyBoundary", "rollbackCriteria"]) if (!nonEmpty(decision[key])) errors.push(`decision: bounded extraction requires ${key}`);
    if (!Array.isArray(decision.comparisonMetrics) || decision.comparisonMetrics.length === 0 || !decision.comparisonMetrics.every(nonEmpty)) errors.push("decision: bounded extraction requires comparisonMetrics");
  }
}
function measuredValue(attribution, key) {
  const evidence = attribution?.values?.[key];
  return evidence?.status === "measured" ? evidence.value : null;
}
function extractionCandidate(operatorRuns, attributions) {
  const p95Failed = operatorRuns.map((run, index) => ({ run, attribution: attributions[index] })).filter(({ run }) => run.p95Ms >= SLO.p95MaxMs);
  if (p95Failed.length < 2) return null;
  for (const component of LOCAL_COMPONENTS) {
    const localDominant = p95Failed.every(({ attribution }) => {
      const local = measuredValue(attribution, component);
      return local !== null && local / attribution.endToEndP95Ms >= SLO.localShareMin;
    });
    const remoteAndUnknownLow = p95Failed.every(({ attribution }) => {
      const remoteAndUnknown = [...REMOTE_COMPONENTS, "unknownMs"].map((key) => measuredValue(attribution, key));
      return remoteAndUnknown.every((value) => value !== null) && remoteAndUnknown.reduce((sum, value) => sum + value, 0) / attribution.endToEndP95Ms < SLO.remoteAndUnknownShareMax;
    });
    if (localDominant && remoteAndUnknownLow) return component;
  }
  return null;
}
function hasMeasuredLimitingComponent(component, decision, operatorRuns, attributions) {
  if (decision === "bounded-shadow-extraction") return component === extractionCandidate(operatorRuns, attributions);
  if (!LOCAL_COMPONENTS.includes(component) && !REMOTE_COMPONENTS.includes(component)) return false;
  const failed = operatorRuns.map((run, index) => ({ run, attribution: attributions[index] })).filter(({ run }) => run.p95Ms >= SLO.p95MaxMs || run.errorRate >= SLO.errorRateMax);
  return failed.length >= 2 && failed.every(({ attribution }) => {
    const value = measuredValue(attribution, component);
    return value !== null && value > 0;
  });
}
function selectDecision(operatorRuns, attributions) {
  if (extractionCandidate(operatorRuns, attributions)) return "bounded-shadow-extraction";
  const failed = operatorRuns.filter((run) => run.p95Ms >= SLO.p95MaxMs || run.errorRate >= SLO.errorRateMax);
  return failed.length >= 2 ? "optimize-current-stack" : "keep";
}

export function checkEvidence(paths) {
  const errors = [];
  const manifest = readJson(paths.manifest, errors, "suite manifest");
  if (manifest) validateManifest(manifest, errors);
  const operatorRuns = [];
  const retrievalRuns = [];
  const attributions = [];
  for (const id of RUN_IDS) {
    const runErrors = [];
    const operator = readJson(path.join(paths.operatorDir, `${id}.json`), runErrors, `operator ${id}`);
    if (operator && manifest) validateOperatorRun(operator, manifest, runErrors, `operator ${id}`);
    const retrieval = readJson(path.join(paths.retrievalDir, `${id}.json`), runErrors, `retrieval ${id}`);
    if (retrieval && manifest) validateRetrievalRun(retrieval, manifest, runErrors, `retrieval ${id}`);
    validateProfilesAndTrace(paths, id, operator, manifest, runErrors);
    const attribution = readAttribution(path.join(paths.operatorDir, "attribution", `${id}.json`), runErrors, `attribution ${id}`);
    if (operator && attribution && attribution.endToEndP95Ms !== operator.p95Ms) runErrors.push(`attribution ${id}: end-to-end p95 must match operator p95`);
    errors.push(...runErrors);
    if (operator && runErrors.length === 0) operatorRuns.push(operator);
    if (retrieval && runErrors.length === 0) retrievalRuns.push(retrieval);
    attributions.push(attribution);
  }
  if (operatorRuns.length < 2) errors.push("fewer than two accepted operator runs");
  if (retrievalRuns.length < 2) errors.push("fewer than two accepted retrieval runs");
  const decision = readJson(paths.decision, errors, "decision");
  if (decision) {
    validateDecisionShape(decision, expectedEvidenceLinks(paths), errors);
    const expected = operatorRuns.length === 2 ? selectDecision(operatorRuns, attributions) : null;
    if (expected && decision.decision !== expected) errors.push(`decision: expected ${expected}, got ${decision.decision}`);
    if (["optimize-current-stack", "bounded-shadow-extraction"].includes(decision.decision) && operatorRuns.length === 2 && !hasMeasuredLimitingComponent(decision.limitingComponent, decision.decision, operatorRuns, attributions)) errors.push("decision: limitingComponent must be a positive measured component in every failed run");
  }
  return { ok: errors.length === 0, errors, selectedDecision: operatorRuns.length === 2 ? selectDecision(operatorRuns, attributions) : null };
}
function parseArgs(argv) {
  const defaults = { manifest: path.join(repoRoot, "reports/operator-load/runtime-bottleneck/suite-manifest.json"), operatorDir: path.join(repoRoot, "reports/operator-load/runtime-bottleneck"), retrievalDir: path.join(repoRoot, "evals/comparative-retrieval/results/runtime-bottleneck"), decision: path.join(repoRoot, ".planning/decisions/runtime-bottleneck.json") };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i]; const value = argv[i + 1];
    if (flag === "--manifest") { defaults.manifest = path.resolve(value); i += 1; }
    else if (flag === "--operator") { defaults.operatorDir = path.resolve(value); i += 1; }
    else if (flag === "--retrieval") { defaults.retrievalDir = path.resolve(value); i += 1; }
    else if (flag === "--decision") { defaults.decision = path.resolve(value); i += 1; }
    else if (flag === "--help" || flag === "-h") { console.log("Usage: node scripts/check-runtime-bottleneck-evidence.mjs [--manifest FILE] [--operator DIR] [--retrieval DIR] [--decision FILE]"); process.exit(0); }
  }
  return defaults;
}
function main() {
  const result = checkEvidence(parseArgs(process.argv));
  if (!result.ok) { result.errors.forEach((error) => console.error(error)); process.exit(1); }
  console.log(`Runtime bottleneck evidence OK: ${result.selectedDecision}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
export { SLO, computedManifestHash, parseArgs, selectDecision, validateAvailability };
