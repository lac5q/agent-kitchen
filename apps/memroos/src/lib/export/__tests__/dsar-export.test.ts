// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { buildKnowledgeAuditEntry } from "@/lib/audit/knowledge-chain";
import { writeAuditEntry } from "@/lib/audit/write";
import {
  deleteDsarUser,
  exportDsarPackage,
  listVaultPathsForUser,
} from "@/lib/export/dsar-export";

let tmpRoot: string;
let db: Database.Database;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dsar-export-"));
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function seedKnowledgeWrite(
  database: Database.Database,
  opts: { tenantId: string; userId: string; path: string; operation?: "read" | "write" | "delete" }
): void {
  const entry = buildKnowledgeAuditEntry(database, {
    tenantId: opts.tenantId,
    actorId: "operator-1",
    actorRole: "operator",
    path: opts.path,
    operation: opts.operation ?? "write",
    agentId: "agent-1",
    userId: opts.userId,
    opHash: `sha256:${crypto.createHash("sha256").update(opts.path).digest("hex")}`,
  });
  writeAuditEntry(
    {
      id: entry.id,
      tenant_id: entry.tenantId,
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      event_type: entry.eventType,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      reason: entry.reason,
      metadata_json: entry.metadata_json,
      created_at: entry.created_at,
    },
    database
  );
}

describe("dsar-export (ENTOPS-08)", () => {
  it("lists vault paths authored by the user from knowledge audit", () => {
    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-a",
      path: "shared/notes.md",
    });
    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-b",
      path: "private/other.md",
    });
    const paths = listVaultPathsForUser(db, "default-tenant", "user-a");
    expect(paths).toEqual(["shared/notes.md"]);
  });

  it("ignores malformed audit metadata while listing vault paths", () => {
    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-a",
      path: "shared/notes.md",
    });
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: "operator-1",
        actor_role: "operator",
        event_type: "knowledge.access",
        entity_type: "knowledge",
        entity_id: "broken",
        reason: "broken",
        metadata_json: "{not-json",
        created_at: new Date().toISOString(),
      },
      db
    );

    expect(listVaultPathsForUser(db, "default-tenant", "user-a")).toEqual(["shared/notes.md"]);
  });

  it("exportDsarPackage archives vault files + audit NDJSON", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantVault = path.join(vaultRoot, "tenants", "default-tenant");
    fs.mkdirSync(path.join(tenantVault, "shared"), { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "shared", "notes.md"), "# notes\n");

    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-a",
      path: "shared/notes.md",
    });

    const result = exportDsarPackage({
      tenantId: "default-tenant",
      userId: "user-a",
      outDir: path.join(tmpRoot, "out"),
      vaultRoot,
      db,
      now: new Date("2026-07-16T21:00:00.000Z"),
    });

    expect(fs.existsSync(result.archivePath)).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.auditEntryCount).toBeGreaterThanOrEqual(1);
    expect(result.vaultPaths).toContain("shared/notes.md");
    expect(fs.existsSync(result.manifestPath)).toBe(true);
  });

  it("skips traversal, missing, and directory vault paths during export", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantVault = path.join(vaultRoot, "tenants", "default-tenant");
    fs.mkdirSync(path.join(tenantVault, "safe"), { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "safe", "notes.md"), "# safe\n");
    fs.writeFileSync(path.join(tmpRoot, "outside.md"), "# outside\n");

    for (const rel of ["safe/notes.md", "../outside.md", "missing.md", "safe"]) {
      seedKnowledgeWrite(db, {
        tenantId: "default-tenant",
        userId: "user-a",
        path: rel,
      });
    }

    const result = exportDsarPackage({
      tenantId: "default-tenant",
      userId: "user-a",
      outDir: path.join(tmpRoot, "out"),
      vaultRoot,
      db,
    });

    expect(result.fileCount).toBe(1);
    expect(result.vaultPaths).toEqual(["safe/notes.md"]);
  });

  it("includes read/delete audit paths and normalizes blank tenant id", () => {
    const vaultRoot = path.join(tmpRoot, "knowledge");
    const tenantVault = path.join(vaultRoot, "tenants", "default-tenant");
    fs.mkdirSync(path.join(tenantVault, "read"), { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "read", "note.md"), "# read\n");
    fs.mkdirSync(path.join(tenantVault, "deleted"), { recursive: true });
    fs.writeFileSync(path.join(tenantVault, "deleted", "note.md"), "# deleted\n");

    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-ops",
      path: "read/note.md",
      operation: "read",
    });
    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-ops",
      path: "deleted/note.md",
      operation: "delete",
    });

    expect(listVaultPathsForUser(db, "default-tenant", "user-ops")).toEqual([
      "deleted/note.md",
      "read/note.md",
    ]);

    const result = exportDsarPackage({
      tenantId: " ",
      userId: " user-ops ",
      outDir: path.join(tmpRoot, "out-ops"),
      vaultRoot,
      db,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(result.fileCount).toBe(2);
    expect(result.vaultPaths).toEqual(["deleted/note.md", "read/note.md"]);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8")) as {
      tenantId: string;
      userId: string;
    };
    expect(manifest).toMatchObject({ tenantId: "default-tenant", userId: "user-ops" });
  });

  it("requires a non-empty user id for exports", () => {
    expect(() =>
      exportDsarPackage({
        tenantId: "default-tenant",
        userId: "  ",
        outDir: path.join(tmpRoot, "out"),
        db,
      })
    ).toThrow(/userId required/);
  });

  it("deleteDsarUser tombstones without removing audit rows", () => {
    seedKnowledgeWrite(db, {
      tenantId: "default-tenant",
      userId: "user-del",
      path: "x.md",
    });
    const before = (
      db.prepare("SELECT COUNT(*) AS c FROM audit_entries").get() as { c: number }
    ).c;

    const result = deleteDsarUser({
      tenantId: "default-tenant",
      userId: "user-del",
      tombstonedBy: "admin",
      db,
    });

    expect(result.auditRowsPreserved).toBe(true);
    expect(result.tombstones.length).toBeGreaterThanOrEqual(1);
    const after = (
      db.prepare("SELECT COUNT(*) AS c FROM audit_entries").get() as { c: number }
    ).c;
    expect(after).toBe(before);

    const tombs = db
      .prepare("SELECT entity_id, reason FROM erasure_tombstones WHERE entity_id = ?")
      .all("user-del") as Array<{ entity_id: string; reason: string }>;
    expect(tombs.length).toBeGreaterThanOrEqual(1);
    expect(tombs.every((t) => t.reason === "dsar")).toBe(true);
  });
});
