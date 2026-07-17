// @vitest-environment node
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { writeVaultArtifact } from "@/lib/vault/writer";

let testDb: Database.Database;
let vaultRoot: string;
let sessionRole: "admin" | "operator" | null = "admin";

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () =>
    sessionRole
      ? {
          userId: "user-admin",
          role: sessionRole,
          email: "admin@example.com",
          displayName: "Admin",
          tenantId: "default-tenant",
        }
      : null,
}));

beforeEach(() => {
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-vault-replay-"));
  vi.stubEnv("MEMROOS_VAULT_ROOT", vaultRoot);
  testDb = new Database(":memory:");
  initSchema(testDb);
  sessionRole = "admin";
});

afterEach(() => {
  testDb.close();
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("/api/admin/vault/[artifactId]/replay", () => {
  it("replays a vault artifact with hash verification", async () => {
    const artifact = writeVaultArtifact(testDb, {
      tenantId: "default-tenant",
      sourceType: "messages",
      sourceId: "session-1",
      sessionId: "session-1",
      project: "memroos",
      body: "line one\nline two\n",
    });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/admin/vault/a/replay") as never, {
      params: Promise.resolve({ artifactId: artifact.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.artifact.id).toBe(artifact.id);
    expect(body.hashVerified).toBe(true);
    expect(body.body).toBe("line one\nline two\n");
  });

  it("rejects non-admin replay", async () => {
    const { GET } = await import("../route");
    sessionRole = "operator";

    const res = await GET(new Request("http://localhost/api/admin/vault/a/replay") as never, {
      params: Promise.resolve({ artifactId: "artifact-id" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 when the session is missing", async () => {
    const { GET } = await import("../route");
    sessionRole = null;

    const res = await GET(new Request("http://localhost/api/admin/vault/a/replay") as never, {
      params: Promise.resolve({ artifactId: "artifact-id" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown artifacts", async () => {
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/admin/vault/a/replay") as never, {
      params: Promise.resolve({ artifactId: "missing-artifact" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the stored artifact hash no longer matches", async () => {
    const artifact = writeVaultArtifact(testDb, {
      tenantId: "default-tenant",
      sourceType: "messages",
      sourceId: "session-tamper",
      sessionId: "session-tamper",
      project: "memroos",
      body: "original vault body",
    });

    testDb
      .prepare("UPDATE raw_artifacts SET content_hash = ? WHERE id = ?")
      .run("0".repeat(64), artifact.id);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/admin/vault/a/replay") as never, {
      params: Promise.resolve({ artifactId: artifact.id }),
    });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/hash mismatch/i);
  });
});
