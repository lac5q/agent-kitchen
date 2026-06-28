import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SPIKE_REPORTS,
  validateFutureSpikes,
  validateSpikeReport,
} from "./check-future-spikes.mjs";

function reportText(report) {
  return `
# Spike

Requirement: \`${report.requirement}\`

Status: completed bounded spike, 2026-06-27

## External Signal
source

## Repo Baseline
${report.requiredPhrases.join("\n")}

## Comparison Result
comparison

## Decision
decision

## Guardrails
guardrails

## Verification
verification
`;
}

describe("future spike checker", () => {
  it("accepts a complete spike report fixture", () => {
    const errors = validateSpikeReport(SPIKE_REPORTS[0], reportText(SPIKE_REPORTS[0]));
    assert.deepEqual(errors, []);
  });

  it("fails when a report omits required guardrails", () => {
    const errors = validateSpikeReport(SPIKE_REPORTS[0], reportText(SPIKE_REPORTS[0]).replace("No backend swap", ""));
    assert.ok(errors.some((error) => error.includes("No backend swap")));
  });

  it("fails when any report is missing", () => {
    const files = new Map(SPIKE_REPORTS.slice(1).map((report) => [report.path, reportText(report)]));
    const result = validateFutureSpikes(files);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes(SPIKE_REPORTS[0].path)));
  });

  it("accepts all complete report fixtures", () => {
    const files = new Map(SPIKE_REPORTS.map((report) => [report.path, reportText(report)]));
    const result = validateFutureSpikes(files);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });
});
