import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { parseArgs, requestOptions, writeRuntimeEvidenceReport } from "../operator-load-test.mjs";
import { hashOperatorConfiguration, hashOperatorWorkload } from "../runtime-bottleneck-contract.mjs";

const hash = (letter) => `sha256:${letter.repeat(64)}`;

function writeSuite(dir) {
  const suite = {
    schemaVersion: "1", suiteManifestHash: hash("a"), fixtureHash: hash("b"), operatorWorkloadHash: hashOperatorWorkload({ agents: 5, writesPerHour: 1000, durationSeconds: 300 }), retrievalWorkloadHash: hash("d"), operatorConfigurationHash: hashOperatorConfiguration({ targetUrl: "http://operator.example.test/api/operations/noc", requestMethod: "GET" }), retrievalConfigurationHash: hash("f"),
    gitRevision: "0123456789abcdef", host: { cpu: "test", memoryBytes: 1 }, runtimeVersions: { node: process.version }, targetUrl: "http://operator.example.test/api/operations/noc", operatorRequestMethod: "GET", dependencyHealth: { sqlite: "healthy" }, degradedMode: false,
  };
  fs.writeFileSync(path.join(dir, "suite-manifest.json"), JSON.stringify(suite));
}
function report() {
  return { status: "pass", durationMs: 300000, totalRequests: 500, errors: 0, errorRate: 0, p50Ms: 10, p95Ms: 20, p99Ms: 30, throughputRps: 2, agents: 5, maxInFlight: 5 };
}

describe("operator load evidence mode", () => {
  it("keeps legacy POST as the default and GET body-free when explicit", () => {
    assert.equal(parseArgs(["node", "script"]).method, "POST");
    assert.equal(requestOptions("GET", 1, new AbortController().signal).body, undefined);
    assert.match(requestOptions("POST", 1, new AbortController().signal).body, /knowledge_write/);
  });

  it("reads an optional bearer from the environment without changing the CLI or trace contract", () => {
    const previous = process.env.MEMROOS_LOADTEST_BEARER;
    try {
      process.env.MEMROOS_LOADTEST_BEARER = "test-only-token";
      const options = requestOptions("GET", 1, new AbortController().signal);
      assert.equal(options.headers.authorization, "Bearer test-only-token");
      assert.equal(JSON.stringify(options).includes("MEMROOS_LOADTEST_BEARER"), false);
    } finally {
      if (previous === undefined) delete process.env.MEMROOS_LOADTEST_BEARER;
      else process.env.MEMROOS_LOADTEST_BEARER = previous;
    }
  });

  it("refuses evidence when the manifest workload was not the executed workload", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operator-evidence-"));
    try {
      writeSuite(dir);
      const args = { evidenceDir: dir, runId: "run-01", suiteManifest: null, method: "GET", url: "http://operator.example.test", endpoint: "/api/operations/noc", agents: 6, writesPerHour: 1000, durationSeconds: 300 };
      assert.throws(() => writeRuntimeEvidenceReport(report(), args, null, []), /operatorWorkloadHash does not match executed arguments/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes one immutable sanitized trace for each evidence run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operator-evidence-"));
    try {
      writeSuite(dir);
      const args = { evidenceDir: dir, runId: "run-01", suiteManifest: null, method: "GET", url: "http://operator.example.test", endpoint: "/api/operations/noc", agents: 5, writesPerHour: 1000, durationSeconds: 300 };
      const requests = [{ kind: "probe", method: "GET", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:00.001Z", latencyMs: 1, status: 200, error: null, inFlightAtStart: 0 }, { kind: "load", agentId: 1, method: "GET", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:00.002Z", latencyMs: 2, status: 500, error: "Bearer test-only-token", inFlightAtStart: 1, authorization: "Bearer test-only-token" }];
      const output = writeRuntimeEvidenceReport(report(), args, null, requests);
      const traceText = fs.readFileSync(output.trace, "utf8");
      const trace = JSON.parse(traceText);
      assert.equal(trace.requests.length, 2);
      assert.equal(trace.requestMethod, "GET");
      assert.equal(trace.requests[1].inFlightAtStart, 1);
      assert.equal(trace.requests[1].error, "request_failed");
      assert.equal("authorization" in trace.requests[1], false);
      assert.equal(traceText.includes("test-only-token"), false);
      assert.throws(() => writeRuntimeEvidenceReport(report(), args, null, requests), /refusing to overwrite immutable evidence artifact/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
