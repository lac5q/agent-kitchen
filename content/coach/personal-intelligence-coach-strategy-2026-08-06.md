---
title: "Personal Intelligence Coach: MemroOS-Centered Strategy"
name: "personal-intelligence-coach-strategy"
description: "Evidence-backed strategy for aggregating Luis's AI chats, communications, schedules, tasks, and activity signals into a private coaching system that discovers high-leverage patterns and tests daily interventions."
publishedAt: "2026-08-06"
tags: [personal-ai, coaching, memroos, quantified-self, agent-memory, behavior-change, privacy, architecture]
keywords: [personal intelligence, AI coach, ChatGPT export, Claude Code, Codex sessions, Gemini Takeout, Grok export, ActivityWatch, screenpipe, Hindsight, JITAI, N-of-1]
author: "Codex"
source_session: "Codex desktop task 2026-08-06"
model: "gpt-5"
sources:
  - "attachment:pasted-text.txt"
  - "local:/home/lac5q/.codex/sessions"
  - "local:/home/lac5q/.claude/projects"
  - "local:/home/lac5q/.cursor/projects"
  - "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data"
  - "https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-data"
  - "https://support.google.com/gemini/answer/16920332?hl=en"
  - "https://x.ai/legal/faq"
  - "https://github.com/heygaia/gaia"
  - "https://github.com/screenpipe/screenpipe"
  - "https://github.com/ActivityWatch/activitywatch"
  - "https://github.com/marswangyang/personal-ai-memory"
  - "https://github.com/queelius/ctk"
  - "https://github.com/joshuaswarren/remnic"
  - "https://github.com/vectorize-io/hindsight"
  - "https://github.com/getzep/graphiti"
  - "https://github.com/khoj-ai/khoj"
  - "https://www.nature.com/articles/s41562-025-02397-x"
  - "https://arxiv.org/abs/2602.15848"
  - "https://pmc.ncbi.nlm.nih.gov/articles/PMC9755932/"
  - "https://www.nature.com/articles/s43856-025-01321-8"
derived_from:
  - "content/coach/runs/2026-07-06.md"
  - "content/coach/runs/2026-07-07.md"
  - "content/job-search/intuit-project-map-from-goals-roadmaps-and-reviews-2026-07-17.md"
  - "content/job-search/master-tmay-interview-story-library-2026-07-22.md"
  - "content/research/luis-uvp-adversarial-validation-2026-07-06.md"
  - "content/research/memroos-vs-hindsight-mem0-cognee-2026-08-04.md"
  - "content/plans/gsd-v8-38-observability-gated-memory-engine-roadmap-2026-08-04.md"
  - ".planning/notes/2026-07-27-connector-ingestion-design.md"
  - ".planning/notes/2026-06-23-proactive-recollection-gsd-requirement.md"
regen_prompt: "Re-audit Luis's available MemroOS evidence and local Codex, Claude, Cursor, Gemini, and Grok data; refresh current export mechanisms and comparable open-source projects; then update the MemroOS-centered personal intelligence coach architecture, hypotheses, guardrails, and phased implementation plan."
---

# Personal Intelligence Coach: MemroOS-Centered Strategy

## Executive recommendation

Build a private evidence-to-intervention loop:

1. Capture first-party events from AI sessions, communications, calendar, tasks, meetings, and later passive activity.
2. Preserve raw evidence with source identity, timestamps, permissions, and hashes.
3. Normalize it without discarding provider-specific structure.
4. Extract commitments, decisions, outcomes, friction, and success signals.
5. Promote only repeated, corroborated patterns into reviewable coaching hypotheses.
6. Let Luis confirm, reject, or edit each hypothesis.
7. Test one small intervention at a time and measure whether it helps.
8. Keep MemroOS as the policy, provenance, audit, and durable-knowledge control plane.

Do not begin with a generalized chatbot or replace MemroOS. The missing product is the closed loop between evidence, calibrated hypothesis, intervention, and measured outcome. Hindsight is a strong optional learning engine, but should sit behind the planned MemroOS adapter, enter through dual-write/shadow-read, and earn promotion in controlled tests.

## What is available now

### Local AI activity

A read-only audit found:

| Source | Local material | First-party prompts | Date span |
|---|---:|---:|---|
| Codex | 170 JSONL files, about 216 MB | 1,451 | 2026-04-15 to 2026-08-06 |
| Claude Code | 80 JSONL logs | 1,005 | 2026-04-15 to 2026-08-05 |
| Cursor | 24 JSONL conversation logs | 95 | 2026-07-14 to 2026-07-19 |
| Gemini CLI | Config and skill files; no local chat corpus found | 0 discovered | n/a |

That is enough for a first work-pattern pilot. Consumer ChatGPT, Claude web, Gemini, and Grok need official exports or local browser capture.

### MemroOS evidence

MemroOS already contains:

- two persisted daily coach runs combining calendar, Gmail metadata, reminders, and a next-action ledger;
- professional evidence showing large-scale transformation, team leadership, operating leverage, and hands-on agent building;
- historical feedback summarized as growth areas in communication, prioritization, artifact quality, and stakeholder pre-alignment;
- an adversarial narrative review showing a strong core story can become overcompressed, overly broad, or insufficiently bounded by attribution and proof;
- email/meeting ingestion foundations, proactive recall, an agent context bus, governance, and a current Hindsight shadow-evaluation roadmap.

Caveat: this is not a validated longitudinal personality model. Two coach runs are snapshots. A 2026-07-27 MemroOS audit also says connected providers are mainly pull-on-demand; continuous connector ingestion is not yet implemented. “Connected” does not mean the full corpus is indexed.

## Initial high-leverage areas

These are hypotheses, not diagnoses.

| Area | Evidence | Confidence | Coach target |
|---|---|---:|---|
| Systems transformation and operating leverage | Repeated enterprise, operator, and AI-builder evidence | High strength | Amplify with evidence assembly and systems-level fixes |
| Customer economics plus trust | Product stories balance growth, simplification, pricing, and customer fit | High strength | Make this an explicit decision lens |
| Coaching and team development | Luis emphasizes role clarity, confidence, trust, and calm standards | Medium-high strength | Prepare stakeholder-specific coaching and delegation plans |
| Execution hygiene under load | Calendar collisions, reminder debt, last-minute resolution, buried alerts | Medium constraint | Commitment ledger, conflict prevention, earlier escalation |
| Prioritization and pre-alignment | Historical performance feedback | Medium-high constraint | Identify decision, stakeholders, objections, evidence, and pre-wire order |
| Artifact clarity and claim calibration | Historical feedback plus attribution/overclaim review | Medium-high constraint | Claim-evidence-boundary gate before important sends |
| Tool/context fragmentation | Many AI surfaces and divergent memories | High system constraint | One governed evidence layer and bounded task context |
| Breadth outrunning closure | Suggested by broad project surface; not yet measured | Low-medium | Measure WIP, reopen rate, promise age, and shipped/started ratio |

The first product should focus on execution hygiene, pre-alignment, artifact quality, and fragmentation. These are observable, high impact, and safer than personality labeling.

## Architecture

### MemroOS control plane

MemroOS remains canonical for source identity, scopes and labels, raw-vault retention, provenance, audit, knowledge documents, memory-engine adapters, user correction, and skills.

Use one MemroOS space per connector/account plus a synthetic source actor. Do not attribute every imported issue, email, or utterance to Luis merely because he connected the account.

### Staging and normalization

Keep each provider export intact in a sealed raw lane. Record checksum, export timestamp, provider account, parser version, and source URI. Normalize provider data while preserving conversation/message IDs, branches, sender/role, timestamps, attachments, tool calls, workspace, source account, and permitted purposes.

Conversation Toolkit is a useful reference for branch-preserving provider importers. Its store should not become a second memory authority.

### Event taxonomy

Start with:

- conversation.turn
- email.message and email.thread
- calendar.event and calendar.change
- task.created, task.updated, task.completed, task.overdue
- meeting.utterance, meeting.decision, meeting.commitment
- agent.run, agent.tool_call, agent.outcome
- code.commit, issue.change, document.revision
- app.activity and focus.block
- self_report.energy, stress, and confidence

Derived primitives:

- commitment: owner, due date, status, evidence;
- decision: alternatives, choice, rationale, stakeholders;
- outcome: intended and actual result;
- friction: delay, rework, conflict, escalation, repeated question;
- strength episode: behavior producing a useful result;
- hypothesis: support, counter-evidence, confidence, scope;
- intervention: trigger, recommendation, approval mode, outcome.

### Deterministic features before LLM inference

Measure:

- calendar overlap and time-to-resolution;
- commitments made, closed, overdue, and reopened;
- reply latency by relationship and importance;
- unanswered outbound follow-ups;
- task age and work-in-progress;
- planned versus actual focus blocks;
- context switches;
- repeated AI prompts about the same unresolved problem;
- artifacts revised after stakeholder objections;
- meeting commitments captured versus completed;
- times when completion quality is strongest;
- started, shipped, and abandoned initiatives.

LLMs explain patterns only after these measurements and must cite event IDs plus counter-evidence.

### Hypothesis lifecycle

Never store “Luis is X” as an unquestioned fact. Store a versioned hypothesis with scope, support, contradictions, source diversity, date window, model/prompt version, confidence, user verdict, next experiment, and expiry.

A practical promotion rule: at least three episodes across two weeks, preferably from two source types, before a hypothesis drives proactive coaching.

Formal self-report should anchor personality. A validated Big Five instrument can establish a prior; events test situational behavior. Recent research supports moderate convergence between LLM estimates and questionnaires, not equivalence. The model is an evidence organizer, not a psychologist.

### Action safety

Begin read-only and draft-only. The coach may surface, summarize, prioritize, draft, and recommend. It should not initially send messages, reschedule meetings, make payments, publish, alter customer/employee records, diagnose mental health, or cross connector spaces without policy.

## The daily product

### Morning, under three minutes

1. Three commitments that most affect the day.
2. One likely collision or failure mode.
3. One 10-minute preventative move.
4. One “not today” item.

### Before an important meeting

Generate the desired decision, stakeholder interests, objections, pre-wire order, needed evidence, one-sentence ask, and commitments not to make casually.

### After meetings and communications

Extract draft commitments with owner, due date, and evidence. Luis confirms them. Watch for staleness before urgency.

### Before a high-impact artifact

Ask:

1. What decision should this produce?
2. Is the main claim bounded and attributable?
3. What evidence supports it?
4. What will a skeptic attack?
5. Can it become one clear ask plus an appendix?

### End of day

Collect a 30-second correction: what mattered that was missed, which nudge helped or annoyed, what promise changed, and one-tap energy/stress.

### Weekly

Report evidence-backed wins, repeated friction, one confirmed or rejected hypothesis, one experiment, a scorecard, and the personal-model change log.

## Evaluation

Borrow from just-in-time adaptive interventions and micro-randomized trials: vary timing or framing only for low-risk nudges and measure proximal outcomes.

First six-week metrics:

- same-day calendar conflicts;
- overdue high-impact commitments;
- early follow-ups;
- preventable stakeholder objections;
- artifacts returned for clarity/evidence;
- usefulness and interruption cost;
- commitments completed;
- deep-work blocks protected;
- rejected/corrected hypotheses;
- recommendations that produced action.

More memories and more notifications are not success.

## What to borrow from other projects

| Project | Borrow | Avoid |
|---|---|---|
| GAIA | Event workflows, cross-tool tasks, approval inbox | Whole-stack duplication and its noncommercial license |
| screenpipe | Event-driven local capture and allow/deny rules | Always-on screenshots/audio at the start |
| ActivityWatch | Local app/window/AFK telemetry | Equating app time with productivity or personality |
| personal-ai-memory | Passive multi-platform browser capture and export/import UX | IndexedDB as canonical truth |
| Conversation Toolkit | Importers and branch-preserving conversation model | A second permanent memory authority |
| Remnic | Scopes, provenance, correction, trust zones, lifecycle, evals | Replacing MemroOS |
| Hindsight | Retain/recall/reflect and mental models | Direct replacement without shadow tests |
| Graphiti | Temporal validity, supersession, episode provenance | Early graph complexity |
| Khoj | Scheduling and personal-agent UX | Another fragmented assistant surface |

## Ingestion order

### Phase 1: high-signal, low-risk

1. Codex JSONL.
2. Claude Code JSONL.
3. Cursor JSONL.
4. Existing MemroOS knowledge, coach runs, and meeting indexes.
5. Calendar and task/reminder state changes.
6. Official AI provider exports.

### Phase 2: communications

1. Gmail metadata and selected high-signal bodies.
2. Meeting decisions, commitments, and transcripts.
3. Slack/Discord/Teams mentions and threads, per-space and consent-gated.
4. Relationship graph.

Start with metadata and commitments. Index full bodies only when necessary.

### Phase 3: passive activity

1. ActivityWatch app/window/AFK events.
2. Browser-domain and focus-block telemetry.
3. Optional screenpipe OCR with deny-by-default rules.
4. If “watch activities” means wearables, Apple Health/Watch summaries in a restricted wellness space with no diagnostic inference.

## Export plan

- ChatGPT: official consumer export includes chat history; Business/Enterprise availability differs.
- Claude: Settings → Privacy export includes conversation and account data for eligible plans.
- Gemini: Takeout can export Gemini Apps activity, chats, generated media, and uploads.
- Grok: Grok.com/mobile Settings → Data Controls supports download; Grok on X is governed separately.
- Ongoing web capture: use a reviewed, pinned local extension only as a sensor feeding a governed import queue.

## Privacy and security

- Seal and encrypt raw exports.
- Derived features inherit the strictest source label.
- Keep third-party communications in connector spaces.
- Cross into the coach space with aggregates unless raw access is explicit.
- Scan secrets and prompt injection before indexing.
- Support source deletion and idempotent re-import.
- Record evidence and parser/model version for every claim.
- Make “why?” and “forget/correct” first-class actions.
- Use local models for sensitive extraction when quality is adequate.
- Do not assess other people's personality.
- Never treat work-tool usage as the whole person.

## Six-week implementation plan

### Week 1

Build read-only Codex, Claude Code, and Cursor adapters; hash, normalize, dedupe, assign source spaces, and report coverage/failures.

### Week 2

Add calendar/task/commitment features. Recreate the coach run as a deterministic report. Build evidence review before chat UI.

### Week 3

Run a validated self-report baseline. Generate cited candidate strengths/constraints with counter-evidence. Luis confirms/rejects them. Create a versioned Personal Operating Manual living brief.

### Week 4

Ship morning, pre-meeting, post-meeting, artifact, and end-of-day loops. Keep external actions draft-only.

### Weeks 5–6

Measure usefulness and interruption. Retire weak nudges. Add selected email/meeting content. Trial ActivityWatch. Only later consider screenpipe/wearables. Run Hindsight in shadow when MemroOS Phase 229 prerequisites are ready.

## Immediate build target

For the currently empty coach workspace:

“Import local Codex, Claude Code, and Cursor histories into governed source spaces; compute commitments, project/topic distribution, repeated unresolved asks, WIP, and completion evidence; produce a reviewable weekly report with five evidence-backed hypotheses and no autonomous actions.”

Acceptance criteria:

- every claim cites events;
- raw and derived records are separable;
- rejected hypotheses cannot drive nudges;
- re-import is idempotent;
- deletion propagates;
- secrets and restricted content stay out of briefs;
- reports are reproducible;
- connectors cannot widen their own scope;
- all output separates observation, inference, and recommendation.

## Bottom line

The relevant areas can be discovered, but not by asking one model to list weaknesses from a data dump. The robust method is:

formal self-report + repeated observed behavior + outcomes + user correction + small experiments.

The strongest current opportunity is to apply Luis's strengths in systems, product judgment, and coaching against observable friction: fragmented context, overloaded commitments, late conflict resolution, stakeholder pre-alignment, and artifact/claim clarity.