#!/usr/bin/env node
/** Generate an immutable Phase 175 suite manifest from real inputs (Node built-ins only). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  hashOperatorConfiguration,
  hashOperatorWorkload,
  hashRetrievalConfiguration,
  hashRetrievalWorkload,
  sha256,
} from "./runtime-bottleneck-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  return "Usage: node scripts/generate-runtime-bottleneck-manifest.mjs " +
    "--fixture FILE --operator-workload FILE --retrieval-workload FILE " +
    "--operator-config FILE --retrieval-config FILE --dependency-health FILE " +
    "--target-url URL [--output FILE]";
}
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`${label} must be valid JSON`); }
}
function hashRetrievalFixture(file) {
  const tasks = readJson(file, "--fixture");
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("--fixture must contain a non-empty task array");
  const canonical = JSON.stringify(tasks.map((task) => ({
    id: task.id,
    dataset: task.dataset,
    task_type: task.task_type,
    corpus: (task.corpus ?? []).map((entry) => ({ id: entry.id, text: entry.text, timestamp_iso: entry.timestamp_iso ?? null })),
    question: task.question,
    expected_answer: task.expected_answer,
    evidence_spans: task.evidence_spans ?? [],
    abstention_correct: task.abstention_correct ?? null,
  })));
  return sha256(canonical);
}
function parseArgs(argv) {
  const args = { output: path.join(repoRoot, "reports", "operator-load", "runtime-bottleneck", "suite-manifest.json") };
  const flags = new Map([
    ["--fixture", "fixture"], ["--operator-workload", "operatorWorkload"], ["--retrieval-workload", "retrievalWorkload"],
    ["--operator-config", "operatorConfiguration"], ["--retrieval-config", "retrievalConfiguration"],
    ["--dependency-health", "dependencyHealth"], ["--target-url", "targetUrl"], ["--output", "output"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") { console.log(usage()); process.exit(0); }
    const key = flags.get(flag);
    if (!key || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${flag}\n${usage()}`);
    args[key] = path.isAbsolute(argv[index + 1]) || key === "targetUrl" ? argv[index + 1] : path.resolve(argv[index + 1]);
    index += 1;
  }
  for (const key of ["fixture", "operatorWorkload", "retrievalWorkload", "operatorConfiguration", "retrievalConfiguration", "dependencyHealth", "targetUrl"]) if (!args[key]) throw new Error(`Missing --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}\n${usage()}`);
  return args;
}
function gitRevision() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { throw new Error("Cannot determine git revision; refuse to generate unverifiable evidence metadata"); }
}
function readDependencyHealth(file) {
  const health = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!health || typeof health !== "object" || Array.isArray(health) || Object.keys(health).length === 0) throw new Error("--dependency-health must contain a non-empty object");
  const healthy = Object.values(health).every((entry) => entry === "healthy" || (entry && typeof entry === "object" && entry.status === "healthy"));
  if (!healthy) throw new Error("dependency health is not fully healthy; refuse to generate accepted evidence manifest");
  return health;
}
function targetUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.username || parsed.password) throw new Error("--target-url must not contain credentials");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("--target-url must use http or https");
  if (parsed.pathname !== "/api/operations/noc") throw new Error("--target-url must be the non-mutating /api/operations/noc endpoint");
  return parsed.toString();
}
function buildManifest(args) {
  const cpu = os.cpus();
  const manifest = {
    schemaVersion: "1",
    fixtureHash: hashRetrievalFixture(args.fixture),
    operatorWorkloadHash: hashOperatorWorkload(readJson(args.operatorWorkload, "--operator-workload")),
    retrievalWorkloadHash: hashRetrievalWorkload({ ...readJson(args.retrievalWorkload, "--retrieval-workload"), fixtureHash: hashRetrievalFixture(args.fixture) }),
    operatorConfigurationHash: hashOperatorConfiguration(readJson(args.operatorConfiguration, "--operator-config")),
    retrievalConfigurationHash: hashRetrievalConfiguration(readJson(args.retrievalConfiguration, "--retrieval-config")),
    gitRevision: gitRevision(),
    host: { cpu: cpu[0]?.model ?? `${os.arch()} CPU`, memoryBytes: os.totalmem() },
    runtimeVersions: { node: process.version, v8: process.versions.v8, uv: process.versions.uv, platform: process.platform, arch: process.arch },
    targetUrl: targetUrl(args.targetUrl),
    operatorRequestMethod: "GET",
    dependencyHealth: readDependencyHealth(args.dependencyHealth),
    degradedMode: false,
  };
  return { ...manifest, suiteManifestHash: sha256(canonicalJson(manifest)) };
}
function writeManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return file;
}
function main() {
  const args = parseArgs(process.argv);
  const output = writeManifest(path.resolve(args.output), buildManifest(args));
  console.log(`Wrote immutable runtime suite manifest: ${path.relative(repoRoot, output)}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
export { buildManifest, canonicalJson, hashRetrievalConfiguration, hashRetrievalFixture, parseArgs, sha256, writeManifest };
