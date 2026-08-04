#!/usr/bin/env node
/** SAVEQ-03: assert every default-visible memory MCP path is governed. */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const knowledgeServer = fs.readFileSync(
  path.join(root, "services/knowledge-mcp/knowledge_system/mcp_server.py"),
  "utf8"
);
const legacyServer = fs.readFileSync(path.join(root, "services/memory/mcp-mem0.py"), "utf8");
const capabilities = fs.readFileSync(
  path.join(root, "services/knowledge-mcp/knowledge_system/capabilities.py"),
  "utf8"
);

function functionBody(source, name) {
  const start = source.indexOf(`def ${name}(`);
  if (start < 0) throw new Error(`missing MCP handler: ${name}`);
  const next = source.indexOf("\ndef ", start + 5);
  return source.slice(start, next < 0 ? source.length : next);
}

const checks = [
  ["knowledge-mcp memory_save", functionBody(knowledgeServer, "memory_save"), "/api/memory/add"],
  ["knowledge-mcp memory_search", functionBody(knowledgeServer, "memory_search"), "/api/memory/prior-work"],
  ["knowledge-mcp agent_memory_save", functionBody(knowledgeServer, "agent_memory_save"), "/api/memory/add"],
  ["legacy mcp-mem0 memory_save", functionBody(legacyServer, "memory_save"), "/api/memory/add"],
  ["legacy mcp-mem0 memory_search", functionBody(legacyServer, "memory_search"), "/api/memory/prior-work"],
  ["legacy mcp-mem0 memory_get_all", functionBody(legacyServer, "memory_get_all"), "/api/memory/prior-work"],
];

for (const [label, body, route] of checks) {
  if (!body.includes(route)) throw new Error(`${label} does not route through ${route}`);
  if (body.includes("_mem0_url()") || body.includes("MEM0_URL}/memory/")) {
    throw new Error(`${label} still has a direct mem0 memory path`);
  }
}

if (!capabilities.includes('"agent_memory_save"')) {
  throw new Error("agent_memory_save is not in the default capability manifest");
}

console.log("MCP governance PASS");
console.log("checked: knowledge-mcp memory_save/memory_search/agent_memory_save; legacy mcp-mem0 memory_save/memory_search/memory_get_all");

