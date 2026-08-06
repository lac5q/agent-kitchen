---
name: "Luis Executive Coaching Integration Plan"
description: "Plan to turn the Tony Robbins AI export, DISC/Motivators report, MemroOS evidence, and AI-tool histories into an evidence-aware executive coaching profile, interview, and daily coaching system."
type: plan
created: 2026-08-06
updated: 2026-08-06
model: gpt-5.6-sol
tags:
  - executive-coaching
  - personal-intelligence
  - tony-robbins
  - disc
  - memroos
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
  - "content/coach/runs/2026-07-06.md"
  - "content/coach/runs/2026-07-07.md"
  - "content/job-search/intuit-project-map-from-goals-roadmaps-and-reviews-2026-07-17.md"
  - "content/job-search/master-tmay-interview-story-library-2026-07-22.md"
  - "content/research/luis-uvp-adversarial-validation-2026-07-06.md"
regen_prompt: "Rebuild this plan from the current Google Doc, DISC/Motivators report, MemroOS evidence, local Codex/Claude/Cursor histories, and current primary coaching sources; separate facts, assessment results, hypotheses, and unknowns; preserve privacy and require user correction."
---

# Luis Executive Coaching Integration Plan

## Outcome

Create one evidence-aware coaching system that:

1. understands Luis from self-report, assessments, observed work patterns, and stakeholder input;
2. distinguishes known facts from hypotheses;
3. converts insight into one measurable behavior experiment at a time;
4. helps daily with priorities, communications, schedule, energy, and follow-through; and
5. stores durable knowledge in MemroOS while keeping sensitive raw data local and revocable.

This is a coaching and performance system, not a mental-health diagnosis or an automated authority over Luis's life.

## What is already known

### Direct self-report from the Tony Robbins AI export

The Google Doc is accessible and contains 15 survey answers. The durable inputs are:

- Current primary need: certainty.
- Recurring pattern: busy but not vital.
- Self-described root condition: running empty.
- Satisfaction: money, day-to-day life, relationships, work/business, and meaning/direction were rated rough; health/energy was rated okay.
- Primary obstacle: pressure and stress.
- Desired outcome: growth.
- Preferred coaching approach: explain why before what.
- Momentum: slipping.
- Change confidence: partly confident.
- Desired future: enough certainty for calm, sustainable energy, plus hope, fun, passion, and pride.
- Pressure response: freeze.
- Communication preference: straight with heart.
- Current security/freedom tradeoff: security.
- Significance/connection tradeoff: close.
- Best-self reference: spirituality, identity, teaching, and passion as experienced around the Tantra Festival.

The document is about 38,700 characters and repeats many AI interpretations. Those interpretations are not independent evidence and should not be counted as multiple confirmations.

### DISC and Motivators report

The report labels Luis's behavioral style **Dynamo**: fast-paced, decisive, persuasive, group-confident, adaptable, energetic, and able to mobilize others. It also warns that speed and passion may be perceived as pressure, manipulation, argumentativeness, or abrasiveness; difficulty saying no and spreading too thin are explicit watch-outs.

The motivator narratives indicate:

- high practical/economic-return orientation;
- high autonomy and individual expression;
- strong desire for authority and influence;
- high theoretical/research drive;
- low preference for externally imposed rules and rigid protocols;
- a guarded, self-protective stance in altruistic exchanges; and
- preference for function and utility over aesthetics.

The 12-page report does not expose numeric motivator ranks or DISC graph scores in the supplied summary, so the narratives must not be converted into false precision.

### Existing behavioral evidence

Prior MemroOS work supports strengths in systems transformation, customer economics and trust, hands-on building, and coaching teams through trust and role clarity. Candidate constraints include execution hygiene under load, prioritization and stakeholder pre-alignment, claim calibration/artifact clarity, and tool/context fragmentation.

“Breadth outruns closure” is plausible, especially given the DISC report's fast pace and spreading-thin warning, but it remains a hypothesis until measured against actual completion, calendar, and follow-up data.

## Evidence hierarchy

Every statement in the final profile will carry one of four labels:

- **Fact / direct self-report** — Luis said it or a system record proves it.
- **Assessment result** — appears in DISC/Motivators; useful as a hypothesis generator.
- **Observed pattern** — repeated behavioral evidence across tasks, calendar, email, or stakeholder feedback.
- **Hypothesis / unknown** — plausible but unconfirmed; requires an interview question or experiment.

Confidence should rise through independent corroboration, not through repeated AI paraphrasing.

## Phase plan

### Phase 0 — Access, consent, and model preflight

- Confirm the Google Doc revision and take a trusted snapshot before editing.
- Define allowed sources and retention: Codex, Claude, Cursor, Grok/Gemini exports, email, calendar, Slack/Teams, browser history, health/activity data, and stakeholder input.
- Default to read-only connectors and local raw storage.
- Put only normalized facts, provenance, corrections, and coaching outcomes in MemroOS.
- Resolve the requested **Luna-Max** subagent lane before delegation. Current preflight finds a Beastmode alias for `gpt-5.6-luna`, but no resolvable Luna-Max model in the installed Pi model list. Do not silently substitute another model.

**Gate:** Luis approves source boundaries and the exact Luna model/alias.

### Phase 1 — Build the personal evidence ledger

Create a canonical event and claim model:

- source, timestamp, domain, people involved, action, outcome;
- claim text, evidence links, confidence, sensitivity, expiry;
- contradictions and user corrections;
- coaching observation versus raw private content.

Use deterministic extraction first. Deduplicate quoted emails, system prompts, AI summaries, and repeated imports. Retain provenance to the original source.

**Luna-Max subagent work:** inventory files, normalize exports, deduplicate repeated text, classify domains, build source manifests, and run completeness checks.

**Lead work:** decide identity boundaries, sensitivity rules, and whether an inference is warranted.

### Phase 2 — Produce Coaching Profile v1

Build a concise profile with:

- strengths to deliberately leverage;
- current outcomes and constraints;
- energizers and depleters;
- decision and communication style;
- pressure pattern;
- stakeholder impact;
- likely derailers;
- confidence and source for every claim;
- contradictions and unknowns.

Reconcile rather than flatten tensions. For example, “fast and decisive” from DISC and “freeze under pressure” from self-report can both be true in different contexts. The interview must identify the triggering conditions.

### Phase 3 — Integrate coaching methods

Use Tony Robbins as a practical layer, not as the sole evidence base:

- **State:** a brief, optional physiology–focus–language reset and a safer, user-chosen version of priming.
- **Direction:** RPM—define the result, why it matters, and the action map.
- **Needs:** use the Six Human Needs as a reflection vocabulary, not a diagnostic taxonomy.
- **Iteration:** CANI as small weekly improvement.

Add evidence-backed mechanisms:

- one behavior goal at a time;
- mental contrasting plus an if-then plan for the most likely obstacle;
- deliberate practice in a real work situation;
- stakeholder feedforward and short monthly perception checks;
- objective measures from calendar, follow-up, and completed commitments;
- weekly review of outcomes, not activity volume.

The core loop is:

> state reset → one result → purpose → obstacle → if-then plan → action → stakeholder feedback → measured outcome → correction.

### Phase 4 — Run a prefilled gap interview

Build a 30–45 minute interview in three tiers:

1. **Essential now:** top three 90-day outcomes, exact pressure/freeze triggers, current commitments, energy/sleep baseline, non-negotiable relationships, and permission boundaries.
2. **Leadership calibration:** three stakeholders, behavior to improve, recent examples, impact on others, and what “better” would look like to them.
3. **Deeper personalization:** values conflicts, identity, spirituality, financial constraints, risk tolerance, reward preferences, avoidance patterns, and preferred intervention style.

For every question, show:

- what is currently prefilled;
- source and confidence;
- why the question matters;
- what is genuinely unknown;
- an easy answer format.

Luis should only need to correct, rank, or fill blanks—not retell everything.

### Phase 5 — Integrate into the Google Doc

Preserve the original Tony AI export as source material. Append a clearly separated section titled:

**Evidence-Based Executive Coaching Synthesis — v1**

Recommended structure:

1. Executive summary.
2. What we know and how we know it.
3. Strengths to leverage.
4. Risks/watch-outs to test.
5. Integrated coaching model.
6. 30-day operating rhythm.
7. Prefilled interview.
8. Honest gaps and consent boundaries.
9. Sources and methodology.

Do not delete the original repeated AI content in the first pass. After Luis reviews the synthesis, offer a second pass that archives or condenses duplication.

**Luna-Max subagent work:** citation formatting, duplicate-section map, heading normalization, checklist QA, and comparison of draft versus acceptance criteria.

**Lead work:** final synthesis, sensitive judgment, claim calibration, and the actual Google Doc write.

### Phase 6 — Build the daily coach MVP

Start with advisory behavior only:

- morning: state/energy check, calendar risk scan, one RPM result, and one if-then plan;
- before meetings: stakeholder, desired outcome, likely tension, and communication adjustment;
- during the day: capture commitments and detect collisions or stale follow-ups;
- evening: promises kept/missed, energy, key lesson, and tomorrow's first action;
- weekly: results versus activity, dropped commitments, stakeholder feedforward, and one behavior experiment.

No autonomous email sending, calendar changes, or relationship-sensitive actions in v1. Draft and recommend first; require confirmation.

### Phase 7 — Validate in a 30-day pilot

Track a small scorecard:

- percentage of daily vital result completed;
- promises kept by due date;
- overdue follow-ups;
- calendar collisions prevented;
- deep-work blocks protected;
- energy before/after key work;
- stakeholder rating of the chosen leadership behavior;
- number of coach suggestions accepted, ignored, or corrected;
- false-positive rate and “creepy/unhelpful” moments.

At days 7, 14, and 30, keep, modify, or remove interventions based on actual value. The system should become more accurate through corrections, not more confident merely because it has more data.

## Acceptance contract

The execution is complete only when:

- the Google Doc has a coherent new synthesis while the original export is preserved;
- every material claim is labeled by evidence type and confidence;
- direct self-report is separated from DISC, AI interpretation, and observed behavior;
- Tony Robbins methods are clearly distinguished from independently researched coaching mechanisms;
- the interview is substantially prefilled and asks only high-value missing questions;
- privacy, consent, and action boundaries are explicit;
- the daily/weekly system has measurable outcomes;
- the complete research artifact is stored and verified in MemroOS;
- requested and actual subagent models are reported, with no silent Luna-Max substitution.

## Delegation map

- **Codex lead:** evidence hierarchy, synthesis, sensitive judgment, coaching architecture, final Google Doc edit, and sign-off.
- **Luna-Max subagents:** mechanical extraction, deduplication, source manifests, question/evidence matrices, citation assembly, formatting, completeness checks, and validation reports.
- **No subagent:** diagnosis, final personality claims, permission decisions, or external actions.
- **Concurrency:** up to three independent Luna-Max workers after model preflight, each with a bounded acceptance contract and compact final output.
- **Failure rule:** retry a mechanical task once; if the requested model is unavailable or provenance cannot be proven, stop and report model drift rather than substitute.

## Immediate next execution sequence

When Luis says to proceed:

1. Resolve whether “Luna-Max” means the existing `gpt-5.6-luna` alias or install/register a distinct Max lane.
2. Freeze the Google Doc revision and evidence-source permissions.
3. Fan out three bounded extraction/QA tasks.
4. Consolidate Coaching Profile v1 and the prefilled interview.
5. Append the synthesis to the Google Doc.
6. Verify the live document and read it back.
7. Persist the full research report and launch the 30-day baseline only after Luis approves the profile.
