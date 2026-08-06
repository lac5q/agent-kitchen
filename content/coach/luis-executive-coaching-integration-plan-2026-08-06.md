---
title: "Luis Executive Coaching Integration Plan v2"
name: "luis-executive-coaching-integration-plan"
description: "Requirements-driven plan for a private, evidence-aware executive coaching system that must prove value before expanding data, inference, or autonomy."
type: plan
version: "2.0"
created: 2026-08-06
updated: 2026-08-06
publishedAt: "2026-08-06"
author: "Codex"
source_session: "Codex desktop task 2026-08-06"
model: "gpt-5.6-sol"
tags:
  - executive-coaching
  - personal-intelligence
  - tony-robbins
  - disc
  - memroos
  - privacy
  - requirements
  - adversarial-review
sources:
  - "Google Doc: https://docs.google.com/document/d/1-148VCCV7A6YOKgTek2sPqGUOBB_J2qJ9cAmD0DOldA/edit?tab=t.0"
  - "Luis Calderon DISC & Motivators report, dated 2025-02-06"
  - "Tony Robbins RPM: https://go.tonyrobbins.com/rpm"
  - "Tony Robbins Six Human Needs: https://www.tonyrobbins.com/personal-growth/need-for-significance"
  - "Tony Robbins Priming: https://www-prod.tonyrobbins.com/ask-tony/priming"
  - "Tony Robbins Emotional Triad: https://www.tonyrobbins.com/es/blog/tony-robbins-core-strategies-for-mastering-your-state"
  - "Executive coaching RCT meta-analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC10272735/"
  - "Workplace coaching meta-analysis: https://openresearch.surrey.ac.uk/esploro/outputs/journalArticle/The-effectiveness-of-workplace-coaching-A/99513563302346"
  - "Marshall Goldsmith Stakeholder Centered Coaching: https://www.marshallgoldsmith.com/post/stakeholder-centered-coaching"
  - "MCII/WOOP meta-analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC8149892/"
derived_from:
  - "content/coach/personal-intelligence-coach-strategy-2026-08-06.md"
  - "content/coach/luis-executive-coaching-plan-gap-audit-2026-08-06.md"
  - "content/coach/luis-executive-coaching-plan-counterarguments-2026-08-06.md"
  - "content/coach/runs/2026-07-06.md"
  - "content/coach/runs/2026-07-07.md"
  - "content/job-search/intuit-project-map-from-goals-roadmaps-and-reviews-2026-07-17.md"
  - "content/job-search/master-tmay-interview-story-library-2026-07-22.md"
  - "content/research/luis-uvp-adversarial-validation-2026-07-06.md"
regen_prompt: "Rebuild this requirements-driven plan from the current Google Doc, assessments, MemroOS evidence, source coverage, gap audit, and counterargument audit; require a minimal falsifiable pilot, privacy and correction controls, explicit phase gates, and measurable stop conditions."
---

# Luis Executive Coaching Integration Plan v2

## Executive decision

Build a small, reversible evidence-to-intervention loop before building a general personal-intelligence platform.

The first product is not “AI that knows everything about Luis.” It is a controlled coaching pilot that helps with one outcome and one behavior using the least sensitive evidence necessary. It must demonstrate value against a simpler manual alternative before adding communications, passive activity, personality inference, or autonomous actions.

The project proceeds in this order:

> define outcome → establish permissions → observe baseline → run prefilled interview → confirm Coaching Profile v1 → test one intervention → measure value and cost → expand only if earned.

## Intended outcome

Create a coaching system that:

1. helps Luis achieve one explicitly selected 90-day outcome;
2. turns evidence into scoped, correctable hypotheses rather than personality labels;
3. improves execution, communication, stakeholder alignment, energy management, or follow-through through one measurable behavior experiment at a time;
4. increases Luis's agency and learned skill rather than dependence;
5. keeps MemroOS as the durable governance, provenance, correction, and knowledge layer; and
6. protects Luis and other people through minimal collection, compartmentalization, and revocable permissions.

## Non-goals

The system is not:

- a clinical, mental-health, or medical diagnostic tool;
- a definitive model of Luis's personality;
- a personality profiler for coworkers, customers, family, or partners;
- an unrestricted searchable vault containing every raw message;
- a replacement for a qualified human coach, clinician, or trusted relationship;
- an employee-monitoring or performance-ranking system;
- an autonomous authority that sends sensitive messages, changes schedules, spends money, publishes, or makes consequential decisions;
- a reason to build more infrastructure when a manual practice works as well.

## What is already known

### Direct self-report

The Tony Robbins AI export contains 15 source answers:

- primary current need: certainty;
- recurring pattern: busy but not vital;
- self-described root condition: running empty;
- money, day-to-day, relationships, work/business, and meaning/direction: rough;
- health/energy: okay;
- primary obstacle: pressure and stress;
- desired outcome: growth;
- preferred coaching approach: why before what;
- momentum: slipping;
- change confidence: partly confident;
- desired future: calm, sustainable energy plus hope, fun, passion, and pride;
- pressure response: freeze;
- communication preference: straight with heart;
- present security/freedom tradeoff: security;
- significance/connection tradeoff: close;
- best-self reference: spirituality, identity, teaching, and passion.

The Google Doc contains extensive repeated AI interpretations. Repetition is not independent confirmation.

### Assessment evidence

The DISC/Motivators report labels Luis's style Dynamo: fast, decisive, persuasive, adaptable, energetic, group-confident, and able to mobilize others. Its explicit watch-outs include pressuring others, being perceived as manipulative or abrasive, difficulty saying no, and spreading too thin.

Its motivator narratives indicate practical/economic return, autonomy, influence, research, and freedom from rigid protocols. The supplied report does not expose numeric DISC graphs or motivator ranks, so these are narrative assessment results, not precise scores.

### Existing behavioral evidence

MemroOS supports strengths in systems transformation, operating leverage, customer economics and trust, hands-on building, and coaching teams through trust and role clarity.

Candidate constraints include execution hygiene under load, prioritization and stakeholder pre-alignment, claim calibration and artifact clarity, and tool/context fragmentation. “Breadth outruns closure” remains a hypothesis until measured.

### Current source coverage

| Source | Available now | Coverage caveat |
|---|---|---|
| Codex | 170 JSONL files; 1,451 first-party prompts; 2026-04-15 to 2026-08-06 | Must exclude system, environment, and subagent messages |
| Claude Code | 80 logs; 1,005 first-party prompts; 2026-04-15 to 2026-08-05 | Must exclude command output and subagent sessions |
| Cursor | 24 logs; 95 first-party prompts; 2026-07-14 to 2026-07-19 | Narrow time range |
| Gemini CLI | Configuration found; no local chat corpus | Unknown until export |
| Consumer ChatGPT, Claude web, Gemini, Grok | Not yet ingested | Requires official export or separately approved capture |
| MemroOS | Existing coach runs and professional evidence | Not a complete longitudinal record |
| Calendar/tasks/email/meetings | Some connector capability exists | Connected does not mean continuously indexed |

No coaching claim may imply coverage beyond this inventory.

# Requirements

Requirements use SHALL for a release-blocking obligation and SHOULD for a preferred behavior that can be waived only with a recorded rationale.

## A. Outcome and value requirements

**OUT-01 — One primary outcome.** Before ingestion or coaching begins, Luis SHALL choose one primary 90-day outcome.

**OUT-02 — One first behavior.** Luis SHALL select one observable behavior to improve first. Candidate behaviors include protecting vital work, earlier stakeholder pre-alignment, clearer artifact claims, or closing commitments.

**OUT-03 — Supporting priorities.** The plan SHALL allow no more than three supporting outcomes and SHALL record explicit “not now” areas.

**OUT-04 — Predefined success.** Luis SHALL define observable success, acceptable tradeoffs, and failure/stop conditions before the pilot.

**OUT-05 — Simpler comparator.** The system SHALL be compared against a concierge alternative: a manual morning brief, weekly review, and optional human accountability.

**OUT-06 — Earn complexity.** No new connector, sensor, model, or autonomous capability SHALL be added until the existing loop shows measurable value.

**OUT-07 — Value accounting.** Reviews SHALL track coaching benefit, time saved, attention cost, maintenance time, and direct model/infrastructure cost.

Addresses: overengineering, maintenance burden, and the risk that building the coach becomes busy but not vital.

## B. Evidence and epistemic requirements

**EVD-01 — Four evidence classes.** Every material claim SHALL be labeled direct self-report, assessment result, observed pattern, or hypothesis/unknown.

**EVD-02 — Scoped language.** Claims SHALL describe context and time window. “Observed in coding-agent use under project pressure” is acceptable; “Luis is always…” is not.

**EVD-03 — Provenance.** Every observed pattern SHALL cite source event IDs, source account, timestamp range, parser version, and model/prompt version.

**EVD-04 — Counter-evidence.** Every promoted hypothesis SHALL include contradictory episodes or state that none were found within the covered sources.

**EVD-05 — Promotion threshold.** A hypothesis SHALL NOT drive proactive coaching until supported by at least three distinct episodes across two weeks and, when practical, two source types.

**EVD-06 — No duplicate corroboration.** Copied prompts, quoted email, repeated exports, and AI paraphrases SHALL be deduplicated before source-diversity or frequency calculations.

**EVD-07 — Attribution.** System prompts, tool output, subagent instructions, quoted text, other people's statements, and Luis-authored text SHALL be distinguished.

**EVD-08 — Contradictions preserved.** Conflicting claims SHALL coexist with scope, evidence, timestamp, and user verdict rather than being flattened into one narrative.

**EVD-09 — Expiry.** Every behavioral hypothesis SHALL have an expiry or review date.

**EVD-10 — User correction.** Luis SHALL be able to mark a claim wrong, context-limited, stale, sensitive, or prohibited for coaching.

**EVD-11 — Forgetting.** A forgotten or rejected claim SHALL stop appearing in briefs and SHALL NOT influence future nudges.

**EVD-12 — Explainability.** Every coaching recommendation SHALL answer: why this, why now, based on what, what is uncertain, and what would disconfirm it.

**EVD-13 — Unknown means unknown.** Insufficient or stale coverage SHALL result in “unknown,” never confident interpolation.

**EVD-14 — Personality triangulation.** DISC and Six Human Needs SHALL be treated as reflection frameworks. Important personality claims SHOULD be triangulated with an optional Big Five or HEXACO self-report, situational behavior, outcomes, and stakeholder observations.

**EVD-15 — No profiling others.** The system SHALL NOT infer, store, or surface personality traits of other people without their explicit participation.

Addresses: data is not the person, selection bias, self-fulfilling labels, framework limitations, and one canonical memory becoming one canonical mistake.

## C. Consent, privacy, and third-party requirements

**PRV-01 — Source-purpose matrix.** Each source SHALL have approved purposes, permitted fields, sensitivity, retention, model-routing policy, and deletion method.

**PRV-02 — Data minimization.** Collection SHALL begin with the smallest fields needed for the selected outcome.

**PRV-03 — Metadata first.** Communications SHALL begin with metadata and Luis's commitments. Full bodies require a separately approved use case.

**PRV-04 — Compartmentalized raw data.** Raw exports SHALL remain in encrypted, source-scoped vaults. They SHALL NOT be copied wholesale into a universally searchable memory index.

**PRV-05 — MemroOS role.** MemroOS SHALL be the canonical control plane for provenance, permissions, corrections, durable derived knowledge, and audit—not an unquestioned authority about personal truth.

**PRV-06 — Sensitivity inheritance.** Derived records SHALL inherit the strictest sensitivity and sharing restriction of their source evidence.

**PRV-07 — Third-party protection.** Briefs SHALL minimize or redact names and content of coworkers, customers, friends, family, and partners unless necessary and authorized.

**PRV-08 — Restricted domains.** Medical, intimate, legal, financial, employee-performance, customer-confidential, and family content SHALL be disabled by default and require separate authorization.

**PRV-09 — Work-policy compliance.** Employer, customer, contractual, retention, and recording policies SHALL be reviewed before work communications or transcripts are ingested.

**PRV-10 — Local/cloud routing.** Sensitive extraction SHOULD use local models when quality is adequate. Any cloud routing SHALL be logged and constrained by source policy.

**PRV-11 — Secrets and injection scanning.** Raw material SHALL be scanned for credentials, private keys, prompt injection, and malicious instructions before model ingestion.

**PRV-12 — Revocation.** Luis SHALL be able to disable a source immediately and initiate deletion of raw and derived records.

**PRV-13 — Deletion propagation.** Source deletion SHALL propagate to indexes, derived claims, caches, and future briefs, with an auditable receipt.

**PRV-14 — Access audit.** Reads, writes, exports, deletions, and cross-space joins SHALL be logged.

**PRV-15 — Backups and recovery.** Backup, key management, restoration, and secure deletion procedures SHALL be defined and tested before sensitive communications are added.

**PRV-16 — Kill switch.** A single control SHALL disable ingestion, nudges, and external connector access without destroying evidence needed for incident review.

Addresses: breach concentration, self-hosting overconfidence, other people's consent, employer/legal constraints, and hidden cloud exposure.

## D. Data architecture and quality requirements

**DAT-01 — Three-layer boundary.** The architecture SHALL separate sealed raw evidence, normalized events, and reviewable durable knowledge.

**DAT-02 — Canonical schemas.** The system SHALL define schemas for event, commitment, decision, outcome, friction episode, strength episode, hypothesis, intervention, correction, and stakeholder observation.

**DAT-03 — Identity resolution.** Provider accounts, workspaces, people, quoted speakers, agents, and synthetic actors SHALL remain distinct.

**DAT-04 — Idempotency.** Re-importing the same export SHALL NOT create duplicate events or evidence.

**DAT-05 — Source fidelity.** Provider-specific IDs, branches, timestamps, roles, attachments, edits, and thread relationships SHALL be preserved where available.

**DAT-06 — Coverage report.** Every import SHALL produce counts, date range, parse failures, excluded records, duplicate rate, and known omissions.

**DAT-07 — Data-quality test corpus.** Tests SHALL cover quoted text, sarcasm, brainstorming versus commitments, copied prompts, subagent messages, stale calendars, conflicting identities, deleted sources, and prompt injection.

**DAT-08 — Graceful degradation.** A stale or unavailable connector SHALL reduce confidence and surface a coverage warning rather than break the coach or fabricate continuity.

**DAT-09 — Hindsight boundary.** Hindsight MAY support retain/recall/reflect only behind a MemroOS adapter, shadow evaluation, provenance preservation, and explicit promotion gate. It SHALL NOT silently become a second canonical memory.

**DAT-10 — No passive capture at launch.** Browser, screen, audio, and wearable capture SHALL remain disabled until the minimal pilot demonstrates value and passes a separate privacy review.

**DAT-11 — Reproducibility.** A report SHALL be reproducible from its evidence snapshot, parser version, feature version, and model/prompt version.

**DAT-12 — Observability.** Ingestion failures, model errors, stale data, policy denials, correction failures, and deletion failures SHALL be visible in an operator report.

Addresses: brittle connectors, false completeness, data-dump architecture, source confusion, and platform-maintenance risk.

## E. Coaching-method requirements

**COA-01 — Prefilled interview deliverable.** Before Coaching Profile v1, the system SHALL produce the actual 10–12 question essential interview, not merely an interview outline.

Each question SHALL include:

- current prefilled answer;
- source and confidence;
- conflicting evidence;
- genuinely missing field;
- why the answer changes the plan;
- an easy correction or selection format.

**COA-02 — Profile review.** Coaching Profile v1 SHALL be reviewed and corrected by Luis before it drives nudges.

**COA-03 — Situational profile.** The profile SHALL organize behavior by context: under pressure, in decision mode, in relationship mode, when depleted, and when ambitious.

**COA-04 — Strength amplification.** Every constraint-focused intervention SHOULD identify a strength that can be used to address it.

**COA-05 — One intervention.** The pilot SHALL test one low-risk intervention at a time when practical.

**COA-06 — Method selection matrix.** Each method SHALL list target condition, basis, expected benefit, burden, contraindications, metric, and stop rule.

Methods to evaluate include:

- RPM for result, purpose, and action mapping;
- the state triad as an optional short reset;
- Six Human Needs as reflection vocabulary;
- CANI as incremental review;
- mental contrasting and if-then planning;
- deliberate practice;
- stakeholder feedforward;
- modeling;
- values, rules, identity, and belief reframing;
- standards and rituals;
- strategic questions and accountability.

**COA-07 — Practitioner versus evidence.** Tony Robbins-originated methods SHALL be distinguished from independently evaluated behavioral mechanisms.

**COA-08 — Optional state practices.** Breathwork, visualization, priming, or other physical practices SHALL be optional, user-selected, and free of unsupported medical claims.

**COA-09 — No coercive leverage.** Shame, humiliation, manipulative pain amplification, or escalating emotional intensity SHALL NOT be default coaching mechanisms.

**COA-10 — Stakeholder consent.** Stakeholder feedback SHALL be voluntary, purpose-limited, and protected from retaliation or inappropriate disclosure.

**COA-11 — One stakeholder behavior.** Stakeholder-centered coaching SHALL focus on one chosen observable behavior, monthly feedforward, and brief perception checks.

**COA-12 — Human compatibility.** Luis SHALL be able to export a concise evidence summary for a human coach while choosing which details remain private.

**COA-13 — Domain separation.** Executive, personal, relationship, financial, spiritual, and wellness coaching SHALL remain separate views unless Luis explicitly authorizes a cross-domain synthesis.

**COA-14 — Skills over dependence.** The coach SHOULD teach repeatable planning, communication, and reflection skills rather than merely supply answers.

**COA-15 — Personal Operating Manual.** The confirmed profile SHALL produce a versioned Personal Operating Manual with strengths, triggers, communication preferences, effective supports, current experiments, uncertainties, and change history.

Addresses: human-coach superiority, DISC/Tony limitations, cross-domain harm, stakeholder ethics, and AI dependence.

## F. Action safety and wellbeing requirements

**SAF-01 — Advisory default.** Version 1 SHALL remain read-only and draft-only for external systems.

**SAF-02 — Consequential actions prohibited.** The system SHALL NOT autonomously send relationship-sensitive or professional messages, reschedule meetings, publish, spend money, alter customer/employee records, or make legal, medical, financial, or employment decisions.

**SAF-03 — Context check.** High-impact advice SHALL surface missing context and require Luis's confirmation of the factual premise.

**SAF-04 — Domain escalation.** The system SHALL define when an issue exceeds executive coaching and should be taken to a qualified human coach, clinician, attorney, financial professional, or trusted person.

**SAF-05 — Distress boundary.** Severe exhaustion, acute distress, coercion, danger, or crisis indicators SHALL stop personality interpretation and trigger a clear human-support recommendation. The system SHALL NOT present itself as emergency support.

**SAF-06 — Incident handling.** Harmful advice, privacy incidents, incorrect external drafts, and failed deletion SHALL enter an incident log and may pause the affected capability.

**SAF-07 — Confidence thresholds.** Low-confidence recommendations SHALL be phrased as questions or omitted.

**SAF-08 — Manual override.** Luis SHALL be able to mute, snooze, disable, correct, and delete without arguing with the model.

Addresses: incomplete context, unsafe advice, therapy substitution, and overconfident automation.

## G. User-experience and anti-surveillance requirements

**UX-01 — Pull before push.** The first pilot SHALL use user-requested or scheduled morning and weekly briefs rather than continuous interruption.

**UX-02 — Notification budget.** Luis SHALL set daily nudge limits, quiet hours, priority rules, and channels.

**UX-03 — No-coach mode.** Luis SHALL be able to pause coaching while retaining data controls and audit access.

**UX-04 — Sensor transparency.** Every brief SHALL show which sources were consulted and their freshness.

**UX-05 — Creepiness measure.** The pilot SHALL collect one-tap “useful,” “wrong,” “annoying,” and “creepy” feedback.

**UX-06 — Interruption cost.** Evaluation SHALL track time and attention consumed, not only actions completed.

**UX-07 — Independence measure.** Reviews SHOULD ask whether Luis is learning the skill and needing fewer prompts.

**UX-08 — No hidden inference.** The system SHALL NOT use undisclosed sources or silently widen connector scope.

**UX-09 — Exact templates.** The plan SHALL define the morning brief, pre-meeting brief, commitment confirmation, artifact gate, end-of-day correction, and weekly review formats before implementation.

Addresses: surveillance, dependence, nudge fatigue, and invisible data use.

## H. Evaluation and anti-Goodhart requirements

**EVAL-01 — Observation baseline.** Collect 7–14 days of baseline data before the first automated intervention, unless Luis explicitly waives this for a manual exercise.

**EVAL-02 — Pre-registered metric.** The primary outcome metric, behavior metric, qualitative success test, and stop rules SHALL be recorded before the pilot.

**EVAL-03 — Outcome hierarchy.** Operational metrics SHALL remain subordinate to the selected 90-day outcome and Luis's qualitative judgment.

**EVAL-04 — Balanced costs.** Evaluation SHALL include stress/energy, interruption, relationship impact, strategic opportunity cost, privacy cost, and maintenance cost.

**EVAL-05 — Experiment registry.** Every intervention SHALL have target, rationale, start/end dates, delivery record, adherence, outcome, confounders, and decision.

**EVAL-06 — Causal humility.** Reports SHALL distinguish observed change, plausible contribution, and causal proof.

**EVAL-07 — Confounder log.** Major work, health, relationship, travel, and environmental changes SHOULD be logged at a coarse, privacy-respecting level.

**EVAL-08 — Metric review.** Any metric that improves while the actual outcome, wellbeing, or relationship quality worsens SHALL be retired.

**EVAL-09 — False-positive rate.** The pilot SHALL measure wrong or irrelevant recommendations and unsupported claims.

**EVAL-10 — Review cadence.** Days 7, 14, and 30 SHALL produce keep, modify, narrow, or stop decisions.

**EVAL-11 — Manual comparator.** The go/no-go review SHALL ask whether a simpler checklist, human coach, or weekly review achieves the same result with less burden.

**EVAL-12 — Expansion gate.** More data SHALL NOT be the automatic response to a weak result. The default response is to narrow or stop.

Addresses: causal ambiguity, Goodhart's law, metric gaming, and “more data will rescue it.”

## I. Operations, model, and cost requirements

**OPS-01 — Phase contract.** Every phase SHALL state owner, reviewer, inputs, outputs, dependencies, time budget, model/cost budget, verification, approval, and rollback.

**OPS-02 — Model identity.** Requested provider/model and actual provider/model SHALL be recorded for every delegated task.

**OPS-03 — No silent substitution.** An unavailable Luna-Max lane SHALL block validated Luna-Max delegation until Luis approves an alternative.

**OPS-04 — Luna clarification.** Before fan-out, Luis SHALL confirm whether Luna-Max means the existing gpt-5.6-luna alias or a distinct provider/model.

**OPS-05 — Verification-cost routing.** Mechanical tasks SHOULD use the least expensive model that can be objectively verified, unless Luis explicitly accepts a more expensive model.

**OPS-06 — Delegated scope.** Extraction, deduplication, manifests, citation assembly, formatting, and mechanical checks MAY be delegated. Personality judgment, permissions, safety decisions, and final synthesis SHALL remain with the lead.

**OPS-07 — Usage report.** Each phase SHALL report requested/actual models, tokens or unavailable status, cost or unavailable status, elapsed time, and drift.

**OPS-08 — Maintenance ceiling.** Gate 0 SHALL define the maximum ongoing hours and expense acceptable for the coach.

**OPS-09 — Freeze expansion.** If maintenance exceeds value for two review cycles, new features and sources SHALL be frozen.

**OPS-10 — Secure public operations.** No sensitive coaching data, local auth, credentials, or private evidence SHALL enter public repositories, issues, logs, or model prompts outside approved routes.

Addresses: model drift, frontier-model waste, runaway maintenance, and operational opacity.

# Default source-permission posture

This table is the starting posture, not final authorization.

| Source | Default at pilot start | Expansion condition |
|---|---|---|
| Confirmed survey and DISC report | Allowed as labeled self-report/assessment | Luis correction |
| Selected MemroOS evidence | Read-only, provenance required | Source-level approval |
| Codex, Claude Code, Cursor histories | Inventory and deterministic aggregate only | Review coverage and examples before semantic profiling |
| Calendar and tasks | Read-only events and commitments | Outcome relevance established |
| Gmail | Metadata only | Selected bodies approved for a defined coaching purpose |
| Meetings/transcripts | Disabled | Consent, work policy, and retention approved |
| Slack/Teams/Discord | Disabled | Space-specific authorization and third-party protections |
| Consumer AI exports | Disabled until imported and reviewed | Coverage and parser report |
| Browser/app activity | Disabled | Pilot value plus separate privacy review |
| Screen/audio capture | Disabled | Separate high-risk decision; not assumed necessary |
| Health/wearables | Disabled and domain-separated | Explicit wellness authorization; no diagnosis |
| Relationship/intimate content | Disabled and domain-separated | Explicit use case and strict privacy review |

# Phase plan and blocking gates

## Phase 0 — Define value, permission, and execution lane

Deliverables:

- one primary 90-day outcome;
- one first behavior;
- success, failure, and “not now” definitions;
- maintenance and cost ceiling;
- source-purpose permission matrix;
- Luna-Max clarification and model preflight;
- initial safety and escalation boundaries.

**Gate 0:** No ingestion or Google Doc synthesis proceeds until Luis approves the outcome, first behavior, source posture, and exact model lane.

## Phase 1 — Concierge baseline

Use existing confirmed evidence, calendar/tasks if approved, and a manual brief. Do not build general ingestion.

Deliverables:

- actual prefilled 10–12 question interview;
- 7–14 day observation baseline;
- manual morning brief and weekly review;
- comparator record: what a checklist or human accountability provides;
- preliminary source inventory.

**Gate 1:** Continue only if the selected coaching problem is measurable and Luis finds the manual loop plausibly useful.

## Phase 2 — Minimal governed evidence ledger

Ingest only the smallest approved sources relevant to the selected outcome.

Deliverables:

- raw/normalized/knowledge boundaries;
- canonical schemas;
- identity and attribution tests;
- idempotent import and deletion propagation;
- coverage/data-quality report;
- correction, why, counter-evidence, expiry, and forget workflows;
- threat model for the included sources.

**Gate 2:** No personality hypothesis is promoted until data quality, deletion, attribution, and correction tests pass.

## Phase 3 — Coaching Profile v1 and Personal Operating Manual

Deliverables:

- strengths and proof episodes;
- contextual patterns and counter-evidence;
- energizers/depleters;
- decision/communication preferences;
- current derailers;
- stakeholder-impact hypotheses;
- unknowns;
- optional Big Five/HEXACO baseline;
- versioned Personal Operating Manual.

**Gate 3:** Luis confirms, edits, rejects, or scopes every material claim before the profile drives recommendations.

## Phase 4 — Google Doc integration

Preserve the original Tony AI export. Append:

**Evidence-Based Executive Coaching Synthesis — v1**

Sections:

1. Executive summary and chosen outcome.
2. What is known and how.
3. Strengths to leverage.
4. Contextual risks to test.
5. Confirmed Personal Operating Manual.
6. Method selection matrix.
7. 30-day pilot.
8. Prefilled interview and Luis's corrections.
9. Honest gaps, permissions, and stop conditions.
10. Sources and methodology.

**Gate 4:** Trusted read, targeted append, live read-back, revision verification, and Luis review. Do not delete the original material in this pass.

## Phase 5 — One-intervention coach MVP

Choose one:

- morning vital-result brief;
- pre-meeting stakeholder pre-alignment;
- commitment follow-through;
- high-impact artifact claim/evidence gate.

The MVP remains advisory and draft-only.

**Gate 5:** The intervention must have a pre-registered target, metric, burden limit, delivery template, and stop rule.

## Phase 6 — Four-week adversarial pilot

Track:

- primary outcome and behavior;
- completion or follow-through;
- energy/stress cost;
- stakeholder perception when authorized;
- usefulness, wrongness, annoyance, and creepiness;
- suggestions accepted/rejected/corrected;
- interruption and maintenance cost;
- manual-comparator performance;
- incidents and privacy failures.

Reviews occur at days 7, 14, and 30.

**Gate 6 — Go/no-go:**

Proceed only if:

1. the selected outcome improved enough to matter to Luis;
2. the system added value beyond the simpler comparator;
3. evidence and recommendations were inspectable and correctable;
4. privacy and third-party boundaries held;
5. attention and maintenance costs were acceptable;
6. agency increased or stayed stable;
7. no claim exceeded its evidence.

A negative answer narrows or stops the project. It does not automatically authorize more data.

## Phase 7 — Earned expansion

Add one source or capability at a time, in this order:

1. selected AI provider exports;
2. selected email or meeting commitments;
3. consented stakeholder feedforward;
4. app/window activity;
5. only then consider screen/audio or wearable signals.

Each expansion repeats privacy review, baseline, data-quality testing, and go/no-go evaluation.

# Daily product templates required before build

## Morning brief, under three minutes

1. Today's one vital result.
2. Why it matters.
3. Most likely obstacle.
4. If-then response.
5. One commitment or collision to address early.
6. One thing explicitly not pursued today.
7. Evidence freshness and one-tap feedback.

## Pre-meeting brief

- desired decision or outcome;
- stakeholder interests without personality profiling;
- likely objections;
- evidence needed;
- pre-wire sequence;
- one-sentence ask;
- commitment not to make casually;
- missing context warning.

## Commitment confirmation

- draft commitment;
- owner;
- due date;
- evidence;
- confidence;
- confirm/edit/reject.

## High-impact artifact gate

1. What decision should this produce?
2. Is the main claim bounded and attributable?
3. What evidence supports it?
4. What will a skeptic attack?
5. What uncertainty must be disclosed?
6. Can the core become one clear ask plus an appendix?

## End-of-day correction

- what mattered that the coach missed;
- what advice helped, annoyed, or felt wrong;
- promises changed;
- energy/stress;
- one claim to correct, scope, or forget;
- tomorrow's first action.

## Weekly review

- outcome progress;
- evidence-backed wins;
- repeated friction and counter-evidence;
- commitments kept, declined, changed, and missed;
- one confirmed, rejected, or expired hypothesis;
- one intervention decision;
- model and source change log;
- privacy/attention/maintenance cost;
- keep, modify, narrow, or stop.

# Counterargument traceability

| Counterargument | Requirements that answer it |
|---|---|
| A human coach or checklist may be enough | OUT-05, OUT-06, EVAL-11, COA-12 |
| More data does not reveal the whole person | EVD-01 through EVD-15 |
| Centralization creates security risk | PRV-01 through PRV-16, DAT-01 |
| Other people did not consent | PRV-03, PRV-07 through PRV-09, EVD-15, COA-10 |
| Labels become self-fulfilling | EVD-02, EVD-04, EVD-08 through EVD-12 |
| DISC/Tony methods are weak foundations | EVD-14, COA-06 through COA-09 |
| Improvement cannot be attributed to coaching | EVAL-01 through EVAL-12 |
| Metrics distort behavior | EVAL-03, EVAL-04, EVAL-08 |
| Monitoring creates surveillance/dependence | UX-01 through UX-09, COA-14 |
| Incomplete advice can cause harm | SAF-01 through SAF-08 |
| Connectors are brittle and incomplete | DAT-04 through DAT-12, EVD-13 |
| Maintenance may exceed benefit | OUT-06, OUT-07, OPS-08, OPS-09 |
| AI cannot replace human accountability | COA-10 through COA-14, SAF-04 |
| Luna-Max may be wasteful or unavailable | OPS-02 through OPS-07 |
| One canonical memory can become one canonical mistake | EVD-08 through EVD-12, PRV-05, COA-15 |

# Final acceptance contract

The plan is successfully executed only when:

- Luis has chosen one outcome and one behavior;
- the actual prefilled interview exists and minimizes repeated disclosure;
- current source coverage and missing sources are explicit;
- permissions are source- and purpose-specific;
- raw evidence is compartmentalized and derived knowledge is governed;
- attribution, deduplication, correction, expiry, forgetting, and deletion propagation work;
- the profile contains context, counter-evidence, and user verdicts;
- Tony/assessment language is separated from independent evidence;
- the Google Doc is updated through a trusted, verified append;
- the MVP tests one low-risk intervention against a baseline and simpler comparator;
- no consequential external action is autonomous;
- stakeholder and third-party data are protected;
- the system reports benefit, wrongness, interruption, privacy, maintenance, and cost;
- requested and actual models are proven;
- the day-30 review produces a documented go, narrow, or stop decision.

## Immediate next action

Do not ingest more data yet.

The next step is to complete Gate 0 with Luis:

1. choose the primary 90-day outcome;
2. choose the first behavior;
3. confirm the default source-permission posture;
4. define value, burden, and stop conditions;
5. clarify the Luna-Max provider/model.

Only then should the prefilled interview and concierge baseline begin.
