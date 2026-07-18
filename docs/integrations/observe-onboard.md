# Observe Onboard + Sidecar

- **Document version:** 2026-07-18.1
- **Creation date/time (UTC):** 2026-07-18T07:15:00Z
- **Update date/time (UTC):** 2026-07-18T07:15:00Z
- **Sources:** `.planning/ROADMAP.md` § v8.16 Phases 168–169, `scripts/install-agent-integrations.sh`, `scripts/run-observe-sidecar.mjs`

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
4. Confirm Pi is included in TARGETS (`~/.pi/...`) along with Claude/Codex/Cursor/Factory/Hermes.
5. Uninstall / key revoke: `bash scripts/install-agent-integrations.sh --uninstall` and rotate the key in the console.

MCP alone is not a wiretap — pair with the observe sidecar for autonomous capture.

## Observe sidecar (Wave 1)

```bash
node scripts/run-observe-sidecar.mjs --dry-run
MEMROOS_BASE_URL=https://memroos.epiloguecapital.com \
MEMROOS_OPERATOR_API_KEY=... \
node scripts/run-observe-sidecar.mjs
```

Wave 1 paths: Claude, Codex, Hermes, OpenClaw, **Pi** (`~/.pi/agent/sessions/**/*.jsonl`).
Default capture depth: `relevant` (`MEMROOS_CAPTURE_DEPTH`).

## Notes

- Phase 170/171 (Cursor/Factory hooks, Antigravity limits, NOC visibility) remain follow-on.
- Ask before production cutover or destructive host actions (v8.15).
