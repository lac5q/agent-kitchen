// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb } from "@/lib/db";
import { POST as expiryPost } from "../expiry/route";
import { POST as holdsPost } from "../legal-holds/route";
import { POST as retentionPost } from "../retention/route";

const TMP_ROOT = path.join(os.tmpdir(), `memory-lifecycle-route-${crypto.randomUUID()}`);

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3110/api/memory-lifecycle/retention", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  closeDb();
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `${crypto.randomUUID()}.db`);
});

afterEach(() => {
  closeDb();
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory lifecycle API routes", () => {
  it("supports policy registration, legal hold skip, release, and later expiry", async () => {
    const policyResponse = await retentionPost(
      jsonRequest({
        action: "create_policy",
        id: "policy-route",
        name: "route policy",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "alpha" },
        durationDays: 0,
        actorId: "operator",
      })
    );
    expect(policyResponse.status).toBe(200);

    const registerResponse = await retentionPost(
      jsonRequest({
        action: "register_record",
        recordType: "message",
        recordId: "api-msg-1",
        ontologyType: "memory.note",
        securityLabel: { visibility: "internal" },
        purpose: "recall",
        scope: { tenantId: "default-tenant", project: "alpha" },
        actorId: "operator",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    expect(registerResponse.status).toBe(200);

    const holdResponse = await holdsPost(
      jsonRequest({
        action: "create",
        id: "hold-route",
        scope: { tenantId: "default-tenant", recordId: "api-msg-1" },
        reasonCode: "litigation",
        actorId: "operator",
      })
    );
    expect(holdResponse.status).toBe(200);

    const heldRun = await expiryPost(
      jsonRequest({
        runKey: "route-run-held",
        actorId: "system",
        scope: { tenantId: "default-tenant", project: "alpha" },
        now: "2026-01-02T00:00:00.000Z",
      })
    );
    const heldJson = (await heldRun.json()) as { summary: { held: number; expired: number } };
    expect(heldJson.summary.held).toBe(1);
    expect(heldJson.summary.expired).toBe(0);

    const releaseResponse = await holdsPost(
      jsonRequest({
        action: "release",
        holdId: "hold-route",
        actorId: "operator",
        now: "2026-01-02T01:00:00.000Z",
      })
    );
    expect(releaseResponse.status).toBe(200);

    const expiredRun = await expiryPost(
      jsonRequest({
        runKey: "route-run-expired",
        actorId: "system",
        scope: { tenantId: "default-tenant", project: "alpha" },
        now: "2026-01-02T02:00:00.000Z",
      })
    );
    const expiredJson = (await expiredRun.json()) as { summary: { held: number; expired: number } };
    expect(expiredJson.summary.held).toBe(0);
    expect(expiredJson.summary.expired).toBe(1);
  });
});
