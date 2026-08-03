// apps/memroos/src/lib/tool-auth/types.ts
// Shared types for the third-party tool authentication plane (Phase 179 / v8.23).
//
// The plane is intentionally simple:
//   - OAuth providers go through Nango; memroos stores only the connection-id
//     reference + last-known account/scope metadata in the vault.
//   - API-key providers store the secret directly in the vault; Nango is not
//     involved (Nango's proxy is used only for OAuth-bearing providers).
//
// Every credential is sealed with the same AES-256-GCM vault the rest of
// memroos uses for agent keys and memory artifacts (see FLEET-22).

export type ConnectionStatus =
  | "connected"
  | "expired"
  | "error"
  | "not_connected";

export type ConnectionAuthMode = "oauth" | "api-key";

export interface ToolConnection {
  /** The provider key from the registry (e.g. "slack"). */
  providerKey: string;
  /** Local tool_connections.id used by the UI and revoke/share routes. */
  connectionId: string;
  /**
   * Nango's own key for the integration ("circleback-mcp"), distinct from
   * providerKey ("circleback"). Nango requires it to delete a connection, so it
   * is surfaced rather than re-derived at the call site.
   */
  providerConfigKey?: string;
  /** Nango's connection_id for OAuth records. */
  nangoConnectionId?: string | null;
  /** raw_artifacts.id for vault-backed records. */
  vaultArtifactId?: string | null;
  status: ConnectionStatus;
  /** Present for OAuth connections only; for API keys this is null. */
  accountEmail?: string | null;
  /** Provider-supplied scope list (OAuth) or null (API key). */
  scopes?: string[] | null;
  /** ISO timestamp the connection was last successfully used. */
  lastUsedAt?: string | null;
  /** ISO timestamp the connection was created. */
  createdAt: string;
  /** ISO timestamp the access token expires (OAuth only). */
  expiresAt?: string | null;
  /** Free-text error from Nango or vault; only present when status="error". */
  errorMessage?: string | null;
  /** Which auth mode this connection uses. */
  authMode: ConnectionAuthMode;
  /** Ownership and sharing metadata populated by the scoped list chokepoint. */
  ownerId?: string | null;
  ownerName?: string | null;
  isShared?: boolean;
  needsOwner?: boolean;
  canManage?: boolean;
  isOwnedByViewer?: boolean;
}

export interface ConnectionUsage {
  used: number;
  limit: number;
  /** Plan tier reported by Nango; free | starter | growth | enterprise. */
  plan: "free" | "starter" | "growth" | "enterprise";
}

export interface ConnectionActivityEvent {
  id: string;
  providerKey: string;
  type:
    | "connection_established"
    | "connection_revoked"
    | "token_refresh_failed"
    | "test_succeeded"
    | "test_failed";
  /** Masked connection id (e.g. "nango_conn_abc…xyz"). */
  connectionId: string | null;
  message?: string | null;
  /** ISO timestamp. */
  at: string;
  /** Operator identity if known. */
  operatorId?: string | null;
}

export interface ConnectOAuthRequest {
  providerKey: string;
  /** The page to redirect back to after the Nango popup completes. */
  returnOrigin: string;
}

export interface ConnectOAuthResponse {
  /** URL to open in a new tab/popup. */
  authorizeUrl: string;
  /** Same providerKey echoed back for the client to correlate. */
  providerKey: string;
  /** Suggested window dimensions for the popup. */
  popupWidth: number;
  popupHeight: number;
}

export interface ConnectApiKeyRequest {
  providerKey: string;
  /** Free-form credentials map. Provider-specific schema is enforced by the route handler. */
  credentials: Record<string, string>;
}

export interface ConnectApiKeyResponse {
  providerKey: string;
  connectionId: string;
  /** Optional account info returned by a test call (e.g. login user). */
  account?: { id?: string; email?: string; displayName?: string } | null;
}

export interface RevokeRequest {
  connectionId?: string;
  providerKey?: string;
  nangoConnectionId?: string;
}

export interface RevokeResponse {
  providerKey: string;
  revoked: true;
}

export interface TestApiKeyRequest {
  providerKey: string;
  credentials: Record<string, string>;
}

export interface TestApiKeyResponse {
  ok: boolean;
  account?: { id?: string; email?: string; displayName?: string } | null;
  error?: string;
}

export interface ListProvidersResponse {
  categories: Array<{
    id: string;
    label: string;
    description: string;
    providers: Array<{
      key: string;
      label: string;
      description: string;
      authMode: ConnectionAuthMode;
      /** Non-null when the provider exists but cannot be connected yet. */
      unavailableReason?: string | null;
    }>;
  }>;
}

export interface ListConnectionsResponse {
  connections: ToolConnection[];
}

export interface ListActivityResponse {
  events: ConnectionActivityEvent[];
}

export interface GetUsageResponse {
  usage: ConnectionUsage;
  /** True when the usage is at or near the limit and an upgrade CTA should appear. */
  approachingLimit: boolean;
}
