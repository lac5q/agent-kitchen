// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initSchema } from "@/lib/db-schema";

let testDb: Database.Database;
let sessionRole: "admin" | "operator" | "reviewer" | null = "operator";

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () =>
    sessionRole
      ? {
          userId: "operator-123",
          role: sessionRole,
          email: "operator@example.com",
          displayName: "Operator",
          tenantId: "default-tenant",
        }
      : null,
}));

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://memroos.example/api/meeting/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testDb?.close();
  testDb = makeDb();
  sessionRole = "operator";
});

describe("POST /api/meeting/join", () => {
  it("requires an authenticated operator session", async () => {
    const { POST } = await import("../route");

    sessionRole = null;
    const unauthenticated = await POST(
      makeRequest({ roomUrl: "https://daily.example/room", token: "token", consentConfirmed: true }) as never
    );
    expect(unauthenticated.status).toBe(403);

    sessionRole = "reviewer";
    const reviewer = await POST(
      makeRequest({ roomUrl: "https://daily.example/room", token: "token", consentConfirmed: true }) as never
    );
    expect(reviewer.status).toBe(403);
  });

  it("rejects join requests without explicit recording consent", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        meetingLabel: "Strategy sync",
        roomUrl: "https://daily.example/secret-room",
        token: "daily-secret-token",
      }) as never
    );

    expect(res.status).toBe(403);
    const auditCount = testDb.prepare("SELECT COUNT(*) AS count FROM audit_entries").get() as { count: number };
    expect(auditCount.count).toBe(0);
  });

  it("requires room URL and token after consent", async () => {
    const { POST } = await import("../route");
    const missingRoom = await POST(
      makeRequest({
        roomUrl: "   ",
        token: "daily-secret-token",
        consentConfirmed: true,
      }) as never
    );
    const missingToken = await POST(
      makeRequest({
        roomUrl: "https://daily.example/secret-room",
        token: "",
        consentConfirmed: true,
      }) as never
    );

    expect(missingRoom.status).toBe(400);
    expect(missingToken.status).toBe(400);
  });

  it("returns an opaque meeting_id when consent is confirmed", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        meetingLabel: "Strategy sync",
        roomUrl: "https://daily.example/secret-room",
        token: "daily-secret-token",
        consentConfirmed: true,
      }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("joining");
    expect(body.meeting_id).not.toContain("://");
    expect(body.meeting_id).not.toContain("secret");
  });

  it("uses a safe default meeting label when the request label is blank", async () => {
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest({
        meetingLabel: "   ",
        roomUrl: "https://daily.example/secret-room",
        token: "daily-secret-token",
        consentConfirmed: true,
      }) as never
    );
    expect(res.status).toBe(200);

    const row = testDb.prepare("SELECT metadata_json FROM audit_entries").get() as { metadata_json: string };
    expect(JSON.parse(row.metadata_json).meeting_label).toBe("Untitled meeting");
  });

  it("audits meeting_id only, never room URL or token", async () => {
    const { POST } = await import("../route");
    const roomUrl = "https://daily.example/secret-room";
    const token = "daily-secret-token";

    const res = await POST(
      makeRequest({
        meetingLabel: "Strategy sync",
        roomUrl,
        token,
        consentConfirmed: true,
      }) as never
    );
    const body = await res.json();

    const row = testDb
      .prepare("SELECT event_type, entity_type, entity_id, metadata_json FROM audit_entries")
      .get() as {
      event_type: string;
      entity_type: string;
      entity_id: string;
      metadata_json: string;
    };

    expect(row.event_type).toBe("meeting.joined");
    expect(row.entity_type).toBe("meeting");
    expect(row.entity_id).toBe(`meeting:${body.meeting_id}`);
    expect(row.metadata_json).toContain(body.meeting_id);
    expect(row.metadata_json).not.toContain(roomUrl);
    expect(row.metadata_json).not.toContain(token);
  });
});
