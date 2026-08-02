// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
let session: { userId: string; role: string } | null = { userId: "admin-1", role: "admin" };

vi.mock("@/lib/db", () => ({ getDb: () => db }));
vi.mock("@/lib/auth/session", () => ({ authenticateUser: async () => session }));

const { PATCH, DELETE } = await import("@/app/api/users/[userId]/route");

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, init));
}
function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}
function addUser(id: string, role: string | null, disabled = false) {
  db.prepare("INSERT INTO users (id, email, display_name, password_hash, disabled_at) VALUES (?,?,?,?,?)").run(
    id,
    `${id}@cordant.ai`,
    id,
    "x",
    disabled ? new Date().toISOString() : null
  );
  if (role) db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?,?)").run(id, role);
}

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  session = { userId: "admin-1", role: "admin" };
  addUser("admin-1", "admin");
});

describe("user removal — guards", () => {
  it("refuses self-removal, so an admin cannot lock themselves out", async () => {
    const res = await PATCH(
      req("http://x/api/users/admin-1", { method: "PATCH", body: JSON.stringify({ disabled: true }) }),
      ctx("admin-1")
    );
    expect(res.status).toBe(400);
    const row = db.prepare("SELECT disabled_at FROM users WHERE id='admin-1'").get() as { disabled_at: string | null };
    expect(row.disabled_at).toBeNull();
  });

  it("refuses to disable the last admin", async () => {
    addUser("admin-2", "admin");
    // admin-1 is the caller; disabling admin-2 is fine while admin-1 remains
    let res = await PATCH(
      req("http://x/api/users/admin-2", { method: "PATCH", body: JSON.stringify({ disabled: true }) }),
      ctx("admin-2")
    );
    expect(res.status).toBe(200);

    // now make admin-2 the caller and try to remove the only remaining admin
    db.prepare("UPDATE users SET disabled_at = NULL WHERE id='admin-2'").run();
    db.prepare("UPDATE users SET disabled_at = ? WHERE id='admin-1'").run(new Date().toISOString());
    session = { userId: "admin-2", role: "admin" };
    res = await PATCH(
      req("http://x/api/users/admin-2", { method: "PATCH", body: JSON.stringify({ disabled: true }) }),
      ctx("admin-2")
    );
    expect(res.status).toBe(400); // self-removal guard fires first
  });

  it("requires admin", async () => {
    addUser("victim", "reviewer");
    session = { userId: "someone", role: "reviewer" };
    const res = await PATCH(
      req("http://x/api/users/victim", { method: "PATCH", body: JSON.stringify({ disabled: true }) }),
      ctx("victim")
    );
    expect(res.status).toBe(403);
  });

  it("401s with no session", async () => {
    addUser("victim", "reviewer");
    session = null;
    const res = await DELETE(req("http://x/api/users/victim", { method: "DELETE" }), ctx("victim"));
    expect(res.status).toBe(401);
  });

  it("404s for an unknown user", async () => {
    const res = await DELETE(req("http://x/api/users/nope", { method: "DELETE" }), ctx("nope"));
    expect(res.status).toBe(404);
  });
});

describe("user removal — disable", () => {
  it("sets disabled_at and revokes every credential", async () => {
    addUser("eric", "reviewer");
    db.prepare("INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(
      "rt1",
      "eric",
      "h",
      "2099-01-01T00:00:00Z"
    );
    db.prepare("INSERT INTO user_api_keys (id, user_id, key_hash) VALUES (?,?,?)").run("k1", "eric", "kh");

    const res = await PATCH(
      req("http://x/api/users/eric", { method: "PATCH", body: JSON.stringify({ disabled: true }) }),
      ctx("eric")
    );
    expect(res.status).toBe(200);

    const u = db.prepare("SELECT disabled_at FROM users WHERE id='eric'").get() as { disabled_at: string | null };
    expect(u.disabled_at).not.toBeNull();

    const rt = db.prepare("SELECT COUNT(*) AS n FROM user_refresh_tokens WHERE user_id='eric'").get() as { n: number };
    expect(rt.n).toBe(0); // sessions cut immediately

    const ak = db.prepare("SELECT revoked_at FROM user_api_keys WHERE id='k1'").get() as { revoked_at: string | null };
    expect(ak.revoked_at).not.toBeNull();
  });

  it("re-enables", async () => {
    addUser("eric", "reviewer", true);
    const res = await PATCH(
      req("http://x/api/users/eric", { method: "PATCH", body: JSON.stringify({ disabled: false }) }),
      ctx("eric")
    );
    expect(res.status).toBe(200);
    const u = db.prepare("SELECT disabled_at FROM users WHERE id='eric'").get() as { disabled_at: string | null };
    expect(u.disabled_at).toBeNull();
  });

  it("rejects a non-boolean", async () => {
    addUser("eric", "reviewer");
    const res = await PATCH(
      req("http://x/api/users/eric", { method: "PATCH", body: JSON.stringify({ disabled: "yes" }) }),
      ctx("eric")
    );
    expect(res.status).toBe(400);
  });
});

describe("user removal — delete", () => {
  it("DELETE without ?hard=true only disables, preserving history", async () => {
    addUser("eric", "reviewer");
    const res = await DELETE(req("http://x/api/users/eric", { method: "DELETE" }), ctx("eric"));
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("disabled");

    const still = db.prepare("SELECT disabled_at FROM users WHERE id='eric'").get() as { disabled_at: string | null };
    expect(still).toBeDefined();
    expect(still.disabled_at).not.toBeNull();
  });

  it("?hard=true removes the row and cascades", async () => {
    addUser("eric", "reviewer");
    db.prepare("INSERT INTO user_api_keys (id, user_id, key_hash) VALUES (?,?,?)").run("k1", "eric", "kh");
    db.pragma("foreign_keys = ON");

    const res = await DELETE(req("http://x/api/users/eric?hard=true", { method: "DELETE" }), ctx("eric"));
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("deleted");

    const gone = db.prepare("SELECT COUNT(*) AS n FROM users WHERE id='eric'").get() as { n: number };
    expect(gone.n).toBe(0);
    const keys = db.prepare("SELECT COUNT(*) AS n FROM user_api_keys WHERE user_id='eric'").get() as { n: number };
    expect(keys.n).toBe(0); // cascade
  });
});
