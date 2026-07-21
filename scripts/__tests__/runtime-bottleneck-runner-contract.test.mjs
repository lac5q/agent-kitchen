import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashRetrievalConfiguration, hashRetrievalWorkload } from "../runtime-bottleneck-contract.mjs";
import { validateRuntimeBottleneckReport } from "../run-comparative-retrieval-evals.mjs";

const fixtureHash = `sha256:${"a".repeat(64)}`;
const healthy = { qdrant: "healthy" };

function report(overrides = {}) {
  const base = {
    dataset: "memroos_public_synthetic",
    adapter: "lexical",
    k: 3,
    rerankEnabled: false,
    judgeEnabled: false,
    providerFlags: { embedding: false, vector_backend: false, rerank: false, judge: false, external_mcp: false },
    seed: 175,
    fixtureHash,
    taskCount: 25,
    aggregate: { completedTaskCount: 25, failedTaskCount: 0 },
  };
  return { ...base, configHash: hashRetrievalConfiguration(base), ...overrides };
}

function suiteFor(actualReport) {
  return {
    suiteManifestHash: `sha256:${"b".repeat(64)}`,
    fixtureHash: actualReport.fixtureHash,
    retrievalConfigurationHash: actualReport.configHash,
    retrievalWorkloadHash: hashRetrievalWorkload({ dataset: actualReport.dataset, taskCount: actualReport.taskCount, fixtureHash: actualReport.fixtureHash }),
    operatorRequestMethod: "GET",
    dependencyHealth: healthy,
    degradedMode: false,
  };
}

describe("runtime bottleneck runner contracts", () => {
  it("derives retrieval workload and configuration hashes from the executed report", () => {
    const actualReport = report();
    const actual = validateRuntimeBottleneckReport(actualReport, suiteFor(actualReport));
    assert.equal(actual.fixtureHash, fixtureHash);
    assert.equal(actual.retrievalConfigurationHash, actualReport.configHash);
  });

  it("rejects a suite whose retrieval workload hash was copied from different arguments", () => {
    const actualReport = report();
    const suite = suiteFor(actualReport);
    suite.retrievalWorkloadHash = hashRetrievalWorkload({ dataset: actualReport.dataset, taskCount: 24, fixtureHash });
    assert.throws(() => validateRuntimeBottleneckReport(actualReport, suite), /executed arguments/);
  });

  it("rejects incomplete or failed retrieval work even when hashes match", () => {
    const actualReport = report({ aggregate: { completedTaskCount: 24, failedTaskCount: 1 } });
    assert.throws(() => validateRuntimeBottleneckReport(actualReport, suiteFor(actualReport)), /25 completed tasks and zero failed tasks/);
  });
});
