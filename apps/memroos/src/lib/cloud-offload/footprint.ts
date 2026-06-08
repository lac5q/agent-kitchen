import fs from "fs";
import os from "os";
import path from "path";

export type LocalStoreClass =
  | "permanent_source"
  | "rebuildable_cache"
  | "replay_queue"
  | "raw_evidence"
  | "runtime_secret_config"
  | "disposable_log";

export type PruneSafety = "never_prune" | "safe_if_rebuilt" | "safe_after_offload" | "safe_with_retention";

export interface LocalStoreProfile {
  id: string;
  path: string;
  class: LocalStoreClass;
  sourceOfTruth: "local" | "cloud" | "hybrid" | "derived";
  cloudTarget: string;
  privacyLabel: "public" | "internal" | "sensitive" | "secret";
  pruneSafety: PruneSafety;
  retention: string;
  exists: boolean;
  sizeBytes: number;
}

export interface LocalFootprintInventory {
  generatedAt: string;
  totalBytes: number;
  pressure: "ok" | "watch" | "critical";
  stores: LocalStoreProfile[];
  warnings: string[];
}

const DEFAULT_LIMITS = {
  watchBytes: 2 * 1024 * 1024 * 1024,
  criticalBytes: 5 * 1024 * 1024 * 1024,
};

function homePath(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function defaultLocalStoreProfiles(repoRoot: string = process.cwd()): Array<Omit<LocalStoreProfile, "exists" | "sizeBytes">> {
  const root = path.resolve(repoRoot);
  return [
    {
      id: "sqlite-operational",
      path: path.join(root, "data/conversations.db"),
      class: "permanent_source",
      sourceOfTruth: "hybrid",
      cloudTarget: "managed-postgres-sync",
      privacyLabel: "sensitive",
      pruneSafety: "never_prune",
      retention: "retain locally until managed sync and restore are proven",
    },
    {
      id: "sqlite-wal-shm",
      path: path.join(root, "data"),
      class: "replay_queue",
      sourceOfTruth: "local",
      cloudTarget: "managed-postgres-sync-checkpoint",
      privacyLabel: "sensitive",
      pruneSafety: "safe_with_retention",
      retention: "cap after checkpointed sync; never delete active db file",
    },
    {
      id: "qmd-cache",
      path: homePath("~/.cache/qmd"),
      class: "rebuildable_cache",
      sourceOfTruth: "derived",
      cloudTarget: "remote-qmd-worker-or-managed-search-index",
      privacyLabel: "internal",
      pruneSafety: "safe_if_rebuilt",
      retention: "cache cap with rebuild from git-backed knowledge",
    },
    {
      id: "mem0-local-cache",
      path: homePath("~/.mem0"),
      class: "rebuildable_cache",
      sourceOfTruth: "cloud",
      cloudTarget: "mem0-plus-qdrant-cloud",
      privacyLabel: "sensitive",
      pruneSafety: "safe_after_offload",
      retention: "retain hot cache only; Qdrant Cloud remains canonical",
    },
    {
      id: "raw-vault",
      path: homePath("~/.memroos/vault"),
      class: "raw_evidence",
      sourceOfTruth: "hybrid",
      cloudTarget: "encrypted-object-storage-with-hash-replay",
      privacyLabel: "sensitive",
      pruneSafety: "safe_after_offload",
      retention: "prune only after object storage hash verification and rollback proof",
    },
    {
      id: "knowledge-repo",
      path: homePath("~/github/knowledge"),
      class: "permanent_source",
      sourceOfTruth: "local",
      cloudTarget: "private-git-remote-plus-remote-index-worker",
      privacyLabel: "internal",
      pruneSafety: "never_prune",
      retention: "portable git source of truth",
    },
    {
      id: "memory-service-logs",
      path: path.join(root, "services/memory/logs"),
      class: "disposable_log",
      sourceOfTruth: "local",
      cloudTarget: "centralized-log-retention",
      privacyLabel: "sensitive",
      pruneSafety: "safe_with_retention",
      retention: "rotate and cap; redact before centralized shipping",
    },
    {
      id: "runtime-env",
      path: homePath("~/.memroos"),
      class: "runtime_secret_config",
      sourceOfTruth: "local",
      cloudTarget: "secret-manager-reference-only",
      privacyLabel: "secret",
      pruneSafety: "never_prune",
      retention: "never upload raw secrets; store references only",
    },
  ];
}

function fileSizeBytes(targetPath: string): number {
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
  } catch {
    return 0;
  }

  let total = 0;
  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(child);
        } else if (entry.isFile()) {
          total += fs.statSync(child).size;
        }
      } catch {
        continue;
      }
    }
  }
  return total;
}

function pressureFor(totalBytes: number, limits = DEFAULT_LIMITS): LocalFootprintInventory["pressure"] {
  if (totalBytes >= limits.criticalBytes) return "critical";
  if (totalBytes >= limits.watchBytes) return "watch";
  return "ok";
}

export function collectLocalFootprintInventory(repoRoot: string = process.cwd()): LocalFootprintInventory {
  const stores = defaultLocalStoreProfiles(repoRoot).map((profile) => {
    const exists = fs.existsSync(profile.path);
    return {
      ...profile,
      exists,
      sizeBytes: exists ? fileSizeBytes(profile.path) : 0,
    };
  });
  const totalBytes = stores.reduce((sum, store) => sum + store.sizeBytes, 0);
  const warnings = stores
    .filter((store) => store.pruneSafety === "never_prune" && store.class !== "runtime_secret_config" && store.sizeBytes > 1024 * 1024 * 1024)
    .map((store) => `${store.id} is locally permanent and over 1GB; confirm cloud sync before any pruning.`);

  return {
    generatedAt: new Date().toISOString(),
    totalBytes,
    pressure: pressureFor(totalBytes),
    stores,
    warnings,
  };
}
