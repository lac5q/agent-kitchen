// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_ROOT = path.join(os.tmpdir(), `ontology-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_ROOT, "ontology.db");
const SOURCE_HASH = `sha256:${"a".repeat(64)}`;

let ontologyRoute: typeof import("../route");
let closeDb: (() => void) | undefined;

function operatorRequest(url: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, init);
}

async function ensureCanonical() {
  const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
    method: "POST",
    body: JSON.stringify({ action: "ensure_canonical", actor: "operator" }),
  }));
  expect(response.status).toBe(200);
  return await response.json() as {
    ok: boolean;
    ontology: { ontologyId: string; version: string; contentHash: string };
  };
}

beforeEach(async () => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TEST_ROOT;
  process.env["SQLITE_DB_PATH"] = TEST_DB_PATH;
  vi.resetModules();
  ontologyRoute = await import("../route");
  closeDb = (await import("@/lib/db")).closeDb;
});

afterEach(() => {
  closeDb?.();
  closeDb = undefined;
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("ontology registry route", () => {
  it("ensures the canonical ontology and exposes its published discovery contract", async () => {
    const canonical = await ensureCanonical();
    expect(canonical.ok).toBe(true);

    const response = ontologyRoute.GET(operatorRequest("/api/ontology"));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      ok: boolean;
      ontology: {
        status: string;
        ontologyId: string;
        version: string;
        contentHash: string;
        definitions: Array<{ id: string }>;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.ontology).toMatchObject({
      status: "published",
      ontologyId: canonical.ontology.ontologyId,
      version: canonical.ontology.version,
      contentHash: canonical.ontology.contentHash,
    });
    expect(body.ontology.definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "entity" }),
      expect.objectContaining({ id: "agent" }),
      expect.objectContaining({ id: "memory" }),
      expect.objectContaining({ id: "provenance" }),
      expect.objectContaining({ id: "policy" }),
    ]));
  });

  it("returns 404 for an explicit unknown ontology version rather than falling back", async () => {
    await ensureCanonical();

    const response = ontologyRoute.GET(operatorRequest("/api/ontology?version=9.9.9"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining("Unknown ontology version"),
    });
  });

  it("persists explicit ontology coordinates when binding provenance", async () => {
    const canonical = await ensureCanonical();
    const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "bind_provenance",
        recordType: "memory",
        recordId: "route-memory-1",
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
        actor: "operator",
      }),
    }));
    expect(response.status).toBe(200);
    const bound = await response.json() as {
      ok: boolean;
      binding: { ontologyId: string; ontologyVersion: string; ontologyContentHash: string };
    };
    expect(bound).toMatchObject({
      ok: true,
      binding: {
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
      },
    });

    const persistedResponse = ontologyRoute.GET(operatorRequest("/api/ontology?recordType=memory&recordId=route-memory-1"));
    expect(persistedResponse.status).toBe(200);
    expect(await persistedResponse.json()).toMatchObject({
      ok: true,
      binding: {
        ontologyId: canonical.ontology.ontologyId,
        ontologyVersion: canonical.ontology.version,
        ontologyContentHash: canonical.ontology.contentHash,
      },
    });
  });

  it("does not expose raw domain pack source input in its response", async () => {
    const canonical = await ensureCanonical();
    const sentinel = "RAW-PACK-SOURCE-MUST-NOT-RETURN";
    const response = await ontologyRoute.POST(operatorRequest("/api/ontology", {
      method: "POST",
      body: JSON.stringify({
        action: "register_pack",
        namespace: "finance.ops",
        owner: "finance",
        version: "1.0.0",
        sourceHash: SOURCE_HASH,
        source: sentinel,
        provenanceSummary: { origin: "git", revision: "abc123" },
        ontology: {
          id: canonical.ontology.ontologyId,
          version: canonical.ontology.version,
          contentHash: canonical.ontology.contentHash,
        },
        types: [{ id: "finance.ops.invoice", semantics: { kind: "entity" } }],
        actor: "operator",
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      ok: boolean;
      pack: { ontology: { id: string; version: string; contentHash: string } };
    };
    expect(body).toMatchObject({
      ok: true,
      pack: {
        ontology: {
          id: canonical.ontology.ontologyId,
          version: canonical.ontology.version,
          contentHash: canonical.ontology.contentHash,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(sentinel);
  });
});
