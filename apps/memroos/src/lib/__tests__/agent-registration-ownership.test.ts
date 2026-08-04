// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

const { listUnownedAgents, registerAgent, getRegisteredAgent } = await import("@/lib/agent-registry");

const base = { role: "agent", platform: "claude", protocol: "rest" } as const;

function addUser(id: string) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)").run(
    id, `${id}@cordant.ai`, id, "x"
  );
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, "reviewer");
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  addUser("eric");
  addUser("juan");
});

/**
 * Registration must never be a way to take over an agent that already exists.
 *
 * The original defect: the upsert read
 *   owner_id = COALESCE(excluded.owner_id, registered_agents.owner_id)
 * so a second caller re-registering a known id became its owner — and, because
 * issueApiKey defaults true, was handed a working credential for it.
 */
describe("re-registering an existing agent id", () => {
  beforeEach(() => {
    registerAgent({ ...base, id: "eric-claude-code", name: "eric's agent", ownerId: "eric" });
  });

  it("does not move ownership to the second caller", () => {
    registerAgent({ ...base, id: "eric-claude-code", name: "pwned", ownerId: "juan" });
    expect(getRegisteredAgent("eric-claude-code")?.ownerId).toBe("eric");
  });

  it("does not hand the second caller an API key", () => {
    const result = registerAgent({
      ...base,
      id: "eric-claude-code",
      name: "pwned",
      ownerId: "juan",
      issueApiKey: true,
    });
    expect(result.apiKey).toBeUndefined();
  });

  it("re-keys only when the caller has established the right to", () => {
    // The library default is safe; a route opts in after checking ownership.
    const denied = registerAgent({ ...base, id: "eric-claude-code", name: "x", issueApiKey: true });
    expect(denied.apiKey).toBeUndefined();

    const allowed = registerAgent({
      ...base,
      id: "eric-claude-code",
      name: "x",
      issueApiKey: true,
      allowRekeyExisting: true,
    });
    expect(allowed.apiKey).toBeTruthy();
  });

  it("still issues a key on genuine first registration", () => {
    const result = registerAgent({ ...base, id: "brand-new", name: "new", ownerId: "juan", issueApiKey: true });
    expect(result.apiKey).toBeTruthy();
    expect(getRegisteredAgent("brand-new")?.ownerId).toBe("juan");
  });

  it("adopts an owner for a pre-existing unowned agent", () => {
    // Backfill case: agents registered before ownership existed have owner_id NULL
    // and must still be claimable, otherwise legacy agents can never be adopted.
    db.prepare("INSERT INTO registered_agents (id,name,role,platform,protocol) VALUES ('legacy','legacy','agent','claude','rest')").run();
    registerAgent({ ...base, id: "legacy", name: "legacy", ownerId: "juan" });
    expect(getRegisteredAgent("legacy")?.ownerId).toBe("juan");
  });

  it("makes unowned registrations queryable for accountable-owner repair", () => {
    registerAgent({ ...base, id: "unowned", name: "unowned" });
    registerAgent({ ...base, id: "owned", name: "owned", ownerId: "juan" });

    expect(listUnownedAgents().map((agent) => agent.id)).toEqual(["unowned"]);
  });
});
