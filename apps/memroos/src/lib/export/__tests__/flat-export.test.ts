// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  computeTreeHash,
  exportFlatVault,
  resolveTenantVaultPath,
  verifyFlatExportManifest,
} from "@/lib/export/flat-export";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flat-export-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("flat-export (ENTOPS-08)", () => {
  it("resolves operator tenants/<id> layout preferentially", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantsPath = path.join(vaultRoot, "tenants", "acme");
    fs.mkdirSync(tenantsPath, { recursive: true });
    fs.writeFileSync(path.join(tenantsPath, "notes.md"), "# hello\n");
    expect(resolveTenantVaultPath("acme", vaultRoot)).toBe(tenantsPath);
  });

  it("falls back to flat tenant layout and sanitizes unsafe tenant ids", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const flatPath = path.join(vaultRoot, "unsafe_tenant");
    fs.mkdirSync(flatPath, { recursive: true });

    expect(resolveTenantVaultPath("unsafe/tenant", vaultRoot)).toBe(flatPath);
    expect(resolveTenantVaultPath("!!!", vaultRoot)).toBe(
      path.join(vaultRoot, "tenants", "___")
    );
    expect(resolveTenantVaultPath("", vaultRoot)).toBe(
      path.join(vaultRoot, "tenants", "default-tenant")
    );
  });

  it("uses configured knowledge roots when vaultRoot is omitted", () => {
    const previousKnowledgeRoot = process.env.KNOWLEDGE_ROOT;
    const previousMemroosKnowledgeRoot = process.env.MEMROOS_KNOWLEDGE_ROOT;
    try {
      const envRoot = path.join(tmpRoot, "env-knowledge");
      fs.mkdirSync(path.join(envRoot, "tenants", "env-tenant"), { recursive: true });
      process.env.KNOWLEDGE_ROOT = "   ";
      process.env.MEMROOS_KNOWLEDGE_ROOT = envRoot;

      expect(resolveTenantVaultPath("env-tenant")).toBe(
        path.join(envRoot, "tenants", "env-tenant")
      );
    } finally {
      if (previousKnowledgeRoot === undefined) {
        delete process.env.KNOWLEDGE_ROOT;
      } else {
        process.env.KNOWLEDGE_ROOT = previousKnowledgeRoot;
      }
      if (previousMemroosKnowledgeRoot === undefined) {
        delete process.env.MEMROOS_KNOWLEDGE_ROOT;
      } else {
        process.env.MEMROOS_KNOWLEDGE_ROOT = previousMemroosKnowledgeRoot;
      }
    }
  });

  it("computeTreeHash is deterministic for the same tree", () => {
    const vault = path.join(tmpRoot, "tenants", "t1");
    fs.mkdirSync(vault, { recursive: true });
    fs.writeFileSync(path.join(vault, "a.md"), "alpha\n");
    fs.writeFileSync(path.join(vault, "b.md"), "beta\n");
    const first = computeTreeHash(vault);
    const second = computeTreeHash(vault);
    expect(first.treeHash).toBe(second.treeHash);
    expect(first.fileCount).toBe(2);
  });

  it("hashes supported knowledge files while skipping ignored directories and binary extensions", () => {
    const vault = path.join(tmpRoot, "tenants", "mixed");
    fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
    fs.mkdirSync(path.join(vault, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(vault, "MEMORY.md"), "memory\n");
    fs.writeFileSync(path.join(vault, "data.json"), "{}\n");
    fs.writeFileSync(path.join(vault, "notes.yaml"), "a: b\n");
    fs.writeFileSync(path.join(vault, "image.png"), "not included\n");
    fs.writeFileSync(path.join(vault, ".git", "ignored.md"), "ignored\n");
    fs.writeFileSync(path.join(vault, "node_modules", "pkg", "ignored.md"), "ignored\n");

    const tree = computeTreeHash(vault);
    expect(tree.files.map((file) => file.relativePath)).toEqual([
      "data.json",
      "MEMORY.md",
      "notes.yaml",
    ]);
    expect(tree.fileCount).toBe(3);
  });

  it("returns an empty deterministic tree hash when the vault path is missing", () => {
    const tree = computeTreeHash(path.join(tmpRoot, "missing"));
    expect(tree.fileCount).toBe(0);
    expect(tree.files).toEqual([]);
    expect(tree.treeHash).toHaveLength(64);
  });

  it("exportFlatVault produces tarball + signed manifest", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantVault = path.join(vaultRoot, "tenants", "default-tenant");
    fs.mkdirSync(tenantVault, { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "readme.md"), "# vault\nsecret-free\n");

    const outDir = path.join(tmpRoot, "out");
    const result = exportFlatVault({
      tenantId: "default-tenant",
      vaultRoot,
      outDir,
      gitSha: "deadbeef",
      signingKey: "test-signing-key",
      now: new Date("2026-07-16T20:00:00.000Z"),
    });

    expect(fs.existsSync(result.archivePath)).toBe(true);
    expect(result.archivePath.endsWith(".tar.gz")).toBe(true);
    expect(fs.existsSync(result.manifestPath)).toBe(true);
    expect(result.manifest.gitSha).toBe("deadbeef");
    expect(result.manifest.treeHash.startsWith("sha256:")).toBe(true);
    expect(result.manifest.signatureAlg).toBe("hmac-sha256");
    expect(result.manifest.fileCount).toBe(1);
    expect(verifyFlatExportManifest(result.manifest, "test-signing-key")).toBe(true);
    expect(verifyFlatExportManifest(result.manifest, "wrong-key")).toBe(false);
  });

  it("self-signs when no signing key is provided", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantVault = path.join(vaultRoot, "tenants", "solo");
    fs.mkdirSync(tenantVault, { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "x.md"), "x\n");

    const result = exportFlatVault({
      tenantId: "solo",
      vaultRoot,
      outDir: path.join(tmpRoot, "out2"),
      gitSha: crypto.randomBytes(4).toString("hex"),
    });
    expect(result.manifest.signatureAlg).toBe("sha256-self");
    expect(verifyFlatExportManifest(result.manifest)).toBe(true);
  });

  it("uses environment git sha and signing key fallbacks", () => {
    const previousGitSha = process.env.MEMROOS_GIT_SHA;
    const previousSourceVersion = process.env.SOURCE_VERSION;
    const previousSigningKey = process.env.MEMROOS_EXPORT_SIGNING_KEY;
    try {
      const vaultRoot = path.join(tmpRoot, "knowledge");
      fs.mkdirSync(path.join(vaultRoot, "tenants", "envsign"), { recursive: true });
      process.env.MEMROOS_GIT_SHA = "env-sha";
      process.env.SOURCE_VERSION = "source-sha";
      process.env.MEMROOS_EXPORT_SIGNING_KEY = "env-signing-key";

      const result = exportFlatVault({
        tenantId: "envsign",
        vaultRoot,
        outDir: path.join(tmpRoot, "out-env"),
        now: new Date("2026-07-16T21:00:00.000Z"),
      });
      expect(result.manifest.gitSha).toBe("env-sha");
      expect(result.manifest.signatureAlg).toBe("hmac-sha256");
      expect(verifyFlatExportManifest(result.manifest, "env-signing-key")).toBe(true);
    } finally {
      if (previousGitSha === undefined) {
        delete process.env.MEMROOS_GIT_SHA;
      } else {
        process.env.MEMROOS_GIT_SHA = previousGitSha;
      }
      if (previousSourceVersion === undefined) {
        delete process.env.SOURCE_VERSION;
      } else {
        process.env.SOURCE_VERSION = previousSourceVersion;
      }
      if (previousSigningKey === undefined) {
        delete process.env.MEMROOS_EXPORT_SIGNING_KEY;
      } else {
        process.env.MEMROOS_EXPORT_SIGNING_KEY = previousSigningKey;
      }
    }
  });
});
