import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

const testDb = new Database(":memory:");
initSchema(testDb);

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: () => true,
  registryWriteUnauthorizedResponse: () =>
    Response.json({ ok: false, error: "unauthorized" }, { status: 403 }),
}));

describe("wiki + observe API routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET /api/wiki returns missing-vault status without throwing", async () => {
    vi.stubEnv("KNOWLEDGE_BASE_PATH", "/tmp/definitely-missing-wiki-root-xyz");
    const { GET } = await import("@/app/api/wiki/route");
    const res = await GET(new Request("http://localhost/api/wiki?view=tree"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.tree).toEqual([]);
  });

  it("GET /api/observe/health returns harness catalog including Pi", async () => {
    const { GET } = await import("@/app/api/observe/health/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.harnesses.some((h: { harness: string }) => h.harness === "pi")).toBe(true);
  });

  it("GET /api/wiki/digest returns cron job status when authorized", async () => {
    const { GET } = await import("@/app/api/wiki/digest/route");
    const res = await GET(new Request("http://localhost/api/wiki/digest"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.job?.id).toBe("wiki-digest");
  });
});
