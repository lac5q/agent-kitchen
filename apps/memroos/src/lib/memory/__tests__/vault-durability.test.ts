// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  listVaultArtifactsForTenant,
  markOrphanedArtifacts,
  readVaultArtifactForTenant,
  reconcileVaultDurability,
  replayVaultArtifactWithDurability,
  writeVaultArtifactWithDurability,
} from "../vault-durability";
import { verifyMemoryAuditChain } from "@/lib/audit/memory-chain";

const VAULT_ROOT = path.join(os.tmpdir(), `vault-durability-test-${crypto.randomUUID()}`);

let db: Database.Database | null = null;

function freshDb(): Database.Database {
  db = new Database(":memory:");
  initSchema(db);
  return db;
}

beforeEach(() => {
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(VAULT_ROOT, { recursive: true });
  process.env["MEMROOS_VAULT_ROOT"] = VAULT_ROOT;
});

afterEach(() => {
  db?.close();
  db = null;
  delete process.env["MEMROOS_VAULT_ROOT"];
});

describe("VAL-MEM-026: vault durability and replay are tenant-safe", () => {
  it("writes vault artifact and records complete durability state", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "src-1",
      body: "vault body content",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    expect(written.id).toBeTruthy();
    expect(written.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const durability = database
      .prepare("SELECT write_state, replay_state FROM memory_vault_durability WHERE artifact_id = ?")
      .get(written.id) as { write_state: string; replay_state: string };
    expect(durability.write_state).toBe("complete");
    expect(durability.replay_state).toBe("complete");
  });

  it("replay recomputes the hash and confirms it matches the persisted row", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "src-replay",
      body: "replay me",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    const result = replayVaultArtifactWithDurability(database, "default-tenant", written.id, "operator");
    expect(result.ok).toBe(true);
    expect(result.expectedHash).toBe(written.contentHash);
    expect(result.observedHash).toBe(written.contentHash);
    expect(result.replayState).toBe("complete");
  });

  it("replay refuses cross-tenant artifacts", () => {
    const database = freshDb();
    // Seed two tenants so the FK to tenants(id) is satisfied.
    database.prepare("INSERT OR IGNORE INTO tenants(id, name, created_at) VALUES (?, ?, ?)").run("default-tenant", "default", "2026-01-01T00:00:00.000Z");
    database.prepare("INSERT OR IGNORE INTO tenants(id, name, created_at) VALUES (?, ?, ?)").run("tenant-b", "tenant-b", "2026-01-01T00:00:00.000Z");
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "src-tenant",
      body: "tenant isolated",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    // Cross-tenant replay: durability row exists under default-tenant only, so replay
    // for tenant-b is rejected as missing (no silent cross-tenant access).
    expect(() =>
      replayVaultArtifactWithDurability(database, "tenant-b", written.id, "operator")
    ).toThrow(/vault durability row missing|tenant mismatch/);
  });

  it("detects hash mismatch when the on-disk body is tampered with", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "src-tamper",
      body: "tamper me",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    // Locate the on-disk file and corrupt it.
    const absolute = path.join(VAULT_ROOT, "default-tenant", written.relativePath);
    const corrupted = Buffer.concat([Buffer.from("X"), fs.readFileSync(absolute)]);
    fs.writeFileSync(absolute, corrupted);

    const result = replayVaultArtifactWithDurability(database, "default-tenant", written.id, "operator");
    expect(result.ok).toBe(false);
    // Either mismatch (hash differs after successful decompression) or failed (decompression
    // threw). Both states signal that the artifact cannot be replayed and require operator review.
    expect(["mismatch", "failed"]).toContain(result.replayState);
    expect(result.failureReason).toBeTruthy();
  });

  it("reconcile reports ok/mismatched/failed counts", () => {
    const database = freshDb();
    const a = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "reconcile-a",
      body: "alpha",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    const b = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "reconcile-b",
      body: "beta",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    // Tamper one
    const absoluteB = path.join(VAULT_ROOT, "default-tenant", b.relativePath);
    fs.writeFileSync(absoluteB, Buffer.concat([Buffer.from("ZZZ"), fs.readFileSync(absoluteB)]));

    const summary = reconcileVaultDurability(database, "default-tenant", "operator");
    expect(summary.ok).toBe(1);
    // The corrupted artifact lands in mismatched OR failed depending on whether
    // zstd decompression succeeds. Either way, it's not in the `ok` bucket.
    expect([...summary.mismatched, ...summary.failed]).toContain(b.id);
    expect(summary.failed).not.toContain(a.id);
  });

  it("audit chain records vault writes and replays through the memory domain", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "audit-chain",
      body: "audit chain body",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    replayVaultArtifactWithDurability(database, "default-tenant", written.id, "operator");
    const verification = verifyMemoryAuditChain(database, "default-tenant");
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBeGreaterThanOrEqual(2);
  });

  it("readVaultArtifactForTenant enforces tenant scope", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "tenant-read",
      body: "tenant scoped",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    const read = readVaultArtifactForTenant(database, "default-tenant", written.id);
    expect(read.id).toBe(written.id);
    expect(() => readVaultArtifactForTenant(database, "other-tenant", written.id)).toThrow(/tenant mismatch/);
  });

  it("listVaultArtifactsForTenant returns artifacts for the tenant", () => {
    const database = freshDb();
    writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "list-a",
      body: "listed",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    const listed = listVaultArtifactsForTenant(database, "default-tenant", { limit: 10 });
    expect(listed.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it("markOrphanedArtifacts flags pending durability rows with missing files", () => {
    const database = freshDb();
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO memory_vault_durability
         (id, tenant_id, artifact_id, artifact_uri, content_hash, classification_json, label_version,
          write_state, replay_state, created_at, updated_at)
         VALUES (?, 'default-tenant', 'orphan-art', 'vault://orphan', 'abc', '{}', 1, 'pending', 'pending', ?, ?)`
      )
      .run("vdr-orphan", now, now);
    const marked = markOrphanedArtifacts(database, "default-tenant");
    expect(marked).toBe(1);
    const row = database
      .prepare("SELECT write_state, failure_reason FROM memory_vault_durability WHERE id = ?")
      .get("vdr-orphan") as { write_state: string; failure_reason: string };
    expect(row.write_state).toBe("orphaned");
    expect(row.failure_reason).toContain("orphaned");
  });

  it("reconcileVaultDurability returns empty summary when durability table is absent", () => {
    const bare = new Database(":memory:");
    const summary = reconcileVaultDurability(bare, "default-tenant", "operator");
    expect(summary).toEqual({ ok: 0, mismatched: [], failed: [] });
    bare.close();
  });

  it("markOrphanedArtifacts marks rows whose artifact file disappeared from disk", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "orphan-file",
      body: "orphan me",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    database
      .prepare(
        `UPDATE memory_vault_durability SET write_state = 'pending' WHERE artifact_id = ?`
      )
      .run(written.id);
    fs.rmSync(path.join(VAULT_ROOT, "default-tenant", written.relativePath), { force: true });
    const marked = markOrphanedArtifacts(database, "default-tenant");
    expect(marked).toBe(1);
    const row = database
      .prepare("SELECT write_state FROM memory_vault_durability WHERE artifact_id = ?")
      .get(written.id) as { write_state: string };
    expect(row.write_state).toBe("orphaned");
  });

  it("rejects invalid artifact timestamps before writing durability rows", () => {
    const database = freshDb();

    expect(() =>
      writeVaultArtifactWithDurability(database, {
        tenantId: "default-tenant",
        sourceType: "memory.test",
        sourceId: "bad-time",
        body: "invalid timestamp",
        label: { visibility: "private", policy: "sealed" },
        actorId: "operator",
        now: new Date("not-a-date"),
      })
    ).toThrow(/Invalid UTC timestamp/);

    expect(database.prepare("SELECT COUNT(*) AS count FROM memory_vault_durability").get()).toMatchObject({ count: 0 });
  });

  it("replay tolerates malformed durability classification JSON", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "bad-classification",
      body: "classify me",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    database
      .prepare("UPDATE memory_vault_durability SET classification_json = ? WHERE artifact_id = ?")
      .run("{", written.id);

    const replayed = replayVaultArtifactWithDurability(database, "default-tenant", written.id, "operator");

    expect(replayed.ok).toBe(true);
    expect(replayed.replayState).toBe("complete");
  });

  it("markOrphanedArtifacts handles filesystem stat failures as missing files", () => {
    const database = freshDb();
    const written = writeVaultArtifactWithDurability(database, {
      tenantId: "default-tenant",
      sourceType: "memory.test",
      sourceId: "fs-error",
      body: "orphan if stat fails",
      label: { visibility: "private", policy: "sealed" },
      actorId: "operator",
    });
    database
      .prepare("UPDATE memory_vault_durability SET write_state = 'pending' WHERE artifact_id = ?")
      .run(written.id);
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation(() => {
      throw new Error("stat failed");
    });
    try {
      expect(markOrphanedArtifacts(database, "default-tenant")).toBe(1);
    } finally {
      existsSpy.mockRestore();
    }
    expect(database.prepare("SELECT write_state FROM memory_vault_durability WHERE artifact_id = ?").get(written.id)).toMatchObject({
      write_state: "orphaned",
    });
  });

  it("markOrphanedArtifacts returns zero when the durability table is absent", () => {
    const bare = new Database(":memory:");
    expect(markOrphanedArtifacts(bare, "default-tenant")).toBe(0);
    bare.close();
  });

  it("writeVaultArtifactWithDurability records failed durability when vault write throws", async () => {
    const database = freshDb();
    const writer = await import("@/lib/vault/writer");
    const spy = vi.spyOn(writer, "writeVaultArtifact").mockImplementation(() => {
      throw new Error("disk full");
    });
    try {
      expect(() =>
        writeVaultArtifactWithDurability(database, {
          tenantId: "default-tenant",
          sourceType: "memory.test",
          sourceId: "fail-write",
          body: "boom",
          label: { visibility: "private", policy: "sealed" },
          actorId: "operator",
        })
      ).toThrow(/disk full/);
      const row = database
        .prepare("SELECT write_state, failure_reason FROM memory_vault_durability ORDER BY created_at DESC LIMIT 1")
        .get() as { write_state: string; failure_reason: string };
      expect(row.write_state).toBe("failed");
      expect(row.failure_reason).toContain("disk full");
    } finally {
      spy.mockRestore();
    }
  });
});
