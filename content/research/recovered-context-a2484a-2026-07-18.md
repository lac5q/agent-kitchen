---
title: "Recovered research — context (session 20260423_135351_a2484a)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260423_135351_a2484a"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260423_135351_a2484a.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260423_135351_a2484a.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260423_135351_a2484a`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 2747 characters of the largest assistant-side structured block recovered from the session transcript.

```
## ✅ All Done — Here's What Happened

### 🔒 1. Git History Completely Rewritten

Ran `git-filter-repo` **twice** to scrub every commit in the `agent-kitchen` repo:

| Pattern | Replaced With |
|---|---|
| `100.101.88.44` | `100.x.x.x` |
| `100.109.19.110` | `100.x.x.x` |
| `kitchen.internal.example` | `kitchen.example.com` |
| `gwen.internal.example` | `gwen.example.com` |
| `/Users/lcalderon/...` | `/Users/yourname/...` |
| `-Users-lcalderon-...` | `-Users-jdoe-...` |
| `kitchen.epilogue...` (truncated) | `kitchen.example...` |
| Same patterns in **commit messages** | Sanitized |

**Verified clean** — grep across the entire history returns zero matches for any sensitive pattern. Force-pushed to GitHub.

---

### 🛡️ 2. Gates Set Up (So This Never Happens Again)

**GitHub Actions workflow** (`.github/workflows/secret-guard.yml`):
- **TruffleHog** — industry-standard secret scanner on every push/PR
- **Custom IP scanner** — blocks Tailscale / RFC1918 IPs from being committed
- **Username path scanner** — blocks real macOS home directories (`/Users/john/...`)
- **Domain scanner** — blocks internal domains
- **Filename scanner** — blocks `.pem`, `.key`, `id_rsa`, `credentials.json`
- **.env.local guard** — fails if `.env.local` is ever staged

**Local pre-commit hook** (`.githooks/pre-commit`):
- Same checks, but runs **before** you even commit
- Install it once: `git config core.hooksPath .githooks`

---

### 📖 3. README Completely Rewritten

New `README.md` includes:
- Hero screenshot of the Kitchen Floor
- Screenshot gallery for all 7 views (Kitchen Floor, Ledger, Flow, Library, Notebooks, APO, Dispatch)
- Clear quick-start instructions
- Config-driven setup guide (no code changes needed)
- Agent directory structure explanation
- Data sources & API routes table
- Tech stack breakdown
- Compatible systems list
- Security section linking to the CI workflow

---

### 🔍 4. Other Public Repos Checked

Scanned **`vibe-island-updates`** (your only other public repo):

| Check | Result |
|---|---|
| API keys / tokens | ❌ None found |
| Internal IPs | ❌ None found |
| Internal domains | ❌ None found |
| Real usernames / paths | ❌ None found |
| Private keys | ❌ None found |

**It's clean.** The only matches were public Sparkle appcast URLs (`github.com/edwluo`, `dl.vibeisland.app`) which are standard distribution links.

---

### 📦 What's Left to Commit

The new README, CI workflow, and pre-commit hook are already pushed to `main`. The sanitized history is live on GitHub.

**One thing:** If anyone else has cloned this repo, they'll need to re-clone it because the commit hashes changed. History rewrite breaks existing clones.

Want me to add anything else — like a `CONTRIBUTING.md` or an issue template?
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
the Hermes session log at `~/.hermes/sessions/20260423_135351_a2484a.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
