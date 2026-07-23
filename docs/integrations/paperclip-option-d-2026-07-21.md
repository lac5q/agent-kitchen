# Paperclip / MemroOS Memory Integration — Option D Opinion

> **Status:** Architectural decision recorded 2026-07-21. Citable from
> `.planning/ROADMAP.md` v8.22 / Phase 178 and `docs/integrations/paperclip.md`
> "Memory Path (FLEET-2x)" §4.
>
> **Author:** Opus 4.8 (frontier architect), invoked through `~/.local/bin/claude-pro`
> on host `maeve-u1` (lac5q), 2026-07-21. The decision was reached end-to-end
> in a single Opus session after the API OAuth pool for Claude was exhausted
> and routing shifted to the `claude -p` (claude.ai Pro subscription) lane.
>
> **Scope:** How MemroOS memory should plug into Paperclip-orchestrated agents
> so that (a) Paperclip heartbeats can hydrate their agents with MemroOS
> context, (b) Paperclip-orchestrated agents can write back to MemroOS during a
> run, and (c) MemroOS remains a standalone MCP product, not a Paperclip
> feature.

## TL;DR

Pick **Option D**: MemroOS integrates at exactly two Paperclip *core* seams —
the planned memory-provider plugin for **push** (pre-run hydrate writes the
context pack into the per-run `instructionsFilePath`) and the existing
tool-connection MCP gateway for **pull** (MemroOS registers as one
`toolConnections` row). **Zero Paperclip adapters gain a single line of
MemroOS-aware code.** Paperclip becomes one consumer of MemroOS, not the gate.

## The four options

| | Where MemroOS plugs in | Adapters touched | Coupling |
|---|---|---|---|
| **A** — Provider in Paperclip core | Paperclip's planned `MemoryAdapter` plugin | 0 (Paperclip core translates per-adapter) | MemroOS reachable only via Paperclip heartbeats |
| **B** — Inside each adapter | Each of ~11 adapters | 11 | N-way coupling on every MemroOS breaking change |
| **C** — Both A and B | Paperclip core + each adapter | 11 + Paperclip | Worst of both |
| **D** — Two Paperclip core seams | Paperclip's `instructionsFilePath` resolver + `toolConnections` MCP gateway | 0 (push uses an adapter-agnostic core seam; pull is one MCP row) | MemroOS ships one MCP server + one `MemoryAdapter`; Paperclip ships two core seams |

## Decision: D

The framing of A vs B vs C assumed that harness-native injection had to be
built per adapter. It does not. Two pre-existing Paperclip seams cover it.

### The load-bearing finding

`AdapterExecutionContext.runtimeMcp` (`paperclip/packages/adapter-utils/src/types.ts:171`)
already hands every adapter a set of Paperclip-managed MCP servers. Paperclip
core builds that set in `buildPaperclipRuntimeMcpServers`
(`paperclip/server/src/services/heartbeat.ts:2135`), gated by per-agent
tool-access profiles and `toolConnections` rows of transport `remote_http`,
minting a per-run gateway token scoped by
`toolMcpGatewayTokens.subjectId = runId` (`heartbeat.ts:~2129`). Adapters
that consume it:

- `claude-local` — writes `mcp-config.json` and passes
  `--mcp-config … --strict-mcp-config`
  (`packages/adapters/claude-local/src/server/execute.ts:506, 843-844`).
- `codex-local` — consumes it through the shared ACP engine
  (`packages/adapter-utils/src/acpx-engine/execute.ts:1023`).

**MemroOS becomes one `toolConnections` row.** Every adapter that wires
`ctx.runtimeMcp` gets MemroOS natively, forever, for free.

Be honest about the current state: **only 2 of 11 adapters read `runtimeMcp`.**
The other nine (cursor-local, gemini-local, grok-local, opencode-local,
pi-local, hermes, hermes-gateway, openclaw-gateway, cursor-cloud) ignore it.
That is a Paperclip core/adapter gap that exists today and is on Paperclip's
roadmap regardless of memory. **Do not let MemroOS pay for it.**

### The second seam: `instructionsFilePath`

The universal floor for push is `instructionsFilePath`. It is present in all
nine `src/server/execute.ts` files, resolved once in core at
`heartbeat.ts:3630`, and honored uniformly:

- CLI harnesses (`claude-local`, `codex-local`, `opencode-local`,
  `gemini-local`, `grok-local`, `pi-local`) — read via
  `--append-system-prompt-file` (`claude execute.ts:841`).
- Cloud harnesses (`cursor-cloud`) — read by the cloud adapter wrapper.
- Gateway harnesses (`hermes`, `hermes-gateway`, `openclaw-gateway`) —
  honored by the agent-card / A2A envelope.

Make MemroOS's `pre_run_hydrate` write the context pack into a **per-run
generated** instructions file at that same resolution point. One core change,
all eleven adapters, all three delivery shapes. The MCP path is then a strict
*upgrade* for harnesses that can pull, not a requirement. Gateway agents do
not need it anyway — MemroOS already reaches Hermes over A2A directly.

## Six-dimension analysis

### (a) Phase 146 ownership contract — clean, with one real collision

The Phase 146 boundary rule ("Paperclip does not own cross-runtime fleet,
memory, or governance") is preserved — storage ownership does not shift. But
there is a collision the docs currently paper over:

- The `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` plan
  claims Paperclip owns *"who is allowed to call a memory operation"*
  (plan §4, ~line 64).
- Phase 146 assigns policy gate and audit chain to MemroOS.

Resolve explicitly as **two tiers**:

| Tier | Owner | Example |
|---|---|---|
| Binding access | Paperclip | Which agent may call which provider at all |
| Record content | MemroOS | Permission-aware pack assembly, redaction, retention |

MemroOS's answer wins on **what's in the bundle**. Write this clause into
`memroos/docs/integrations/paperclip.md` as a new "Memory Path (FLEET-2x)"
§4 next to the existing FLEET-18 / FLEET-19 sections. (This is
**MEMCLIP-01** in v8.22 / Phase 178.)

### (b) The 2026-03-17 plan — honored, not superseded

MemroOS is precisely the *"one hosted adapter example"* called out in the
2026-03-17 plan's Rollout Phase 3. No rewrite. Two small amendments:

1. Add `providerNativeToolSurface?: boolean` to `MemoryAdapterCapabilities`
   (~plan line 178). Lets Paperclip slim the hydrate payload when the
   harness can pull (avoids pushing the same context twice).
2. Add a provenance stamp to `MemoryContextBundle` (~plan line 303) that
   records *"this provider's own permission filter shaped this bundle."*
   Cheap to add, makes audit chains legible.

These amendments land in the Paperclip repo separately if accepted. They are
not a v8.22 gate.

### (c) Three delivery shapes — universal floor covers all

CLI harnesses, cloud harnesses, and gateway harnesses all share the
`instructionsFilePath` seam for push. For pull, the `runtimeMcp` seam works
for any harness that supports MCP — currently CLI and gateway. Cloud
harnesses (cursor-cloud) get push-only initially and pull when their MCP
support ships.

The N-way fan-out that Option B would have forced is **Paperclip core's
already-solved problem**, not MemroOS's. MemroOS ships one MCP server and
one `MemoryAdapter`; Paperclip's core handles the rest.

### (d) "Don't rent away the memory layer" — D preserves the pitch

Under pure A, MemroOS is only reachable while a Paperclip heartbeat is
running. A Claude Code session you start by hand in a terminal — or any
agent running outside Paperclip — gets nothing. MemroOS becomes a Paperclip
feature, not a product.

Under D, the same MemroOS MCP server is simultaneously:

- A Paperclip `toolConnections` row (one consumer).
- A plain MCP endpoint any harness can point at, as
  `~/.cursor/projects/mcps/memroos` already does today.

Paperclip becomes one customer of MemroOS. The product pitch — *"use
Claude Code, Codex, ADK, LangGraph, A2A, REST, or local workers without
renting away the memory layer that makes them useful"* — stays intact.

### (e) Coupling — asymmetry in MemroOS's favor

Two versioned contracts, **both authored by MemroOS**:

1. The MCP tool schema.
2. The `MemoryAdapter` interface
   (`paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` lines
   326-342).

Failure modes:

| Event | What breaks under D | What breaks under B |
|---|---|---|
| MemroOS ships breaking change | The Paperclip plugin breaks; one package to fix | All 11 adapters break |
| Paperclip ships breaking change in `AdapterExecutionContext` | 11 adapters break (already true today, unchanged) | 11 adapters break, AND MemroOS's per-adapter code breaks |
| New harness adapter added | Inherits push free; inherits pull when it wires `runtimeMcp`; MemroOS ships nothing | Requires an N+1-th MemroOS-aware adapter implementation |

The asymmetry is the whole argument. Under D, MemroOS's breaking-change blast
radius is one package. Under B, every breaking change is an 11-way fix.

### (f) Memory provenance — clean push, salvageable pull

Push path is clean. `MemorySourceRef` (plan ~lines 198-214) carries
`{companyId, agentId, runId, …}` end-to-end because the Paperclip core is
the writer.

Pull path is the leak: an MCP `memory.note` from Claude arrives at MemroOS
carrying only a gateway token. Salvageable, because that token is already
run-scoped via `toolMcpGatewayTokens.subjectId`. MemroOS resolves the token
to `{companyId, agentId, runId}` for audit provenance — see the sharpest
risk below.

## Sharpest risk: split-brain provenance and double-capture

**The scenario.** One run hydrates via the `instructionsFilePath` hook
*and* the harness calls `memory.note` over MCP during the run. You get two
records with divergent lineage, Paperclip's `memory_operations` disagrees
with MemroOS `audit_entries`, and downstream recall degrades.

**Mitigation, concretely:**

1. **Contract clause** in `memroos/docs/integrations/paperclip.md`, new
   *"Memory Path (FLEET-2x)"* §4: every MemroOS write originating from a
   Paperclip-issued gateway token MUST
   - resolve that token to `{companyId, agentId, runId}`, and
   - be idempotent on `(run_id, content_hash)`.
2. **Paperclip side:** expose token→run-scope introspection on the tool
   gateway. The `subjectId` field already exists
   (`heartbeat.ts:~2129`); making it readable by MemroOS's MCP callee is the
   change.
3. **Test:** an integration test asserting a run that both hydrates via
   hook and writes via MCP yields **exactly one** MemroOS record and
   **two linked** `memory_operations` rows. Place it next to
   `packages/adapter-utils/src/mcp-isolation.integration.test.ts`, which
   already stands up the gateway harness via
   `test-support/mcp-isolation-harness.ts`.

(Mitigations 2 and 3 are **MEMCLIP-03** and **MEMCLIP-04** in v8.22 /
Phase 178.)

## What would flip the recommendation

- **Collapse to plain A and stop** if `runtimeMcp` stays stuck at 2 of 11
  adapters AND your actual fleet runs on `hermes-gateway` and `cursor-cloud`.
  In that case the pull half is vapor — push only via `instructionsFilePath`
  is sufficient and Option A's cheaper shape wins.
- **Flip toward B for the top two harnesses only** if the MemroOS context
  pack turns out to require harness-native constructs that no file or MCP
  server can express — skills-catalog materialization, subagent
  definitions, per-harness hooks. **Check that before you build:** if the
  pack is text plus tools, D holds.

## Source transcript

Full Opus 4.8 output (≈3,000 tokens of analysis) was captured in
`/tmp/memroos-paperclip-opinion-prompt.txt` (the prompt) plus the
`claude -p` stdout returned to this pi session on 2026-07-21. The opinion
above is the structured form of that response; the raw text is the
canonical source if any specific claim is disputed.

## File:line citations (for the load-bearing claims)

| Claim | Source |
|---|---|
| `runtimeMcp` is on `AdapterExecutionContext` | `paperclip/packages/adapter-utils/src/types.ts:171` |
| `buildPaperclipRuntimeMcpServers` builds the set | `paperclip/server/src/services/heartbeat.ts:2135` |
| Per-run gateway token is run-scoped | `paperclip/server/src/services/heartbeat.ts:~2129` (`toolMcpGatewayTokens.subjectId = runId`) |
| `claude-local` consumes `runtimeMcp` | `paperclip/packages/adapters/claude-local/src/server/execute.ts:506, 843-844` |
| `codex-local` consumes `runtimeMcp` | `paperclip/packages/adapter-utils/src/acpx-engine/execute.ts:1023` |
| `instructionsFilePath` resolved in core | `paperclip/server/src/services/heartbeat.ts:3630` |
| `claude-local` honors `instructionsFilePath` | `paperclip/packages/adapters/claude-local/src/server/execute.ts:841` (`--append-system-prompt-file`) |
| Memory plan's "who is allowed" claim | `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` §4, ~line 64 |
| Memory plan's `MemoryAdapterCapabilities` | `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` ~line 178 |
| Memory plan's `MemoryContextBundle` | `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` ~line 303 |
| Memory plan's `MemoryAdapter` interface | `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` lines 326-342 |
| Memory plan's `MemorySourceRef` shape | `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` ~lines 198-214 |
| Integration contract to extend | `memroos/docs/integrations/paperclip.md` (Phase 146, FLEET-17..21) |
| Phase 146 ownership table | `memroos/docs/integrations/paperclip.md` "Ownership Split" |
| Existing integration test scaffold | `paperclip/packages/adapter-utils/src/mcp-isolation.integration.test.ts` + `test-support/mcp-isolation-harness.ts` |