// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
let session: { userId: string; role: string } | null = null;

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/auth/session", () => ({ authenticateUser: async () => session }));
// No operator key and a non-loopback host, so the session is the only gate.
vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: () => false,
  authorizeRegistryWriteStrict: () => false,
  registryWriteUnauthorizedResponse: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));

const { POST } = await import("@/app/api/agents/register/route");
const { PATCH, DELETE } = await import("@/app/api/agents/[id]/route");
const { PATCH: PATCHOwnership } = await import("@/app/api/agents/[id]/ownership/route");

function addUser(id: string, role: string) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)").run(
    id, `${id}@cordant.ai`, id, "x"
  );
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, role);
}
function addAgent(id: string, ownerId: string | null, deregistered = false) {
  db.prepare(
    `INSERT INTO registered_agents (id,name,role,platform,protocol,owner_id,deregistered_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, id, "agent", "claude", "rest", ownerId, deregistered ? new Date().toISOString() : null);
}
function registerBody(id: string, name = id) {
  return { id, name, role: "agent", platform: "claude", protocol: "rest", issueApiKey: true };
}
const post = (body: unknown) =>
  POST(new Request("https://memroos.example/api/agents/register", {
    method: "POST", body: JSON.stringify(body),
  }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ownershipPatch = (id: string, body: unknown) =>
  PATCHOwnership(
    new Request(`https://memroos.example/api/agents/${id}/ownership`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id)
  );
const ownerOf = (id: string) =>
  (db.prepare("SELECT owner_id FROM registered_agents WHERE id=?").get(id) as { owner_id: string | null }).owner_id;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  addUser("eric", "admin");
  addUser("juan", "reviewer");
  addUser("luis", "admin");
  session = null;
});

describe("POST /api/agents/register — the takeover gate", () => {
  it("404s when a signed-in user names an agent they do not own", async () => {
    addAgent("eric-agent", "eric");
    session = { userId: "juan", role: "reviewer" };

    const res = await post(registerBody("eric-agent", "pwned"));

    expect(res.status).toBe(404);
    expect(ownerOf("eric-agent")).toBe("eric");
    expect(await res.json()).not.toHaveProperty("apiKey");
  });

  it("lets the owner re-register their own agent", async () => {
    addAgent("juan-agent", "juan");
    session = { userId: "juan", role: "reviewer" };
    const res = await post(registerBody("juan-agent", "renamed"));
    expect(res.status).toBe(200);
    expect(ownerOf("juan-agent")).toBe("juan");
    // Re-registering is how an owner rotates a key on reinstall.
    expect((await res.json()).apiKey).toBeTruthy();
  });

  it("rejects re-registering a revoked agent without changing its revocation", async () => {
    addAgent("retired", "juan", true);
    session = { userId: "juan", role: "reviewer" };
    const res = await post(registerBody("retired"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "agent_revoked", code: "agent_revoked" });
    expect(
      (db.prepare("SELECT deregistered_at FROM registered_agents WHERE id='retired'").get() as { deregistered_at: string }).deregistered_at
    ).toBeTruthy();
    expect(db.prepare("SELECT COUNT(*) AS count FROM agent_api_keys WHERE agent_id='retired'").get()).toEqual({ count: 0 });
  });

  it("does not let a non-admin adopt an unowned agent", async () => {
    // Unowned rows are admin-only; letting anyone claim one by re-registering
    // would be the takeover again, just via a machine-created row.
    addAgent("orphan", null);
    session = { userId: "juan", role: "reviewer" };
    expect((await post(registerBody("orphan"))).status).toBe(404);
    expect(ownerOf("orphan")).toBeNull();
  });

  it("an admin may adopt an unowned agent", async () => {
    addAgent("orphan", null);
    session = { userId: "luis", role: "admin" };
    expect((await post(registerBody("orphan"))).status).toBe(200);
    expect(ownerOf("orphan")).toBe("luis");
  });

  it("a brand-new id registers to the caller, with a key", async () => {
    session = { userId: "juan", role: "reviewer" };
    const res = await post(registerBody("juan-new"));
    expect(res.status).toBe(200);
    expect((await res.json()).apiKey).toBeTruthy();
    expect(ownerOf("juan-new")).toBe("juan");
  });

  it("401s with no session and no operator key", async () => {
    expect((await post(registerBody("anything"))).status).toBe(401);
  });

  it("does not mint a key when issueApiKey is omitted", async () => {
    session = { userId: "juan", role: "reviewer" };
    const res = await post({ id: "no-default-key", name: "No Default Key", role: "agent", platform: "claude", protocol: "rest" });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("apiKey");
  });
});

describe("PATCH / DELETE /api/agents/[id] — the management gate", () => {
  beforeEach(() => addAgent("eric-agent", "eric"));

  it("404s when a non-owner renames", async () => {
    session = { userId: "juan", role: "reviewer" };
    const res = await PATCH(
      new Request("https://memroos.example/api/agents/eric-agent", {
        method: "PATCH", body: JSON.stringify({ name: "pwned" }),
      }),
      ctx("eric-agent")
    );
    expect(res.status).toBe(404);
    const row = db.prepare("SELECT name FROM registered_agents WHERE id='eric-agent'").get() as { name: string };
    expect(row.name).toBe("eric-agent");
  });

  it("404s when a non-owner deregisters", async () => {
    session = { userId: "juan", role: "reviewer" };
    const res = await DELETE(
      new Request("https://memroos.example/api/agents/eric-agent", { method: "DELETE" }),
      ctx("eric-agent")
    );
    expect(res.status).toBe(404);
    const row = db.prepare("SELECT deregistered_at FROM registered_agents WHERE id='eric-agent'").get() as {
      deregistered_at: string | null;
    };
    expect(row.deregistered_at).toBeNull();
  });

  it("a shared agent is still not managed by a non-owner", async () => {
    db.prepare("UPDATE registered_agents SET is_shared=1 WHERE id='eric-agent'").run();
    session = { userId: "juan", role: "reviewer" };
    const res = await DELETE(
      new Request("https://memroos.example/api/agents/eric-agent", { method: "DELETE" }),
      ctx("eric-agent")
    );
    expect(res.status).toBe(404);
  });

  it("the owner may rename their own", async () => {
    session = { userId: "eric", role: "admin" };
    const res = await PATCH(
      new Request("https://memroos.example/api/agents/eric-agent", {
        method: "PATCH", body: JSON.stringify({ name: "renamed" }),
      }),
      ctx("eric-agent")
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/agents/[id]/ownership — the claim gate", () => {
  it("lets an admin claim an unowned agent for themselves", async () => {
    addAgent("orphan", null);
    session = { userId: "luis", role: "admin" };

    const res = await ownershipPatch("orphan", { transferToUserId: "luis" });

    expect(res.status).toBe(200);
    expect(ownerOf("orphan")).toBe("luis");
  });

  it("does not let a non-admin claim an unowned agent", async () => {
    addAgent("orphan", null);
    session = { userId: "juan", role: "reviewer" };

    const res = await ownershipPatch("orphan", { transferToUserId: "juan" });

    expect(res.status).toBe(404);
    expect(ownerOf("orphan")).toBeNull();
  });

  it("does not let a non-admin claim a shared unowned agent", async () => {
    addAgent("shared-orphan", null);
    db.prepare("UPDATE registered_agents SET is_shared=1 WHERE id='shared-orphan'").run();
    session = { userId: "juan", role: "reviewer" };

    const res = await ownershipPatch("shared-orphan", { transferToUserId: "juan" });

    expect(res.status).toBe(403);
    expect(ownerOf("shared-orphan")).toBeNull();
  });
});
