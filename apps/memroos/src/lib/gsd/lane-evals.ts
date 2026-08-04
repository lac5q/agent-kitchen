import fs from "fs";
import path from "path";
import crypto from "crypto";
import type Database from "better-sqlite3";

import type { AgentContextLane } from "@/lib/agent/context-packet";

export type GsdLaneEvalMetric =
  | "source_coverage"
  | "proof_compliance"
  | "recall_provenance"
  | "resumability"
  | "claim_grounding"
  | "safety_gate";

export interface GsdLaneEvalRubricEntry {
  weight: number;
  minimum: number;
}

export interface GsdLaneEvalCase {
  id: string;
  lane: AgentContextLane;
  scenario: string;
  rubric: Partial<Record<GsdLaneEvalMetric, GsdLaneEvalRubricEntry>>;
  input: {
    requiredProof?: string[];
    proof?: Record<string, unknown>;
    sources?: string[];
    recallProvenance?: string[];
    handoffMarker?: string;
    claims?: Array<{ text: string; source?: string }>;
    destructiveAction?: string;
  };
  expected: {
    proofCompliant?: boolean;
    missingProof?: string[];
    sourceCoverage?: number;
    recallProvenanceCount?: number;
    resumable?: boolean;
    groundedClaims?: number;
    safetyGatePassed?: boolean;
    minimumScore: number;
  };
}

export interface GsdLaneEvalResult {
  caseId: string;
  lane: AgentContextLane;
  scenario: string;
  passed: boolean;
  score: number;
  metrics: Record<GsdLaneEvalMetric, number>;
  failures: string[];
  ledgerReceiptId?: number;
}

export interface GsdLaneEvalSuiteResult {
  runId: string;
  evaluatedAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  results: GsdLaneEvalResult[];
}

interface CasesFile {
  version: string;
  lanes: GsdLaneEvalCase[];
}

function casesPath(): string {
  return path.join(process.cwd(), "evals/gsd-lane-evals/cases.json");
}

export function loadGsdLaneEvalCases(): GsdLaneEvalCase[] {
  const raw = fs.readFileSync(casesPath(), "utf8");
  const parsed = JSON.parse(raw) as CasesFile;
  return parsed.lanes;
}

function truthyProof(value: unknown): boolean {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function metricValue(caseDef: GsdLaneEvalCase): Record<GsdLaneEvalMetric, number> {
  const proof = caseDef.input.proof ?? {};
  const required = caseDef.input.requiredProof ?? [];
  const missing = required.filter((key) => !truthyProof(proof[key]));
  const proofCompliant = missing.length === 0;

  const sourceCoverage = (caseDef.input.sources?.length ?? 0) > 0 ? 1 : 0;
  const recallProvenance = (caseDef.input.recallProvenance?.length ?? 0) > 0 ? 1 : 0;
  const resumability = caseDef.input.handoffMarker ? 1 : 0;
  const groundedClaims =
    (caseDef.input.claims ?? []).filter((claim) => Boolean(claim.source?.trim())).length /
    Math.max((caseDef.input.claims ?? []).length, 1);
  const safetyGate = caseDef.input.destructiveAction && !proofCompliant ? 0 : proofCompliant ? 1 : 0;

  return {
    source_coverage: sourceCoverage,
    proof_compliance: proofCompliant ? 1 : 0,
    recall_provenance: recallProvenance,
    resumability,
    claim_grounding: groundedClaims,
    safety_gate: safetyGate,
  };
}

function scoreCase(caseDef: GsdLaneEvalCase, metrics: Record<GsdLaneEvalMetric, number>): number {
  const entries = Object.entries(caseDef.rubric) as Array<[GsdLaneEvalMetric, GsdLaneEvalRubricEntry]>;
  const totalWeight = entries.reduce((sum, [, entry]) => sum + entry.weight, 0) || 1;
  return entries.reduce((sum, [metric, entry]) => sum + metrics[metric] * entry.weight, 0) / totalWeight;
}

function writeLedgerReceipt(db: Database.Database, result: GsdLaneEvalResult): number {
  const summary = result.passed
    ? `GSD lane eval passed: ${result.caseId}`
    : `GSD lane eval failed: ${result.caseId}`;
  const insert = db
    .prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES ('gsd-lane-eval', 'checkpoint', @summary, @artifacts)`
    )
    .run({
      summary,
      artifacts: JSON.stringify({
        command: "lane_eval",
        caseId: result.caseId,
        lane: result.lane,
        passed: result.passed,
        score: result.score,
        metrics: result.metrics,
        failures: result.failures,
      }),
    });
  return Number(insert.lastInsertRowid);
}

export function evaluateGsdLaneCase(db: Database.Database, caseDef: GsdLaneEvalCase, persistReceipt = true): GsdLaneEvalResult {
  const metrics = metricValue(caseDef);
  const score = scoreCase(caseDef, metrics);
  const failures: string[] = [];

  if (caseDef.expected.proofCompliant !== undefined && caseDef.expected.proofCompliant !== (metrics.proof_compliance === 1)) {
    failures.push("proof_compliance mismatch");
  }
  if (caseDef.expected.missingProof) {
    const proof = caseDef.input.proof ?? {};
    const missing = (caseDef.input.requiredProof ?? []).filter((key) => !truthyProof(proof[key]));
    if (missing.join(",") !== caseDef.expected.missingProof.join(",")) {
      failures.push(`missingProof expected ${caseDef.expected.missingProof.join(",")} got ${missing.join(",")}`);
    }
  }
  if (caseDef.expected.sourceCoverage !== undefined && metrics.source_coverage !== caseDef.expected.sourceCoverage) {
    failures.push("source_coverage mismatch");
  }
  if (
    caseDef.expected.recallProvenanceCount !== undefined &&
    (caseDef.input.recallProvenance?.length ?? 0) !== caseDef.expected.recallProvenanceCount
  ) {
    failures.push("recall_provenance count mismatch");
  }
  if (caseDef.expected.resumable !== undefined && Boolean(caseDef.input.handoffMarker) !== caseDef.expected.resumable) {
    failures.push("resumability mismatch");
  }
  if (caseDef.expected.groundedClaims !== undefined) {
    const grounded = (caseDef.input.claims ?? []).filter((claim) => Boolean(claim.source?.trim())).length;
    if (grounded !== caseDef.expected.groundedClaims) failures.push("grounded claim count mismatch");
  }
  if (caseDef.expected.safetyGatePassed !== undefined) {
    const passed = metrics.safety_gate === 1;
    if (passed !== caseDef.expected.safetyGatePassed) failures.push("safety_gate mismatch");
  }
  if (score < caseDef.expected.minimumScore) {
    failures.push(`score ${score.toFixed(3)} below minimum ${caseDef.expected.minimumScore}`);
  }

  const result: GsdLaneEvalResult = {
    caseId: caseDef.id,
    lane: caseDef.lane,
    scenario: caseDef.scenario,
    passed: failures.length === 0,
    score,
    metrics,
    failures,
  };

  if (persistReceipt) {
    result.ledgerReceiptId = writeLedgerReceipt(db, result);
  }

  return result;
}

export function runGsdLaneEvalSuite(
  db: Database.Database,
  input: { caseIds?: string[]; persistReceipts?: boolean; now?: () => Date } = {}
): GsdLaneEvalSuiteResult {
  const now = input.now?.() ?? new Date();
  const cases = loadGsdLaneEvalCases().filter((caseDef) => !input.caseIds || input.caseIds.includes(caseDef.id));
  const results = cases.map((caseDef) => evaluateGsdLaneCase(db, caseDef, input.persistReceipts !== false));
  const passedCases = results.filter((result) => result.passed).length;
  return {
    runId: `lane_eval_${crypto.createHash("sha256").update(now.toISOString()).digest("hex").slice(0, 12)}`,
    evaluatedAt: now.toISOString(),
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    passRate: results.length === 0 ? 1 : passedCases / results.length,
    results,
  };
}
