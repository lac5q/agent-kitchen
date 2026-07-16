/**
 * Phase 127 / ENTOPS-08: `memroos export --flat` library.
 *
 * Produces a gzipped tarball of the org knowledge vault for a tenant plus a
 * signed manifest (sha256 tree hash + gitSha + timestamp + signature).
 *
 * Layout preference (operator): `${vaultRoot}/tenants/<tenantId>/`
 * Fallback: `${vaultRoot}/<tenantId>/` then `${vaultRoot}/` if neither exists.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

export interface FlatExportOptions {
  tenantId: string;
  /** Knowledge vault root. Defaults to KNOWLEDGE_ROOT / MEMROOS_KNOWLEDGE_ROOT / ~/.memroos/knowledge */
  vaultRoot?: string;
  /** Output directory for the archive + manifest. */
  outDir: string;
  /** Optional signing key (HMAC-SHA256). Falls back to self-hash when unset. */
  signingKey?: string;
  /** Override git SHA (tests). */
  gitSha?: string;
  now?: Date;
}

export interface FlatExportManifest {
  version: 1;
  kind: "memroos-flat-export";
  tenantId: string;
  vaultPath: string;
  createdAt: string;
  gitSha: string;
  treeHash: string;
  fileCount: number;
  archiveRelativePath: string;
  signature: string;
  signatureAlg: "hmac-sha256" | "sha256-self";
}

export interface FlatExportResult {
  archivePath: string;
  manifestPath: string;
  manifest: FlatExportManifest;
}

function defaultVaultRoot(): string {
  return (
    process.env.KNOWLEDGE_ROOT?.trim() ||
    process.env.MEMROOS_KNOWLEDGE_ROOT?.trim() ||
    path.join(os.homedir(), ".memroos", "knowledge")
  );
}

/**
 * Resolve the on-disk tenant vault directory.
 * Prefer operator `tenants/<id>` layout (matches knowledge-mcp store.py).
 */
export function resolveTenantVaultPath(tenantId: string, vaultRoot?: string): string {
  const root = path.resolve(vaultRoot ?? defaultVaultRoot());
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9._-]/g, "_") || "default-tenant";
  const tenantsPath = path.join(root, "tenants", safeTenant);
  if (fs.existsSync(tenantsPath)) return tenantsPath;
  const flatPath = path.join(root, safeTenant);
  if (fs.existsSync(flatPath)) return flatPath;
  // Default to operator layout even if empty — caller may create fixtures.
  return tenantsPath;
}

function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.isFile()) {
        // Prefer markdown; include other text knowledge artifacts too.
        if (/\.(md|markdown|txt|json|yaml|yml)$/i.test(entry.name) || entry.name === "MEMORY.md") {
          out.push(full);
        }
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.localeCompare(b));
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/**
 * Deterministic tree hash: sha256 of sorted "relPath\\0contentHash\\n" lines.
 */
export function computeTreeHash(vaultPath: string): { treeHash: string; fileCount: number; files: Array<{ relativePath: string; sha256: string }> } {
  const files = listMarkdownFiles(vaultPath);
  const entries: Array<{ relativePath: string; sha256: string }> = files.map((abs) => ({
    relativePath: path.relative(vaultPath, abs).split(path.sep).join("/"),
    sha256: sha256File(abs),
  }));
  const canonical = entries.map((e) => `${e.relativePath}\0${e.sha256}\n`).join("");
  const treeHash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return { treeHash, fileCount: entries.length, files: entries };
}

function resolveGitSha(override?: string): string {
  if (override) return override;
  const env = process.env.MEMROOS_GIT_SHA?.trim() || process.env.SOURCE_VERSION?.trim();
  if (env) return env;
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  if (result.status === 0 && result.stdout?.trim()) return result.stdout.trim();
  return "unknown";
}

function signManifestBody(
  body: Omit<FlatExportManifest, "signature" | "signatureAlg">,
  signingKey?: string
): { signature: string; signatureAlg: FlatExportManifest["signatureAlg"] } {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const key = signingKey ?? process.env.MEMROOS_EXPORT_SIGNING_KEY?.trim();
  if (key) {
    const signature = crypto.createHmac("sha256", key).update(canonical, "utf8").digest("hex");
    return { signature: `hmac-sha256:${signature}`, signatureAlg: "hmac-sha256" };
  }
  const signature = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return { signature: `sha256:${signature}`, signatureAlg: "sha256-self" };
}

function createTarball(sourceDir: string, archivePath: string): void {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  // Use system tar for portable gzip tarball (available on Linux/macOS).
  const parent = path.dirname(sourceDir);
  const base = path.basename(sourceDir);
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
  }
  const result = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", parent, base],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`tar failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

/**
 * Export a tenant vault as a .tar.gz plus signed manifest JSON.
 */
export function exportFlatVault(options: FlatExportOptions): FlatExportResult {
  const tenantId = options.tenantId.trim() || "default-tenant";
  const vaultPath = resolveTenantVaultPath(tenantId, options.vaultRoot);
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const archiveName = `memroos-flat-${tenantId}-${stamp}.tar.gz`;
  const archivePath = path.join(outDir, archiveName);
  const manifestPath = path.join(outDir, `memroos-flat-${tenantId}-${stamp}.manifest.json`);

  const { treeHash, fileCount } = computeTreeHash(vaultPath);
  createTarball(vaultPath, archivePath);

  const body: Omit<FlatExportManifest, "signature" | "signatureAlg"> = {
    version: 1,
    kind: "memroos-flat-export",
    tenantId,
    vaultPath,
    createdAt: now.toISOString(),
    gitSha: resolveGitSha(options.gitSha),
    treeHash: `sha256:${treeHash}`,
    fileCount,
    archiveRelativePath: archiveName,
  };
  const { signature, signatureAlg } = signManifestBody(body, options.signingKey);
  const manifest: FlatExportManifest = { ...body, signature, signatureAlg };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return { archivePath, manifestPath, manifest };
}

/** Verify a previously written manifest signature against its body fields. */
export function verifyFlatExportManifest(
  manifest: FlatExportManifest,
  signingKey?: string
): boolean {
  const { signature: _s, signatureAlg: _a, ...body } = manifest;
  const expected = signManifestBody(body, signingKey);
  return expected.signature === manifest.signature && expected.signatureAlg === manifest.signatureAlg;
}
