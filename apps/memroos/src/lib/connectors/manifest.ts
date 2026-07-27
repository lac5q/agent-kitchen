/**
 * Per-provider sync manifests.
 *
 * A connected provider exposes far more MCP tools than are safe or useful to
 * poll — Linear alone exposes 57, most of them mutations (`save_issue`,
 * `merge_diff`, `delete_comment`). A generic "walk everything" crawler would
 * call them. So each provider declares exactly which read tools to poll, how
 * to paginate, and which field carries the incremental cursor.
 *
 * Verified against the live Linear MCP connection 2026-07-27:
 *   - `list_issues` / `list_documents` accept `updatedAt`, so incremental
 *     sync needs no content hashing — pass the high-water mark and the
 *     provider returns only what changed.
 *   - `list_comments` has NO time filter and is keyed by parent id, so it is
 *     deliberately absent here; comments belong to a per-changed-issue fetch,
 *     not a global sweep, or every cycle re-pulls the whole comment corpus.
 *   - `list_issues` truncates long bodies ("use `get_issue` for full
 *     description"). We index the truncated form on purpose: full bodies are
 *     an opt-in second pass, not the default, because every synced row costs
 *     an Ollama embedding.
 */

/** How a provider paginates a list response. */
export type PaginationStyle = "cursor";

export interface SyncTool {
  /** MCP tool name to call. */
  tool: string;
  /**
   * Key in the tool's JSON result holding the array of records
   * (e.g. `list_issues` returns `{ issues: [...] }`).
   */
  resultKey: string;
  /**
   * Argument name carrying the incremental high-water mark, or null when the
   * tool offers no time filter (full pull every cycle — keep those small).
   */
  incrementalArg: string | null;
  /** Field on each record holding its stable provider-side id. */
  idField: string;
  /** Fields concatenated to form the indexed text body, in order. */
  contentFields: readonly string[];
  pagination: PaginationStyle;
}

export interface ConnectorManifest {
  /** memroos provider key — matches PROVIDERS[].key in tool-auth/providers.ts. */
  providerKey: string;
  /** Nango provider_config_key — matches PROVIDERS[].providerConfigKey. */
  providerConfigKey: string;
  /** MCP endpoint the brokered token authenticates against. */
  mcpEndpoint: string;
  tools: readonly SyncTool[];
}

const LINEAR: ConnectorManifest = {
  providerKey: "linear",
  providerConfigKey: "linear-mcp",
  mcpEndpoint: "https://mcp.linear.app/mcp",
  tools: [
    {
      tool: "list_issues",
      resultKey: "issues",
      incrementalArg: "updatedAt",
      idField: "id",
      contentFields: ["title", "description"],
      pagination: "cursor",
    },
    {
      tool: "list_documents",
      resultKey: "documents",
      incrementalArg: "updatedAt",
      idField: "id",
      contentFields: ["title", "content"],
      pagination: "cursor",
    },
    {
      tool: "list_projects",
      resultKey: "projects",
      // No time filter, but a workspace has few projects — a full pull is cheap.
      incrementalArg: null,
      idField: "id",
      contentFields: ["name", "description"],
      pagination: "cursor",
    },
  ],
};

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [LINEAR];

export function getManifest(providerKey: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((m) => m.providerKey === providerKey);
}

/**
 * Space name for a connection's dedicated space.
 *
 * One space per connection is the isolation boundary: `space_members` decides
 * who can recall the content, and `spaces.default_labels_json` decides whether
 * it is indexable at all. Both are data, not code.
 */
export function connectorSpaceName(providerKey: string): string {
  return `connector/${providerKey}`;
}

/**
 * `messages.project` value for connector rows.
 *
 * MUST stay namespaced under `connector/`. `filterBySpace` falls back to
 * matching `project` against the space NAME when a row's `space_id` is null or
 * does not match — so a bare project string like "linear" could pass the gate
 * for an unrelated space named "linear". The `connector/` prefix makes that
 * collision impossible, and connector rows always carry a real `space_id`
 * besides.
 */
export function connectorProject(providerKey: string): string {
  return `connector/${providerKey}`;
}

/** Stable `messages.session_id` for a connection — one logical stream per connection. */
export function connectorSessionId(
  providerKey: string,
  connectionId: string,
): string {
  return `${providerKey}:${connectionId}`;
}
