// @vitest-environment node
/**
 * VAL-ORCH-003: MCP protocol + capability validation precedes access.
 * Missing capabilities, malformed descriptors, unsupported protocol,
 * invalid JSON-RPC, and unregistered tools fail before read/write/search.
 */
import { describe, expect, it } from "vitest";
import {
  negotiateDescriptor,
  resolveRegisteredTool,
  validateInitializeParams,
  validateJsonRpcEnvelope,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  REQUIRED_MSIQ_CAPABILITIES,
  REQUIRED_MSIQ_TOOLS,
} from "../mcp-protocol";

function okCapabilities() {
  return REQUIRED_MSIQ_CAPABILITIES.map((name) => ({ name, version: "1", source: "self-hosted-mcp" }));
}

function okTools() {
  return REQUIRED_MSIQ_TOOLS.map((name) => ({
    name,
    description: name,
    requiredScope: ["tenantId", "userId", "agentId", "spaceId", "label", "purpose"],
    requiredCapabilities: ["memory.read", "memory.write", "memory.search"],
  }));
}

describe("VAL-ORCH-003 -- MCP JSON-RPC envelope validation", () => {
  it("accepts a valid 2.0 envelope with string id and known fields", () => {
    const r = validateJsonRpcEnvelope({
      jsonrpc: "2.0",
      id: "1",
      method: "initialize",
      params: { foo: "bar" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.method).toBe("initialize");
  });

  it("rejects non-2.0 envelopes", () => {
    const r = validateJsonRpcEnvelope({ jsonrpc: "1.0", id: "1", method: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("malformed_jsonrpc_envelope");
  });

  it("rejects envelopes with unknown fields", () => {
    const r = validateJsonRpcEnvelope({
      jsonrpc: "2.0",
      id: "1",
      method: "x",
      extra: true,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-object envelopes", () => {
    const r = validateJsonRpcEnvelope("not an object" as unknown);
    expect(r.ok).toBe(false);
  });

  it("rejects when id is the wrong type", () => {
    const r = validateJsonRpcEnvelope({ jsonrpc: "2.0", id: { complex: true }, method: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("VAL-ORCH-003 -- initialize params validation", () => {
  it("accepts a complete initialize params block", () => {
    const r = validateInitializeParams({
      protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
      capabilities: okCapabilities(),
      clientInfo: { name: "memroos", version: "1" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unsupported protocol versions", () => {
    const r = validateInitializeParams({
      protocolVersion: "2099-01-01",
      capabilities: okCapabilities(),
      clientInfo: { name: "memroos", version: "1" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unsupported_protocol_version");
  });

  it("rejects malformed capabilities list", () => {
    const r = validateInitializeParams({
      protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
      capabilities: [{ name: "memory.read" }],
      clientInfo: { name: "memroos", version: "1" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("malformed_initialize_params");
  });
});

describe("VAL-ORCH-003 -- negotiateDescriptor", () => {
  it("succeeds with valid transport, protocol, capabilities, tools", () => {
    const r = negotiateDescriptor({
      transport: "local",
      initialize: {
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
        capabilities: okCapabilities(),
        serverInfo: { name: "self-hosted-mcp", version: "1.0.0" },
        tools: okTools(),
      },
      transcript: [],
    });
    expect(r.ok).toBe(true);
  });

  it("fails closed for non-self-hosted transports", () => {
    const r = negotiateDescriptor({
      transport: "foundry",
      initialize: {
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
        capabilities: okCapabilities(),
        serverInfo: { name: "foundry", version: "1" },
        tools: okTools(),
      },
      transcript: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unsupported_transport");
  });

  it("fails closed when a required capability is missing", () => {
    const r = negotiateDescriptor({
      transport: "local",
      initialize: {
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
        capabilities: [{ name: "memory.read", version: "1", source: "x" }],
        serverInfo: { name: "x", version: "1" },
        tools: okTools(),
      },
      transcript: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_capabilities");
  });

  it("fails closed when a required tool is missing", () => {
    const r = negotiateDescriptor({
      transport: "local",
      initialize: {
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
        capabilities: okCapabilities(),
        serverInfo: { name: "x", version: "1" },
        tools: [{ name: "memory_write" }],
      },
      transcript: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_tools");
  });
});

describe("VAL-ORCH-003 -- resolveRegisteredTool", () => {
  it("resolves a known tool with required scope and capabilities", () => {
    const r = resolveRegisteredTool({
      tools: okTools(),
      name: "memory_write",
      requestedScope: ["tenantId", "userId", "agentId", "spaceId", "label", "purpose"],
      requestedCapabilities: ["memory.read", "memory.write", "memory.search"],
    });
    expect(r.ok).toBe(true);
  });

  it("fails closed on an unregistered tool", () => {
    const r = resolveRegisteredTool({
      tools: okTools(),
      name: "evil_tool",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unregistered_tool");
  });

  it("fails closed when a required capability is not requested", () => {
    const r = resolveRegisteredTool({
      tools: okTools(),
      name: "memory_write",
      requestedScope: ["tenantId", "userId", "agentId", "spaceId", "label", "purpose"],
      requestedCapabilities: ["memory.read"],
    });
    expect(r.ok).toBe(false);
  });
});
