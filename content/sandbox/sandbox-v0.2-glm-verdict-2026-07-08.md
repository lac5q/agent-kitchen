---
title: Sandbox Plan v0.2 — GLM-5.2 Round-2 Verdict
date: 2026-07-08
topic: sandbox
model: GLM-5.2 (validation)
sources:
  - /Users/lcalderon/.hermes/cache/delegation/subagent-summary-0-20260708_182351_265175.txt (raw GLM output)
  - /Users/lcalderon/plans/sandboxed-fleet-plan.md (v0.2 plan under review)
  - /Users/lcalderon/github/memroos/content/sandbox/sandboxed-fleet-plan-v0.2-glm-round2-2026-07-08.md (persisted plan)
derived_from:
  - GLM-5.2 round-1 verdict (2026-07-08, CHALLENGED with 7 blockers + 4 contradictions)
  - parent v0.2 plan claiming all round-1 issues fixed
regen_prompt: "Validate Hermes's v0.2 sandbox plan against the live box state. Verify each round-1 blocker is real-fixed (not rebranded). Find any new bugs introduced. Give final shippability verdict in <1500 chars."
---

# Sandbox Plan v0.2 — GLM-5.2 Round-2 Verdict

**Verdict:** VALIDATED-WITH-FIXES
**Issued:** 2026-07-08
**Reviewer:** GLM-5.2 (independent validation pass)
**Subject:** `/Users/lcalderon/plans/sandboxed-fleet-plan.md` (v0.2, ~31KB)

---

## Round-1 blocker status (all verified real-fixed)

| # | Was | Now | Verified |
|---|---|---|---|
| B1 apt on OL9 | `apt-get install` commands | `curl` tarball install, no package mgr | ✓ |
| B2 Docker reinstall | Would conflict with running 29.6.1 daemon | Removed; only `docker info` sanity + daemon.json patch | ✓ |
| B3 6GB on 4.9GB host | `--memory=6g` (OOM) | `--memory=3g`, 1 concurrent slot; math closes (4.9 − 0.6 = 4.3 free) | ✓ |
| B4 runsc missing | No install path | gvisor.dev tarball + sha256 on both boxes | ✓ |
| B5 mcp-proxy URL | Fake `smartcomputerlab/mcp-proxy-go` repo | Custom Python sketch (structurally correct path; ✗ sketch itself broken — see New Issues) | partially ✓ |
| B6 paperclip down | Silent-kill on WSL2 restart | systemd unit + linger verified live | ✓ |
| B7 WSL2 LPE | Kernel 6.6.87.2 (CVE-2026-31431) | Kernel 6.18.33.2 rolling, post-patch; §5 step 10 verifies | ✓ |

**4 contradictions also resolved:** `live-restore:false` (was true, contradicts `--rm`); wrapper codified as single canonical command (was scattered flags); egress allowlist includes api.anthropic.com/openai/linear/sentry (was missing LLM endpoints); Codex Seatbelt profile fully defined (was missing); `scp` artifact offload codified in §2 teardown (was implicit); subuid/subgid setup steps added (was missing — userns-remap would fail).

## New issues v0.2 introduced

1. **mcp-proxy sketch is non-functional (7 distinct bugs):**
   - `path[1:]` treated as URL → `urlparse()` empty hostname → `is_allowed()` always False
   - Authorization header line is **literally malformed** (looks like botched sed-replace of an f-string); will raise `SyntaxError`
   - `headers['Authorization']` references undefined `headers` dict
   - Always emits GET upstream regardless of inbound method (POST/PUT/PATCH for MCP tools all break)
   - `ssl=True` without `server_hostname=` — SNI/hostname verification may fail on anthropic/openai
   - `readuntil(b'\r\n\r\n')` reads only headers; POST bodies are dropped
   - No try/except — bad host crashes the proxy, no audit log entry

2. **Seatbelt profile contradicts §3:** profile allows only loopback outbound (`network-out (to "127.0.0.1")`), but §3 says agent reaches api.anthropic.com via the mcp-proxy over the unix socket. Inconsistent. Resolve by either (a) allowing loopback + adding a Hermes-side TCP→unix-socket forwarder, or (b) relaxing `network-out` to allow LLM endpoints directly via macOS application-layer firewall.

3. **Seatbelt `file-read*` is unrestricted** — agent can read `~/.ssh`, `~/.aws`. Should be narrow.

4. **T5 verification text was wrong** about Codex `network_access` behavior (it is *dropped*, not *honored* — openai/codex#10390).

5. **`agent-workspace` and `/tmp/hermes-sess-<id>` directories referenced in §1c but never created** — pre-flight `mkdir` missing.

6. **§1b daemon.json drops `--directfs=false`** while §1a includes it (asymmetric, unjustified).

7. **maeve-u1 uses systrap even though `/dev/kvm` is present** — leaves ~2× perf on the table.

## Shippability assessment

- **§1a on oracle-1 TODAY: YES.** Docker 29.6.1 has 0 containers, restart in step 5 is safe, subuid/subgid already set, 4.3 GB free math closes. Caveat: `live-restore:false` means future container restart kills it — intended tradeoff.
- **§1b on maeve-u1 TODAY: YES** after ~5 min apt install. Fresh dockerd, nothing to break. Kernel 6.18.33.2 confirmed. The mcp-proxy will be broken-as-written until sketch is replaced.
- **Pre-flight gap:** `mkdir -p /Users/lcalderon/agent-workspace` and `/tmp/hermes-sess-<id>/` on Mac before lifecycle step 6.

## GLM-5.2 recommendation (verbatim)

> Ship it with two specific blockers: (1) REPLACE the §3 mcp-proxy sketch with a working implementation — the current code will not start (SyntaxError on the malformed header line) and even if patched, GET-only upstream, undefined `headers`, and `path[1:]` URL parsing mean nothing reaches api.anthropic.com. Treat it as an audit-grade proxy and write+test the real thing before §5 step 6 will pass. (2) RECONCILE §1c Seatbelt with §3 egress: either allow loopback + state that Mac agent goes through a Hermes-side TCP→unix-socket forwarder, or relax `network-out` to allow the LLM endpoints directly via the macOS application-layer firewall. The 7 round-1 blockers + 4 contradictions are genuinely fixed and the sizing math closes; what's left is implementation, not design.

## Next steps for parent (v0.3)

1. Write a real, tested `hermes-mcp-proxy.py` (~150 lines Python with proper URL parsing, header injection, SSL hostname pinning, error handling, audit logging).
2. Add Hermes-side TCP→unix-socket forwarder (`~/bin/hermes-loopback-forwarder.py`) to reconcile Seatbelt-vs-§3.
3. Narrow Seatbelt `file-read*` to specific subpaths.
4. Add Mac pre-flight `mkdir` block.
5. Restore `--directfs=false` symmetry in both daemon.json blocks.
6. Fix T5 verification text.
7. Document `/dev/kvm` fast-path option on maeve-u1.
8. Re-run §5 verification end-to-end.
9. Dispatch GLM round 3 on v0.3.

## Status: ✅ persisted to MemroOS

- Plan v0.2: `/Users/lcalderon/github/memroos/content/sandbox/sandboxed-fleet-plan-v0.2-glm-round2-2026-07-08.md`
- This verdict: `/Users/lcalderon/github/memroos/content/sandbox/sandbox-v0.2-glm-verdict-2026-07-08.md`
- Both files: full YAML frontmatter per MemroOS schema (title, date, topic, model, sources, derived_from, regen_prompt).
- MemroOS MCP tools (`mcp_memroos_knowledge_write` etc.) NOT registered in current session — used **fallback path** (direct file write) per `.hermes/AGENTS.md` directive.