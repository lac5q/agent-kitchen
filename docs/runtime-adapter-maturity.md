# Runtime Adapter Maturity Matrix

This matrix records the honest maturity of every runtime target that `scripts/install-agent-integrations.sh` wires to MemroOS. Fleet diagrams should not treat all nine targets as equal. The maturity levels are:

- **T1** — shipped + smoke-tested + governance-hooked path available (pre-exec gate ready).
- **T2** — installed + partial contract (memory/MCP only, thin dispatch, or a dedicated transport without the full GSD adapter).
- **T3** — stub / install-only / unproven (only the installer entry exists; no dedicated adapter or specific tests).

## Matrix

| Runtime | Platform key | Maturity | Evidence | Owner | Notes |
|---|---|---|---|---|---|
| Hermes | `hermes` | **T1** | `apps/memroos/src/lib/gsd/adapters.ts` accepts `hermes`; `apps/memroos/src/app/api/gsd/adapter/route.ts` runs `runGsdAdapterSafetyCheck` before executing any action; `apps/memroos/src/lib/__tests__/gsd-phase136.test.ts` exercises `hermes`; `apps/memroos/src/lib/local-agent-runtime.ts` detects Hermes CLI processes; `apps/memroos/src/lib/agent-registry-seed.ts` accepts `hermes`; Paperclip ships built-in `hermes_local` and `hermes_gateway` adapters (`content/audits/paperclip-control-plane-audit-2026-07-08.md`). | memroos-platform | Governance-hooked GSD path is live; Paperclip provides a parallel runtime adapter. |
| OpenClaw | `openclaw` | **T2** | `apps/memroos/src/lib/dispatch/openclaw-adapter.ts` implements a file-drop envelope adapter with tests in `apps/memroos/src/lib/dispatch/__tests__/openclaw-adapter.test.ts`; `apps/memroos/src/lib/dispatch/adapter-factory.ts` selects it for `openclaw` and `opencode`; Paperclip ships `openclaw-gateway` (`content/audits/paperclip-control-plane-audit-2026-07-08.md`). Not listed in `GsdAdapterId` (`apps/memroos/src/lib/gsd/adapters.ts`), so there is no `claude_code`-style pre-exec GSD gate yet. | memroos-platform | Dedicated transport exists; needs a GSD adapter ID and safety gate to reach T1. |
| OpenCode | `opencode` | **T2** | Covered by `openclaw-adapter.ts` platform list (`platform: ["opencode", "openclaw"]`), so it inherits the file-drop dispatch path. Installer target exists (`scripts/install-agent-integrations.sh`). No dedicated GSD adapter ID (`GsdAdapterId` does not include `opencode`). | memroos-platform | Reuses the OpenClaw transport; GSD adapter contract is missing. |
| Claude Code | `claude` | **T2** | `GsdAdapterId` includes `claude_code` (`apps/memroos/src/lib/gsd/adapters.ts`); `apps/memroos/src/app/api/gsd/adapter/route.ts` enforces the safety gate for any allowed ID; `docs/integrations/claude-code.md` documents A2A and REST onboarding. No dedicated dispatch adapter (falls back to `hive-poll-adapter.ts`). No test exercises `claude_code` specifically. | memroos-platform | Memory/MCP contract is wired; thin dispatch and no runtime-specific tests keep it at T2. |
| Codex | `codex` | **T2** | `GsdAdapterId` includes `codex`; `apps/memroos/src/lib/__tests__/gsd-phase136.test.ts` exercises `codex` through `create_task`; safety gate is tested in the same file; `docs/integrations/claude-code.md` covers the REST reporting pattern. No dedicated dispatch adapter (falls back to `hive-poll-adapter.ts`). | memroos-platform | Generic GSD adapter is smoke-tested with the codex identity, but there is no Codex-specific transport or runtime integration. |
| Cursor | `cursor` | **T2** | `GsdAdapterId` includes `cursor`; `apps/memroos/src/app/api/gsd/adapter/route.ts` runs the safety gate for any allowed ID. No dedicated dispatch adapter (falls back to `hive-poll-adapter.ts`). No specific tests for `cursor`. | memroos-platform | GSD contract string is present; needs runtime-specific adapter and tests to reach T1. |
| Qwen | `qwen` | **T3** | Installer target exists (`scripts/install-agent-integrations.sh`); valid `AgentPlatform` (`apps/memroos/src/types/index.ts`); registry seed example exists (`agents.config.json`). No dedicated adapter, no GSD adapter ID, and no specific tests. | memroos-platform | Install-only; falls back to `hive-poll` if dispatched. |
| Gemini | `gemini` | **T3** | Installer target exists; valid `AgentPlatform`; registry seed example exists. A2A adapter lists `gemini` only because A2A routing is protocol-driven, not because there is a Gemini-specific adapter (`apps/memroos/src/lib/dispatch/a2a-adapter.ts`). No dedicated adapter, no GSD adapter ID, and no specific tests. | memroos-platform | Install-only; falls back to `hive-poll` or A2A if configured. |
| ZCode | `zcode` | **T3** | Installer target exists; valid `AgentPlatform`; registry seed example exists; `apps/memroos/src/lib/dispatch/__tests__/adapter-factory.test.ts` confirms `zcode` maps to `hive-poll`. No dedicated adapter, no GSD adapter ID, and no specific tests. | memroos-platform | Install-only; confirmed to fall back to `hive-poll`. |

## Rationale per target

- **Hermes (T1)** is the only target with both a MemroOS GSD adapter ID and a pre-execution safety gate (`runGsdAdapterSafetyCheck`), plus dedicated local-runtime detection, plus Paperclip's built-in `hermes_local` / `hermes_gateway` adapters. This is the most mature path.
- **OpenClaw (T2)** has a real, tested file-drop dispatch adapter and Paperclip `openclaw-gateway` evidence, but it does not yet participate in the `/api/gsd/adapter` pre-exec gate as a first-class adapter ID.
- **OpenCode (T2)** rides the same OpenClaw file-drop transport but lacks its own GSD contract, so it shares OpenClaw's T2 maturity with one extra hop of indirection.
- **Claude Code, Codex, Cursor (T2)** are recognized by the GSD adapter dispatcher and therefore benefit from the safety gate, but they have no dedicated transport adapter and no runtime-specific smoke tests. The GSD adapter code is generic; using it with a specific `adapterId` does not make that runtime's integration mature.
- **Qwen, Gemini, ZCode (T3)** are install targets only. They appear in the registry platform enum and have seeded example rows, but MemroOS has no dedicated adapter, no GSD adapter ID, and no specific tests for them. They fall back to the generic `hive-poll` adapter.

## Maturity drift check

The installer target list (`scripts/install-agent-integrations.sh`) and this matrix should be kept in sync. A lightweight check is:

```bash
# Count canonical TARGETS rows in the installer (excluding the dynamic OpenClaw loop)
grep -E '^\s*"[a-z]+\|' scripts/install-agent-integrations.sh

# Verify every base target appears in the matrix
for name in claude codex cursor gemini qwen zcode opencode hermes openclaw; do
  rg -i "^\| $name " docs/runtime-adapter-maturity.md || echo "MISSING: $name"
done
```

A CI note can be added to the Phase 143 verification step: after any installer edit, ensure the matrix row count and target names match the `TARGETS` array plus the OpenClaw workspace discovery logic.

## Next steps to move T2/T3 adapters to T1

1. **OpenClaw → T1**: add `openclaw` to `GsdAdapterId` in `apps/memroos/src/lib/gsd/adapters.ts`, extend `apps/memroos/src/app/api/gsd/adapter/route.ts` to route OpenClaw actions through the pre-exec safety gate, and add a GSD adapter test for `openclaw`.
2. **OpenCode → T1**: either add a dedicated `opencode` GSD adapter ID or formally merge OpenCode into the OpenClaw T1 path, documenting that OpenCode uses the OpenClaw transport.
3. **Claude Code / Codex / Cursor → T1**: add runtime-specific adapter modules (similar to `openclaw-adapter.ts`) or A2A-first onboarding, and add targeted GSD adapter tests for each identity.
4. **Qwen / Gemini / ZCode → T1/T2**: promote to T2 by adding a `GsdAdapterId` entry and at least one GSD adapter test; promote to T1 by adding a dedicated transport adapter or verified A2A path plus safety-gate coverage.
5. **Cross-cutting**: ensure every T1 adapter has a pre-execution policy gate that delegates to the existing POLGOV engine (per the Phase 145 reconciliation note in `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md`), rather than adding a second policy engine per adapter.

## Observe capture matrix (v8.16)


*Updated: 2026-08-04 (Phase 192: SELFCAP-03 hook capability matrix + drift gate).*

*Mirrors `apps/memroos/src/lib/observe-sidecar.ts` `OBSERVE_HARNESS_PATHS` exactly.
The drift-check script `scripts/check-observe-maturity-drift.mjs` keeps this table,
the catalog, and the installer `TARGETS` rows in sync (exit code `1` on drift).*

| Harness | Wave | Platform key | Hook support | Installed hooks | Capture method | Fallback | Status |
|---------|------|--------------|--------------|-----------------|----------------|----------|--------|
| Claude | 1 | `claude` | `native` | `memory-brief` + `capture-gate` | jsonl `~/.claude/projects` | `skill+sidecar` | supported (`jsonl` + native hooks) |
| Codex | 1 | `codex` | `portable` | `memory-brief` + `capture-gate` | jsonl `~/.codex/sessions` | `skill+sidecar` | supported (`jsonl` + portable hooks) |
| Hermes | 1 | `hermes` | `plugin` | `memory-brief` + `capture-gate` | plugin + jsonl at `~/.hermes/sessions` | `skill+sidecar` | supported (`plugin`) |
| OpenClaw | 1 | `openclaw` | `none` | `none` | jsonl under `~/.openclaw/sessions` (also inherits Hermes-family `~/.hermes/sessions`) | `skill+sidecar` | supported (`jsonl`), no lifecycle hook claim |
| Pi | 1 | `pi` | `none` | `none` | jsonl `~/.pi/agent/sessions` | `skill+sidecar` | supported (`jsonl`, first-class), no lifecycle hook claim |
| Cursor | 2 | `cursor` | `none` | `none` | MCP `mcp.json` only; vendor transcripts at `~/.cursor/projects/<id>/agent-transcripts/<session>/<session>.jsonl` exist but use a non-standard `<timestamp>/<user_query>` schema — stay on MCP | `skill+sidecar` | partial (`mcp-partial`), no lifecycle hook claim |
| Factory/Droid | 2 | `factory` / `droid` | `none` | `none` | MCP `~/.factory/mcp.json` + JSONL fallback at `~/.factory/sessions/-<cwd-dir>/<session-uuid>.jsonl` (maps `platform=droid`) | `skill+sidecar` | partial (`hooks+jsonl` capture maturity), no lifecycle hook claim |
| Antigravity | 3 | `antigravity` | `none` | `none` | no CLI/JSONL/MCP surface verified; catalog keeps the row so the health endpoint can honestly report `no path` instead of faking coverage | `skill+sidecar` | limited, no lifecycle hook claim |

### Installer `TARGETS` sync targets (Phases 169–171)

`scripts/install-agent-integrations.sh` lists every observe harness (except `factory`,
which is covered by the `droid` install target) in `TARGETS`:

- Wave 1: `claude`, `codex`, `hermes`, `openclaw`, `pi` — first-class `jsonl` / `plugin`
  paths.
- Wave 2: `cursor` (`cursor-json` MCP block), `droid` (`factory-json` MCP block;
  corresponds to the `factory` observe row and `platform=droid` registry key).
- Wave 3: `antigravity` (`none` MCP style — emits a clear honest signal during
  `install` / `check` / `uninstall`; no AGENTS.md or skill file is written).

### Phase 170–171 invariants (matches `observe-sidecar.ts`)

- Wave 1 Pi stays first-class; no demotion. `OBSERVE_HARNESS_PATHS` keeps `pi`
  alongside `claude` / `codex` / `hermes` / `openclaw`.
- Wave 2 Cursor keeps `mcp-partial` until the vendor transcript schema stabilizes;
  the catalog `notes` documents the vendor export path so it is not lost.
- Wave 2 Factory/Droid retains `hooks+jsonl` as a capture maturity label, but its
  lifecycle `hookSupport` is `none` until a reproducible official hook surface is
  found. The catalog row's `notes` string contains the literal `droid` so it ties
  back to `CodingAgentRuntime.droid`.
- Wave 3 Antigravity has empty `sessionRoots` and an explicit
  `no capture path; verify-by-design` notes string. No false full-capture claim.
- `install-agent-integrations.sh` lists Antigravity in `TARGETS` with a `none`
  MCP style that emits a clear honest signal during `install` / `check` /
  `uninstall` (no files are written for Antigravity).

### Operator visibility — Phase 171 (OBSERVE-14)

`GET /api/observe/health` now reads canonical `notes` from the catalog so docs
and the response stay in lock-step. Per-harness rows expose:

- `harness`, `wave`, `maturity` — straight from the catalog.
- `lastCaptureAt` — `MAX(captured_at)` for `runtime` rows in
  `agent_session_captures`.
- `captureCount` — `COUNT(*)` for `runtime` rows in `agent_session_captures`.
- `depthSetting` — `MEMROOS_CAPTURE_DEPTH` (`summary` / `relevant` / `full`),
  defaulting to `relevant`.
- `errorCount` — `COUNT(*)` of `agent_session_captures` rows for this runtime
  whose `status='failed'` (the existing `status` CHECK enum already covers
  `failed`). Wave 1–2 harnesses that have never failed report `0`; Antigravity
  reports `0` by construction (no capture rows possible).
- `errorRate` — kept `null` for now; computed when we have enough failed rows
  to make the percentage meaningful. Catalog row is the source of truth for
  honest messaging instead of error-rate arithmetic.
- `agentsByHarness` — `COUNT(*)` of `registered_agents` rows whose `platform`
  matches the harness's runtime name (case-insensitive). Droid maps to
  `platform=droid`; everything else maps to `platform=<harness>`. This is the
  operator visibility "who is onboarded" count that the Wave-1 smoke proves
  end-to-end.
- `sidecarHeartbeatAt`, `sidecarHealth`, and `sidecarWarning` — the
  `observe-sidecar` cron-health heartbeat. A stale or failed heartbeat is also
  eligible for the existing NOC Attention feed; liveness is not inferred from
  a launchd/systemd process alone.

### Drift-check automation (OBSERVE-13)

Run `scripts/check-observe-maturity-drift.mjs` (or `npm run check:observe-maturity-drift`
from `apps/memroos`) to verify the catalog, matrix, and installer `TARGETS`
agree on harness names and that every lifecycle-hook claim has backing in the
installer and Hermes plugin. The check is also wired into CI alongside
`check:future-spikes`. Exit code `1` on drift — fix the catalog row, the matrix
row, or the installer `TARGETS` row before merging.
