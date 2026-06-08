#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.argv.find((arg) => arg.startsWith("--repo-root="))?.slice("--repo-root=".length)
  ?? process.cwd();

function homePath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function profiles(root) {
  return [
    ["sqlite-operational", path.join(root, "data/conversations.db"), "permanent_source", "managed-postgres-sync", "never_prune"],
    ["sqlite-wal-shm", path.join(root, "data"), "replay_queue", "managed-postgres-sync-checkpoint", "safe_with_retention"],
    ["qmd-cache", homePath("~/.cache/qmd"), "rebuildable_cache", "remote-qmd-worker-or-managed-search-index", "safe_if_rebuilt"],
    ["mem0-local-cache", homePath("~/.mem0"), "rebuildable_cache", "mem0-plus-qdrant-cloud", "safe_after_offload"],
    ["raw-vault", homePath("~/.memroos/vault"), "raw_evidence", "encrypted-object-storage-with-hash-replay", "safe_after_offload"],
    ["knowledge-repo", homePath("~/github/knowledge"), "permanent_source", "private-git-remote-plus-remote-index-worker", "never_prune"],
    ["memory-service-logs", path.join(root, "services/memory/logs"), "disposable_log", "centralized-log-retention", "safe_with_retention"],
    ["runtime-env", homePath("~/.memroos"), "runtime_secret_config", "secret-manager-reference-only", "never_prune"],
  ];
}

function sizeOf(target) {
  try {
    const stat = fs.statSync(target);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
  } catch {
    return 0;
  }

  let total = 0;
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(child);
        else if (entry.isFile()) total += fs.statSync(child).size;
      } catch {
        continue;
      }
    }
  }
  return total;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

const rows = profiles(path.resolve(repoRoot)).map(([id, filePath, storeClass, cloudTarget, pruneSafety]) => {
  const exists = fs.existsSync(filePath);
  const sizeBytes = exists ? sizeOf(filePath) : 0;
  return { id, path: filePath, class: storeClass, cloudTarget, pruneSafety, exists, sizeBytes };
});
const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
const pressure = totalBytes >= 5 * 1024 ** 3 ? "critical" : totalBytes >= 2 * 1024 ** 3 ? "watch" : "ok";

console.log(JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  repoRoot: path.resolve(repoRoot),
  totalBytes,
  totalHuman: human(totalBytes),
  pressure,
  stores: rows.map((row) => ({ ...row, sizeHuman: human(row.sizeBytes) })),
}, null, 2));
