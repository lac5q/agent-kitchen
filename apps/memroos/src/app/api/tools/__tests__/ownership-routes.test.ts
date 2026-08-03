// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

let db: Database.Database;
let session: { userId: string; role: "admin" | "operator" | "reviewer" } | null;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  db.exec(`
    INSERT INTO users (id, email, display_name, password_hash)
    VALUES
      ('owner', 'owner@example.com', 'Owner', 'hash'),
      ('viewer', 'viewer@example.com', 'Viewer', 'hash');
    INSERT INTO user_roles (user_id, role) VALUES
      ('owner', 'operator'), ('viewer', 'reviewer');
    INSERT INTO tool_connections
      (id, provider_key, auth_mode, owner_id, is_shared, needs_owner, created_at)
    VALUES
      ('private-connection', 'stripe', 'api-key', 'owner', 0, 0, '2026-08-01T00:00:00.000Z'),
      ('shared-connection', 'stripe', 'api-key', 'owner', 1, 0, '2026-08-01T00:00:00.000Z');
  `);
  session = { userId: "viewer", role: "reviewer" };
  vi.doMock("@/lib/db", () => ({ getDb: () => db }));
  vi.doMock("@/lib/auth/session", () => ({ authenticateUser: async () => session }));
});

afterEach(() => {
  db.close();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/auth/session");
  vi.resetModules();
});

describe("tool connection route ownership gates", () => {
  it("returns 403 for visible shared and 404 for invisible private", async () => {
    const { POST } = await import("../disconnect/route");

    const shared = await POST(
      new Request("http://localhost/api/tools/disconnect", {
        method: "POST",
        body: JSON.stringify({ connectionId: "shared-connection" }),
        headers: { "content-type": "application/json" },
      }) as never,
    );
    expect(shared.status).toBe(403);

    const privateConnection = await POST(
      new Request("http://localhost/api/tools/disconnect", {
        method: "POST",
        body: JSON.stringify({ connectionId: "private-connection" }),
        headers: { "content-type": "application/json" },
      }) as never,
    );
    expect(privateConnection.status).toBe(404);
  });

  it("lets the owner toggle sharing and leaves the row targeted", async () => {
    session = { userId: "owner", role: "operator" };
    const { POST } = await import("../connections/share/route");
    const response = await POST(
      new Request("http://localhost/api/tools/connections/share", {
        method: "POST",
        body: JSON.stringify({ connectionId: "private-connection", shared: true }),
        headers: { "content-type": "application/json" },
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(
      db.prepare("SELECT is_shared FROM tool_connections WHERE id = 'private-connection'").get(),
    ).toEqual({ is_shared: 1 });
    expect(
      db.prepare("SELECT is_shared FROM tool_connections WHERE id = 'shared-connection'").get(),
    ).toEqual({ is_shared: 1 });
  });
});
