## Validation Report phase-192

- Commands + exit codes; Tests passed/total; typecheck/lint
  - `MEMROOS_VAULT_ROOT=$(mktemp -d) npm test -- --run` — exit 0; **3,765/3,798 passed** (33 skipped), 444 test files passed and 1 skipped.
  - Targeted route/observe suite — exit 0; **51/51 passed**.
  - Session-hook, extraction-v2, and maturity-drift Node tests — exit 0; **22/22 passed**.
  - `npm run typecheck` — exit 0.
  - `npm run lint --workspace apps/memroos` — exit 0; 0 errors, existing warnings only. Scoped lint also exited 0.
  - `npm run check:route-auth-boundary` — exit 0.
  - `npm run check:observe-maturity-drift` — exit 0.
  - `bash -n` all added shell hooks/installers and `node --check` all added JS modules — exit 0.
  - Installer isolated-home install/check/uninstall smoke — exit 0.

- Hook set: files shipped, install path, and the exact fail-open/bounded-timeout behavior
  - Shipped `scripts/hooks/memroos-memory-brief.sh`, `memroos-capture-gate.sh`, `memroos-hook-common.sh`, and `memroos-hook-utils.mjs`, plus `scripts/observe-session-extraction.mjs`.
  - `scripts/install-agent-integrations.sh` copies them to `$HOME/.memroos/hooks` and installs native Claude hooks in `$HOME/.claude/settings.json`, portable Codex hooks in `$HOME/.codex/hooks.json`, and the Hermes plugin in `$HOME/.hermes/plugins/memory/memroos`.
  - `memory-brief`: prior-work POST uses `curl --max-time 1.5`; stdout is only the <=600-token pointer digest. Timeout, malformed payload, or bad response writes a typed miss receipt and exits 0, so session start proceeds.
  - `capture-gate`: structured capture POST uses `curl --max-time 3.5`; typed skip/capture/failure receipts are written to `$HOME/.memroos/hook-receipts/session-hooks.jsonl`. Failure exits 0, records `observe-capture-gate` cron health with NOC metadata when the server is reached, and attempts the existing NOC cron-health endpoint with the operator key. No hook path blocks the session.

- Harness matrix: per-harness claim and what backs it
  - Claude — `native`; `SessionStart`, `Stop`, and `PreCompact` entries are upserted into `~/.claude/settings.json`.
  - Codex — `portable`; the same lifecycle entries are upserted into `~/.codex/hooks.json`.
  - Hermes — `plugin`; `plugin.yaml` declares lifecycle hooks and the provider delegates to the shared fail-open scripts.
  - OpenClaw, Pi, Cursor, Factory/Droid, Antigravity — `none`; no lifecycle hook claim, with explicit `skill+sidecar` fallback. Factory retains `hooks+jsonl` only as capture maturity, not lifecycle-hook coverage.
  - `scripts/check-observe-maturity-drift.mjs` now rejects unsupported claims, matrix/catalog capability disagreement, missing hook pairs, and missing installer/plugin backing.

- SELFCAP-01..05 item-by-item: met / partial (what remains) / not met
  - SELFCAP-01 — **met**: agent-key authentication is scoped to the authenticated agent ID and registered runtime, rate-limited per agent identity, and forced from `full` to server-side `relevant`; the operator-key sidecar path remains available for vault/full capture.
  - SELFCAP-02 — **met**: Claude/Codex/Hermes hook set, <=600-token brief, typed receipts, bounded timeouts, fail-open behavior, and NOC Attention health receipt are implemented and tested.
  - SELFCAP-03 — **met**: capability matrix is tracked in the repo and drift-gated; unsupported harnesses explicitly say `none` rather than claiming coverage.
  - SELFCAP-04 — **met**: deterministic-first extraction v2 populates decisions, outcomes/verification, errors, commands, files, entities, events, and redacted summaries for sidecar and hook captures. No LLM is needed for structured fields.
  - SELFCAP-05 — **met**: installer ships launchd, systemd-user, and cron-template schedules through `scripts/install-observe-sidecar-schedule.sh`; the sidecar posts an `observe-sidecar` heartbeat to cron health, surfaced as `sidecarHeartbeatAt`, `sidecarHealth`, and `sidecarWarning` in observe health. Live activation was not run against the operator’s real home; the isolated cron-template install/check was verified.

- Diff stats; unrelated files: yes/no
  - **No unrelated files.** 14 tracked implementation files modified; 14 new implementation files added, plus this report. Tracked diff: **+959 / -134**; all untracked files currently add 1,024 lines including the report. No commit was created.

- Escalations
  - None. No schema change was needed, and the capability matrix records explicit fallbacks for harnesses without verified lifecycle hooks.
