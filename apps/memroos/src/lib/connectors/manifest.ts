/**
 * Per-provider sync manifests.
 *
 * A connected provider exposes far more surface than is safe or useful to
 * poll — Linear alone exposes 57 MCP tools, most of them mutations
 * (`save_issue`, `merge_diff`, `delete_comment`). A generic "walk everything"
 * crawler would call them. So each provider declares exactly which read
 * operations to poll, how to paginate, and which field carries the
 * incremental cursor.
 *
 * Every fact encoded here was verified against the live provider on
 * 2026-07-27, not inferred from documentation. The providers differ more than
 * expected, which is why the shape is data rather than per-provider code:
 *
 *   - Linear speaks MCP and returns `{ issues: [...] }` with `hasNextPage`
 *     plus a cursor, and accepts `updatedAt` for real incremental sync.
 *   - Circleback speaks MCP but returns a BARE JSON ARRAY with no wrapper key,
 *     exposes no time filter at all, and paginates by integer `pageIndex`.
 *   - Notion is not MCP: Nango brokers a plain OAuth2 REST token, so it needs
 *     an HTTP method, path, and the dated `Notion-Version` header.
 */

/**
 * How a provider advances through pages.
 *
 * `cursor` — opaque token echoed back on the next call (Linear, Notion).
 * `page-index` — 0-based integer (Circleback; its response carries neither a
 * cursor nor `hasNextPage`, so the only way forward is to increment).
 */
export type PaginationStyle = "cursor" | "page-index";

/**
 * Wire protocol. `mcp` posts JSON-RPC to an MCP endpoint; `rest` issues a
 * plain HTTP request. Nango's own provider template is the source of truth
 * here: `auth_mode: MCP_OAUTH2` means MCP, `OAUTH2` means REST.
 */
export type Transport = "mcp" | "rest";

export interface SyncTool {
  /** MCP tool name, or a label for the REST call (see `method`/`path`). */
  tool: string;
  /**
   * Key in the response holding the array of records. `null` means the
   * response IS the array — Circleback returns a bare array, and assuming a
   * wrapper key there silently yields zero records rather than an error.
   */
  resultKey: string | null;
  /**
   * Argument carrying the incremental high-water mark, or null when the
   * provider offers no time filter. Only Linear has one; for the others every
   * cycle re-reads the newest page and relies on the UNIQUE(session_id,
   * request_id) constraint to no-op unchanged records.
   */
  incrementalArg: string | null;
  /** Field on each record holding its stable provider-side id. */
  idField: string;
  /**
   * Field carrying the record's own timestamp. Every provider names it
   * differently — Linear `updatedAt`, Circleback `createdAt` (it has no
   * updatedAt at all), Notion `last_edited_time`. Assuming one name collapsed
   * the others onto the ingest date and broke recency ranking.
   */
  timestampField: string;
  /**
   * Fields concatenated to form the indexed text body, in order. Missing or
   * non-string fields are skipped rather than stringified.
   */
  contentFields: readonly string[];
  pagination: PaginationStyle;
  /**
   * Constants merged into every call. Circleback's `intent` is a REQUIRED
   * param — omitting it fails the call outright.
   */
  staticArgs?: Record<string, unknown>;
  /** REST only: HTTP method. */
  method?: string;
  /** REST only: path appended to the manifest endpoint. */
  path?: string;
  /** REST only: extra headers the provider requires. */
  headers?: Record<string, string>;
  /**
   * REST only: key in the response holding the next-page cursor, and the
   * request arg it is passed back as.
   */
  cursorField?: string;
  cursorArg?: string;
  /** REST only: boolean key indicating another page exists. */
  hasMoreField?: string;
  /**
   * Optional per-record second pass, for providers whose list endpoint omits
   * the actual content. Costs one extra request per record, so it is opt-in
   * per tool rather than a default.
   *
   * `notion-page` fetches `/v1/blocks/{id}/children` and folds the flattened
   * text (plus the real page title) into the indexed body — without it a
   * Notion record is a bare URL, which embeds and indexes but can never match
   * a semantic query.
   */
  enrich?: "notion-page";
}

export interface ConnectorManifest {
  /** memroos provider key — matches PROVIDERS[].key in tool-auth/providers.ts. */
  providerKey: string;
  /**
   * Nango provider_config_key — matches PROVIDERS[].providerConfigKey and MUST
   * exist in the Nango dashboard. A key with no matching integration produces
   * a connection that can never be fetched.
   */
  providerConfigKey: string;
  /** MCP endpoint or REST base URL, per `transport`. */
  endpoint: string;
  transport: Transport;
  tools: readonly SyncTool[];
}

const LINEAR: ConnectorManifest = {
  providerKey: "linear",
  providerConfigKey: "linear-mcp",
  transport: "mcp",
  endpoint: "https://mcp.linear.app/mcp",
  tools: [
    {
      tool: "list_issues",
      resultKey: "issues",
      // The one provider with a real server-side time filter — this is what
      // makes Linear's incremental sync cheap.
      incrementalArg: "updatedAt",
      idField: "id",
      timestampField: "updatedAt",
      contentFields: ["title", "description"],
      pagination: "cursor",
    },
    {
      tool: "list_documents",
      resultKey: "documents",
      incrementalArg: "updatedAt",
      idField: "id",
      timestampField: "updatedAt",
      contentFields: ["title", "content"],
      pagination: "cursor",
    },
    {
      tool: "list_projects",
      resultKey: "projects",
      // No time filter, but a workspace has few projects — a full pull is cheap.
      incrementalArg: null,
      idField: "id",
      timestampField: "updatedAt",
      contentFields: ["name", "description"],
      pagination: "cursor",
    },
  ],
};

/**
 * Circleback — meeting notes and transcripts.
 *
 * `SearchTranscripts` and `GetTranscriptsForMeetings` exist but are excluded:
 * full transcripts are an order of magnitude larger than notes and every
 * synced row costs an Ollama embedding. Notes carry the summarised substance;
 * transcripts are an opt-in second pass if they turn out to be needed.
 */
const CIRCLEBACK: ConnectorManifest = {
  providerKey: "circleback",
  providerConfigKey: "circleback-mcp",
  transport: "mcp",
  // Not mcp.circleback.ai — that host does not resolve. Nango's provider
  // template gives base_url https://app.circleback.ai/api/, and `/mcp` under
  // it is the path that completes an MCP handshake.
  endpoint: "https://app.circleback.ai/api/mcp",
  tools: [
    {
      tool: "SearchMeetings",
      // Verified: the payload is a bare JSON array, not `{ meetings: [...] }`.
      resultKey: null,
      // No updatedAt/startDate high-water equivalent on the record, and
      // `startDate` filters meeting time rather than modification time — using
      // it as an incremental key would permanently skip edited older meetings.
      incrementalArg: null,
      idField: "id",
      timestampField: "createdAt",
      contentFields: ["name", "notes"],
      pagination: "page-index",
      staticArgs: {
        // REQUIRED by the tool schema. Circleback uses it to bias retrieval,
        // so it must describe the actual purpose rather than be blank.
        intent: "index meeting notes into long-term memory",
      },
    },
  ],
};

/**
 * Notion — pages and databases.
 *
 * REST, not MCP: Nango registers `notion` with `auth_mode: OAUTH2`, so the
 * brokered token is a normal Notion integration token.
 */
const NOTION: ConnectorManifest = {
  providerKey: "notion",
  // The Nango integration is `notion`. There is no `notion-rest` integration —
  // a manifest naming one would fetch nothing.
  providerConfigKey: "notion",
  transport: "rest",
  endpoint: "https://api.notion.com",
  tools: [
    {
      tool: "search",
      resultKey: "results",
      // /v1/search has no since-filter. Sorting by last_edited_time descending
      // puts the freshest pages first, so an early page hit is enough for
      // steady-state; the unique constraint absorbs the repeats.
      incrementalArg: null,
      idField: "id",
      timestampField: "last_edited_time",
      // Notion's search response carries `properties` and `url` but no page
      // body. `enrich: "notion-page"` performs the follow-on fetch and writes
      // the assembled title + body + url into `_content`; `url` remains the
      // fallback for a page whose blocks cannot be read, which is exactly the
      // URL-only record this used to produce for everything.
      contentFields: ["_content", "url"],
      enrich: "notion-page",
      pagination: "cursor",
      method: "POST",
      path: "/v1/search",
      headers: { "Notion-Version": "2022-06-28" },
      staticArgs: {
        sort: { direction: "descending", timestamp: "last_edited_time" },
      },
      cursorField: "next_cursor",
      cursorArg: "start_cursor",
      hasMoreField: "has_more",
    },
  ],
};

/**
 * Google Drive — REST (Nango registers `google-drive` as OAUTH2, so the
 * brokered token is a plain Google access token).
 *
 * Verified against the live API 2026-07-28: GET /drive/v3/files returns
 * `{ files: [...], nextPageToken }`, and each record carries id, name,
 * mimeType, modifiedTime, webViewLink. Unlike Notion this is a GET, so every
 * argument travels in the query string — see callRest's bodyless branch.
 *
 * `fields` must be requested explicitly; Drive's default projection omits
 * modifiedTime and webViewLink, which would collapse every record onto the
 * ingest date and leave it unlinkable.
 */
const GOOGLE_DRIVE: ConnectorManifest = {
  providerKey: "google-drive",
  providerConfigKey: "google-drive",
  transport: "rest",
  endpoint: "https://www.googleapis.com",
  tools: [
    {
      tool: "list_files",
      resultKey: "files",
      // Drive's time filter rides inside the `q` expression rather than a
      // standalone argument, which this manifest shape cannot express. Newest
      // first plus the UNIQUE(session_id, request_id) constraint gives correct
      // steady-state behaviour, same as Notion.
      incrementalArg: null,
      idField: "id",
      timestampField: "modifiedTime",
      // Drive exposes no file body here; name + link is thin but honest, and
      // makes the file findable and openable.
      contentFields: ["name", "webViewLink"],
      pagination: "cursor",
      method: "GET",
      path: "/drive/v3/files",
      staticArgs: {
        orderBy: "modifiedTime desc",
        fields:
          "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
      },
      cursorField: "nextPageToken",
      cursorArg: "pageToken",
    },
  ],
};

export const CONNECTOR_MANIFESTS: readonly ConnectorManifest[] = [
  LINEAR,
  CIRCLEBACK,
  NOTION,
  GOOGLE_DRIVE,
];

export function getManifest(providerKey: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((m) => m.providerKey === providerKey);
}

/**
 * Space name for a connection's dedicated space.
 *
 * One space per provider is the isolation boundary: `space_members` decides
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
