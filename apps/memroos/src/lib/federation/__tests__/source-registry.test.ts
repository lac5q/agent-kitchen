// @vitest-environment node
/**
 * VAL-ORCH-006: explicit registration, eligibility resolution.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { registerFederationSource, listFederationSources, resolveEligibleSources } from "../source-registry";

let db: import("better-sqlite3").Database;
let closeDb: () => void;
let TEST_DB_DIR: string;

beforeEach(async () => {
  TEST_DB_DIR = path.join(os.tmpdir(), "federation-registry-" + crypto.randomUUID());
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  process.env.SQLITE_DB_PATH = path.join(TEST_DB_DIR, "fed.db");
  vi.resetModules();
  const { getDb, closeDb: close } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  db = getDb();
  initSchema(db);
  closeDb = close;
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_DIR)) fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function okInput(overrides: Partial<Parameters<typeof registerFederationSource>[1]> = {}) {
  return {
    tenantId: "default-tenant",
    sourceHandle: "memory-alpha",
    sourceKind: "memory" as const,
    spaceId: "space-1",
    purpose: "memory_search",
    allowedOperations: ["search", "read"],
    trustLevel: "registered" as const,
    transport: "inproc" as const,
    createdBy: "operator-1",
    ...overrides,
  };
}

describe("VAL-ORCH-006 -- explicit registration", () => {
  it("registers a new source and writes an audit entry", () => {
    const r = registerFederationSource(db, okInput());
    expect(r.kind).toBe("registered");
    if (r.kind !== "registered") return;
    expect(r.source.tenantId).toBe("default-tenant");
    expect(r.source.registrationHash.startsWith("sha256:")).toBe(true);
    const rows = db.prepare("SELECT event_type FROM audit_entries WHERE event_type = ?").all("orch.federation.source.registered") as Array<{ event_type: string }>;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("denies registration when required fields are missing", () => {
    const r = registerFederationSource(db, okInput({ sourceHandle: "" }));
    expect(r.kind).toBe("denied");
    const r2 = registerFederationSource(db, okInput({ allowedOperations: [] }));
    expect(r2.kind).toBe("denied");
    const r3 = registerFederationSource(db, okInput({ sourceKind: "invalid" as "memory" }));
    expect(r3.kind).toBe("denied");
  });

  it("upserts on conflict (tenant, handle, kind)", () => {
    const a = registerFederationSource(db, okInput());
    const b = registerFederationSource(db, okInput({ purpose: "memory-promotion" }));
    if (a.kind !== "registered" || b.kind !== "registered") throw new Error("not registered");
    expect(a.source.id).toBe(b.source.id);
    expect(b.source.purpose).toBe("memory-promotion");
    const list = listFederationSources(db, "default-tenant");
    expect(list.length).toBe(1);
  });

  it("filters un-registered (disabled) sources out of eligibility", () => {
    registerFederationSource(db, okInput({ enabled: false }));
    const list = listFederationSources(db, "default-tenant", { enabledOnly: true });
    expect(list.length).toBe(0);
    const eligible = resolveEligibleSources({ sources: listFederationSources(db, "default-tenant"), requiredOperation: "search" });
    const omitted = eligible.find((e) => e.kind === "omitted");
    expect(omitted).toBeDefined();
    if (omitted && omitted.kind === "omitted") expect(omitted.reason).toBe("source_disabled");
  });

  it("filters revoked trust and unknown trust sources out", () => {
    registerFederationSource(db, okInput({ sourceHandle: "revoked", trustLevel: "revoked" }));
    registerFederationSource(db, okInput({ sourceHandle: "unknown", trustLevel: "unknown" }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible.every((e) => e.kind === "omitted" && (e.reason === "source_trust_revoked_or_unknown"))).toBe(true);
  });

  it("filters expired sources", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    registerFederationSource(db, okInput({ sourceHandle: "expired", hasExpiry: true, expiresAt: past }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible.length).toBe(1);
    expect(eligible[0].kind).toBe("omitted");
    if (eligible[0].kind === "omitted") expect(eligible[0].reason).toBe("source_expired");
  });

  it("filters sources whose allowedOperations do not include the operation", () => {
    registerFederationSource(db, okInput({ allowedOperations: ["write"] }));
    const list = listFederationSources(db, "default-tenant");
    const eligible = resolveEligibleSources({ sources: list, requiredOperation: "search" });
    expect(eligible[0].kind).toBe("omitted");
    if (eligible[0].kind === "omitted") expect(eligible[0].reason).toBe("operation_not_allowed");
  });
});
