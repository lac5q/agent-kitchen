/**
 * Minimal MCP client for connector ingestion.
 *
 * Speaks the streamable-HTTP transport that `mcp.linear.app` and the other
 * Nango-brokered MCP endpoints use: a JSON-RPC POST whose response is an SSE
 * stream carrying one `data:` line per message. Verified against the live
 * Linear connection 2026-07-27.
 *
 * Deliberately read-only — `callTool` is the only verb, and the manifest
 * decides which tools it may name. Nothing here can reach a mutation unless a
 * manifest lists one.
 */

const PROTOCOL_VERSION = "2025-06-18";

export interface McpCallResult {
  /**
   * Parsed JSON payload. Deliberately `unknown`: Linear returns an object
   * keyed by record type, Circleback returns a bare array. The manifest's
   * `resultKey` decides how to read it.
   */
  payload: unknown;
}

class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

async function rpc(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new McpError(`MCP ${endpoint} returned HTTP ${res.status}`);
  }

  const text = await res.text();

  // The response is an SSE stream; each message arrives as a `data:` line.
  // A plain JSON body is also accepted so a non-streaming server still works.
  for (const line of text.split("\n")) {
    const trimmed = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!trimmed.startsWith("{")) continue;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.error) {
      const err = parsed.error as { message?: string };
      throw new McpError(err?.message ?? "MCP returned an error");
    }
    if (parsed.result !== undefined) {
      return parsed.result as Record<string, unknown>;
    }
  }

  throw new McpError(`MCP ${endpoint} returned no parseable result`);
}

/** Handshake. Required before tools/call on a fresh connection. */
export async function initialize(
  endpoint: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await rpc(
    endpoint,
    accessToken,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "memroos-connector-sync", version: "1.0" },
      },
    },
    signal,
  );
}

/**
 * Call one read tool and return its decoded payload.
 *
 * MCP wraps tool output in a content-block array; list tools return a single
 * text block holding JSON. We decode that here so callers see a plain object.
 */
export async function callTool(
  endpoint: string,
  accessToken: string,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<McpCallResult> {
  const result = await rpc(
    endpoint,
    accessToken,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: tool, arguments: args },
    },
    signal,
  );

  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const block = content?.find((c) => c.type === "text");
  if (!block?.text) {
    throw new McpError(`MCP tool ${tool} returned no text content`);
  }

  // Circleback returns a bare JSON array where Linear returns an object, so
  // the decoded value is `unknown` rather than a record — the caller reads it
  // through the manifest's `resultKey` (null meaning "the payload is the
  // array"). Typing this as an object here would have made a bare array read
  // as zero records instead of failing loudly.
  const payload = JSON.parse(block.text) as unknown;
  return { payload };
}

/**
 * Issue a REST call for providers Nango brokers with plain OAuth2 rather than
 * MCP (Notion). Same return shape as `callTool` so the sync loop does not
 * branch on transport beyond choosing the caller.
 */
export async function callRest(
  baseUrl: string,
  accessToken: string,
  opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<McpCallResult> {
  const res = await fetch(`${baseUrl}${opts.path}`, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal,
  });

  if (!res.ok) {
    throw new McpError(`REST ${opts.path} returned HTTP ${res.status}`);
  }

  return { payload: (await res.json()) as unknown };
}
