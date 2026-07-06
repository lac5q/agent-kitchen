#!/usr/bin/env node
/**
 * scripts/check-operator-load-slo.mjs
 *
 * Phase 124 (ENTOPS-01) gate. Reads reports/operator-load/latest.json and
 * fails (exit 1) if:
 *   - report missing
 *   - status !== "pass"
 *   - p95Ms >= 500
 *   - errorRate >= 0.001
 *   - report age > OPERATOR_LOAD_MAX_AGE_HOURS (default 72)
 *
 * Additionally: if any of the operator-load enterprise-claim vocabulary
 * phrases ("enterprise-ready", "100-agent", "multi-tenant", "SOC 2",
 * "SOC2") appears in content/, docs/, or README* files, the gate fails
 * unless the report is a fresh pass.
 *
 * Mirrors the structure of check-future-spikes.mjs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const REPORT_PATH = path.join(repoRoot, "reports", "operator-load", "latest.json");
export const BASELINE_PATH = path.join(repoRoot, "reports", "operator-load", "baseline.json");
export const SLO = Object.freeze({
  p95MaxMs: 500,
  errorRateMax: 0.001,
});

export const ENTERPRISE_CLAIMS = Object.freeze([
  "enterprise-ready",
  "100-agent",
  "multi-tenant",
  "SOC 2",
  "SOC2",
]);

export const CLAIM_SCAN_DIRS = Object.freeze(["content", "docs"]);
export const CLAIM_SCAN_READMES = Object.freeze(["README.md", "README"]);

function nowMs() {
  return Date.now();
}

export function loadReport(reportPath = REPORT_PATH, baselinePath = BASELINE_PATH) {
  // Prefer latest.json; if it doesn't exist (CI fresh checkout),
  // fall back to the committed baseline.json placeholder. The gate
  // still fails because baseline.status === "baseline", but a missing
  // report is treated the same way as a baseline placeholder — both
  // are explicitly NOT pass, so enterprise claims stay blocked.
  const candidatePaths = [reportPath, baselinePath];
  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      return JSON.parse(raw);
    } catch {
      // fall through to next candidate
    }
  }
  return null;
}

export function evaluateReport(report, { maxAgeHours = Number.parseFloat(process.env.OPERATOR_LOAD_MAX_AGE_HOURS) || 72, now = nowMs() } = {}) {
  const errors = [];
  const warnings = [];

  if (!report) {
    errors.push(`Missing operator load report (no reports/operator-load/latest.json or baseline.json found)`);
    return { ok: false, errors, warnings };
  }
  if (report.status !== "pass") {
    errors.push(`Operator load report status is "${report.status ?? "unknown"}", expected "pass"`);
  }
  if (typeof report.p95Ms === "number" && report.p95Ms >= SLO.p95MaxMs) {
    errors.push(`Operator load p95Ms=${report.p95Ms} exceeds SLO ${SLO.p95MaxMs}`);
  }
  if (report.p95Ms == null) {
    errors.push(`Operator load report missing p95Ms`);
  }
  if (typeof report.errorRate === "number" && report.errorRate >= SLO.errorRateMax) {
    errors.push(`Operator load errorRate=${report.errorRate} exceeds SLO ${SLO.errorRateMax}`);
  }
  if (typeof report.generatedAt === "string") {
    const generatedMs = Date.parse(report.generatedAt);
    if (!Number.isFinite(generatedMs)) {
      errors.push(`Operator load report generatedAt is not a valid ISO timestamp`);
    } else {
      const ageHours = (now - generatedMs) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        errors.push(
          `Operator load report is stale: ageHours=${ageHours.toFixed(2)} > maxAgeHours=${maxAgeHours}`
        );
      }
    }
  } else {
    errors.push(`Operator load report missing generatedAt`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

function walkTextFiles(root) {
  /** Yield {abs, rel} for each text-ish file under root. */
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) {
          continue;
        }
        stack.push(abs);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (
          lower.endsWith(".md") ||
          lower.endsWith(".mdx") ||
          lower.endsWith(".txt") ||
          lower.endsWith(".json") ||
          lower.endsWith(".yml") ||
          lower.endsWith(".yaml")
        ) {
          out.push({ abs, rel: path.relative(repoRoot, abs) });
        }
      }
    }
  }
  return out;
}

export function findEnterpriseClaimHits(scanPaths = CLAIM_SCAN_DIRS, extras = CLAIM_SCAN_READMES) {
  /** Returns [{file, claim, lineNo, snippet}]. */
  const hits = [];
  const candidates = [];
  for (const dir of scanPaths) candidates.push(path.join(repoRoot, dir));
  for (const name of extras) candidates.push(path.join(repoRoot, name));
  const files = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      for (const file of walkTextFiles(candidate)) files.push(file);
    } else if (stat.isFile()) {
      files.push({ abs: candidate, rel: path.relative(repoRoot, candidate) });
    }
  }
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file.abs, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const claim of ENTERPRISE_CLAIMS) {
        if (line.includes(claim)) {
          hits.push({ file: file.rel, claim, lineNo: i + 1, snippet: line.trim().slice(0, 200) });
        }
      }
    }
  }
  return hits;
}

export function runGate({ reportPath = REPORT_PATH, baselinePath = BASELINE_PATH, maxAgeHours, now = nowMs(), scanClaims = true } = {}) {
  const report = loadReport(reportPath, baselinePath);
  const result = evaluateReport(report, { maxAgeHours, now });
  if (!result.ok) return result;

  if (scanClaims) {
    const hits = findEnterpriseClaimHits();
    if (hits.length > 0) {
      // Status is pass and fresh — claims are allowed.
      // Otherwise the basic evaluator already failed. This block is
      // informational only when the report is green.
      // (We deliberately do not gate claims independently of the report
      //  because the same report status already gates claims above.)
      result.warnings.push(
        `Enterprise-claim vocabulary matched ${hits.length} location(s); allowed because latest report is green.`
      );
    }
  }
  return result;
}

function main() {
  const result = runGate();
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  for (const warning of result.warnings) console.warn(warning);
  console.log("Operator load SLO OK (latest report is fresh and within thresholds)");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}