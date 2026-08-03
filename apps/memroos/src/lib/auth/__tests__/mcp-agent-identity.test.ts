// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

const { ensureMcpAgent, issueTokens, resolveAccessToken, registerClient } = await import(
  "@/lib/auth/mcp-oauth-store"
);
const { listAgentsVisibleTo, listAllAgentsUnscoped } = await import("@/lib/agent-registry");

function addUser(id: string) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)").run(
    id, `${id}@cordant.ai`, id, "x"
  );
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, "reviewer");
}

let clientId: string;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  addUser("eric");
  addUser("juan");
  // mcp_oauth_tokens has an FK to mcp_oauth_clients, so a token test needs a
  // client that actually exists.
  clientId = registerClient({
    clientName: "Test MCP client",
    redirectUris: ["https://claude.ai/cb"],
  }).clientId;
});

/**
 * The gap this closes: an OAuth token named a human, but MemroOS records memory
 * as an agent. A connector that only resolved to a user had nothing to write
 * with — Cowork could read everything and write nothing, and the connected
 * client never appeared on /agents because nothing had registered it.
 */
describe("an MCP connection registers an agent", () => {
  it("creates an agent owned by the human who authorised it", () => {
    const agentId = ensureMcpAgent("eric", "client-1");
    const row = db.prepare("SELECT owner_id, name FROM registered_agents WHERE id=?").get(agentId) as
      | { owner_id: string; name: string }
      | undefined;
    expect(row?.owner_id).toBe("eric");
  });

  it("is visible to its owner under scoped visibility", () => {
    const agentId = ensureMcpAgent("eric", "client-1");
    const seen = listAgentsVisibleTo({ userId: "eric", role: "reviewer" }).map((a) => a.id);
    expect(seen).toContain(agentId);
  });

  it("is not visible to anyone else", () => {
    ensureMcpAgent("eric", "client-1");
    expect(listAgentsVisibleTo({ userId: "juan", role: "reviewer" })).toEqual([]);
  });

  /** Reconnecting must not litter the registry with a new agent each time. */
  it("reuses the same agent across reconnects", () => {
    const first = ensureMcpAgent("eric", "client-1");
    const second = ensureMcpAgent("eric", "client-1");
    expect(second).toBe(first);
    expect(listAllAgentsUnscoped()).toHaveLength(1);
  });

  it("gives two people their own agent for the same client", () => {
    expect(ensureMcpAgent("eric", "client-1")).not.toBe(ensureMcpAgent("juan", "client-1"));
    expect(listAllAgentsUnscoped()).toHaveLength(2);
  });

  it("revives an agent the owner had deregistered, without changing owner", () => {
    const agentId = ensureMcpAgent("eric", "client-1");
    db.prepare("UPDATE registered_agents SET deregistered_at=? WHERE id=?").run(
      new Date().toISOString(), agentId
    );
    ensureMcpAgent("eric", "client-1");
    const row = db.prepare("SELECT deregistered_at, owner_id FROM registered_agents WHERE id=?").get(agentId) as
      | { deregistered_at: string | null; owner_id: string }
      | undefined;
    expect(row?.deregistered_at).toBeNull();
    expect(row?.owner_id).toBe("eric");
  });

  it("names a Cowork client as the cowork platform", () => {
    const cowork = registerClient({
      clientName: "Claude Cowork",
      redirectUris: ["https://claude.ai/cb"],
    });
    const agentId = ensureMcpAgent("eric", cowork.clientId);
    const row = db.prepare("SELECT platform FROM registered_agents WHERE id=?").get(agentId) as
      | { platform: string }
      | undefined;
    expect(row?.platform).toBe("cowork");
  });
});

describe("token resolution carries the agent", () => {
  it("issuing a token registers the agent immediately", () => {
    issueTokens({ clientId, userId: "eric", scope: "mcp:read mcp:write" });
    expect(listAllAgentsUnscoped()).toHaveLength(1);
  });

  it("resolving a token yields the agent to act as", () => {
    const { accessToken } = issueTokens({ clientId, userId: "eric", scope: "mcp:read mcp:write" });
    const resolved = resolveAccessToken(accessToken);
    expect(resolved?.userId).toBe("eric");
    expect(resolved?.agentId).toBeTruthy();
    expect(
      db.prepare("SELECT owner_id FROM registered_agents WHERE id=?").get(resolved!.agentId)
    ).toMatchObject({ owner_id: "eric" });
  });
});
