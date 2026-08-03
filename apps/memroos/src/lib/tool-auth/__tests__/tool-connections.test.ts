// @vitest-environment node
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { writeVaultArtifact } from "@/lib/vault/writer";

let db: Database.Database;
let vaultRoot: string;

beforeEach(() => {
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-tool-connections-"));
  vi.stubEnv("MEMROOS_VAULT_ROOT", vaultRoot);
  vi.stubEnv("MEMROOS_VAULT_KEY_PATH", path.join(vaultRoot, "vault.key"));
  db = new Database(":memory:");
  initSchema(db);
  db.exec(`
    INSERT INTO users (id, email, display_name, password_hash)
    VALUES
      ('admin-1', 'admin@example.com', 'Admin User', 'hash'),
      ('alice-1', 'alice@example.com', 'Alice User', 'hash'),
      ('bob-1', 'bob@example.com', 'Bob User', 'hash');
    INSERT INTO user_roles (user_id, role) VALUES
      ('admin-1', 'admin'), ('alice-1', 'operator'), ('bob-1', 'reviewer');
  `);
  vi.doMock("@/lib/db", () => ({ getDb: () => db }));
});

afterEach(() => {
  db.close();
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/db");
  vi.resetModules();
});

function insertConnection(input: {
  id: string;
  providerKey?: string;
  ownerId: string | null;
  isShared?: number;
  needsOwner?: number;
  nangoConnectionId?: string | null;
  vaultArtifactId?: string | null;
}) {
  db.prepare(
    `INSERT INTO tool_connections
       (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
        nango_connection_id, vault_artifact_id, created_at)
     VALUES (?, ?, 'oauth', ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.providerKey ?? "circleback",
    input.ownerId,
    input.isShared ?? 0,
    input.needsOwner ?? 0,
    input.nangoConnectionId ?? null,
    input.vaultArtifactId ?? null,
    new Date().toISOString(),
  );
}

async function loadConnections() {
  return await import("../tool-connections");
}

describe("Phase 227 tool connection ownership chokepoint", () => {
  it("requires a viewer and returns only owned/shared rows while preserving duplicate providers", async () => {
    insertConnection({ id: "alice-private", ownerId: "alice-1" });
    insertConnection({ id: "bob-private", ownerId: "bob-1" });
    insertConnection({ id: "shared-one", ownerId: "bob-1", isShared: 1 });
    insertConnection({ id: "shared-two", ownerId: "bob-1", isShared: 1 });

    const { listToolConnectionsVisibleTo } = await loadConnections();
    const alice = await listToolConnectionsVisibleTo({ userId: "alice-1", role: "operator" });
    expect(alice.map((connection) => connection.connectionId)).toEqual(
      expect.arrayContaining(["alice-private", "shared-one", "shared-two"]),
    );
    expect(alice).toHaveLength(3);
    expect(alice.find((connection) => connection.connectionId === "shared-one")).toMatchObject({
      ownerId: "bob-1",
      ownerName: "Bob User",
      isShared: true,
      canManage: false,
    });
  });

  it("allows shared use without shared management, and system use only when shared", async () => {
    insertConnection({ id: "private", ownerId: "alice-1" });
    insertConnection({ id: "shared", ownerId: "alice-1", isShared: 1 });
    const {
      canManageToolConnection,
      canUseToolConnection,
      SYSTEM_TOOL_CONNECTION_PRINCIPAL,
    } = await loadConnections();

    expect(canManageToolConnection({ userId: "bob-1", role: "reviewer" }, "shared")).toBe(false);
    expect(canUseToolConnection({ userId: "bob-1", role: "reviewer" }, "shared")).toBe(true);
    expect(canUseToolConnection({ userId: "bob-1", role: "reviewer" }, "private")).toBe(false);
    expect(canUseToolConnection(SYSTEM_TOOL_CONNECTION_PRINCIPAL, "shared")).toBe(true);
    expect(canUseToolConnection(SYSTEM_TOOL_CONNECTION_PRINCIPAL, "private")).toBe(false);
  });

  it("orphanizes a connection when its owner is deleted", async () => {
    insertConnection({ id: "orphan-me", ownerId: "alice-1" });
    db.prepare("DELETE FROM users WHERE id = ?").run("alice-1");
    const { getToolConnectionRecord } = await loadConnections();
    expect(getToolConnectionRecord("orphan-me")).toMatchObject({
      ownerId: null,
      isShared: false,
    });
  });
});

describe("Phase 227 connection persistence", () => {
  it("keeps two users' same-provider OAuth connections distinct", async () => {
    const store = await import("../credential-store");
    const first = await store.storeOAuthConnection({
      providerKey: "circleback",
      nangoConnectionId: "nango-alice",
      accountEmail: "alice@example.com",
      scopes: null,
      ownerId: "alice-1",
    });
    const second = await store.storeOAuthConnection({
      providerKey: "circleback",
      nangoConnectionId: "nango-bob",
      accountEmail: "bob@example.com",
      scopes: null,
      ownerId: "bob-1",
    });

    expect(first.connectionId).not.toBe(second.connectionId);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM tool_connections WHERE provider_key = 'circleback'").get(),
    ).toEqual({ count: 2 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM tool_connections WHERE nango_connection_id LIKE 'nango-%'").get(),
    ).toEqual({ count: 2 });
  });
});

describe("Phase 227 migration backfill", () => {
  it("backfills legacy vault rows to the earliest admin and is idempotent", () => {
    const artifact = writeVaultArtifact(db, {
      body: JSON.stringify({
        providerKey: "circleback",
        authMode: "oauth",
        nangoConnectionId: "legacy-nango",
        accountEmail: "legacy@example.com",
        connectedAt: "2026-08-01T00:00:00.000Z",
      }),
      sourceType: "tool_connection",
      sourceId: "circleback",
      label: {
        visibility: "private",
        domain: "engineering",
        sensitivity: null,
        policy: "sealed",
      },
    });

    db.exec("DROP TABLE tool_connections");
    db.pragma("user_version = 37");
    initSchema(db);
    initSchema(db);

    const rows = db
      .prepare("SELECT owner_id, is_shared, needs_owner, nango_connection_id, vault_artifact_id FROM tool_connections")
      .all() as Array<Record<string, string | number | null>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner_id: "admin-1",
      is_shared: 1,
      needs_owner: 1,
      nango_connection_id: "legacy-nango",
      vault_artifact_id: artifact.id,
    });
  });
});
