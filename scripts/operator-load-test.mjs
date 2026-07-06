#!/usr/bin/env node
/**
 * scripts/operator-load-test.mjs
 *
 * Phase 124 (ENTOPS-01) load harness. Spawns N concurrent simulated agents
 * each issuing knowledge_write-equivalent POSTs at the requested writes/hour
 * rate, computes p50/p95/p99 + error rate, and writes a signed report.
 *
 * Pure Node built-ins. No external deps.
 *
 * Usage:
 *   node scripts/operator-load-test.mjs \
 *     [--agents 100] [--writes-per-hour 1000] [--duration 300] \
 *     [--url $MEMROOS_LOADTEST_URL] [--endpoint /api/knowledge]
 *
 * Outputs:
 *   reports/operator-load/latest.json  (gitignored)
 *   reports/operator-load/latest.md    (gitignored)
 *
 * Honest degradation: if the operator URL is unreachable, writes
 * latest.json with status:"unreachable" and exits non-zero.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const reportsDir = path.join(repoRoot, "reports", "operator-load");

const SLO = Object.freeze({
  p95MaxMs: 500,
  errorRateMax: 0.001,
});

function parseArgs(argv) {
  const args = {
    agents: 100,
    writesPerHour: 1000,
    durationSeconds: 300,
    url: process.env.MEMROOS_LOADTEST_URL || "http://localhost:3002",
    endpoint: process.env.MEMROOS_LOADTEST_ENDPOINT || "/api/knowledge",
  };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--agents":
        args.agents = Math.max(1, Number.parseInt(next, 10) || args.agents);
        i++;
        break;
      case "--writes-per-hour":
        args.writesPerHour = Math.max(1, Number.parseInt(next, 10) || args.writesPerHour);
        i++;
        break;
      case "--duration":
        args.durationSeconds = Math.max(1, Number.parseInt(next, 10) || args.durationSeconds);
        i++;
        break;
      case "--url":
        args.url = String(next || args.url);
        i++;
        break;
      case "--endpoint":
        args.endpoint = String(next || args.endpoint);
        i++;
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/operator-load-test.mjs " +
            "[--agents N] [--writes-per-hour N] [--duration SECONDS] " +
            "[--url URL] [--endpoint /path]"
        );
        process.exit(0);
      default:
        // ignore unknown
        break;
    }
  }
  return args;
}

function safeTargetHost(rawUrl) {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid-url";
  }
}

function percentile(sortedNumbers, p) {
  if (sortedNumbers.length === 0) return null;
  const rank = (p / 100) * (sortedNumbers.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedNumbers[low];
  const fraction = rank - low;
  return sortedNumbers[low] + (sortedNumbers[high] - sortedNumbers[low]) * fraction;
}

function summarize(samples, totalDurationSeconds, options = {}) {
  const { status = "pass", findings = [] } = options;
  const errors = samples.filter((s) => s.status >= 400 || s.error).length;
  const latencies = samples
    .filter((s) => Number.isFinite(s.latencyMs))
    .map((s) => s.latencyMs)
    .sort((a, b) => a - b);

  const totalRequests = samples.length;
  const p50Ms = percentile(latencies, 50);
  const p95Ms = percentile(latencies, 95);
  const p99Ms = percentile(latencies, 99);
  const errorRate = totalRequests > 0 ? errors / totalRequests : 0;
  const throughputRps = totalDurationSeconds > 0 ? totalRequests / totalDurationSeconds : 0;

  return {
    status,
    totalRequests,
    errors,
    errorRate: Number(errorRate.toFixed(6)),
    p50Ms: p50Ms == null ? null : Number(p50Ms.toFixed(2)),
    p95Ms: p95Ms == null ? null : Number(p95Ms.toFixed(2)),
    p99Ms: p99Ms == null ? null : Number(p99Ms.toFixed(2)),
    throughputRps: Number(throughputRps.toFixed(4)),
    findings,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function gitShaOrZero() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "0000000000000000000000000000000000000000";
  }
}

function buildManifest(body) {
  const json = JSON.stringify(body);
  const sha256 = createHash("sha256").update(json).digest("hex");
  return {
    gitSha: gitShaOrZero(),
    timestamp: nowIso(),
    sloThresholds: { ...SLO },
    sha256,
    signedBy: "operator-load-test",
  };
}

function writeReport(report) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, "latest.json");
  const mdPath = path.join(reportsDir, "latest.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    mdPath,
    [
      `# Operator Load Report (${report.status})`,
      ``,
      `- generatedAt: ${report.generatedAt}`,
      `- durationSeconds: ${report.durationSeconds}`,
      `- agents: ${report.agents}`,
      `- writesPerHour: ${report.writesPerHour}`,
      `- endpoint: ${report.endpoint}`,
      `- targetHost: ${report.targetHost}`,
      ``,
      `## Metrics`,
      ``,
      `| metric | value |`,
      `| --- | --- |`,
      `| totalRequests | ${report.totalRequests} |`,
      `| errors | ${report.errors} |`,
      `| errorRate | ${report.errorRate} |`,
      `| p50Ms | ${report.p50Ms ?? "n/a"} |`,
      `| p95Ms | ${report.p95Ms ?? "n/a"} |`,
      `| p99Ms | ${report.p99Ms ?? "n/a"} |`,
      `| throughputRps | ${report.throughputRps} |`,
      ``,
      `## SLO`,
      ``,
      `- p95Ms < ${SLO.p95MaxMs} (got ${report.p95Ms ?? "n/a"})`,
      `- errorRate < ${SLO.errorRateMax} (got ${report.errorRate})`,
      ``,
      `## Manifest`,
      ``,
      `- gitSha: ${report.manifest.gitSha}`,
      `- timestamp: ${report.manifest.timestamp}`,
      `- sha256: ${report.manifest.sha256}`,
      ``,
      `## Findings`,
      ``,
      ...(report.findings.length ? report.findings.map((f) => `- ${f}`) : ["- (none)"]),
      ``,
    ].join("\n")
  );
  return { jsonPath, mdPath };
}

function unreachableReport(args, reason) {
  const startIso = nowIso();
  const targetHost = safeTargetHost(args.url);
  const partial = {
    status: "unreachable",
    generatedAt: startIso,
    durationSeconds: 0,
    totalRequests: 0,
    errors: 0,
    errorRate: 0,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    throughputRps: 0,
    agents: args.agents,
    writesPerHour: args.writesPerHour,
    endpoint: args.endpoint,
    targetHost,
    findings: [reason],
  };
  const manifest = buildManifest(partial);
  return { ...partial, manifest };
}

async function runAgent(agentId, totalDurationMs, writesPerSecondPerAgent, url, endpoint, abortSignal, sink) {
  const intervalMs = writesPerSecondPerAgent > 0 ? 1000 / writesPerSecondPerAgent : Infinity;
  const start = Date.now();
  let nextScheduled = start;

  while (Date.now() - start < totalDurationMs) {
    if (abortSignal.aborted) break;
    const now = Date.now();
    const sleep = nextScheduled - now;
    if (sleep > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleep));
    }
    nextScheduled += intervalMs;
    // catch up if we fell behind (don't burst more than once)
    if (nextScheduled < Date.now() - intervalMs) nextScheduled = Date.now() + intervalMs;

    const sentAt = Date.now();
    let status = 0;
    let error = null;
    try {
      const response = await fetch(`${url}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-load-agent": String(agentId) },
        body: JSON.stringify({
          agent: agentId,
          kind: "knowledge_write",
          payload: {
            source: "operator-load-test",
            summary: `load-test write from agent ${agentId} at ${new Date().toISOString()}`,
            content: `Synthetic load record for ENTOPS-01 harness (agent=${agentId}, ts=${Date.now()}).`,
            tags: ["loadtest", "phase-124"],
          },
        }),
        signal: abortSignal,
      });
      status = response.status;
      // drain body without holding the socket forever
      try {
        await response.arrayBuffer();
      } catch {
        /* ignore */
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = Date.now() - sentAt;
    sink.push({ latencyMs, status, error });
  }
}

async function runHarness(args) {
  const writesPerSecondTotal = args.writesPerHour / 3600;
  const writesPerSecondPerAgent = writesPerSecondTotal / args.agents;
  const totalDurationMs = args.durationSeconds * 1000;
  const url = args.url.replace(/\/$/, "");
  const endpoint = args.endpoint.startsWith("/") ? args.endpoint : `/${args.endpoint}`;
  const targetHost = safeTargetHost(url);
  const startIso = nowIso();

  // Pre-flight reachability probe. If the URL is unreachable we never
  // silently pass — write the unreachable receipt and bail out.
  let probe;
  try {
    probe = await fetch(`${url}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-load-probe": "1" },
      body: JSON.stringify({ probe: true, kind: "knowledge_write" }),
      // tight deadline; even a 404 is informative
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const report = unreachableReport(args, `Operator URL ${url}${endpoint} unreachable: ${message}`);
    report.generatedAt = startIso;
    writeReport(report);
    console.error(`UNREACHABLE: ${message}`);
    return { report, exitCode: 2 };
  }

  const samples = [];
  const sink = (entry) => samples.push(entry);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), totalDurationMs + 1000);

  const agentPromises = [];
  for (let i = 0; i < args.agents; i++) {
    agentPromises.push(
      runAgent(i, totalDurationMs, writesPerSecondPerAgent, url, endpoint, controller.signal, {
        push: sink,
      })
    );
  }
  await Promise.all(agentPromises);
  clearTimeout(timer);

  const endIso = nowIso();
  const findings = [];
  if (probe.status === 404) {
    findings.push(
      `Endpoint ${endpoint} returned 404 on probe. Operator likely does not expose a knowledge-write surface yet. The harness still produced metrics; gate will treat this as NOT pass until the endpoint exists and returns 2xx.`
    );
  } else if (probe.status >= 500) {
    findings.push(`Endpoint ${endpoint} returned HTTP ${probe.status} on probe.`);
  }

  const summary = summarize(samples, args.durationSeconds, {
    status: findings.length > 0 ? "fail" : "pass",
    findings,
  });

  const partial = {
    ...summary,
    generatedAt: startIso,
    finishedAt: endIso,
    durationSeconds: args.durationSeconds,
    agents: args.agents,
    writesPerHour: args.writesPerHour,
    endpoint,
    targetHost,
  };
  const manifest = buildManifest(partial);
  const report = { ...partial, manifest };

  // Override status based on SLO
  const p95 = report.p95Ms;
  const meetsSlo =
    p95 != null && p95 < SLO.p95MaxMs && report.errorRate < SLO.errorRateMax;
  if (!meetsSlo) {
    report.status = "fail";
    report.findings = [
      ...report.findings,
      `SLO not met: p95Ms=${p95 ?? "n/a"} (must be < ${SLO.p95MaxMs}), ` +
        `errorRate=${report.errorRate} (must be < ${SLO.errorRateMax})`,
    ];
  }
  // Re-sign after status adjustment
  report.manifest = buildManifest(report);

  writeReport(report);
  return { report, exitCode: report.status === "pass" ? 0 : 1 };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `[load] agents=${args.agents} writesPerHour=${args.writesPerHour} ` +
      `duration=${args.durationSeconds}s url=${args.url}${args.endpoint}`
  );
  const { report, exitCode } = await runHarness(args);
  console.log(
    `[load] status=${report.status} totalRequests=${report.totalRequests} ` +
      `p95Ms=${report.p95Ms ?? "n/a"} errorRate=${report.errorRate}`
  );
  process.exit(exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { parseArgs, percentile, summarize, buildManifest, runHarness, SLO, unreachableReport };