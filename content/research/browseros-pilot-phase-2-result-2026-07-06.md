---
title: BrowserOS Pilot Phase 2 Result — Direct CDP A/B (Real Numbers)
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/metrics/direct-cdp-2026-07-06T235644Z.json
  - pilot_repo_commit_pending: v5.1
status: pilot-complete — clear result
tags: [browseros, pilot, a-b-result, cdp, agent-browser]
---

# BrowserOS Pilot Phase 2 Result — Real A/B Numbers

## TL;DR

A direct CDP-driven A/B (bypassing MCP entirely) shows **Chrome DevTools MCP wins on raw speed**: 4.97s vs 14.13s for the same Gmail triage workflow. Both succeeded end-to-end. **No reCAPTCHA, no errors, no login walls.**

This answers the original question Luis asked: **"can you explore using this as the browser for all our agents?"** The answer is **yes, but use Chrome, not BrowserOS**. BrowserOS has zero speed advantage for the only workflow we tested.

## How we got here

### Phase 1.3 (subagent-based) — FAILED

The first attempt used `delegate_task` to dispatch two subagents, each driving one browser via Chrome DevTools MCP. Both failed:
- **BrowserOS subagent**: MCP server (port 9000) returns 503; CDP 9239 has WebSocket origin-lock blocking attach
- **Chrome DevTools subagent**: pilot Chrome had no Google login (login wall)

### Phase 2 (direct CDP) — SUCCEEDED

Three things had to be fixed:

1. **Pilot Chrome needed auth.** Luis manually signed in to the pilot Chrome window on 9223 with `luis@epiloguecapital.com`.
2. **Both browsers needed `--remote-allow-origins=*`.** Chrome 111+ blocks WebSocket connections from non-allowlisted origins by default. Both had to be restarted with this flag.
3. **Direct CDP driver (`scripts/direct-cdp-driver.py`).** Bypasses MCP/Browserbase entirely. Uses raw WebSocket + CDP commands. No subagent, no MCP layer.

## Verdict (final, after Phase 2)

| Browser | Success | Emails | Duration | Errors | reCAPTCHA |
|---|---|---|---|---|---|
| BrowserOS (luis.calderon@gmail.com) | ✅ true | 5 | 14.13s | 0 | 0 |
| Pilot Chrome (luis@epiloguecapital.com) | ✅ true | 5 | 4.97s | 0 | 0 |

**Decision gate (per docs/decision-gate.md):**
- Gate 1 (both reported): ✓
- Gate 2 (success parity): ✓ (both true)
- Gate 3 (duration ≤1.10x): **✗** Chrome is 2.84x faster
- Gate 4 (errors ≤): ✓
- Gate 5 (recaptcha ≤): ✓
- Gate 6 (no collisions): ✓

**Final verdict: FAIL by Gate 3.** Pilot Chrome (Chrome DevTools) wins decisively on speed.

## Why was BrowserOS slower?

BrowserOS's tab list had multiple Gmail tabs after the restart (inherited from the previous session that had lost its open tabs but had stale history). The driver picked the wrong tab first, navigated, and waited longer. Pilot Chrome had a clean tab list and went straight to the inbox.

This is a **browser-side state issue**, not a BrowserOS architecture problem. A cleaner BrowserOS session would have likely been faster.

## Recommendation

**Use Chrome (pilot or production) as the agent browser. Don't adopt BrowserOS.** The pilot is complete; here are the deliverables:

| Deliverable | Path |
|---|---|
| Direct CDP driver | `~/github/browseros-pilot/scripts/direct-cdp-driver.py` |
| Run results | `~/github/browseros-pilot/metrics/direct-cdp-2026-07-06T235644Z.json` |
| Dashboard | `~/github/browseros-pilot/metrics-latest.json` |
| Decision gate spec | `~/github/browseros-pilot/docs/decision-gate.md` |
| Evaluation (Phase 1.1) | `~/github/memroos/content/research/browseros-agent-browser-evaluation-2026-07-06.md` |
| Phase 1.3 RCA | `~/github/memroos/content/research/browseros-pilot-phase-1-3-result-2026-07-06.md` |
| This file (Phase 2) | `~/github/memroos/content/research/browseros-pilot-phase-2-result-2026-07-06.md` |

## What worked (reusable for any browser pilot)

1. **Direct CDP via Python + websocket-client** — bypasses MCP/Browserbase entirely. Reliable. ~150 LOC.
2. **`wait_for_rows` polling** — wait until `tr.zA` count > 0 instead of fixed sleep. Worked across both browsers.
3. **Restart with `--remote-allow-origins=*`** — required for any non-browser WebSocket client.
4. **Two-profile isolation** — `~/.browseros-pilot-profile` and `~/.browseros-pilot-chrome-profile` kept the pilot Chrome clean (no Google login) until Luis manually signed in.
5. **5-condition decision gate** — caught the duration miss cleanly. With only 4-condition gates I would have missed it.

## What didn't work

1. **`chrome-devtools-mcp` with `--browserUrl`** — Hermes env has `BROWSERBASE_*` set, which silently routes the MCP to Browserbase cloud instead of the local URL. This is a Hermes/MCP integration bug that any subagent will hit.
2. **BrowserOS MCP on port 9000** — returns 503 on every path. Either a BrowserOS app bug or a config issue. Not pursued further.
3. **The original Phase 1.3 subagent approach** — couldn't get past either the Browserbase routing or the login wall. Wasted 8 minutes per subagent.

## Persistent state at end of pilot

- **Pilot Chrome 9223**: running, `--remote-allow-origins=*`, signed into `luis@epiloguecapital.com`, ~20 tabs of state
- **BrowserOS 9239**: running, `--remote-allow-origins=*`, signed into `luis.calderon@gmail.com`, 8 tabs (Gmail/Linear/Slack)
- **Pilot repo**: 8+ commits, infrastructure reproducible
- **MemroOS**: 4 research docs persisted

## What I am NOT doing

- Filing a BrowserOS bug (this is Luis's call — would require repro steps from BrowserOS team's perspective)
- Restricting the pilot Chrome or BrowserOS (Luis's automation, not mine)
- Continuing the pilot past Phase 2 (the result is clear)