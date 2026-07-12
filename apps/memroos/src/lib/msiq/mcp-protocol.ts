/**
 * MSIQ-04 (VAL-ORCH-001, VAL-ORCH-003): MCP protocol + capability validation
 * for the self-hosted Microsoft Agent Framework memory adapter.
 *
 * Hard contracts:
 *   - JSON-RPC 2.0 envelopes only (no positional parameters; numeric or
 *     string `id` only; rejects `null` and unknown fields at the boundary).
 *   - Negotiated MCP protocol version is one of an allowlist. Self-hosted
 *     transport: stdio/inproc only. No paid / hosted transports are accepted.
 *   - Capability negotiation is mandatory before any tool call: the adapter
 *     must have observed `tools/list` and the requested `tools/call` must
 *     match a registered tool with the documented name, declared scope
 *     permissions, and the union of capabilities listed at session open.
 *   - Fail-closed: every validation failure is a typed error and an audit
 *     receipt. Validation ALWAYS precedes adapter access, so a missing or
 *     malformed descriptor cannot trigger a direct-DB or arbitrary-tool path.
 *
 * This module is pure: it has no DB dependency, no network calls. The
 * caller wires the deterministic transcript into the audit log.
 */

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26"] as const;
export type SupportedMcpProtocolVersion = (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number];

export const SELF_HOSTED_MCP_TRANSPORTS = ["local", "inproc", "memory", "mcp_stdio"] as const;
export type SelfHostedMcpTransport = (typeof SELF_HOSTED_MCP_TRANSPORTS)[number];

/**
 * Declared capabilities a Microsoft Agent Framework memory adapter must
 * advertise to satisfy MSIQ-04. The union of capabilities is recorded on
 * the session row; if any required capability is missing the session is
 * denied (`missing_capabilities`) before any tool is invoked.
 */
export const REQUIRED_MSIQ_CAPABILITIES = [
  "memory.read",
  "memory.write",
  "memory.search",
  "tools.list",
] as const;
export type RequiredMsiqCapability = (typeof REQUIRED_MSIQ_CAPABILITIES)[number];

/** Required memory tool names. Each must be present in `tools/list`. */
export const REQUIRED_MSIQ_TOOLS = [
  "memory_read",
  "memory_write",
  "memory_search",
] as const;
export type RequiredMsiqTool = (typeof REQUIRED_MSIQ_TOOLS)[number];

export interface McpToolDescriptor {
  name: string;
  description?: string | null;
  /** Required scope dimensions declared by the tool. */
  requiredScope?: string[];
  /** Required capability flags declared by the tool. */
  requiredCapabilities?: string[];
}

export interface McpCapabilityDescriptor {
  name: string;
  version?: string | null;
  source: string;
}

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: McpCapabilityDescriptor[];
  clientInfo: { name: string; version: string };
}

export interface McpInitializeResult {
  protocolVersion: SupportedMcpProtocolVersion;
  capabilities: McpCapabilityDescriptor[];
  serverInfo: { name: string; version: string };
  tools: McpToolDescriptor[];
}

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown> | McpInitializeParams | McpToolCallParams | null;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export type McpValidationOutcome =
  | {
      ok: true;
      protocolVersion: SupportedMcpProtocolVersion;
      capabilities: McpCapabilityDescriptor[];
      tools: McpToolDescriptor[];
      transcript: McpJsonRpcRequest[];
      validatedAt: string;
    }
  | {
      ok: false;
      reason: McpValidationFailure;
      detail: string;
      transcript: McpJsonRpcRequest[];
      validatedAt: string;
    };

export type McpValidationFailure =
  | "unsupported_transport"
  | "unsupported_protocol_version"
  | "malformed_jsonrpc_envelope"
  | "missing_capabilities"
  | "missing_tools"
  | "unregistered_tool"
  | "malformed_initialize_params"
  | "no_initialize_observe";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asCapabilityList(value: unknown): McpCapabilityDescriptor[] | null {
  if (!Array.isArray(value)) return null;
  const out: McpCapabilityDescriptor[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (typeof entry.name !== "string" || entry.name.length === 0) return null;
    const version = typeof entry.version === "string" ? entry.version : null;
    if (entry.version !== undefined && entry.version !== null && !version) return null;
    if (typeof entry.source !== "string" || entry.source.length === 0) return null;
    out.push({
      name: entry.name,
      version,
      source: entry.source,
    });
  }
  return out;
}


/**
 * Validate a JSON-RPC envelope at the protocol boundary. Returns the parsed
 * envelope or a typed error reason. Strict 2.0 envelope: id is string|number
 * (nullable to support notifications, but notifications are not allowed
 * here -- the adapter only sends requests). Extra top-level fields are
 * rejected to fail closed on malformed descriptors.
 */
export function validateJsonRpcEnvelope(value: unknown):
  | { ok: true; request: McpJsonRpcRequest }
  | { ok: false; reason: McpValidationFailure; detail: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "malformed_jsonrpc_envelope", detail: "envelope must be a JSON object" };
  }
  if (value.jsonrpc !== "2.0") {
    return { ok: false, reason: "malformed_jsonrpc_envelope", detail: "jsonrpc field must be the literal string '2.0'" };
  }
  if (typeof value.method !== "string" || value.method.length === 0) {
    return { ok: false, reason: "malformed_jsonrpc_envelope", detail: "method must be a non-empty string" };
  }
  if (value.id !== undefined && value.id !== null) {
    if (typeof value.id !== "string" && typeof value.id !== "number") {
      return { ok: false, reason: "malformed_jsonrpc_envelope", detail: "id must be string|number|null" };
    }
  }
  if (value.params !== undefined && value.params !== null && !isRecord(value.params)) {
    return { ok: false, reason: "malformed_jsonrpc_envelope", detail: "params must be an object or null" };
  }
  const knownFields = new Set(["jsonrpc", "id", "method", "params"]);
  for (const key of Object.keys(value)) {
    if (!knownFields.has(key)) {
      return { ok: false, reason: "malformed_jsonrpc_envelope", detail: `unknown field: ${key}` };
    }
  }
  return {
    ok: true,
    request: {
      jsonrpc: "2.0",
      id: (value.id ?? null) as string | number | null,
      method: value.method,
      params: (value.params ?? null) as Record<string, unknown> | null,
    },
  };
}

/**
 * Validate an `initialize` params block. Returns the negotiated protocol
 * version, capabilities, and serverInfo, or a typed failure.
 */
export function validateInitializeParams(value: unknown):
  | { ok: true; protocolVersion: SupportedMcpProtocolVersion; capabilities: McpCapabilityDescriptor[]; clientInfo: { name: string; version: string } }
  | { ok: false; reason: McpValidationFailure; detail: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "malformed_initialize_params", detail: "initialize params must be an object" };
  }
  if (typeof value.protocolVersion !== "string") {
    return { ok: false, reason: "malformed_initialize_params", detail: "protocolVersion must be a string" };
  }
  if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(value.protocolVersion as SupportedMcpProtocolVersion)) {
    return { ok: false, reason: "unsupported_protocol_version", detail: `protocolVersion=${value.protocolVersion} is not in the supported allowlist` };
  }
  const capabilities = asCapabilityList(value.capabilities);
  if (!capabilities) {
    return { ok: false, reason: "malformed_initialize_params", detail: "capabilities must be an array of {name,version?,source}" };
  }
  if (!isRecord(value.clientInfo) || typeof value.clientInfo.name !== "string" || typeof value.clientInfo.version !== "string") {
    return { ok: false, reason: "malformed_initialize_params", detail: "clientInfo.{name,version} must be strings" };
  }
  return {
    ok: true,
    protocolVersion: value.protocolVersion as SupportedMcpProtocolVersion,
    capabilities,
    clientInfo: { name: value.clientInfo.name, version: value.clientInfo.version },
  };
}

/**
 * Negotiate the descriptor after the host has observed `initialize` and
 * `tools/list`. Fails closed if any required capability or required tool is
 * missing or if any negotiated protocol version is not on the allowlist.
 *
 * The transcript is the caller's responsibility: this function is pure and
 * returns the union of observed tools + capabilities.
 */
export function negotiateDescriptor(args: {
  transport: string;
  initialize: McpInitializeResult;
  transcript: McpJsonRpcRequest[];
}): McpValidationOutcome {
  const { transport, initialize, transcript } = args;
  const validatedAt = new Date().toISOString();

  if (!SELF_HOSTED_MCP_TRANSPORTS.includes(transport as SelfHostedMcpTransport)) {
    return {
      ok: false,
      reason: "unsupported_transport",
      detail: `transport=${transport} is not self-hosted`,
      transcript,
      validatedAt,
    };
  }
  if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(initialize.protocolVersion)) {
    return {
      ok: false,
      reason: "unsupported_protocol_version",
      detail: `negotiated protocolVersion=${initialize.protocolVersion} is not in the supported allowlist`,
      transcript,
      validatedAt,
    };
  }

  const capNames = new Set(initialize.capabilities.map((c) => c.name));
  const missingCapabilities = REQUIRED_MSIQ_CAPABILITIES.filter((c) => !capNames.has(c));
  if (missingCapabilities.length > 0) {
    return {
      ok: false,
      reason: "missing_capabilities",
      detail: `missing required capabilities: ${missingCapabilities.join(",")}`,
      transcript,
      validatedAt,
    };
  }
  const toolNames = new Set(initialize.tools.map((t) => t.name));
  const missingTools = REQUIRED_MSIQ_TOOLS.filter((t) => !toolNames.has(t));
  if (missingTools.length > 0) {
    return {
      ok: false,
      reason: "missing_tools",
      detail: `missing required tools: ${missingTools.join(",")}`,
      transcript,
      validatedAt,
    };
  }
  return {
    ok: true,
    protocolVersion: initialize.protocolVersion,
    capabilities: initialize.capabilities,
    tools: initialize.tools,
    transcript,
    validatedAt,
  };
}

/**
 * Look up a registered tool by name and verify the requested scope + capability
 * flags cover what the tool declared. Returns the descriptor on success or
 * a typed failure.
 */
export function resolveRegisteredTool(args: {
  tools: McpToolDescriptor[];
  name: string;
  requestedScope?: string[];
  requestedCapabilities?: string[];
}): { ok: true; tool: McpToolDescriptor } | { ok: false; reason: McpValidationFailure; detail: string } {
  const { tools, name, requestedScope, requestedCapabilities } = args;
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, reason: "unregistered_tool", detail: `tool ${name} is not registered` };
  }
  if (tool.requiredScope && tool.requiredScope.length > 0) {
    if (!requestedScope) {
      return { ok: false, reason: "malformed_jsonrpc_envelope", detail: `tool ${name} requires scope` };
    }
    for (const required of tool.requiredScope) {
      if (!requestedScope.includes(required)) {
        return { ok: false, reason: "malformed_jsonrpc_envelope", detail: `tool ${name} requires scope dimension ${required}` };
      }
    }
  }
  if (tool.requiredCapabilities && tool.requiredCapabilities.length > 0) {
    if (!requestedCapabilities) {
      return { ok: false, reason: "missing_capabilities", detail: `tool ${name} requires capabilities` };
    }
    for (const required of tool.requiredCapabilities) {
      if (!requestedCapabilities.includes(required)) {
        return { ok: false, reason: "missing_capabilities", detail: `tool ${name} requires capability ${required}` };
      }
    }
  }
  return { ok: true, tool };
}
