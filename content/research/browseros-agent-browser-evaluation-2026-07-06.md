---
title: BrowserOS as a Shared Browser Layer for All Agents — Evaluation
date: 2026-07-06
sources:
  - https://github.com/browseros-ai/BrowserOS
  - https://docs.browseros.com/
  - https://docs.browseros.com/comparisons/chrome-devtools-mcp
  - https://docs.browseros.com/features/use-with-claude-code
  - https://github.com/browseros-ai/BrowserOS/releases
derived_from: Luis's Discord message in Epilogue Capital #devops asking whether BrowserOS could replace the current per-agent browser setup
regen_prompt: |
  Regenerate this evaluation by (1) re-fetching the BrowserOS GitHub README and
  docs.browseros.com pages, (2) re-reading ~/.hermes/BROWSER_AUTOMATION_STANDARD.md,
  (3) comparing the BrowserOS MCP tool surface to the Chrome DevTools MCP surface
  and our current Hermes browser config, and (4) updating the verdict table and
  pilot recommendation.
model: MiniMax-M3
status: evaluation-complete
recommendation: hybrid-pilot
---

# BrowserOS as a Shared Browser Layer for All Agents

## TL;DR

BrowserOS is **not** a clean drop-in replacement for our current Chrome DevTools
MCP + dedicated automation profile setup, but it has real advantages in three
specific workflows. Recommended posture: **hybrid pilot** — keep Chrome DevTools
MCP as the primary for production automation; pilot BrowserOS MCP for the
authenticated-extraction and tab-orchestration workloads where it actually wins.

Do not switch all agents blindly. The shared-browser premise is seductive but
introduces state-collision risk across 8+ agent profiles we currently isolate.

## What BrowserOS Is

- Open-source Chromium fork (AGPL-3.0) by Felafax, Inc. (YC).
- 11.7k stars, 1.2k forks, 66 releases, 2,978 commits. Active.
- Built-in MCP server on `http://127.0.0.1:9239/mcp` — 53 tools, 40+ app
  integrations (Gmail, Slack, GitHub, Linear, Notion, etc.).
- Uses your **real** browser session — cookies, logins, extensions persist.
- Also exposes `browseros-cli` (Go) for terminal/agent control and a Node SDK
  (`@browseros-ai/agent-sdk`).

## Current Stack (today)

Documented in `~/.hermes/BROWSER_AUTOMATION_STANDARD.md`:

1. Dedicated Chrome at `~/.chrome-automation-profile`, CDP on `127.0.0.1:9222`.
2. Chrome DevTools MCP (`@anthropic-ai/chrome-devtools-mcp`) attached to that
   profile — 29 tools focused on debug/inspection.
3. `dev-browser` for named-session repeatable automation.
4. Codex in-app browser for localhost testing.
5. Computer Use only with explicit permission (focus-steal risk).

8 agent profiles today: `default, gale, gizmo, grant, gwen, lucia, main,
marketing-specialist`. Each may inherit browser tools.

## Feature Comparison: BrowserOS MCP vs Chrome DevTools MCP

Pulled directly from `docs.browseros.com/comparisons/chrome-devtools-mcp`:

| Dimension | BrowserOS MCP | Chrome DevTools MCP | Winner |
|---|---|---|---|
| Total MCP tools | 53 | 29 | BrowserOS |
| External app integrations | 40+ | 0 | BrowserOS (huge) |
| Setup complexity | Copy URL, instant | Need `--remote-debugging-port` + separate Node process | BrowserOS |
| Browser session | Real logged-in Chrome | Attached debug session; some sites block WebDriver-detected browsers | BrowserOS |
| Anti-detection | C++-level APIs, not just CDP | Pure CDP — many sites fingerprint it | BrowserOS |
| Console message inspection | **Coming soon** | ✅ | Chrome DevTools MCP |
| Network request inspection | **Coming soon** | ✅ | Chrome DevTools MCP |
| Performance tracing | **Coming soon** | ✅ | Chrome DevTools MCP |
| Lighthouse audit | **Coming soon** | ✅ | Chrome DevTools MCP |
| Device/network emulation | **Coming soon** | ✅ | Chrome DevTools MCP |
| Memory snapshots | **Coming soon** | ✅ | Chrome DevTools MCP |
| Page-as-Markdown extraction | ✅ | ❌ | BrowserOS |
| Hidden/background tabs | ✅ | ❌ | BrowserOS |
| Tab groups, windows, bookmarks, history | ✅ | ❌ | BrowserOS |
| PDF/screenshot file export | ✅ | ❌ | BrowserOS |
| Select dropdown, checkbox, focus helpers | ✅ | ❌ | BrowserOS |

**Bottom line:** BrowserOS wins on automation breadth and "real session" UX.
Chrome DevTools MCP wins on developer/QA inspection tools. The comparison page
explicitly admits BrowserOS's debugging surface is "coming soon."

## Where BrowserOS Actually Wins for Our Workloads

1. **Authenticated data extraction** (LinkedIn, Gmail, Notion, Linear).
   Real logged-in session vs WebDriver-detached debug session. Our Vendasta
   login flow is a current pain point — BrowserOS's anti-detection via C++ APIs
   is materially better than raw CDP for reCAPTCHA-prone sites.
2. **Cross-app workflows** ("extract from Gmail → create Linear issue → post
   to Slack"). The 40+ built-in MCP integrations replace gws/slack/linear
   adapters for many flows. Reduces glue code in our agents.
3. **Tab orchestration** (background tabs, tab groups, hidden windows). Useful
   for multi-account workflows and research sweeps where we currently juggle
   multiple `dev-browser` named sessions.
4. **Markdown page extraction** (`get_page_content`). Cleaner than
   DOM-scraping with our current tools.

## Where It Does Not Win

1. **Debugging & QA** — Chrome DevTools MCP has console/network/performance
   tools today; BrowserOS says "coming soon." For our developer workflows
   (testing web apps, reading console errors) Chrome DevTools MCP is the right
   answer *right now*.
2. **Localhost app testing from Codex** — already covered by Codex's bundled
   `browser-use@openai-bundled`. BrowserOS doesn't displace it.
3. **Isolation guarantees** — BrowserOS MCP runs in the user's real browser.
   That is a feature for logged-in workflows but a **liability** for agent
   isolation: eight agents hitting one browser means cookie/session/tab state
   collisions, leaked tabs across agents, and bot-detection contamination when
   agent A's clicks disrupt agent B's logged-in session. Our current setup
   isolates per-agent via separate CDP targets and dedicated user-data-dir.

## Operational Concerns

- **Single point of failure.** All agents tied to one BrowserOS instance.
  Today we can kill/restart Chrome DevTools MCP without breaking unrelated
  agents; BrowserOS MCP being in the browser process itself means a BrowserOS
  crash takes everyone down.
- **AGPL-3.0 license.** Acceptable for internal use; matters if we ever ship
  BrowserOS-derived code. Felafax, Inc. is the copyright holder. Their
  commercial license exists (separate file in repo).
- **Vendor dependency.** Felafax is a young YC company. 11.7k stars is real
  traction but the project is still beta (release v0.0.5 of "BrowserClaw
  Server" on 2026-07-06). Many "coming soon" features.
- **Different tool IDs.** Existing agents that call `chrome-devtools-mcp` tools
  (`click`, `fill`, `take_snapshot` etc.) — the BrowserOS equivalents have the
  same names but different params (e.g., `take_enhanced_snapshot` vs
  `take_snapshot`). Migration is not zero-cost.
- **macOS dual-screen gotcha** still applies: any browser automation that
  routes through `focus_app`/`cua-driver` on a second display is fragile.
  BrowserOS being a separate browser binary may actually help here.

## Hybrid-Pilot Recommendation

**Phase 1 — Pilot (1–2 weeks):** Stand up BrowserOS alongside the existing
Chrome DevTools MCP. Run a focused pilot with **Gwen** (our research/orchestrator
agent) for one authenticated-extraction workflow (likely LinkedIn → sheet
extraction or Gmail → Linear triage). Measure:

- Success rate on first attempt vs current
- Time to complete vs current
- reCAPTCHA / bot-detection incidents vs current
- Cookie/session collision incidents with Chrome DevTools MCP running concurrently

**Phase 2 — Decision gate:** If Gwen pilot wins on success rate and time, and
collision rate is low, expand to **Grant** (sales-ops) and **Lucia**
(marketing-specialist) for their respective authenticated workflows.

**Phase 3 — Codify:** If Phase 2 holds, update
`~/.hermes/BROWSER_AUTOMATION_STANDARD.md` to add BrowserOS as a tier-1
option for authenticated workflows, alongside Chrome DevTools MCP for
debug/inspection. Do **not** retire Chrome DevTools MCP — BrowserOS still
lacks the debugging tools today.

**Explicit non-goals for the pilot:**

- Do not migrate Codex's localhost browser (already solved).
- Do not migrate Computer Use (different problem space).
- Do not replace our dedicated `~/.chrome-automation-profile` for any agent
  that requires isolation from BrowserOS's shared session.

## Decision

| Option | Effort | Risk | Reward |
|---|---|---|---|
| Adopt BrowserOS for everything | Medium-high (rewrite tool calls, isolation re-architecture) | High (state collisions, vendor dependency, missing debug tools) | Low (we'd lose capabilities we already have) |
| Stay on Chrome DevTools MCP only | Zero | Zero | None (we leave wins on the table) |
| **Hybrid pilot** | Low (additive, no rip-and-replace) | Low (pilot is contained) | Medium (capture wins where real, preserve current strengths) |

**Choose hybrid pilot.** Run for two weeks. Re-evaluate at end of pilot against
the four metrics above. If BrowserOS wins on ≥3 of 4, expand to Phase 2. If not,
keep it as a niche tool for the specific authenticated-extraction workloads
where it clearly beats CDP.

## Sources

- BrowserOS repo: <https://github.com/browseros-ai/BrowserOS>
- BrowserOS docs: <https://docs.browseros.com/>
- Official Chrome DevTools MCP comparison: <https://docs.browseros.com/comparisons/chrome-devtools-mcp>
- MCP client setup: <https://docs.browseros.com/features/use-with-claude-code>
- YC launch: <https://www.ycombinator.com/launches/ORU-browseros-the-open-source-agentic-browser>
- Our current standard: `~/.hermes/BROWSER_AUTOMATION_STANDARD.md`