import {
  collectLocalFootprintInventory,
  type LocalFootprintInventory,
  type LocalStoreProfile,
} from "@/lib/cloud-offload/footprint";
import { getDb } from "@/lib/db";

export type MemoryIterationStatus = "healthy" | "needs_repair" | "storage_watch";

export interface MemoryIterationSnapshot {
  status: MemoryIterationStatus;
  warnings: string[];
  observe: {
    indexableMessages: number;
    embeddedMessages: number;
    embeddingBacklog: number;
    discordMessages: number;
    discordFtsRows: number;
    discordMissingFts: number;
    lastDiscordMessageAt: string | null;
    localFootprintBytes: number;
    localFootprintPressure: LocalFootprintInventory["pressure"];
  };
  repair: {
    nextAction: string;
    batchPolicy: string;
    ownership: string;
  };
  verify: {
    requiredChecks: string[];
  };
  storage: {
    rebuildableBytes: number;
    offloadableBytes: number;
    neverPruneBytes: number;
    cloudOffloadCandidates: Array<Pick<
      LocalStoreProfile,
      "id" | "class" | "sizeBytes" | "sourceOfTruth" | "cloudTarget" | "pruneSafety" | "privacyLabel" | "retention"
    >>;
  };
}

export interface MemoryDoctorDiagnostic {
  generatedAt: string;
  memoryIteration: MemoryIterationSnapshot;
  localFootprint: LocalFootprintInventory;
}

function scalar(db: ReturnType<typeof getDb>, sql: string, params: unknown[] = []): number {
  try {
    const row = db.prepare(sql).get(...params) as { value?: number } | undefined;
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

function scalarText(db: ReturnType<typeof getDb>, sql: string, params: unknown[] = []): string | null {
  try {
    const row = db.prepare(sql).get(...params) as { value?: string | null } | undefined;
    return typeof row?.value === "string" ? row.value : null;
  } catch {
    return null;
  }
}

function safeCloudOffloadCandidates(stores: LocalStoreProfile[]) {
  return stores
    .filter((store) => store.exists && store.sizeBytes > 0 && store.pruneSafety !== "never_prune")
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 8)
    .map((store) => ({
      id: store.id,
      class: store.class,
      sizeBytes: store.sizeBytes,
      sourceOfTruth: store.sourceOfTruth,
      cloudTarget: store.cloudTarget,
      pruneSafety: store.pruneSafety,
      privacyLabel: store.privacyLabel,
      retention: store.retention,
    }));
}

export function buildMemoryIterationSnapshot(
  db: ReturnType<typeof getDb>,
  localFootprint: LocalFootprintInventory
): MemoryIterationSnapshot {
  const indexableMessages = scalar(
    db,
    `SELECT COUNT(*) AS value
     FROM messages
     WHERE policy = 'indexable'
       AND visibility IN ('internal','public_safe','public_approved')
       AND length(trim(content, ' ' || char(9) || char(10) || char(13))) > 0`
  );
  const embeddedMessages = scalar(
    db,
    `SELECT COUNT(*) AS value
     FROM messages m
     JOIN message_embeddings e ON e.message_id = m.id
     WHERE m.policy = 'indexable'
       AND m.visibility IN ('internal','public_safe','public_approved')
       AND length(trim(m.content, ' ' || char(9) || char(10) || char(13))) > 0`
  );
  const embeddingBacklog = Math.max(0, indexableMessages - embeddedMessages);
  const discordMessages = scalar(db, "SELECT COUNT(*) AS value FROM messages WHERE project = 'platform:discord'");
  const discordFtsRows = scalar(db, "SELECT COUNT(*) AS value FROM messages_fts WHERE project = 'platform:discord'");
  const discordMissingFts = scalar(
    db,
    `SELECT COUNT(*) AS value
     FROM messages m
     LEFT JOIN messages_fts f ON f.rowid = m.id
     WHERE m.project = 'platform:discord'
       AND f.rowid IS NULL`
  );
  const lastDiscordMessageAt = scalarText(
    db,
    "SELECT MAX(timestamp) AS value FROM messages WHERE project = 'platform:discord'"
  );
  const rebuildableBytes = localFootprint.stores
    .filter((store) => store.pruneSafety === "safe_if_rebuilt")
    .reduce((sum, store) => sum + store.sizeBytes, 0);
  const offloadableBytes = localFootprint.stores
    .filter((store) => store.pruneSafety === "safe_after_offload" || store.pruneSafety === "safe_with_retention")
    .reduce((sum, store) => sum + store.sizeBytes, 0);
  const neverPruneBytes = localFootprint.stores
    .filter((store) => store.pruneSafety === "never_prune")
    .reduce((sum, store) => sum + store.sizeBytes, 0);

  const warnings: string[] = [];
  if (discordMissingFts > 0) warnings.push(`${discordMissingFts} Discord messages are missing FTS rows`);
  if (embeddingBacklog > 0) warnings.push(`${embeddingBacklog} indexable messages need embeddings`);
  if (localFootprint.pressure !== "ok") warnings.push(`local footprint pressure is ${localFootprint.pressure}`);

  const status: MemoryIterationStatus =
    discordMissingFts > 0 || embeddingBacklog > 0
      ? "needs_repair"
      : localFootprint.pressure !== "ok"
        ? "storage_watch"
        : "healthy";

  const nextAction =
    discordMissingFts > 0
      ? "rebuild SQLite FTS mirrors for missing Discord rows, then re-run NOC memory iteration checks"
      : embeddingBacklog > 0
        ? "run the in-product embedding backfill worker in bounded batches until backlog reaches zero"
        : localFootprint.pressure !== "ok"
          ? "offload verified safe-after-offload stores and cap rebuildable caches"
          : "continue scheduled in-product observation";

  return {
    status,
    warnings,
    observe: {
      indexableMessages,
      embeddedMessages,
      embeddingBacklog,
      discordMessages,
      discordFtsRows,
      discordMissingFts,
      lastDiscordMessageAt,
      localFootprintBytes: localFootprint.totalBytes,
      localFootprintPressure: localFootprint.pressure,
    },
    repair: {
      nextAction,
      batchPolicy: "bounded batches with verification after every cycle",
      ownership: "product-owned NOC and memory health surfaces, not external cron-only state",
    },
    verify: {
      requiredChecks: [
        "Discord messages mirrored into messages and messages_fts",
        "message_embeddings backlog reaches zero for indexable rows",
        "source-to-QMD contract passes for recent knowledge files",
        "local footprint pressure remains below critical",
      ],
    },
    storage: {
      rebuildableBytes,
      offloadableBytes,
      neverPruneBytes,
      cloudOffloadCandidates: safeCloudOffloadCandidates(localFootprint.stores),
    },
  };
}

export function buildMemoryDoctorDiagnostic(
  db: ReturnType<typeof getDb> = getDb(),
  repoRoot: string = process.cwd()
): MemoryDoctorDiagnostic {
  const localFootprint = collectLocalFootprintInventory(repoRoot);
  return {
    generatedAt: new Date().toISOString(),
    localFootprint,
    memoryIteration: buildMemoryIterationSnapshot(db, localFootprint),
  };
}

export function isMemoryDoctorCommand(message: string): boolean {
  return /^\/doctor(?:\s+(?:memory|memories))?\s*$/i.test(message.trim());
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units.shift() ?? "KB";
  while (value >= 1024 && units.length > 0) {
    value /= 1024;
    unit = units.shift() ?? unit;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function formatMemoryDoctorReport(diagnostic: MemoryDoctorDiagnostic): string {
  const snapshot = diagnostic.memoryIteration;
  const observe = snapshot.observe;
  const storage = snapshot.storage;
  const warnings = snapshot.warnings.length > 0
    ? snapshot.warnings.map((warning) => `- ${warning}`)
    : ["- none"];
  const checks = snapshot.verify.requiredChecks.map((check) => `- ${check}`);
  const candidates = storage.cloudOffloadCandidates.length > 0
    ? storage.cloudOffloadCandidates
      .slice(0, 5)
      .map((candidate) => `- ${candidate.id}: ${formatBytes(candidate.sizeBytes)} to ${candidate.cloudTarget}`)
    : ["- none"];

  return [
    "Memory Doctor",
    `Generated: ${diagnostic.generatedAt}`,
    `Status: ${snapshot.status}`,
    "",
    "Observe",
    `- Discord messages: ${formatCount(observe.discordMessages)}`,
    `- Discord FTS missing: ${formatCount(observe.discordMissingFts)}`,
    `- Last Discord message: ${observe.lastDiscordMessageAt ?? "none"}`,
    `- Embeddings: ${formatCount(observe.embeddedMessages)} / ${formatCount(observe.indexableMessages)}`,
    `- Embedding backlog: ${formatCount(observe.embeddingBacklog)}`,
    `- Local footprint: ${formatBytes(observe.localFootprintBytes)} (${observe.localFootprintPressure})`,
    "",
    "Repair",
    `- Next action: ${snapshot.repair.nextAction}`,
    `- Batch policy: ${snapshot.repair.batchPolicy}`,
    `- Ownership: ${snapshot.repair.ownership}`,
    "",
    "Warnings",
    ...warnings,
    "",
    "Cloud Offload",
    `- Rebuildable: ${formatBytes(storage.rebuildableBytes)}`,
    `- Offloadable: ${formatBytes(storage.offloadableBytes)}`,
    `- Never prune: ${formatBytes(storage.neverPruneBytes)}`,
    ...candidates,
    "",
    "Verify",
    ...checks,
  ].join("\n");
}
