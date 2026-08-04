import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import {
  listVaultConnections,
} from "./credential-store";
import {
  listNangoConnections,
  ToolAuthConfigError,
} from "./nango-client";
import type { ToolConnection } from "./types";

type PersistedToolConnection = ToolConnection;

export interface ToolConnectionViewer {
  userId: string;
  role: "admin" | "operator" | "reviewer";
}

export type ToolConnectionPrincipal =
  | ToolConnectionViewer
  | { kind: "system" }
  | { userId: string; role: "system" };

export const SYSTEM_TOOL_CONNECTION_PRINCIPAL = { kind: "system" } as const;

export interface ToolConnectionRecord {
  id: string;
  providerKey: string;
  authMode: "oauth" | "api-key";
  ownerId: string | null;
  isShared: boolean;
  needsOwner: boolean;
  nangoConnectionId: string | null;
  vaultArtifactId: string | null;
  accountEmail: string | null;
  createdAt: string;
}

interface ToolConnectionDbRow {
  id: string;
  provider_key: string;
  auth_mode: "oauth" | "api-key";
  owner_id: string | null;
  is_shared: number;
  needs_owner: number;
  nango_connection_id: string | null;
  vault_artifact_id: string | null;
  account_email: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
}

interface ToolConnectionListOptions {
  /** Used by route fallback when Nango is configured but temporarily down. */
  skipNango?: boolean;
}

function rowQuery(): ToolConnectionDbRow[] {
  return getDb()
    .prepare(
      `SELECT tc.id, tc.provider_key, tc.auth_mode, tc.owner_id,
              tc.is_shared, tc.needs_owner, tc.nango_connection_id,
              tc.vault_artifact_id, tc.account_email, tc.created_at,
              u.display_name AS owner_name, u.email AS owner_email
       FROM tool_connections tc
       LEFT JOIN users u ON u.id = tc.owner_id
       ORDER BY tc.created_at DESC, tc.id DESC`,
    )
    .all() as ToolConnectionDbRow[];
}

function toRecord(row: ToolConnectionDbRow): ToolConnectionRecord {
  return {
    id: row.id,
    providerKey: row.provider_key,
    authMode: row.auth_mode,
    ownerId: row.owner_id,
    isShared: row.is_shared === 1,
    needsOwner: row.needs_owner === 1,
    nangoConnectionId: row.nango_connection_id,
    vaultArtifactId: row.vault_artifact_id,
    accountEmail: row.account_email,
    createdAt: row.created_at,
  };
}

function adminOwnerId(): string | null {
  const row = getDb()
    .prepare(
      `SELECT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.role = 'admin' AND u.disabled_at IS NULL
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

function ensureVaultConnectionRows(vault: PersistedToolConnection[]): void {
  const db = getDb();
  const findArtifact = db.prepare(
    `SELECT id FROM tool_connections WHERE vault_artifact_id = ? LIMIT 1`,
  );
  const findNango = db.prepare(
    `SELECT id FROM tool_connections WHERE nango_connection_id = ? LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO tool_connections
       (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
        nango_connection_id, vault_artifact_id, account_email, created_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE tool_connections
     SET vault_artifact_id = COALESCE(vault_artifact_id, ?),
         account_email = COALESCE(account_email, ?)
     WHERE id = ?`,
  );

  for (const connection of vault) {
    const artifactId = connection.vaultArtifactId ?? connection.connectionId;
    const existing = findArtifact.get(artifactId) as { id: string } | undefined;
    if (existing) {
      update.run(artifactId, connection.accountEmail ?? null, existing.id);
      continue;
    }

    const nangoId = connection.nangoConnectionId ?? null;
    if (nangoId) {
      const existingNango = findNango.get(nangoId) as { id: string } | undefined;
      if (existingNango) {
        update.run(artifactId, connection.accountEmail ?? null, existingNango.id);
        continue;
      }
    }

    insert.run(
      crypto.randomUUID(),
      connection.providerKey,
      connection.authMode,
      adminOwnerId(),
      nangoId,
      artifactId,
      connection.accountEmail ?? null,
      connection.createdAt,
    );
  }
}

function ensureNangoConnectionRow(connection: PersistedToolConnection): void {
  const nangoId = connection.nangoConnectionId ?? connection.connectionId;
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM tool_connections WHERE nango_connection_id = ? LIMIT 1`,
    )
    .get(nangoId) as { id: string } | undefined;
  if (existing) return;

  db.prepare(
    `INSERT INTO tool_connections
       (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
        nango_connection_id, account_email, created_at)
     VALUES (?, ?, 'oauth', ?, 1, 1, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    connection.providerKey,
    adminOwnerId(),
    nangoId,
    connection.accountEmail ?? null,
    connection.createdAt,
  );
}

function connectionFromRow(
  row: ToolConnectionDbRow,
  viewer: ToolConnectionViewer,
  vault: PersistedToolConnection | undefined,
  nango: PersistedToolConnection | undefined,
): ToolConnection {
  const source = nango ?? vault;
  const ownerName = row.owner_name ?? row.owner_email ?? null;
  return {
    providerKey: row.provider_key,
    connectionId: row.id,
    providerConfigKey: nango?.providerConfigKey,
    nangoConnectionId: row.nango_connection_id,
    vaultArtifactId: row.vault_artifact_id,
    status: source?.status ?? "connected",
    accountEmail: nango?.accountEmail ?? vault?.accountEmail ?? row.account_email,
    scopes: nango?.scopes ?? vault?.scopes ?? null,
    lastUsedAt: source?.lastUsedAt ?? null,
    createdAt: row.created_at,
    expiresAt: source?.expiresAt ?? null,
    errorMessage: source?.errorMessage ?? null,
    authMode: row.auth_mode,
    ownerId: row.owner_id,
    ownerName,
    isShared: row.is_shared === 1,
    needsOwner: row.needs_owner === 1,
    canManage: viewer.role === "admin" || row.owner_id === viewer.userId,
    isOwnedByViewer: row.owner_id === viewer.userId,
  };
}

/**
 * The only user-facing tool-connection listing. The viewer argument is
 * mandatory so an unscoped listing cannot be introduced by accident.
 */
export async function listToolConnectionsVisibleTo(
  viewer: ToolConnectionViewer,
  options: ToolConnectionListOptions = {},
): Promise<ToolConnection[]> {
  const vault = listVaultConnections();
  ensureVaultConnectionRows(vault);

  let nango: PersistedToolConnection[] = [];
  if (!options.skipNango) {
    try {
      nango = await listNangoConnections();
    } catch (err) {
      if (err instanceof ToolAuthConfigError) {
        nango = [];
      } else {
        throw err;
      }
    }
  }
  for (const connection of nango) ensureNangoConnectionRow(connection);

  const vaultByArtifact = new Map<string, PersistedToolConnection>();
  const vaultByNango = new Map<string, PersistedToolConnection>();
  for (const connection of vault) {
    vaultByArtifact.set(connection.vaultArtifactId ?? connection.connectionId, connection);
    if (connection.nangoConnectionId) vaultByNango.set(connection.nangoConnectionId, connection);
  }
  const nangoById = new Map<string, PersistedToolConnection>();
  for (const connection of nango) {
    nangoById.set(connection.nangoConnectionId ?? connection.connectionId, connection);
  }

  const rows = rowQuery();
  return rows
    .filter((row) =>
      viewer.role === "admin" ||
      row.owner_id === viewer.userId ||
      row.is_shared === 1,
    )
    .map((row) => {
      const vaultConnection = row.vault_artifact_id
        ? vaultByArtifact.get(row.vault_artifact_id)
        : row.nango_connection_id
          ? vaultByNango.get(row.nango_connection_id)
          : undefined;
      const nangoConnection = row.nango_connection_id
        ? nangoById.get(row.nango_connection_id)
        : undefined;
      return connectionFromRow(row, viewer, vaultConnection, nangoConnection);
    });
}

/** Resolve the legacy provider-key revoke shape without moving scope logic into a route. */
export async function resolveToolConnectionForLegacyRevoke(
  viewer: ToolConnectionViewer,
  input: { providerKey: string; nangoConnectionId?: string },
): Promise<
  | { status: "ok"; connection: ToolConnectionRecord }
  | { status: "not-found" }
  | { status: "forbidden" }
> {
  const visible = await listToolConnectionsVisibleTo(viewer);
  const matches = visible.filter(
    (connection) =>
      connection.providerKey === input.providerKey &&
      (!input.nangoConnectionId || connection.nangoConnectionId === input.nangoConnectionId),
  );
  const manageable = matches.find((connection) => connection.canManage);
  if (manageable) {
    const record = getToolConnectionRecord(manageable.connectionId);
    return record ? { status: "ok", connection: record } : { status: "not-found" };
  }
  return matches.length > 0 ? { status: "forbidden" } : { status: "not-found" };
}

export function getToolConnectionRecord(connectionId: string): ToolConnectionRecord | null {
  const row = getDb()
    .prepare(
      `SELECT tc.id, tc.provider_key, tc.auth_mode, tc.owner_id,
              tc.is_shared, tc.needs_owner, tc.nango_connection_id,
              tc.vault_artifact_id, tc.account_email, tc.created_at,
              u.display_name AS owner_name, u.email AS owner_email
       FROM tool_connections tc
       LEFT JOIN users u ON u.id = tc.owner_id
       WHERE tc.id = ?`,
    )
    .get(connectionId) as ToolConnectionDbRow | undefined;
  return row ? toRecord(row) : null;
}

/** True when a connection is in this viewer's scope. */
export function canViewToolConnection(
  viewer: ToolConnectionViewer,
  connectionId: string,
): boolean {
  if (viewer.role === "admin") return Boolean(getToolConnectionRecord(connectionId));
  const row = getToolConnectionRecord(connectionId);
  return Boolean(row && (row.ownerId === viewer.userId || row.isShared));
}

/** Only the owner or an admin may revoke or change sharing. */
export function canManageToolConnection(
  viewer: ToolConnectionViewer,
  connectionId: string,
): boolean {
  const row = getToolConnectionRecord(connectionId);
  return Boolean(row && (viewer.role === "admin" || row.ownerId === viewer.userId));
}

/** Credential use is broader than management, but system use is shared-only. */
export function canUseToolConnection(
  principal: ToolConnectionPrincipal,
  connectionId: string,
): boolean {
  const row = getToolConnectionRecord(connectionId);
  if (!row) return false;
  if ("kind" in principal && principal.kind === "system") return row.isShared;
  if (!("userId" in principal)) return row.isShared;
  return principal.role === "admin" || row.ownerId === principal.userId || row.isShared;
}

export function setToolConnectionShared(connectionId: string, shared: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE tool_connections SET is_shared = ? WHERE id = ?")
    .run(shared ? 1 : 0, connectionId);
  return result.changes > 0;
}

export function deleteToolConnectionRecord(connectionId: string): boolean {
  const result = getDb().prepare("DELETE FROM tool_connections WHERE id = ?").run(connectionId);
  return result.changes > 0;
}
