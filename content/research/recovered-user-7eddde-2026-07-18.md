---
title: "Recovered research — user (session 20260423_135641_7eddde)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260423_135641_7eddde"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260423_135641_7eddde.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260423_135641_7eddde.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260423_135641_7eddde`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4730 characters of the largest assistant-side structured block recovered from the session transcript.

```
[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary. The current session state (files, config, etc.) may reflect work described here — avoid repeating it:
## Active Task
User asked: "continue with pipeline"

## Goal
Manage the job application process for Luis Calderon, including sourcing roles, tailoring resumes and cover letters (without AI markers or em dashes), and tracking application status.

## Constraints & Preferences
- **No AI Voice**: Content must sound human and professional.
- **No Em Dashes**: STRICT prohibition on using "—" in any written content.
- **Tone**: Punchy, short sentences, grounded.
- **File Exposure**: Full file paths must be provided for every generated document.
- **Application Status**: Mark roles as "Applied" only when confirmed by the user.

## Completed Actions
1. PATCH `ops-data/applications.md` — Moved Stealth Startup to "Skip" and Huge Inc to "Applied" [tool: patch]
2. WEB_EXTRACT Kindred and Discover International — Pulled JD data from LinkedIn and Ashby [tool: web_extract]
3. WRITE Kindred materials — Created `cv-luis-calderon-kindred-director-new-products-gtm-2026-04-23.html` and `cover-letter-kindred-director-new-products-gtm-2026-04-23.html` [tool: write_file]
4. WRITE Discover International materials — Created `cv-luis-calderon-discoverintl-head-of-product-agentic-ai-2026-04-23.html` and `cover-letter-discoverintl-head-of-product-agentic-ai-2026-04-23.html` [tool: write_file]
5. EXECUTE Node.js Playwright script — Successfully converted all four HTML files into PDFs in `~/github/jobhunt/career-ops/output/` [tool: execute_code]
6. VISION_ANALYZE Discover International form — Identified LinkedIn "Top Choice" message box and character limits [tool: vision_analyze]
7. PATCH `ops-data/applications.md` — Marked Kindred (078) and Discover International (079) as "Applied" [tool: patch]
8. PATCH `ops-data/applications.md` — Marked Hopper (009), ezCater (030), Outreach (045), Coursera (071), and Upstart (080) as "Applied" per user batch request [tool: patch]

## Active State
- **Working Directory**: `~/github/jobhunt`
- **Trackers**: `ops-data/applications.md` updated with recent "Applied" statuses.
- **Output Directory**: `~/github/jobhunt/career-ops/output/` contains the latest PDFs for Kindred and Discover International.
- **Latest Scored Pipeline**: Coursera (4.4), Outreach (4.2), ezCater (4.1), Upstart (Agentic), and Hopper (4.0) are now marked as completed/applied.

## In Progress
Transitioning to the next set of roles in the pipeline or evaluating new "Agentic AI" specific roles.

## Blocked
None.

## Key Decisions
- **Manual PDF generation**: Used a direct Node/Playwright script to bypass environment-specific npm installation issues for PDF generation.
- **Focus Shift**: At the user's direction, the Stealth Startup application was abandoned due to "low-quality lead/red flags" like generic JD and wide salary range.

## Resolved Questions
- User asked for a LinkedIn note for Sam Shinner: Provided two drafts (direct and referral-focused) for Discover International outreach.
- User requested file locations: Committed to providing full absolute paths for all future generated files.

## Pending User Asks
- None. User is waiting for the next recommended actions from the pipeline.

## Relevant Files
- `~/github/jobhunt/ops-data/applications.md`: Jobs tracker (recently patched to line 86).
- `~/github/jobhunt/ops-data/pipeline.md`: Source for upcoming targets.
- `~/github/jobhunt/career-ops/output/cv-luis-calderon-kindred-director-new-products-gtm-2026-04-23.pdf`: Ready for archive.
- `~/github/jobhunt/career-ops/output/cv-luis-calderon-discoverintl-head-of-product-agentic-ai-2026-04-23.pdf`: Ready for archive.

## Remaining Work
- Evaluate the remaining "Agentic" roles: Experian (Director, Agentic AI), GitHub (Senior Director), and Sifflet (AI PM).
- Continue down the scored list in `pipeline.md` (e.g., Toptal - Senior Director of Product, AI).

## Critical Context
- Salary expectations for Kindred: $200K-$250K. 
- Salary expectations for Discover International: $300K-$320K.
- Date for all current session applications: 2026-04-23.
- User email: [REDACTED]
- User phone: [REDACTED]
- LinkedIn: [REDACTED]

--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---


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
the Hermes session log at `~/.hermes/sessions/20260423_135641_7eddde.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
