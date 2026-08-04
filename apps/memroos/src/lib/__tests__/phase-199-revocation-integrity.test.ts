// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `phase-199-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "phase-199.db");

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const dbModule = await import("../db");
  const registryModule = await import("../agent/registry");
  const schemaModule = await import("../db-schema");
  return {
    ...registryModule,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
    withForeignKeysDisabled: schemaModule.withForeignKeysDisabled,
  };
}

describe("Phase 199 revocation integrity", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadModules();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_AGENT_API_KEY_TTL_DAYS;
  });

  it("enables PRAGMA foreign_keys on a fresh connection", async () => {
    const { getDb } = await loadModules();
    const db = getDb();
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("issues agent keys with expires_at and rejects expired keys", async () => {
    const { registerAgent, authenticateAgentKey, getDb } = await loadModules();
    const result = registerAgent({
      id: "ttl-agent",
      name: "TTL Agent",
      role: "test",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    expect(result.apiKey).toBeTruthy();

    const row = getDb()
      .prepare(`SELECT expires_at FROM agent_api_keys WHERE agent_id = ?`)
      .get("ttl-agent") as { expires_at: string | null };
    expect(row.expires_at).toBeTruthy();
    expect(Date.parse(row.expires_at!)).toBeGreaterThan(Date.now());

    expect(authenticateAgentKey(result.apiKey!)).toMatchObject({ id: "ttl-agent" });

    getDb()
      .prepare(`UPDATE agent_api_keys SET expires_at = ? WHERE agent_id = ?`)
      .run(new Date(Date.now() - 60_000).toISOString(), "ttl-agent");
    expect(authenticateAgentKey(result.apiKey!)).toBeNull();
  });

  it("rejects keys with null expires_at (fail closed)", async () => {
    const { registerAgent, authenticateAgentKey, getDb } = await loadModules();
    const result = registerAgent({
      id: "null-ttl-agent",
      name: "Null TTL",
      role: "test",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    getDb()
      .prepare(`UPDATE agent_api_keys SET expires_at = NULL WHERE agent_id = ?`)
      .run("null-ttl-agent");
    expect(authenticateAgentKey(result.apiKey!)).toBeNull();
  });

  it("adds users.disabled_at and keeps foreign_keys ON around rebuild helper", async () => {
    const { getDb, withForeignKeysDisabled } = await loadModules();
    const db = getDb();
    const cols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
    expect(cols.some((c) => c.name === "disabled_at")).toBe(true);

    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    let sawOff = false;
    withForeignKeysDisabled(db, () => {
      sawOff = db.pragma("foreign_keys", { simple: true }) === 0;
    });
    expect(sawOff).toBe(true);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
