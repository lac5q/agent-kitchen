/**
 * MSIQ-05 (VAL-ORCH-006..008): Federated retrieval source registry.
 *
 * Sources MUST be explicitly registered before they can be queried.
 * Unknown, disabled, expired, incomplete, or foreign sources are never
 * accessed. Each source declares type, handle, tenant/space/purpose,
 * labels, allowed operations, trust, and (optional) expiry.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
export type FederationSourceKind = "memory" | "knowledge" | "mcp";
export type FederationSourceTransport = "local" | "inproc" | "memory" | "mcp_stdio" | "mcp_http";
export type FederationSourceTrust = "registered" | "trusted" | "revoked" | "unknown";
export interface FederationSourceInput {
  tenantId: string;
  sourceHandle: string;
  sourceKind: FederationSourceKind;
  spaceId?: string | null;
  purpose: string;
  labelPolicyJson?: Record<string, unknown>;
  allowedOperations: string[];
  trustLevel?: FederationSourceTrust;
  enabled?: boolean;
  hasExpiry?: boolean;
  expiresAt?: string | null;
  transport: FederationSourceTransport;
  descriptor?: Record<string, unknown>;
  createdBy: string;
}
export interface FederationSourceRow {
  id: string;
  tenantId: string;
  sourceHandle: string;
  sourceKind: FederationSourceKind;
  spaceId: string | null;
  purpose: string;
  labelPolicyJson: Record<string, unknown>;
  allowedOperations: string[];
  trustLevel: FederationSourceTrust;
  enabled: boolean;
  hasExpiry: boolean;
  expiresAt: string | null;
  transport: FederationSourceTransport;
  descriptor: Record<string, unknown>;
  registrationHash: string;
  lastHealthAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type FederationSourceEligibility =
  | { kind: "eligible"; source: FederationSourceRow }
  | { kind: "omitted"; reason: string };
function hashSource(input: FederationSourceInput): string {
  const canonical = stableJson({
    tenantId: input.tenantId,
    sourceHandle: input.sourceHandle,
    sourceKind: input.sourceKind,
    spaceId: input.spaceId ?? null,
    purpose: input.purpose,
    labelPolicyJson: input.labelPolicyJson ?? {},
    allowedOperations: [...input.allowedOperations].sort(),
    trustLevel: input.trustLevel ?? "registered",
    transport: input.transport,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeStable(v)]),
    );
  }
  return value;
}
export function registerFederationSource(
  db: Database.Database,
  input: FederationSourceInput,
): { kind: "registered"; source: FederationSourceRow } | { kind: "denied"; reason: string } {
  if (!input.tenantId) return { kind: "denied", reason: "tenantId required" };
  if (!input.sourceHandle || input.sourceHandle.length === 0) {
    return { kind: "denied", reason: "sourceHandle required" };
  }
  if (!["memory", "knowledge", "mcp"].includes(input.sourceKind)) {
    return { kind: "denied", reason: "invalid sourceKind" };
  }
  if (!input.allowedOperations || input.allowedOperations.length === 0) {
    return { kind: "denied", reason: "allowedOperations must be non-empty" };
  }
  if (!input.purpose) return { kind: "denied", reason: "purpose required" };

  const registrationHash = hashSource(input);
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id FROM federation_sources WHERE tenant_id = ? AND source_handle = ? AND source_kind = ?")
    .get(input.tenantId, input.sourceHandle, input.sourceKind) as { id: string } | undefined;

  let newId = "";
  if (existing) {
    db.prepare(
      "UPDATE federation_sources SET space_id = ?, purpose = ?, label_policy_json = ?, allowed_operations_json = ?, trust_level = ?, enabled = ?, has_expiry = ?, expires_at = ?, transport = ?, descriptor_json = ?, registration_hash = ?, updated_at = ? WHERE id = ?"
    ).run(
      input.spaceId ?? null,
      input.purpose,
      JSON.stringify(input.labelPolicyJson ?? {}),
      JSON.stringify(input.allowedOperations),
      input.trustLevel ?? "registered",
      input.enabled === false ? 0 : 1,
      input.hasExpiry ? 1 : 0,
      input.expiresAt ?? null,
      input.transport,
      JSON.stringify(input.descriptor ?? {}),
      registrationHash,
      now,
      existing.id,
    );
  } else {
    newId = "fedsrc-" + crypto.randomUUID();
    db.prepare(
      "INSERT INTO federation_sources (id, tenant_id, source_handle, source_kind, space_id, purpose, label_policy_json, allowed_operations_json, trust_level, enabled, has_expiry, expires_at, transport, descriptor_json, registration_hash, last_health_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)"
    ).run(
      newId,
      input.tenantId,
      input.sourceHandle,
      input.sourceKind,
      input.spaceId ?? null,
      input.purpose,
      JSON.stringify(input.labelPolicyJson ?? {}),
      JSON.stringify(input.allowedOperations),
      input.trustLevel ?? "registered",
      input.enabled === false ? 0 : 1,
      input.hasExpiry ? 1 : 0,
      input.expiresAt ?? null,
      input.transport,
      JSON.stringify(input.descriptor ?? {}),
      registrationHash,
      input.createdBy,
      now,
      now,
    );
  }

  try {
    writeAuditEntry(
      {
        tenant_id: input.tenantId,
        actor_id: input.createdBy,
        actor_role: "operator",
        event_type: AUDIT_EVENT_TYPES.ORCH_FEDERATION_SOURCE_REGISTERED,
        entity_type: ENTITY_TYPES.FEDERATION_SOURCE,
        entity_id: "federation_source:" + input.sourceHandle,
        reason: "federation_source_registered",
        metadata_json: {
          source_handle: input.sourceHandle,
          source_kind: input.sourceKind,
          trust_level: input.trustLevel ?? "registered",
          enabled: input.enabled === false ? 0 : 1,
          registration_hash: registrationHash,
        },
      },
      db,
    );
  } catch {
    // ignore
  }

  return {
    kind: "registered",
    source: {
      id: existing?.id ?? newId,
      tenantId: input.tenantId,
      sourceHandle: input.sourceHandle,
      sourceKind: input.sourceKind,
      spaceId: input.spaceId ?? null,
      purpose: input.purpose,
      labelPolicyJson: input.labelPolicyJson ?? {},
      allowedOperations: [...input.allowedOperations],
      trustLevel: input.trustLevel ?? "registered",
      enabled: input.enabled === false ? false : true,
      hasExpiry: input.hasExpiry === true,
      expiresAt: input.expiresAt ?? null,
      transport: input.transport,
      descriptor: input.descriptor ?? {},
      registrationHash,
      lastHealthAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function getFederationSource(
  db: Database.Database,
  tenantId: string,
  sourceId: string,
): FederationSourceRow | null {
  const row = db
    .prepare("SELECT * FROM federation_sources WHERE tenant_id = ? AND id = ?")
    .get(tenantId, sourceId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseSourceRow(row);
}

export function listFederationSources(
  db: Database.Database,
  tenantId: string,
  filter?: { sourceKind?: FederationSourceKind; enabledOnly?: boolean },
): FederationSourceRow[] {
  const conditions: string[] = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (filter?.sourceKind) {
    conditions.push("source_kind = ?");
    params.push(filter.sourceKind);
  }
  if (filter?.enabledOnly) {
    conditions.push("enabled = 1");
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const rows = db
    .prepare("SELECT * FROM federation_sources " + where + " ORDER BY created_at ASC")
    .all(...params) as Record<string, unknown>[];
  return rows.map(parseSourceRow);
}

export function resolveEligibleSources(args: {
  sources: FederationSourceRow[];
  now?: Date;
  requiredOperation: string;
}): Array<FederationSourceEligibility> {
  const now = (args.now ?? new Date()).toISOString();
  const out: FederationSourceEligibility[] = [];
  for (const source of args.sources) {
    if (!source.enabled) {
      out.push({ kind: "omitted", reason: "source_disabled" });
      continue;
    }
    if (source.trustLevel === "revoked" || source.trustLevel === "unknown") {
      out.push({ kind: "omitted", reason: "source_trust_revoked_or_unknown" });
      continue;
    }
    if (source.hasExpiry && source.expiresAt && source.expiresAt < now) {
      out.push({ kind: "omitted", reason: "source_expired" });
      continue;
    }
    if (source.allowedOperations.indexOf(args.requiredOperation) === -1) {
      out.push({ kind: "omitted", reason: "operation_not_allowed" });
      continue;
    }
    out.push({ kind: "eligible", source });
  }
  return out;
}

function parseSourceRow(row: Record<string, unknown>): FederationSourceRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    sourceHandle: String(row.source_handle),
    sourceKind: row.source_kind as FederationSourceKind,
    spaceId: row.space_id == null ? null : String(row.space_id),
    purpose: String(row.purpose),
    labelPolicyJson: safeRecord(row.label_policy_json),
    allowedOperations: safeArray(row.allowed_operations_json),
    trustLevel: row.trust_level as FederationSourceTrust,
    enabled: Number(row.enabled) === 1,
    hasExpiry: Number(row.has_expiry) === 1,
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    transport: row.transport as FederationSourceTransport,
    descriptor: safeRecord(row.descriptor_json),
    registrationHash: String(row.registration_hash),
    lastHealthAt: row.last_health_at == null ? null : String(row.last_health_at),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function safeArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}
