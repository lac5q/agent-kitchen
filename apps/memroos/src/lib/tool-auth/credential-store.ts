// apps/memroos/src/lib/tool-auth/credential-store.ts
// Vault-backed credential store for the tool-auth plane (Phase 179 / v8.23).
//
// Two record shapes live in the vault under the source_type="tool_connection":
//
//   1. OAuth record (after the Nango callback completes):
//        {
//          providerKey: "slack",
//          authMode: "oauth",
//          nangoConnectionId: "12345",
//          accountEmail: "ops@example.com",
//          scopes: ["channels:read", ...],
//          connectedAt: "2026-07-23T..."
//        }
//
//   2. API-key record:
//        {
//          providerKey: "stripe",
//          authMode: "api-key",
//          connectionId: "<uuid>",
//          ciphertext: "<envelope>",  // AES-256-GCM via the vault
//          connectedAt: "..."
//        }
//
// OAuth records don't hold a refresh token — Nango owns that. memroos stores
// only the connection-id reference + the metadata needed to render the
// Connected card on /settings/tools.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getDb } from "@/lib/db";
import { writeVaultArtifact, readVaultArtifact } from "@/lib/vault/writer";
import type {
  ConnectionActivityEvent,
  ToolConnection,
} from "./types";

const SOURCE_TYPE = "tool_connection";

interface OAuthRecord {
  providerKey: string;
  authMode: "oauth";
  nangoConnectionId: string;
  accountEmail: string | null;
  scopes: string[] | null;
  connectedAt: string;
}

interface ApiKeyRecord {
  providerKey: string;
  authMode: "api-key";
  connectionId: string;
  /** The plaintext API key — encrypted via the vault before persistence. */
  apiKey: string;
  connectedAt: string;
}

type ToolAuthRecord = OAuthRecord | ApiKeyRecord;

function newConnectionId(): string {
  return crypto.randomUUID();
}

/**
 * Persist an OAuth connection (Nango-managed). No secret material lives in
 * memroos; we only store the Nango connection-id and the metadata needed to
 * render the connection card.
 */
export async function storeOAuthConnection(input: {
  providerKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
  scopes: string[] | null;
  ownerId?: string | null;
}): Promise<ToolConnection> {
  const db = getDb();
  const connectionId = newConnectionId();
  const record: OAuthRecord = {
    providerKey: input.providerKey,
    authMode: "oauth",
    nangoConnectionId: input.nangoConnectionId,
    accountEmail: input.accountEmail,
    scopes: input.scopes,
    connectedAt: new Date().toISOString(),
  };
  const result = writeVaultArtifact(db, {
    body: JSON.stringify(record),
    sourceType: SOURCE_TYPE,
    sourceId: input.providerKey,
    label: {
      visibility: "private",
      domain: "engineering", // tool-auth integrations are engineering-plane artefacts
      sensitivity: null, // OAuth records hold no secrets (Nango owns them)
      policy: "sealed",
    },
  });
  db.prepare(
    `INSERT INTO tool_connections
       (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
        nango_connection_id, vault_artifact_id, account_email, created_at)
     VALUES (?, ?, 'oauth', ?, 0, 0, ?, ?, ?, ?)`,
  ).run(
    connectionId,
    input.providerKey,
    input.ownerId ?? null,
    input.nangoConnectionId,
    result.id,
    record.accountEmail,
    record.connectedAt,
  );
  return {
    providerKey: input.providerKey,
    connectionId,
    nangoConnectionId: input.nangoConnectionId,
    vaultArtifactId: result.id,
    status: "connected",
    accountEmail: record.accountEmail,
    scopes: record.scopes,
    lastUsedAt: null,
    createdAt: record.connectedAt,
    expiresAt: null,
    errorMessage: null,
    authMode: "oauth",
  };
}

/**
 * Persist an API-key connection. The key is sealed inside the vault envelope.
 */
export async function storeApiKeyConnection(input: {
  providerKey: string;
  apiKey: string;
  ownerId?: string | null;
}): Promise<ToolConnection> {
  const db = getDb();
  const record: ApiKeyRecord = {
    providerKey: input.providerKey,
    authMode: "api-key",
    connectionId: newConnectionId(),
    apiKey: input.apiKey,
    connectedAt: new Date().toISOString(),
  };
  // The vault's shouldEncryptVaultLabel rules encrypt "sealed" policies with
  // AES-256-GCM. We pass apiKey in the body — never as a label.
  const result = writeVaultArtifact(db, {
    body: JSON.stringify(record),
    sourceType: SOURCE_TYPE,
    sourceId: input.providerKey,
    label: {
      visibility: "private",
      domain: "engineering",
      sensitivity: "credential", // holds an API key / secret
      policy: "sealed",
    },
  });
  db.prepare(
    `INSERT INTO tool_connections
       (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
        vault_artifact_id, created_at)
     VALUES (?, ?, 'api-key', ?, 0, 0, ?, ?)`,
  ).run(record.connectionId, input.providerKey, input.ownerId ?? null, result.id, record.connectedAt);
  return {
    providerKey: input.providerKey,
    connectionId: record.connectionId,
    vaultArtifactId: result.id,
    status: "connected",
    accountEmail: null,
    scopes: null,
    lastUsedAt: null,
    createdAt: record.connectedAt,
    expiresAt: null,
    errorMessage: null,
    authMode: "api-key",
  };
}

/**
 * Read back the plaintext API key for `providerKey`. Returns undefined when
 * no key is stored or the artifact can't be read.
 */
export async function readApiKey(
  providerKey: string,
  connectionId?: string,
): Promise<string | undefined> {
  const db = getDb();
  const row = connectionId
    ? db
        .prepare(
          `SELECT vault_artifact_id AS id
           FROM tool_connections
           WHERE id = ? AND provider_key = ? AND auth_mode = 'api-key'`,
        )
        .get(connectionId, providerKey) as { id: string | null } | undefined
    : db
        .prepare(
          `SELECT id FROM raw_artifacts
           WHERE source_type = ? AND source_id = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(SOURCE_TYPE, providerKey) as { id: string } | undefined;
  if (!row?.id) return undefined;
  const artifact = readVaultArtifact(db, row.id);
  const record = JSON.parse(artifact.body) as ToolAuthRecord;
  if (record.authMode !== "api-key") return undefined;
  return record.apiKey;
}

/**
 * Returns every persisted connection (OAuth + API-key) for this installation.
 * Vault-stored records win; Nango-stored OAuth records are merged in by the
 * caller via listNangoConnections().
 */
export function listVaultConnections(): ToolConnection[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, source_id, created_at FROM raw_artifacts
       WHERE source_type = ?
       ORDER BY created_at DESC`,
    )
    .all(SOURCE_TYPE) as Array<{ id: string; source_id: string; created_at: string }>;
  const out: ToolConnection[] = [];
  for (const r of rows) {
    try {
      const artifact = readVaultArtifact(db, r.id);
      const record = JSON.parse(artifact.body) as ToolAuthRecord;
      if (record.authMode === "oauth") {
        out.push({
          providerKey: record.providerKey,
          connectionId: r.id,
          nangoConnectionId: record.nangoConnectionId,
          vaultArtifactId: r.id,
          status: "connected",
          accountEmail: record.accountEmail,
          scopes: record.scopes,
          lastUsedAt: null,
          createdAt: record.connectedAt,
          expiresAt: null,
          errorMessage: null,
          authMode: "oauth",
        });
      } else {
        out.push({
          providerKey: record.providerKey,
          connectionId: r.id,
          vaultArtifactId: r.id,
          status: "connected",
          accountEmail: null,
          scopes: null,
          lastUsedAt: null,
          createdAt: record.connectedAt,
          expiresAt: null,
          errorMessage: null,
          authMode: "api-key",
        });
      }
    } catch {
      // Skip unreadable artifacts rather than failing the whole list.
    }
  }
  return out;
}

/**
 * Deletes the persisted connection for `providerKey` (both auth modes).
 * Returns the number of artifacts removed.
 */
export function deleteVaultConnection(providerKey: string): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, artifact_path FROM raw_artifacts
       WHERE source_type = ? AND source_id = ?`,
    )
    .all(SOURCE_TYPE, providerKey) as Array<{ id: string; artifact_path: string }>;
  return rows.reduce((count, row) => count + deleteVaultConnectionById(row.id), 0);
}

/** Delete exactly one vault artifact, identified by raw_artifacts.id. */
export function deleteVaultConnectionById(artifactId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, artifact_path FROM raw_artifacts
       WHERE id = ? AND source_type = ?`,
    )
    .get(artifactId, SOURCE_TYPE) as { id: string; artifact_path: string } | undefined;
  if (!row) return 0;

  db.transaction(() => {
    db.prepare(`DELETE FROM artifact_labels WHERE artifact_id = ?`).run(row.id);
    db.prepare(`DELETE FROM raw_artifacts WHERE id = ?`).run(row.id);
  })();

  // Best-effort file cleanup — vault writes are atomic; missing files are
  // tolerable as long as the DB row is gone.
  try {
    const vaultRoot =
      process.env.MEMROOS_VAULT_ROOT ||
      path.join(os.homedir(), ".memroos", "vault");
    fs.unlinkSync(path.join(vaultRoot, "default-tenant", row.artifact_path));
  } catch {
    // ignore — DB row removal is the source of truth
  }
  return 1;
}

/**
 * Append an entry to the connection-activity audit log. Persisted via the
 * audit table so /settings/tools can render the "Recent activity" strip
 * alongside connections.
 */
export function appendActivityEvent(input: {
  providerKey: string;
  type: ConnectionActivityEvent["type"];
  connectionId?: string | null;
  message?: string | null;
  operatorId?: string | null;
}): void {
  const db = getDb();
  const event: ConnectionActivityEvent = {
    id: crypto.randomUUID(),
    providerKey: input.providerKey,
    type: input.type,
    connectionId: input.connectionId ?? null,
    message: input.message ?? null,
    at: new Date().toISOString(),
    operatorId: input.operatorId ?? null,
  };
  // Persist via the standard audit chain so it composes with the rest of
  // memroos's audit query tooling. Audit is best-effort: failures here
  // should never 500 the caller (the data row in raw_artifacts is the
  // source of truth).
  try {
    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, 'default-tenant', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.id,
      input.operatorId ?? "anonymous",
      "operator",
      `tool_auth.${input.type}`,
      "tool_connection",
      input.providerKey,
      input.message ?? null,
      JSON.stringify(event),
      event.at,
    );
  } catch (err) {
    console.error("tool-auth: audit write failed (best-effort)", err);
  }
}

/**
 * Returns the last N activity events for the tool-auth plane.
 */
export function listActivityEvents(limit = 5): ConnectionActivityEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metadata_json, created_at FROM audit_entries
       WHERE event_type LIKE 'tool_auth.%'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{ metadata_json: string; created_at: string }>;
  return rows.map((r) => {
    try {
      const parsed = JSON.parse(r.metadata_json) as ConnectionActivityEvent;
      return parsed;
    } catch {
      return {
        id: "unknown",
        providerKey: "unknown",
        type: "connection_established",
        connectionId: null,
        message: null,
        at: r.created_at,
        operatorId: null,
      };
    }
  });
}
