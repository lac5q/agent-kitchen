/**
 * Phase 127 / ENTOPS-08: per-user DSAR export (vault paths + audit NDJSON).
 *
 * Collects vault files authored by the user (from central knowledge audit)
 * plus their audit trail into one archive. Does not embed raw secrets beyond
 * what already exists in vault files; audit metadata never includes file body.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import type Database from "better-sqlite3";

import { streamAuditEntries } from "@/lib/audit/query";
import { AUDIT_EVENT_TYPES } from "@/lib/audit/event-types";
import { resolveTenantVaultPath } from "@/lib/export/flat-export";
import { tombstoneUserForDsar, type ErasureTombstone } from "@/lib/erasure-tombstone";

export interface DsarExportOptions {
  tenantId: string;
  userId: string;
  outDir: string;
  vaultRoot?: string;
  db: Database.Database;
  now?: Date;
}

export interface DsarExportResult {
  archivePath: string;
  manifestPath: string;
  fileCount: number;
  auditEntryCount: number;
  vaultPaths: string[];
}

export interface DsarDeleteOptions {
  tenantId: string;
  userId: string;
  tombstonedBy: string;
  db: Database.Database;
  now?: Date;
}

export interface DsarDeleteResult {
  tombstones: ErasureTombstone[];
  /** Always true — delete path never removes audit_entries. */
  auditRowsPreserved: true;
}

/**
 * Resolve vault-relative paths written by this user from knowledge audit metadata.
 */
export function listVaultPathsForUser(
  db: Database.Database,
  tenantId: string,
  userId: string
): string[] {
  const paths = new Set<string>();
  for (const entry of streamAuditEntries(
    {
      tenantId,
      userId,
      eventType: AUDIT_EVENT_TYPES.KNOWLEDGE_ACCESS,
    },
    db
  )) {
    try {
      const meta = JSON.parse(entry.metadata_json) as Record<string, unknown>;
      const p = typeof meta.path === "string" ? meta.path : null;
      const op = typeof meta.operation === "string" ? meta.operation : null;
      if (p && (op === "write" || op === "delete" || op === "read")) {
        paths.add(p);
      }
    } catch {
      // skip malformed metadata
    }
  }
  return [...paths].sort();
}

function copyVaultFiles(
  vaultRoot: string,
  relativePaths: string[],
  stagingDir: string
): string[] {
  const copied: string[] = [];
  for (const rel of relativePaths) {
    // Prevent path traversal
    const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    if (normalized.includes("..")) continue;
    const abs = path.join(vaultRoot, normalized);
    const resolved = path.resolve(abs);
    if (!resolved.startsWith(path.resolve(vaultRoot) + path.sep) && resolved !== path.resolve(vaultRoot)) {
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
    const dest = path.join(stagingDir, "vault", normalized);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(resolved, dest);
    copied.push(normalized.split(path.sep).join("/"));
  }
  return copied;
}

function writeAuditNdjson(
  db: Database.Database,
  tenantId: string,
  userId: string,
  destPath: string
): number {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const lines: string[] = [];
  for (const entry of streamAuditEntries({ tenantId, userId }, db)) {
    lines.push(JSON.stringify(entry));
  }
  fs.writeFileSync(destPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  return lines.length;
}

function createArchive(stagingDir: string, archivePathNoExt: string): string {
  fs.mkdirSync(path.dirname(archivePathNoExt), { recursive: true });
  const zipPath = `${archivePathNoExt}.zip`;
  const tarPath = `${archivePathNoExt}.tar.gz`;

  const zipCheck = spawnSync("zip", ["-v"], { encoding: "utf8" });
  if (zipCheck.error === undefined) {
    const result = spawnSync("zip", ["-r", "-q", zipPath, "."], {
      cwd: stagingDir,
      encoding: "utf8",
    });
    if (result.status === 0 && fs.existsSync(zipPath)) return zipPath;
  }

  const result = spawnSync(
    "tar",
    ["-czf", tarPath, "-C", stagingDir, "."],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`archive failed: ${result.stderr || result.stdout || "unknown"}`);
  }
  return tarPath;
}

/**
 * Build a per-user DSAR package: vault files + audit NDJSON + manifest.
 */
export function exportDsarPackage(options: DsarExportOptions): DsarExportResult {
  const tenantId = options.tenantId.trim() || "default-tenant";
  const userId = options.userId.trim();
  if (!userId) throw new Error("userId required");

  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-dsar-"));
  try {
    const vaultPath = resolveTenantVaultPath(tenantId, options.vaultRoot);
    const vaultRels = listVaultPathsForUser(options.db, tenantId, userId);
    const copied = copyVaultFiles(vaultPath, vaultRels, staging);
    const auditCount = writeAuditNdjson(
      options.db,
      tenantId,
      userId,
      path.join(staging, "audit", "entries.ndjson")
    );

    const manifest = {
      version: 1,
      kind: "memroos-dsar-export",
      tenantId,
      userId,
      createdAt: now.toISOString(),
      vaultFileCount: copied.length,
      auditEntryCount: auditCount,
      vaultPaths: copied,
      contentSha256: crypto
        .createHash("sha256")
        .update(JSON.stringify({ vaultPaths: copied, auditEntryCount: auditCount }))
        .digest("hex"),
    };
    fs.writeFileSync(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8"
    );

    const archiveBase = path.join(outDir, `memroos-dsar-${tenantId}-${userId}-${stamp}`);
    const archivePath = createArchive(staging, archiveBase);

    const manifestPath = path.join(outDir, `memroos-dsar-${tenantId}-${userId}-${stamp}.manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    return {
      archivePath,
      manifestPath,
      fileCount: copied.length,
      auditEntryCount: auditCount,
      vaultPaths: copied,
    };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * DSAR right-to-delete: insert tombstones only. Never deletes audit rows.
 */
export function deleteDsarUser(options: DsarDeleteOptions): DsarDeleteResult {
  const tombstones = tombstoneUserForDsar(options.db, {
    tenantId: options.tenantId,
    userId: options.userId,
    tombstonedBy: options.tombstonedBy,
    now: options.now,
  });
  return { tombstones, auditRowsPreserved: true };
}
