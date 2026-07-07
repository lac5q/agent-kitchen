---
title: BrowserOS Pilot Phase 1.3 — A/B Inconclusive, BrowserOS MCP Layer Broken
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/metrics/2026-07-06.jsonl
  - commit: 4067f71
  - subagent_run: 20260706T225949Z
status: inconclusive-pilot-stop
tags: [browseros, pilot, rca, mcp, agent-browser]
---

# BrowserOS Pilot Phase 1.3 — A/B Result + Root Cause

## TL;DR

Pilot A/B ran end-to-end. **Verdict: FAIL** by Gate 4 (BrowserOS errors=1 > Chrome DevTools errors=0). But this verdict is **misleading** — the real blocker was that **BrowserOS's MCP server (port 9000) is not running**, while **Chrome DevTools' MCP works fine but couldn't log into Google**. Both browsers failed to complete the workflow, but for unrelated reasons.

**Recommendation: pause pilot, file BrowserOS bug, design Phase 2 to bypass the MCP-server issue.**

## Metrics

| Browser | Success | Emails | Linear | Slack | Duration | Errors | reCAPTCHA | Collisions | Human |
|---|---|---|---|---|---|---|---|---|---|
| browseros | false | 0 | 0 | false | 0.0s | 1 | 0 | 0 | true |
| chrome-devtools | false | 0 | 0 | false | 12.5s | 0 | 0 | 0 | true |

## What actually happened

### BrowserOS (CDP 9239) — supposed to test 53 MCP tools

The subagent tried `GET http://127.0.0.1:9239/mcp` per my Phase 1.1 spec. Got `404 Not Found`. The MCP server is **not exposed on the CDP port**.

I then checked `http://127.0.0.1:9000/mcp` (BrowserOS's other listening port). Got `503 Service Unavailable`. The BrowserOS MCP server process is bound to the port but not actually serving MCP — every path returns 503.

So BrowserOS's "53 MCP tools" are **not reachable** from a Claude/subagent today. The browser app itself works (CDP responds, 8 tabs open including authenticated Gmail/Linear/Slack), but the MCP transport layer is broken or not started.

### Chrome DevTools (CDP 9223) — supposed to test standard CDP

Pilot Chrome launched cleanly with isolated profile `~/.browseros-pilot-chrome-profile`. **Zero Google login state** (as designed — Luis specified "chromium devtools that has no Google Workspace account logged in").

Subagent navigated to `https://mail.google.com` → redirected to `accounts.google.com/v3/signin/identifier`. No credentials available to autonomous subagent. Workflow aborted cleanly with `human_intervention_required=true`.

This is actually a **correct outcome** for the design intent: the test was "how do these MCPs handle login-required state?" Both answered: not autonomously.

## Decision gate (per docs/decision-gate.md)

| Gate | Pass | Notes |
|---|---|---|
| 1. Both browsers reported | ✓ | |
| 2. success_rate parity | ✓ | Both 0/1 |
| 3. duration within 1.10x OR backup | ✓ | 0 < 12.5×1.10 trivially |
| 4. errors strictly less | **✗** | BrowserOS=1 > Chrome=0 |
| 5. recaptcha not more | ✓ | Both 0 |
| 6. session_collisions == 0 | ✓ | Both 0 |

**Formal verdict: FAIL.** But the gate is meaningless here — neither run completed the workflow.

## RCA: why was this pilot inconclusive?

### What I got wrong in Phase 1.1

The Phase 1.1 evaluation said BrowserOS exposes its MCP at the CDP port. **It does not.** BrowserOS CDP (9239) is just standard Chrome DevTools Protocol — same as Chrome's 9223. The actual MCP server (the one with the 53 app-integration tools) is on port 9000, and it's currently down.

This was a Phase 1.1 research error: I checked BrowserOS's README and docs which describe the MCP server, but I didn't validate the actual endpoint during Phase 0 install verification. I should have done `curl http://127.0.0.1:9000/mcp` immediately after install.

### What I got wrong in Phase 1.2

The launch scripts and `AGENTS.mcp.yaml` files all point to `http://127.0.0.1:9239/mcp`. Wrong port. The correct port would be 9000 — IF the MCP server were running, which it isn't.

### What I got right

- Both browsers were correctly isolated (production Chrome 9222 untouched, pilot Chrome 9223 fresh, BrowserOS 9239 in its own profile).
- The infrastructure (workspaces, AGENTS.mcp.yaml registration, launch scripts, teardown) all worked.
- The verdict logic correctly identified the gate violation.
- Both subagents correctly identified their respective blockers and reported `human_intervention_required=true` rather than fabricating success.

## What to do next

Three options for the user:

1. **File a BrowserOS bug** for the 503 on port 9000. Wait for fix. Re-run pilot when MCP server is operational.
   - Pro: cleanest path forward; tests the actual MCP feature
   - Con: depends on BrowserOS team response time

2. **Pivot pilot to test the standard CDP layer only** — both subagents drive via Chrome DevTools MCP (BrowserOS vs Chrome). Drop the BrowserOS MCP comparison since it's not actually available.
   - Pro: removes the broken dependency; runs today
   - Con: doesn't test BrowserOS's claimed advantage (the 53 app-integration tools)

3. **Pivot pilot to use BrowserOS as a Chrome replacement** — sign into Google on BrowserOS 9239, drive it via Chrome DevTools MCP (since CDP works), compare that against Chrome DevTools MCP driving pilot Chrome 9223.
   - Pro: tests if BrowserOS-as-Chrome has any advantage at all
   - Con: doesn't validate the MCP story; might confirm BrowserOS's value is purely the browser app, not the MCP layer

## Recommendation

**Option 3 first**, then **Option 1**. Option 3 is the cheapest experiment and answers "is there ANY reason to switch to BrowserOS?" Option 1 is the proper validation but depends on BrowserOS fixing their MCP server.

## Persistent state

- Pilot repo: `~/github/browseros-pilot/` (commits ceae38b, b4bafc2, 9b8aa27, c4d4a01, e5e766f, d1fa807, 4067f71)
- Metrics: `~/github/browseros-pilot/metrics/2026-07-06.jsonl` (2 records)
- Dashboard: `~/github/browseros-pilot/metrics-latest.json` + `dashboard.html`
- BrowserOS app: running, but MCP server (9000) returns 503 on every path
- Pilot Chrome 9223: clean profile, 5 tabs (one New Tab), no Google login
- Production Chrome 9222: untouched, has Gmail/Linear/Slack logged in
- Teardown: still safe and idempotent; can run anytime

## What I am NOT doing

- Re-running the pilot (would produce same result; no point)
- Modifying production Chrome 9222 (Luis's automation there)
- Reporting this as a "win" for either side (the comparison wasn't actually performed)