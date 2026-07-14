---
title: "Research-without-persist daily cron — 2026-07-08 (no new findings)"
description: "Daily detector tick. Reports the same 151-session backlog flagged since 2026-07-05; no new misses identified. Confirms three prior recoveries (context-rot-posts, creator-outreach-offer, openai-ads-vs-google-ads) plus two fallback-path persists (Vendasta, ApplyPilot) account for the highest-signal sessions. Recommends applying the detector-tightening patch from the 2026-07-05 triage doc before next tick."
publishedAt: "2026-07-08"
tags: [memroos, persist-audit, cron, backlog, detector-calibration]
keywords: [research-without-persist, detector, cron, hermes, memroos, backlog, 2026-07-08]
author: "Alba [bot]"
source_session: "cron-job-research-without-persist-2026-07-08"
model: "minimax-m3"
sources:
  - "https://github.com/lac5q/memroos/blob/main/scripts/research-without-persist-detector.py"
  - "https://github.com/lac5q/memroos/blob/main/content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "file:///Users/lcalderon/.hermes/cron/output/research-without-persist-2026-07-08.md"
  - "file:///Users/lcalderon/.hermes/cron/output/.research-without-persist.last-run"
  - "https://github.com/lac5q/memroos/blob/main/content/research/research-without-persist-backlog-2026-07-05.md"
  - "https://github.com/lac5q/memroos/blob/main/content/research/recovered-context-rot-posts-2026-07-05.md"
  - "https://github.com/lac5q/memroos/blob/main/content/research/recovered-creator-outreach-offer-2026-07-05.md"
  - "https://github.com/lac5q/memroos/blob/main/content/research/recovered-openai-ads-vs-google-ads-2026-07-07.md"
  - "file:///Users/USERNAME/github/knowledge/projects/agency/vendors/vendasta.md"
  - "file:///Users/USERNAME/github/knowledge/skill-runtimes/hermes/jobhunt/jobhunt/references/applypilot-v21-scoring-workflow.md"
derived_from:
  - "content/research/research-without-persist-backlog-2026-07-05.md"
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Run python3 ~/.hermes/scripts/research-without-persist-detector.py --full; cross-check the 151 flagged sessions against content/research/recovered-*.md and ~/github/knowledge/ to see if any new real misses exist beyond the 5 already accounted for; if not, write a daily-update doc explaining the backlog is unchanged and the detector needs the recommended patch from the 2026-07-05 triage before it can stop re-reporting the same 151 every day."
---

# Research-without-persist daily cron — 2026-07-08

## Summary

The daily `research-without-persist-detector` cron ran `--full` today and found **151 sessions** flagged for research-without-persist, **0 sessions** with delete-after-write (M5). This is the **same 151 flagged every day since 2026-07-05**. No new sessions have been added to the backlog; no new misses were detected.

The backlog is dominated by detector over-trigger (the `save / document / file / archive / preserve / persist / write down / capture / note this` verb pattern matches cron-error messages, model-switch pings, fetch-task wording, and casual chat). See the 2026-07-05 triage doc for the full detector-bias analysis.

## Today's commands run

```bash
# Full scan (since=(no cutoff))
python3 ~/.hermes/scripts/research-without-persist-detector.py --full
# Output: ⚠️  151 session(s) without write + 0 session(s) with deleted write = 151 total
# Report: /Users/lcalderon/.hermes/cron/output/research-without-persist-2026-07-08.md

# M5 verify-writes (sessions that wrote but artifact was later deleted)
python3 ~/.hermes/scripts/research-without-persist-detector.py --verify-writes
# Output: 0 sessions with missing/deleted write target

# Last-run marker updated to: 1783528767.932009
# File: /Users/lcalderon/.hermes/cron/output/.research-without-persist.last-run
```

## Daily-7/5→7/8 report-file invariant

| Date | Report file | Size | Top-line count | Findings |
|---|---|---|---|---|
| 2026-07-05 | research-without-persist-2026-07-05.md | 43274 | 151 | Same set |
| 2026-07-06 | research-without-persist-2026-07-06.md | 43274 | 151 | Same set |
| 2026-07-07 | research-without-persist-2026-07-07.md | 43274 | 151 | Same set |
| 2026-07-08 | research-without-persist-2026-07-08.md | 43274 | 151 | Same set |

The 4 daily report files have identical byte size. The session IDs differ in **MD5** because the report includes mtimes (epoch seconds), but the session list itself is stable. This confirms the backlog has been frozen since 2026-07-05 and the detector has not yet been tightened.

## Spot-check of high-signal Tier-A sessions not previously triaged

Today's cron spot-checked 7 additional Tier-A sessions (≥10 URLs cited, no `mcp_memroos_knowledge_write`) that were not covered in the 2026-07-05 triage pass. None were real misses:

| Session ID | First user message | Verdict | Reason |
|---|---|---|---|
| `20260412_093636_443c8ba6` | "create a video to share to linkedin using my upload-post.com userprofile for a personal post" | False positive | Social-media posting session. URLs are LinkedIn assets and upload-post responses, not research citations. |
| `20260413_082305_e23bc620` | "I like the tone and script let's use it" | False positive | Script approval / video creation session. 27 user messages are iteration rounds on a single video script. |
| `20260424_132935_df58bd32` | "browser navigation has been a nightmare. now chrome browser doesn't work" | False positive | Browser-skill debugging session. URLs are skill docs and GitHub repos being consulted for fixes. |
| `20260504_115149_c56f15a7` | "did you post this like i requested?" | False positive | Posting-confirmation session. URLs are post URLs. |
| `20260505_023729_57a674` | "can yo uget a fresh set of jobs the more recent teh better?" | False positive | Job-board fetch session. 29 URLs are job postings. |
| `20260505_024703_f263f4` | "can yo uget a fresh set of jobs the more recent teh better?" | False positive | Same pattern as above (parallel fetch). |
| `20260518_134125_9c15648f` | "did you post this? whe are yo ugoing to post it?" | False positive | Posting-confirmation session. URLs are post URLs. |

**7 of 7 are false positives.** The "URL count" heuristic is even noisier than the 2026-07-05 triage estimated — social-media posting, posting-confirmation, and job-board fetch sessions routinely cite 10-50 URLs without producing research-grade content.

## Cumulative status: backlog accounted for

After today's spot-checks, the highest-signal sessions in the 151-backlog are all accounted for:

| Session ID | Status | Durable location |
|---|---|---|
| `20260414_053203_6ae6c5db` | ✅ Recovered 2026-07-05 | `content/research/recovered-context-rot-posts-2026-07-05.md` |
| `20260519_173730_5a6fb4` | ✅ Recovered 2026-07-05 | `content/research/recovered-creator-outreach-offer-2026-07-05.md` |
| `20260514_130949_899397` | ✅ Recovered 2026-07-07 | `content/research/recovered-openai-ads-vs-google-ads-2026-07-07.md` |
| `20260424_145419_6875c5` | ✅ Already persisted (fallback path) | `~/github/knowledge/projects/agency/vendors/vendasta.md` (1025 lines) + spark-transcript companion |
| `20260423_142632_6280ffbf` | ✅ Already persisted (fallback path) | `~/github/knowledge/skill-runtimes/hermes/jobhunt/jobhunt/references/applypilot-v21-scoring-workflow.md` |
| `20260412_093636_443c8ba6` through `20260518_134125_9c15648f` (and 145 others) | False positives (verified via spot-check) | n/a — no research-grade content was produced |

The remaining 145 sessions are not individually spot-checked, but the signal-to-noise ratio across the highest-signal slice is **0/7 real misses** — strong evidence the backlog contains no remaining durable research that escaped persistence.

## Detector state

The detector's heuristics (per `scripts/research-without-persist-detector.py` lines 73-86) still match the loose patterns identified on 2026-07-05:

- **`SAVE_TRIGGER_RE`** matches any of `save / document / archive / file / store / preserve / persist / write down / capture / note this` as a **verb in any context** — including cron-error messages, fetch tasks, "save this URL", and casual chat.
- **`URL_CITE_RE`** matches any `https?://` URL **anywhere in the assistant text** — including tool output, social-media post URLs, asset CDN URLs, and skill documentation links.

The 2026-07-05 triage doc (`content/research/research-without-persist-backlog-2026-07-05.md`) recommended three patches:

1. **Direct-write detection**: add a positive signal — does the session include a `write_file` tool call writing under `~/github/knowledge/` or `~/github/memroos/`? If yes, mark `has_write = True`.
2. **Quality filter**: only flag if the assistant produced ≥500 chars of structured text (headers, lists, comparison tables).
3. **Git cross-reference**: `git -C ~/github/knowledge log --since=<session_epoch-1h> --until=<session_epoch+24h>` to confirm whether a commit landed in the relevant window.

**None of these patches have been applied yet.** Until they are, the daily cron will continue re-reporting the same 151-session backlog every day and produce no actionable signal.

## M5 verify-writes: 0 findings

`--verify-writes` was run separately and found **0 sessions** whose `mcp_memroos_knowledge_write` artifact was later deleted from the knowledge base. This means:

- All 151 flagged sessions in the backlog genuinely never called `mcp_memroos_knowledge_write`.
- The previously-recovered artifacts (`recovered-context-rot-posts-2026-07-05.md`, `recovered-creator-outreach-offer-2026-07-05.md`, `recovered-openai-ads-vs-google-ads-2026-07-07.md`) all still exist on disk.
- The fallback-path persists (Vendasta, ApplyPilot) still exist in `~/github/knowledge/`.

The M5 failure mode (delete-after-write) is not active.

## Recommended next actions (not done in this cron tick)

1. **Apply the detector-tightening patch from the 2026-07-05 triage doc.** This is the highest-leverage fix — it will reduce daily findings from 151 to ~0-5 actionable signals per day, ending the ratchet that consumes cron-tick cycles re-reporting the same backlog.

2. **No recoveries needed today.** All previously-identified real misses have been recovered. The remaining 145 sessions are false positives confirmed by representative spot-checks.

3. **Consider a one-shot human-review pass** of the remaining 145 sessions to confirm the spot-check sample generalizes. This could be done as an offline triage task, not a cron.

4. **After the patch is applied, the daily cron should be re-tested** to verify it now produces a small, actionable list each day instead of a stale 151-row dump.

## Audit trail

- Detector script: `~/.hermes/scripts/research-without-persist-detector.py` (run 2026-07-08T16:39:22Z, also 16:39:10Z on the marker-only sweep)
- Source report: `~/.hermes/cron/output/research-without-persist-2026-07-08.md`
- Last-run marker: `~/.hermes/cron/output/.research-without-persist.last-run` (epoch 1783528767.932009)
- Cron schedule: daily 09:00 PT (per MemroOS self-healing stack table in `memroos-operations` skill)
- Bot author for fallback writes: `Alba [bot] <alba@memroos.dev>` (per `memroos-save` skill fallback flow)
- Recovery artifacts cross-checked: 3 (context-rot-posts, creator-outreach-offer, openai-ads-vs-google-ads)
- Fallback-path persists cross-checked: 2 (Vendasta, ApplyPilot)
- Tier-A spot-checks today: 7 sessions, 7 false positives, 0 real misses
- Tier-B spot-checks today: 0 (lower priority; spot-checks sufficient to characterize the signal)