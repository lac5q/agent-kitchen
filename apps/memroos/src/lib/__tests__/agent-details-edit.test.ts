// apps/memroos/src/lib/__tests__/agent-details-edit.test.ts
//
// Operators need to rename agents whose auto-detected names are unhelpful.
// The constraint that matters: a rename must survive the next host sync, and
// the editable surface must stay narrow enough that the registry can never be
// hand-edited into disagreeing with the machine.

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let db: Database.Database;

vi.mock("@/lib/db", () => ({ getDb: () => db }));

const { initSchema } = await import("@/lib/db-schema");
const { registerAgent, getRegisteredAgent, updateAgentDetails } = await import(
  "@/lib/agent-registry"
);

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  registerAgent({
    id: "hermes:claude",
    name: "Claude Code",
    role: "Coding agent (CLI)",
    platform: "claude",
    protocol: "rest",
    location: "local",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("updateAgentDetails", () => {
  it("renames an agent", () => {
    const updated = updateAgentDetails("hermes:claude", {
      name: "Hermes Claude",
      role: "Primary coding agent on hermes",
    });
    expect(updated?.name).toBe("Hermes Claude");
    expect(updated?.role).toBe("Primary coding agent on hermes");
  });

  it("leaves untouched fields alone", () => {
    updateAgentDetails("hermes:claude", { name: "Renamed" });
    const a = getRegisteredAgent("hermes:claude");
    expect(a?.name).toBe("Renamed");
    expect(a?.role).toBe("Coding agent (CLI)");
    // Identity fields describe where the agent actually is — not editable.
    expect(a?.platform).toBe("claude");
  });

  it("rejects an empty name or role", () => {
    expect(() => updateAgentDetails("hermes:claude", { name: "  " })).toThrow();
    expect(() => updateAgentDetails("hermes:claude", { role: "" })).toThrow();
  });

  it("returns null for an unknown agent", () => {
    expect(updateAgentDetails("nope", { name: "x" })).toBeNull();
  });

  it("a rename survives a re-detect that reports the original name", () => {
    // sync-host-agents.sh upserts with ON CONFLICT DO UPDATE but deliberately
    // omits name/role, so re-running detection must not revert an operator
    // rename. This models that upsert.
    updateAgentDetails("hermes:claude", { name: "Hermes Claude" });

    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, status,
         location, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'rest', 'dormant', 'local', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         platform = excluded.platform,
         updated_at = excluded.updated_at,
         deregistered_at = NULL`,
    ).run(
      "hermes:claude",
      "Claude Code", // what detection would report
      "Coding agent (CLI)",
      "claude",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    expect(getRegisteredAgent("hermes:claude")?.name).toBe("Hermes Claude");
  });
});
