// apps/memroos/src/lib/__tests__/agent-registry-seed-hosts.test.ts
//
// The seed list is operator-wide: it holds Luis's desktop coding agents
// (*-luis-mbp), the OpenClaw crew, and cloud sessions. Seeding it wholesale put
// 20 agents on cordant-hermes-01 — including "Cursor Desktop", which lives on a
// laptop. Entries now declare `metadata.hosts`, matched against MEMROOS_HOST_ID.
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { seedRegisteredAgents } from "@/lib/agent-registry-seed";

const orig = { ...process.env };
afterEach(() => { process.env = { ...orig }; vi.restoreAllMocks(); });

function seedFor(hostId?: string) {
  const db = new Database(":memory:");
  initSchema(db);
  process.env.MEMROOS_SEED_REGISTERED_AGENTS = "1";
  if (hostId) process.env.MEMROOS_HOST_ID = hostId;
  else delete process.env.MEMROOS_HOST_ID;
  seedRegisteredAgents(db);
  return db.prepare("SELECT id FROM registered_agents ORDER BY id").all() as {id:string}[];
}

describe("host-scoped seeding", () => {
  it("seeds the full roster on oracle-1", () => {
    const ids = seedFor("oracle-1").map(r => r.id);
    expect(ids).toContain("cursor-desktop-luis-mbp");
    expect(ids.length).toBeGreaterThan(15);
  });
  it("seeds only shared services on cordant-hermes-01", () => {
    const ids = seedFor("cordant-hermes-01").map(r => r.id);
    // Luis's laptop agents must NOT appear on a server that is not his laptop.
    expect(ids).not.toContain("cursor-desktop-luis-mbp");
    expect(ids).not.toContain("codex-desktop-luis-mbp");
    expect(ids).toContain("alba");
    expect(ids.length).toBeLessThan(10);
  });
});
