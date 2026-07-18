---
title: "Recovered research — active (session 20260505_023729_57a674)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, active]
author: "Alba [bot]"
source_session: "20260505_023729_57a674"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_023729_57a674.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_023729_57a674.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — active

**Source session:** `20260505_023729_57a674`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 5000 characters of the largest assistant-side structured block recovered from the session transcript.

```
[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. Your current task is identified in the '## Active Task' section of the summary — resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary. The current session state (files, config, etc.) may reflect work described here — avoid repeating it:
## Active Task
User asked: "can you add https://github.com/lac5q to all my resumes"

## Goal
Help Luis apply to the best recent jobs from the fresh job scan by creating tailored resumes and cover letters, validating documents, and assisting with each application one at a time.

Current focus has shifted from Hometap to Rula at Luis’s request, but the newest outstanding task is to add Luis’s GitHub profile URL to all resumes.

Overall application order/status:
1. Advisor360 — Senior Principal Product Manager, Agentic Products — completed by Luis.
2. Hometap — Principal Product Manager, New Products — paused, not submitted.
3. Rula — Sr. Product Manager - AI — tailored docs created/validated; Ashby application staged, not submitted.
4. Huntress — Staff Product Manager, SIEM — pending.
5. Apollo.io — Product Builder, AI Agents — pending.

## Constraints & Preferences
- Work one role at a time unless Luis asks to switch.
- Do not submit applications without Luis’s review and explicit approval.
- Do not guess required subjective/legal/applicant-choice answers.
- Use Luis resume rules and executive resume critique standards.
- Tailor each resume and cover letter to the specific job.
- Validate generated PDFs for:
  - correct page count,
  - readability,
  - no cutoff/overflow,
  - single-column layout,
  - no em dashes where possible,
  - education dates removed/checked.
- Luis resume preferences:
  - product leader building agentic workflows,
  - one target title, max two,
  - omit Epilogue unless role values agentic OS/portfolio/SMB,
  - remove education dates,
  - always provide resume file paths, job synopsis, posting/apply links, status/next decision.
- For each job/application, Luis wants:
  - concise job synopsis,
  - job posting link,
  - apply link when different,
  - resume + cover letter file paths,
  - status / next decision needed.
- New Discord/copy preference:
  - In Discord, any text or URLs Luis needs to copy/paste should be shown in fenced code blocks so Discord exposes a copy button when available.
  - Also include normal clickable links separately when useful.
- Sensitive credentials/secrets must never be preserved. If credentials/API keys/tokens/passwords/connection strings appear, replace with `[REDACTED]`.
- Avoid preserving personal contact values unnecessarily; refer to personal email/phone as “from resume” rather than exact values.
- Never kill Chrome; non-destructive browser operations only.
- Default docs to Google Docs where relevant.

## Completed Actions
1. UPDATED task list — marked previous “Send Luis the best recent jobs and priorities” as completed [tool: todo].
2. READ job scan `~/github/jobhunt/pipeline-runs/scan-20260505-fresh.json` — confirmed fresh role list and Advisor360 details [tool: read_file].
3. EXTRACTED Advisor360 Built In posting `https://builtin.com/job/product-lead/8995370` — retrieved JD for “Senior Principal Product Manager, Agentic Products” [tool: web_extract].
4. READ `~/github/jobhunt/resume.html`, `~/github/jobhunt/scripts/generate-resume-pdf.js`, Domino tailored resume/cover letter, and `~/github/jobhunt/printable-resume.html` — used as source/reference for tailored docs [tool: read_file/search_files].
5. CHECKED environment — `date '+%B %-d, %Y'` returned `May 5, 2026`; Node Playwright available (`playwright ok`) [tool: terminal].
6. CREATED Advisor360 tailored resume HTML at `~/github/jobhunt/resumes-advisor360/Luis-Calderon-Advisor360-Senior-Principal-PM-Agentic-Products.html` — 11,415 bytes; targeted agentic products/financial advisor workflows [tool: write_file].
7. CREATED Advisor360 cover letter HTML at `~/github/jobhunt/resumes-advisor360/Luis-Calderon-Advisor360-Cover-Letter.html` — 3,493 bytes; dated May 5, 2026 [tool: write_file].
8. CREATED Advisor360 render script `~/github/jobhunt/resumes-advisor360/render-advisor360-docs.js` — Playwright PDF render plus `.sheet` overflow checks [tool: write_file].
9. RENDERED Advisor360 PDFs — generated resume PDF 344.8 KB and cover letter PDF 101.2 KB; no `.sheet` overflow [tool: terminal].
10. VALIDATED Advisor360 PDFs — `pdfinfo` showed resume 2 pages and cover letter 1 page; `pdftotext | grep '—'` found no em dash; visual previews passed readability/no cutoff/single-column checks [tool: terminal/vision_analyze].
11. NAVIGATED Advisor360 apply flow — found Rippling apply URL `https://ats.rippling.com/advisor360-llc/jobs/dc360fa
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
the Hermes session log at `~/.hermes/sessions/20260505_023729_57a674.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
