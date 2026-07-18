---
title: "Recovered research — system (session 20260424_132935_df58bd32)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, system]
author: "Alba [bot]"
source_session: "20260424_132935_df58bd32"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260424_132935_df58bd32.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260424_132935_df58bd32.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — system

**Source session:** `20260424_132935_df58bd32`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 5000 characters of the largest assistant-side structured block recovered from the session transcript.

```
State checked. Here’s the blunt version.

## What’s actually reliable right now

### 1. **For logged-in SaaS already open in real Chrome**
Use **real Chrome + Chrome DevTools MCP**.

That’s the only clean path for things like Vendasta where:
- your real Chrome session is logged in,
- isolated browsers hit reCAPTCHA,
- we need DOM/screenshot/click access,
- and we don’t want foreground typing roulette.

Current blocker: Chrome is **not listening on `127.0.0.1:9222`**. I verified connection refused.

So the setup fix is:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
```

But: don’t do that while you’re actively working unless we first preserve/close/reopen safely. This can mess with the live Chrome session if done sloppily.

---

### 2. **For repeatable browser tasks that don’t need your live cookies**
Use **`dev-browser`**.

It is installed and works:

```bash
/opt/homebrew/bin/dev-browser
```

Best for:
- public pages,
- scraping,
- screenshots,
- testing flows,
- non-authenticated research,
- workflows where we can build repeatable scripts.

Bad for:
- Vendasta-style SaaS behind login + reCAPTCHA,
- anything that needs your already-open Chrome tab.

---

### 3. **For Codex specifically**
Codex has new useful stuff installed:

- `codex-cli 0.124.0` installed. Latest npm is `0.125.0`.
- Codex now has:
  - `mcp`
  - `plugin`
  - `app`
  - `cloud`
  - `--search`
  - image input
  - MCP server support
  - Codex in-app Browser plugin
  - Codex Computer Use plugin

Your Codex config already has:

```toml
[plugins."computer-use@openai-bundled"]
enabled = true

[plugins."browser-use@openai-bundled"]
enabled = true
```

Important distinction:

**Codex Browser plugin** is good for local app/browser testing inside Codex, especially:
- `localhost`
- `127.0.0.1`
- file URLs
- in-app browser tabs

It is **not the same thing** as controlling your real logged-in Chrome tab.

**Codex Computer Use** can control Mac apps, but it depends on desktop/accessibility permissions and is inherently riskier because it can type/click foreground apps. Use only when explicitly approved.

---

## What is currently broken / inconsistent

### Chrome DevTools MCP skill exists, but Chrome isn’t launched correctly
`clawhub list` shows:

```text
chrome-devtools-mcp-standard 1.0.0
```

But no actual listener on `9222`.

That means the standard is installed, but the browser runtime isn’t attached. Like having a steering wheel connected to air.

---

### `browser-use` CLI is not installed as a shell command
The Hermes skill says `browser-use` CLI exists, but command availability showed no usable `browser-use` binary.

So don’t rely on `browser-use` CLI from Hermes right now.

Codex has a **plugin named browser-use**, but that’s different. Annoying naming collision. Great job, tool ecosystem. Very normal.

---

### macOS Accessibility is blocked
I checked:

```text
System Events UI elements enabled: false
```

So GUI-level automation is currently blocked. That means:
- no reliable System Events UI inspection,
- no safe desktop clicking/typing,
- no Mac-level foreground automation.

This is good from a safety perspective, bad for “please use my visible browser” tasks.

---

## My recommended standard moving forward

Use this decision tree.

### A. Logged-in SaaS / dashboard / CRM / Vendasta / anything with reCAPTCHA
**Primary:** real Chrome + Chrome DevTools MCP  
**Fallback:** user manually does the login/CAPTCHA step, then we attach  
**Avoid:** cloud browser, isolated dev-browser, blind AppleScript/UI automation

Setup goal:

1. Launch Chrome with remote debugging.
2. Confirm:

```bash
curl http://127.0.0.1:9222/json/version
```

3. Then agents can attach safely without stealing focus.

---

### B. Local web app testing
**Primary:** Codex in-app Browser plugin if working inside Codex  
**Secondary:** `dev-browser` from Hermes/Alba  
**Avoid:** real Chrome unless login/session state matters

Use Codex when doing code + browser testing in one loop.

Use Alba/Hermes `dev-browser` when I’m orchestrating quick checks/screenshots/scripts.

---

### C. Public web research / scraping / screenshots
**Primary:** web tools first  
**Secondary:** `dev-browser`  
**Last resort:** cloud browser/browserbase-style tools

No reason to burn browser automation on static pages if Firecrawl/web extract works.

---

### D. Desktop GUI control
**Only with explicit approval.**

If you want this path, enable macOS permissions for the relevant agent/app:
- Accessibility
- Automation
- Screen Recording, if screenshots/vision are needed

But I’d keep this as emergency mode. It’s the most likely to type into Discord like a drunk raccoon.

---

## What I’d set up once, cleanly

### 1. Create a dedicated automation Chrome profile
This avoids trashing your normal Chrome.

Something like:

```bash
mkdir -p "$HOME/.chrome-automation-profile"

"/Applicat
```

## Why this was missed

The detector classifies this session as research-without-persist because:

1. The session produced structured markdown output (research, comparison, analysis, or recommendations)
2. The session cited external sources OR the user message asked to save/document/file
3. The session never called `mcp_memroos_knowledge_write`

This is a pre-ratchet-era finding — the ratchet fix (`--full` flag discipline +
last-run marker for incremental scans) was deployed after this session completed.
The current daily incremental scan is clean; these backlog entries reflect
sessions that completed before the persist gatekeeper was tightened.

## Recovery status

This is a backfill artifact. The original session content was preserved in
the Hermes session log at `~/.hermes/sessions/20260424_132935_df58bd32.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
