---
title: "Gap Audit: Luis Executive Coaching Integration Plan"
name: "luis-executive-coaching-plan-gap-audit"
description: "Prioritized audit of what is missing from the executive coaching integration plan before it can guide a safe, measurable implementation."
publishedAt: "2026-08-06"
tags: [executive-coaching, plan-review, personal-intelligence, memroos, governance]
keywords: [coaching profile, interview, data ingestion, measurement, privacy, stakeholder feedback, Luna-Max]
author: "Codex"
source_session: "Codex desktop task 2026-08-06"
model: "gpt-5.6-sol"
sources:
  - "content/coach/luis-executive-coaching-integration-plan-2026-08-06.md"
  - "content/coach/personal-intelligence-coach-strategy-2026-08-06.md"
  - "attachment:pasted-text.txt"
  - "Google Doc: https://docs.google.com/document/d/1-148VCCV7A6YOKgTek2sPqGUOBB_J2qJ9cAmD0DOldA/edit?tab=t.0"
  - "Luis Calderon DISC & Motivators report, dated 2025-02-06"
derived_from:
  - "content/coach/luis-executive-coaching-integration-plan-2026-08-06.md"
  - "content/coach/personal-intelligence-coach-strategy-2026-08-06.md"
regen_prompt: "Compare the latest Luis executive coaching integration plan against the prior personal-intelligence strategy, available assessment and survey evidence, implementation requirements, privacy controls, and measurable coaching outcomes; rank missing elements by execution risk."
---

# Gap Audit: Luis Executive Coaching Integration Plan

## Bottom line

The current plan is a sound direction memo. It correctly separates evidence from inference, treats Tony Robbins as one practitioner layer, preserves the original Google Doc, includes human review, and proposes measurable daily coaching.

It is not yet an executable product or coaching-program specification. It promises several essential deliverables—the actual prefilled interview, Coaching Profile v1, source inventory, technical design, privacy matrix, baseline, and intervention protocols—but does not contain them. The largest risk is proceeding from an attractive conceptual profile directly to daily nudges without first defining the user's priority outcomes, data boundaries, baseline, and correction mechanisms.

## Priority 0: required before implementation

### 1. A concrete outcome hierarchy

The plan does not state which life or executive outcomes matter most now. “Growth,” “certainty,” and “sustainable energy” are useful themes but cannot choose between competing work, relationship, financial, and wellbeing priorities.

Add:

- one primary 90-day outcome;
- no more than three supporting outcomes;
- one leadership behavior to change first;
- explicit tradeoffs and “not now” areas;
- success and failure conditions observable by Luis and, where appropriate, stakeholders.

Without this, the coach may optimize activity, calm, or responsiveness while missing the result Luis actually values.

### 2. The actual prefilled interview

The plan describes an interview but does not formulate it. The original request asked for the interview itself and asked that known answers be filled in honestly.

Add the actual question set with:

- current prefilled answer;
- source;
- confidence;
- conflicting evidence;
- missing field;
- easy response format;
- decision that the answer will affect.

The essential first interview should be closer to 10–12 high-value corrections than a broad biography.

### 3. A current source and coverage inventory

The plan lists possible sources but does not show what is available, missing, stale, export-only, or continuously connected.

Add a table for each source:

- account and identity;
- date range;
- record count;
- raw location;
- ingestion status;
- permissions;
- sensitivity;
- refresh mechanism;
- known omissions;
- deletion capability.

The prior strategy already found meaningful local Codex, Claude Code, and Cursor corpora, while consumer ChatGPT, Claude web, Gemini, and Grok still require exports or capture. That distinction should be visible in the execution plan.

### 4. A consent and third-party privacy matrix

“Read-only” is insufficient when emails, meetings, Slack, and relationship data include other people.

Add source-by-purpose authorization:

- what may be ingested;
- whether bodies or only metadata are allowed;
- what may be used for personal coaching;
- what may be quoted;
- who may see derived conclusions;
- retention and deletion periods;
- prohibited domains;
- rules for intimate, medical, legal, financial, employee, customer, and family content;
- a kill switch and full revocation path.

The system must not infer or score other people's personality simply because they communicated with Luis.

### 5. A technical architecture and data contract

The plan names an evidence ledger but does not specify an implementable system.

Add:

- raw-vault versus normalized-event versus durable-knowledge boundaries;
- canonical event, commitment, decision, outcome, hypothesis, intervention, and correction schemas;
- identity/entity resolution across accounts;
- idempotent imports and source deletion propagation;
- encryption, secrets handling, access control, backup, and recovery;
- search/recall design and the precise role of MemroOS versus optional Hindsight;
- scheduler, connector, and observability components;
- model version, prompt version, and evidence IDs on derived claims;
- failure queues, retry policy, and parser/data-quality reports.

Without these, “aggregate everything” can become an ungoverned data dump.

### 6. Baseline and causal measurement

The scorecard lists useful metrics but no baseline duration, targets, attribution method, or instrumentation.

Add:

- a 7–14 day observation-only baseline;
- metric definitions and data sources;
- target ranges rather than vanity counts;
- an experiment registry;
- one intervention at a time where possible;
- adherence and interruption-cost measures;
- a record of suggestions accepted, rejected, corrected, and ignored;
- criteria for retiring an intervention;
- day 7, 14, and 30 review decisions.

This is necessary to know whether coaching helps rather than merely coinciding with change.

### 7. Correction, forgetting, and contradiction workflows

The evidence hierarchy is good, but there is no user-facing control for a wrong claim.

Add first-class actions:

- “Why do you think this?”
- “That is wrong.”
- “True only in this context.”
- “Forget this source or claim.”
- “Show counter-evidence.”
- “Expire/retest this belief.”
- “Do not use this for coaching.”

Define promotion thresholds, confidence updates, contradiction handling, expiry, rollback, and how rejected hypotheses are prevented from driving future nudges.

### 8. An operational safety and escalation protocol

The plan says the system is not therapy, but it does not define what happens when data suggests severe exhaustion, acute distress, health risk, coercion, or unsafe behavior.

Add:

- boundaries between executive coaching, medical care, and mental-health support;
- when the agent should stop interpretation and recommend a qualified human;
- emergency/crisis non-automation language;
- contraindication review for intensive breathwork or other physical practices;
- no manipulative “pain leverage,” shame, or pressure tactics;
- an incident log and kill switch.

### 9. Exact execution ownership, dependencies, cost, and schedule

The phases lack estimates, owner/accountability, required connectors, cost ceilings, and blocking decisions.

Add for each phase:

- owner and reviewer;
- inputs and outputs;
- dependencies;
- time and cost budget;
- acceptance checks;
- approval gate;
- rollback;
- durable artifact path.

### 10. Resolve the Luna-Max lane

The plan requires Luna-Max but current preflight did not find a resolvable Luna-Max model. An alias exists for `gpt-5.6-luna`, which may or may not be what Luis intended.

Before fan-out:

- define exact provider/model;
- select the harness;
- prove requested versus actual model provenance;
- state concurrency and budgets;
- prohibit silent fallback;
- define what work is mechanical enough to delegate.

## Priority 1: important for coaching quality

### 11. A validated personality baseline beyond DISC

DISC/Motivators can generate useful coaching hypotheses but should not carry the full personality model. Add an optional validated Big Five or HEXACO self-report, plus context-specific examples and stakeholder observations. The goal is triangulation, not more labels.

### 12. A coaching-method selection matrix

The plan names RPM, Six Human Needs, the state triad, CANI, MCII/WOOP, deliberate practice, and stakeholder feedforward, but does not map them to problems, evidence strength, measures, or limits.

Add a matrix with:

- intervention;
- target condition;
- evidence/practitioner basis;
- burden;
- safety constraints;
- success metric;
- stop rule.

The Tony layer should also evaluate modeling, values/rules, identity and belief reframing, standards/rituals, strategic questions, and accountability. Each should be retained only when it has a clear target and safe measurement.

### 13. The actual Coaching Profile v1

The plan contains source summaries, not the final profile. The profile should present:

- strengths and proof episodes;
- situational derailers;
- energizers/depleters;
- communication and decision preferences;
- stress contexts;
- stakeholder impact;
- confidence and counter-evidence;
- what remains unknown;
- a short Personal Operating Manual;
- version history.

### 14. Stakeholder program details

The plan mentions feedforward but not how to run it.

Add:

- stakeholder-selection criteria;
- consent and confidentiality;
- initial anonymous 360 questions;
- one chosen behavior;
- monthly five-minute feedforward prompts;
- mini-survey wording;
- who can see raw responses;
- protection against retaliation or relationship damage;
- exit criteria.

### 15. Concrete coaching experiences

The morning/evening outline needs actual output templates, timing rules, notification limits, and examples.

Define:

- daily brief format;
- pre-meeting brief;
- commitment confirmation;
- artifact-quality gate;
- end-of-day correction;
- weekly review;
- quiet hours;
- maximum nudges;
- priority/urgency logic;
- snooze, mute, and disable controls.

### 16. Data-quality and adversarial evaluation

Add test sets and failure cases:

- quoted text misattributed to Luis;
- agent/subagent prompts mistaken for user intent;
- duplicates across AI exports;
- sarcasm and brainstorming treated as commitments;
- stale calendars;
- conflicting identities;
- prompt injection in email or documents;
- sensitive data leaking into a brief;
- plausible but unsupported personality claims.

### 17. Competitive/project synthesis

The plan cites sources but omits the earlier borrow/avoid decisions across ActivityWatch, screenpipe, Hindsight, Graphiti, Khoj, Conversation Toolkit, and related projects. A product plan needs explicit architecture decisions, not just references.

### 18. Separation of executive and whole-life coaching

Work, money, spirituality, relationships, health, and identity have different sensitivity, success criteria, and appropriate interventions. Define domain boundaries and whether the executive coach, personal coach, and wellness signals are separate views over the same evidence layer.

## What the current plan gets right

Preserve these elements:

- evidence versus inference labeling;
- recognition that repeated AI paraphrases are not independent evidence;
- reconciliation of “Dynamo” decisiveness with self-reported freezing;
- read-only/draft-only external actions in v1;
- one measurable behavior experiment at a time;
- stakeholder perception rather than self-report alone;
- preserving the original Tony export;
- no silent model substitution;
- MemroOS as durable knowledge and governance layer.

## Recommended revision sequence

1. Decide the primary 90-day outcome and one first behavior.
2. Write and run the prefilled interview.
3. Complete the source/coverage and consent matrices.
4. Produce Coaching Profile v1 and obtain Luis's corrections.
5. Specify the architecture, schemas, security, and deletion path.
6. Observe a baseline.
7. Select one coaching loop and its exact metric.
8. Resolve Luna-Max and delegate only objectively verifiable work.
9. Run a limited 30-day pilot.
10. Expand sources and autonomy only after measured benefit and low false-positive/privacy cost.

## Definition of a complete v2 plan

A revised plan is implementation-ready only when a different competent team could build and evaluate it without inventing core decisions about purpose, permissions, schemas, safety, metrics, models, or user experience.
