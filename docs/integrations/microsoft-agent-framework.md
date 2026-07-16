# Microsoft Agent Framework (MAF) → MemRoOS Memory

Self-hosted [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) (MIT) agents can use MemRoOS as durable cross-session memory through MCP. The MemRoOS side of this path is the MSIQ adapter under `apps/memroos/src/lib/msiq/`.

## Hard constraints (fail-closed)

| Rule | Default |
| --- | --- |
| Transport | Local MCP only (`stdio` or self-hosted Streamable HTTP on your network) |
| License / cost | MIT/OSS packages and local models; no paid Foundry-hosted defaults |
| Foundry-hosted agents | Not documented as a supported path; adapter `foundryOnlyMode` returns unavailable with no provider fallback |
| Scope | Every write/read requires a complete tenant/user/agent/space/label/purpose/belief-stage identity |
| Writes | Idempotent by `(idempotency_key, scope_hash, request_hash)`; payload/scope reuse conflicts fail closed |

Do not configure Azure AI Foundry Agent Service, Foundry-hosted memory, or other metered Microsoft cloud memory backends in this integration. If you need cloud LLM inference, that is outside this guide; memory durability stays on MemRoOS.

## Architecture

```
MAF agent (Python/.NET, self-hosted)
    │  MCP stdio or Streamable HTTP
    ▼
MemRoOS MCP facade (`scripts/memroos-mcp.sh`)
    │  memory_search / memory_recall / memory_save (+ knowledge tools)
    ▼
MemRoOS app + MSIQ adapter (`openMsiqSession` / `writeViaMsiqAdapter` / `readViaMsiqAdapter`)
    │
    ▼
Durable memory tiers (vector / graph / episodic) with audit receipts
```

Related docs:

- [MemRoOS as an MCP server](mcp.md) — stdio and Streamable HTTP client config
- Adapter source: `apps/memroos/src/lib/msiq/msiq-adapter.ts`
- Protocol validation: `apps/memroos/src/lib/msiq/mcp-protocol.ts`
- Scope identity: `apps/memroos/src/lib/msiq/scope-identity.ts`

## Prerequisites

1. A running MemRoOS operator app with agent API keys issued for the MAF agent identity.
2. MCP launcher available: `scripts/memroos-mcp.sh` (see [mcp.md](mcp.md)).
3. MAF installed from the MIT OSS package (`pip install agent-framework` for Python, or the corresponding .NET OSS package). Prefer local/open model providers; do not use Foundry-hosted agent hosting for this path.

## Recommended path — MCP stdio from MAF

On the MemRoOS host, ensure the MCP script works for the agent key:

```bash
export MEMROOS_AGENT_ID="maf-worker"
export MEMROOS_REQUIRE_SERVER_MEMORY=1
"${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"
```

Wire that same command into MAF as a local MCP server (stdio). Conceptually:

```python
# Illustrative — adjust to the MAF MCP client API you ship with.
# Package: agent-framework (MIT). No Foundry hosting required.
from agent_framework import Agent, MCPStdioTool  # names may vary by MAF version

memroos = MCPStdioTool(
    name="memroos",
    command="/bin/bash",
    args=[
        "-lc",
        'export MEMROOS_MCP_CLIENT="${MEMROOS_MCP_CLIENT:-maf}"; '
        'export MEMROOS_REQUIRE_SERVER_MEMORY="${MEMROOS_REQUIRE_SERVER_MEMORY:-1}"; '
        'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"',
    ],
    env={"MEMROOS_AGENT_ID": "maf-worker"},
)

async with memroos:
    agent = Agent(name="maf-worker", tools=[memroos])
    # Agent tools include MemRoOS memory_search / memory_save / memory_recall
    await agent.run("Remember that the customer requires private-network deploy first.")
```

For a remote MAF process on the same Tailscale/LAN, run MemRoOS MCP over Streamable HTTP instead of stdio — see Option B in [mcp.md](mcp.md). Still self-hosted; still no Foundry memory backend.

## What the MSIQ adapter enforces

When traffic enters through the MemRoOS MSIQ adapter (tests: `apps/memroos/src/lib/msiq/__tests__/msiq-adapter.test.ts`):

1. **Session open** (`openMsiqSession`) negotiates MCP protocol version and capabilities. Incomplete scope or failed MCP validation is denied. `foundryOnlyMode: true` returns `foundry_only_unavailable` with no hosted fallback.
2. **Writes** (`writeViaMsiqAdapter`) require a session token, idempotency key, and complete scope. Injection detection can deny payloads. Conflicts on reused keys with different payloads are typed `conflict`, not silent overwrite.
3. **Reads** (`readViaMsiqAdapter`) stay inside the session scope and policy gate; results carry provenance suitable for receipts.
4. **Close** (`closeMsiqSession`) ends the session without clearing durable memory already written.

Register the MAF agent in MemRoOS with a stable `agentId` that matches `MEMROOS_AGENT_ID` / scope `actor.capability` so audit and policy receipts stay attributable.

## Operator checklist

- [ ] Agent registered; scoped API key present for MCP (`MEMROOS_AGENT_ID`).
- [ ] MCP health: `MEMROOS_REQUIRE_SERVER_MEMORY=1` passes against `/api/memory/health`.
- [ ] MAF process uses local MCP command or self-hosted HTTP URL only.
- [ ] No Foundry Agent Service / Foundry memory / paid connector defaults in agent config.
- [ ] Cross-session recall verified: write in one MAF run, recall in a later run via `memory_search` / `memory_recall`.

## Out of scope

- Foundry-hosted MAF deployment and Foundry-managed memory stores
- Paid Microsoft connector breadth (MSIQ-05 covers only free/local registered sources)
- Replacing MemRoOS memory tiers with MAF in-process session history alone

## Related requirements

- **MSIQ-04** — self-hosted MAF adapter + this guide; no Foundry-hosted paid path in defaults or docs
- **MEMSEC** / **POLGOV** — labels, retrieval authorization, and policy receipts still apply on every memory use
