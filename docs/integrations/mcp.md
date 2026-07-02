# MemroOS as an MCP Server

MemroOS exposes a small MCP facade named `memroos` for knowledge, memory, and progressive tool discovery. The facade keeps the legacy server id for compatibility. It supports both:

- **stdio**: best when the MCP client runs on the same machine or has a local clone.
- **Streamable HTTP**: best for Maria/Sophia or any agent on another machine over Tailscale/LAN.

The server entry point is:

```bash
scripts/memroos-mcp.sh
```

It keeps stdout clean for MCP JSON-RPC, installs missing Python MCP dependencies into `.venv` if needed, and defaults `KNOWLEDGE_ROOT` to `~/github/knowledge` when present.

When `MEMROOS_AGENT_API_KEY` is not inherited, the launcher can load a local scoped agent key from `~/.memroos/agent-keys/<agent-id>.key`. Set `MEMROOS_AGENT_ID` explicitly when possible. Codex configs should set `MEMROOS_MCP_CLIENT=codex`; the launcher then prefers `codex-desktop-luis-mbp` when that key exists and falls back to the older `opencode` local key.

Set `MEMROOS_REQUIRE_SERVER_MEMORY=1` when the agent must fail actively if server-backed memory is unavailable. In strict mode, `scripts/memroos-mcp.sh` exits before starting MCP unless the scoped agent can authenticate to the MemRoOS app and `/api/memory/health` reports every memory tier as `up`. Set `MEMROOS_REQUIRE_SERVER_MEMORY=0` only for intentional repo-local/offline MCP work.

## Option A — local stdio client

Use this when the agent client can run commands on the same filesystem as the MemroOS clone.

```json
{
  "mcpServers": {
    "memroos": {
      "command": "/bin/bash",
      "args": [
        "-lc",
        "export MEMROOS_MCP_CLIENT=\"${MEMROOS_MCP_CLIENT:-codex}\"; export MEMROOS_REQUIRE_SERVER_MEMORY=\"${MEMROOS_REQUIRE_SERVER_MEMORY:-1}\"; exec \"${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh\""
      ],
      "env": {
        "MEMROOS_AGENT_ID": "codex-desktop-luis-mbp"
      }
    }
  }
}
```

For Hermes, the equivalent config is:

```yaml
mcp_servers:
  memroos:
    command: /bin/bash
    args:
      - -lc
      - exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"
```

## Option B — remote Streamable HTTP client

Use this when Maria/Sophia are on a different machine.

On the MemroOS host:

```bash
cd ~/github/memroos
npm run mcp:http
# or: ./scripts/memroos-mcp.sh --http --host 0.0.0.0 --port 8765
```

Then on Maria/Sophia's machine, add:

```json
{
  "mcpServers": {
    "memroos": {
      "url": "http://<memroos-tailscale-host-or-ip>:8765/mcp"
    }
  }
}
```

For Hermes on Maria/Sophia's machine:

```yaml
mcp_servers:
  memroos:
    url: http://<memroos-tailscale-host-or-ip>:8765/mcp
```

Replace `<memroos-tailscale-host-or-ip>` with the Memroos machine's Tailscale DNS name or 100.x Tailscale IP.

## Tool schema contract

The MCP facade exposes its machine-readable tool contract through both:

- `mcp_tool_contract` tool
- `mcp://tools/contract` resource

The contract id is `memroos-mcp-tools.v1`. It lists every registered MCP tool with a description, JSON-schema-shaped `inputSchema`, and `outputSchema`. The same registry backs FastMCP registration and the export contract, so new top-level tools should be added through `_mcp_tool`.

Verify the exported contract with:

```bash
npm run check:mcp-schema
```

## Goal-state handoffs

Long agent runs should persist their active state through MemRoOS before compaction, restart, or cross-agent transfer. Keep the project-local `GOAL_STATE.md` current, then send it through the audited agent-context bus:

```bash
npm run handoff:goal-state -- --repo /path/to/project --to-agent codex-desktop-luis-mbp
```

The script searches `.beastmode/GOAL_STATE.md`, `GOAL_STATE.md`, then `.planning/GOAL_STATE.md`. It sends a `context_sync` message and sets `saveToMemory=true`, so the handoff is available both in the recipient inbox and in audited agent memory. It never prints the API key.

## ChatGPT connector server

ChatGPT custom connectors and Deep Research-compatible MCP servers need read-only `search` and `fetch` tools. The MemroOS MCP facade includes those tools alongside the richer knowledge, memory, and tool-attention tools.

For the easy macOS setup, install the HTTP MCP facade as a LaunchAgent:

```bash
cd ~/github/memroos
MEMROOS_MCP_PUBLIC_BASE_URL=https://memroos.example npm run install:mcp:chatgpt
```

The installer writes `~/Library/LaunchAgents/com.memroos.chatgpt-mcp.plist`, keeps the server alive on port `8765`, and prints the connector URL:

```text
https://memroos.example/mcp
```

The installer also creates `~/.memroos/com.memroos.chatgpt-mcp.env` with a generated `MEMROOS_MCP_BEARER_TOKEN` and `0600` permissions. HTTP clients must send:

```text
Authorization: Bearer <token>
```

ChatGPT web custom connectors support OAuth or no-auth remote MCP, not arbitrary static bearer-token setup. For public ChatGPT use, put this server behind an OAuth-capable access layer such as Cloudflare Access Managed OAuth, or expose a separate read-only public-safe MCP profile that contains only `search` and `fetch`.

Useful follow-up commands:

```bash
npm run install:mcp:chatgpt -- status
npm run install:mcp:chatgpt -- uninstall
tail -f /tmp/memroos-chatgpt-mcp.log
```

There is also an editable plist template at `examples/mcp/com.memroos.chatgpt-mcp.plist` for non-default LaunchAgent setups.

## Smoke tests

Local stdio config parse:

```bash
bash -n scripts/memroos-mcp.sh
bash -n scripts/memroos-goal-state-handoff.sh
MEMROOS_MCP_CLIENT=codex scripts/memroos-mcp.sh --agent-env-status
MEMROOS_MCP_CLIENT=codex MEMROOS_REQUIRE_SERVER_MEMORY=1 scripts/memroos-mcp.sh --agent-env-status
```

Remote HTTP server health via MCP initialize is easiest with an MCP-aware client, but a basic HTTP reachability check should return an MCP response rather than connection refused:

```bash
curl -i http://<memroos-host>:8765/mcp
```

Expected: HTTP reaches the FastMCP endpoint. Some clients require a POST/session handshake, so a plain GET may return 405/406; that is still better than connection refused.

## Security notes

- Prefer Tailscale/private LAN. Do not expose this directly to the public internet.
- `memory_search` can reveal sensitive memory if the backing mem0 service is reachable; treat the HTTP MCP endpoint as trusted-internal only.
- For public/tunnel use, put it behind HTTPS and an auth proxy before sharing the URL.
