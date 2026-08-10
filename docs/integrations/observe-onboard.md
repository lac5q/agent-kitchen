# Observe Onboard + Sidecar

- **Document version:** 2026-07-18.2
- **Creation date/time (UTC):** 2026-07-18T07:15:00Z
- **Update date/time (UTC):** 2026-07-18T16:30:00Z (Phase 170 hardening OBSERVE-10/11/12)
- **Sources:** `.planning/ROADMAP.md` § v8.16 Phases 168–170, `apps/memroos/src/lib/observe-sidecar.ts`, `scripts/install-agent-integrations.sh`, `scripts/run-observe-sidecar.mjs`

## Employee onboard (≤5 minutes)

1. Get a scoped MemRoOS agent/operator API key from the operator console.
2. Set remote brain URL:
   ```bash
   export MEMROOS_OPERATOR_URL=https://memroos.epiloguecapital.com
   ```
3. From a MemRoOS checkout (or after downloading the installer scripts):
   ```bash
   bash scripts/install-agent-integrations.sh
   ```
4. Confirm Pi is included in TARGETS (`~/.pi/agent/...`) along with Claude/Codex/Cursor/Factory/Hermes. When `pi-mcp-adapter` is installed (`pi install npm:pi-mcp-adapter`), the installer writes the MemroOS stdio entry into the adapter's shared `~/.config/mcp/mcp.json` without replacing other servers. Plain Pi installations remain instructions/skills only and report that no adapter surface is available. Antigravity also appears in `TARGETS` but the install path is a `none` MCP-style no-op: the installer prints a clear `no installer surface; observe via MCP only (verify-by-design)` warning instead of fabricating an installer.
5. Uninstall / key revoke: `bash scripts/install-agent-integrations.sh --uninstall` and rotate the key in the console.

MCP alone is not a wiretap — pair with the observe sidecar for autonomous capture.

## Observe sidecar (Wave 1..2)

```bash
node scripts/run-observe-sidecar.mjs --dry-run
MEMROOS_BASE_URL=https://memroos.epiloguecapital.com \
MEMROOS_OPERATOR_API_KEY=... \
node scripts/run-observe-sidecar.mjs
```

Wave 1 paths: Claude, Codex, Hermes, OpenClaw, **Pi** (`~/.pi/agent/sessions/**/*.jsonl`).
Wave 2 paths (with `MEMROOS_OBSERVE_WAVE=2`): Cursor (`mcp-partial`, MCP only) and Factory/Droid (`hooks+jsonl`, MCP + `~/.factory/sessions/**/*.jsonl`).
Antigravity is documented in the catalog but resolves no roots by design (no capture path verified).
Default capture depth: `relevant` (`MEMROOS_CAPTURE_DEPTH`).

## Notes

- **Phase 170 (OBSERVE-10/11/12) hardening shipped**: Wave 2/3 catalog rows now carry explicit `notes` strings in `apps/memroos/src/lib/observe-sidecar.ts`. Cursor stays `mcp-partial` (vendor exports exist inside `~/.cursor/projects/*/agent-transcripts/` but their shape is non-standard); Factory/Droid promotes to `hooks+jsonl` with a real JSONL fallback at `~/.factory/sessions/-<cwd-dir>/<session-uuid>.jsonl` plus the MCP server config; Antigravity remains `limited` with an honest `no capture path; verify-by-design` note.
- **Installer Antigravity TARGETS row**: `scripts/install-agent-integrations.sh` lists `antigravity` with the `none` MCP style. `install` / `check` / `uninstall` all print the honest signal and never write `AGENTS.md` or a skill for Antigravity, so the entry cannot collide with a future Antigravity install.
- Pi remains Wave-1 first-class. The Wave-1 rows in `OBSERVE_HARNESS_PATHS` are byte-identical to Phase 169 except for the new (optional) `notes` field; behavior of `resolveObserveRoots` at `wave=1` is unchanged.
- Ask before production cutover or destructive host actions (v8.15).
