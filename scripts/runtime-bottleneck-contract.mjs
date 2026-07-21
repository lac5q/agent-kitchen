import { createHash } from "node:crypto";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function sha256Hash(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 hash`);
  return value;
}

export function operatorWorkloadShape({ agents, writesPerHour, durationSeconds }) {
  return {
    agents: positiveInteger(agents, "operator workload agents"),
    writesPerHour: positiveInteger(writesPerHour, "operator workload writesPerHour"),
    durationSeconds: positiveInteger(durationSeconds, "operator workload durationSeconds"),
  };
}

export function operatorConfigurationShape({ targetUrl, requestMethod }) {
  if (typeof targetUrl !== "string" || targetUrl.length === 0) throw new Error("operator configuration targetUrl must be non-empty");
  if (requestMethod !== "GET") throw new Error("operator configuration requestMethod must be GET");
  return { targetUrl, requestMethod };
}

export function retrievalWorkloadShape({ dataset, taskCount, fixtureHash }) {
  if (typeof dataset !== "string" || dataset.length === 0) throw new Error("retrieval workload dataset must be non-empty");
  return {
    dataset,
    taskCount: positiveInteger(taskCount, "retrieval workload taskCount"),
    fixtureHash: sha256Hash(fixtureHash, "retrieval workload fixtureHash"),
  };
}

export function retrievalConfigurationShape({ dataset, adapter, k, rerankEnabled, judgeEnabled, providerFlags, seed }) {
  if (typeof dataset !== "string" || dataset.length === 0) throw new Error("retrieval configuration dataset must be non-empty");
  if (typeof adapter !== "string" || adapter.length === 0) throw new Error("retrieval configuration adapter must be non-empty");
  if (!Number.isInteger(k) || k < 1) throw new Error("retrieval configuration k must be a positive integer");
  if (typeof rerankEnabled !== "boolean" || typeof judgeEnabled !== "boolean") throw new Error("retrieval configuration rerankEnabled and judgeEnabled must be boolean");
  if (!isObject(providerFlags) || Object.values(providerFlags).some((value) => typeof value !== "boolean")) throw new Error("retrieval configuration providerFlags must be boolean values");
  if (!Number.isInteger(seed) || seed < 0) throw new Error("retrieval configuration seed must be a non-negative integer");
  return { dataset, adapter, k, rerankEnabled, judgeEnabled, providerFlags: canonicalize(providerFlags), seed };
}

export function hashOperatorWorkload(args) {
  return sha256(JSON.stringify(operatorWorkloadShape(args)));
}

export function hashOperatorConfiguration(args) {
  return sha256(JSON.stringify(operatorConfigurationShape(args)));
}

export function hashRetrievalWorkload(args) {
  return sha256(JSON.stringify(retrievalWorkloadShape(args)));
}

export function hashRetrievalConfiguration(args) {
  return sha256(JSON.stringify(retrievalConfigurationShape(args)));
}
