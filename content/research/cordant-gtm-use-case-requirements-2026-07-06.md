---
title: Cordant GTM OS Use Case Requirements
date: 2026-07-06
topic: cordant
model: Codex GPT-5
sources:
  - Circleback meeting "Eric <> Luis", created 2026-07-02, meeting id 10123864
  - Circleback meeting "Luis <> Eric: GTM Stack & Retainer Check-in", created 2026-06-24, meeting id 9907575
  - Circleback meeting "Luis & Eric", created 2026-06-08, meeting id 9436768
  - Circleback meeting "Eric <> Luis Agentic Conversation", created 2026-05-18, meeting id 8854184
  - Cordant local artifacts 2026-06-28 and 2026-06-29 GTM OS review documents
derived_from:
  - /Users/USERNAME/github/cordant/artifacts/docs/2026-07-06-cordant-gtm-use-case-requirements.md
  - Google Doc https://docs.google.com/document/d/1ek1uAsty0s_EaVTqfQzXuPJphupevQN4U6Yh2Wlv6n0/edit
regen_prompt: "Integrate Eric Rosenthal's wholesale ISO example and other described GTM/BD examples into a Cordant GTM OS use case requirements document."
---

# Cordant GTM OS Use Case Requirements

Date: July 6, 2026
Prepared for: Eric Rosenthal and Luis Calderon
Status: Review document

## Purpose

This document converts Eric's concrete GTM examples into product requirements for Cordant's first GTM operating system. It integrates the wholesale ISO walkthrough from July 2 with earlier GTM/BD examples Eric described across May and June.

The goal is not to build a generic sales automation platform. The goal is to define the repeatable work Cordant needs before adding fractional sellers, converting design partners into pilots, or activating investor/warm-intro networks.

## Source Basis

- July 2, 2026 Eric/Luis meeting: wholesale ISO production-line selling, Monaco/build-vs-buy priority, GTM OS vs memory bandwidth decision.
- June 24, 2026 Eric/Luis meeting: GTM capability inventory, fractional salesperson toolkit, HubSpot/Clay/Sales Navigator starting stack, Muty/Monaco references.
- June 8, 2026 Eric/Luis meeting: GTM intelligence loop by August, 10-20 Tier 1 accounts, investor connection mapping, September outbound target.
- May 18, 2026 Eric/Luis meeting: account-based research, city/segment targeting, investor relationship management, research agent, knowledge/permission foundation.
- Existing Cordant artifacts: `2026-06-28-cordant-gtm-os-review-plan.md`, `2026-06-29-cordant-gtm-os-capability-tool-matrix-review.md`, and `2026-06-29-cordant-gtm-stack-rollout-playbook.md`.

## Executive Summary

Cordant's GTM OS should begin with one concrete operating loop:

1. Pick a target segment.
2. Generate a source-backed target account list.
3. Map buyer personas and actual contacts.
4. Score operational complexity and fit.
5. Find warm paths through investors, advisors, LinkedIn, and known relationships.
6. Produce account briefs, talking points, and draft outreach.
7. Equip the seller with a toolkit for calls, decks, demo prep, and follow-up.
8. Capture meeting feedback back into the account record, product context, and next actions.

Eric's wholesale ISO example is the best anchor scenario because it includes the full chain: public list sourcing, persona discovery, relationship mapping, outreach decisioning, transcript-derived positioning, tailored collateral, call capture, and CRM/knowledge-base writeback.

The first version should support research, briefing, draft generation, and human-reviewed action. It should not autonomously send outreach, write unreviewed CRM truth, or overbuild custom tooling where HubSpot, Sales Navigator, Clay, Monaco-like tools, or other SaaS products are sufficient.

## Core Personas

### Eric / Founder-GTM Lead

- Chooses priority segments and approves messaging.
- Owns investor and strategic relationship activation.
- Reviews external-facing asks, outreach, decks, and sensitive claims.
- Needs visibility into what is ready to act on this week.

### Fractional Seller / Segment Specialist

- Has ICP-specific relationships or domain credibility, for example card issuers, wholesale ISOs, sponsor banks, fintechs, remittance companies, or payment infrastructure firms.
- Needs an approved list of target accounts and contacts.
- Needs account context, warm paths, talking points, and draft outreach.
- Owns calls and relationship-building; the system handles most research and operational prep.

### GTM Operator / RevOps-MOPS Support

- Maintains account/contact hygiene, source links, statuses, owners, and follow-up rules.
- Ensures HubSpot or the approved tracking surface stays trustworthy.
- Runs weekly GTM operating briefs and exception queues.

### Product / Solutions Support

- Validates product claims, demo assumptions, and technical feasibility.
- Helps translate design partner feedback into product follow-ups, Linear issues, or sales enablement updates.

## Primary Use Case: Wholesale ISO Production-Line Selling

### Scenario

Cordant wants to target wholesale ISOs that do card acquiring. Eric knows there are many such companies and that Visa/Mastercard publish lists that can seed the target-account universe. A seller specializing in this segment should not spend most of their time building lists, finding personas, writing generic outreach, or assembling decks. Their job should be to get on calls, build rapport, and move qualified opportunities forward.

### Desired Outcome

A salesperson can say: "I want to go after wholesale ISOs," and the system produces a reviewed selling packet:

- Target account list with source links and reason codes.
- Buyer persona map by account.
- Known contacts and likely buyers.
- Warm intro paths or cold-outreach recommendation.
- Account-specific talking points from Cordant knowledge and prior call transcripts.
- Draft intro request, cold note, and follow-up.
- Meeting prep brief.
- Deck/demo prep instructions.
- Post-call summary and next action logging.

### End-to-End Workflow

1. Segment selection
   - Eric selects "wholesale ISO/card acquiring" as the active segment.
   - The system loads the approved segment definition, exclusion rules, and priority signals.

2. Account universe generation
   - Pull candidate accounts from Visa/Mastercard lists, payment ecosystem directories, investor portfolios, market maps, and other approved sources.
   - Normalize account names, URLs, geography, size, and account type.
   - Deduplicate against existing HubSpot or tracker records.

3. Fit and complexity scoring
   - Score each account against Cordant's ICP.
   - Capture operational complexity signals: card acquiring, sponsor-bank relationships, multi-party payment flows, reconciliation burden, compliance exposure, cross-border/remittance activity, multi-ledger complexity, or evidence of payment modernization.
   - Store source links and short reason codes, not just a numeric score.

4. Buyer/persona mapping
   - Identify likely economic, technical, operations, compliance/risk, and partnership buyers.
   - Example roles: CTO, Head of Operations, Chief Compliance Officer, payments/product lead, risk/compliance owner, sponsor-bank/partnership owner.
   - Decide whether paid enrichment is needed or whether LinkedIn/Sales Navigator/manual research is sufficient.

5. Warm-path mapping
   - Check Eric's LinkedIn, Cordant team networks, investor portfolios, advisors, and known relationships.
   - Determine whether to ask for an intro, send a cold note, or hold for a stronger relationship path.
   - Require Eric approval before using investor relationships.

6. Account brief generation
   - Produce a source-linked account dossier with context, why now, likely pain, buyer map, warm path, meeting goal, and suggested next action.
   - Include "known unknowns" so the seller knows where confidence is low.

7. Outreach and meeting prep
   - Generate draft intro asks, cold emails, LinkedIn notes, and meeting agendas.
   - Pull approved positioning from Cordant's product marketing context and prior transcripts.
   - Never send automatically.

8. Deck/demo prep
   - Recommend which deck narrative or demo angle fits the account.
   - Use Cordant-approved claims only.
   - Flag when product/solutions review is needed before using a demo claim.

9. Call capture and follow-up
   - Record and summarize the meeting through Circleback or the approved capture tool.
   - Extract product feedback, willingness-to-pay signals, objections, buyer language, follow-ups, and next action.
   - Route outcomes to HubSpot/tracker, knowledge base, and product follow-up queue after review.

## Additional Use Cases Eric Described

### 1. City or Segment-Based ABM Dinner / Meeting Prep

Eric described a preemptive account-based research workflow: given a city or segment, surface the right people to invite based on fit, role, what they are posting, and relationship path.

Requirements:

- Input can be a city, event, segment, target account type, or design-partner theme.
- Output should be a ranked list of 10 invitees or target contacts.
- Ranking must include source links, why this person matters, likely relevance to Cordant, and recommended ask.
- The system must distinguish "interesting person" from "actionable GTM target."

### 2. Fractional Seller Enablement

Eric's model is 3-4 fractional sellers with segment-specific credibility. Each might receive about 40 target companies, buyer data, a draft-outreach workflow, and a Claude/Hermes context pack.

Requirements:

- Seller onboarding packet by segment.
- Approved account/contact list.
- HubSpot or tracker access rules.
- Draft-only outreach assistant.
- Segment-specific deck, demo, and objection-handling guidance.
- Weekly status packet: accounts touched, meetings booked, blockers, next asks.

### 3. Investor Network Activation

Eric has roughly 35 investors/angels/institutions chosen partly for their ability to open doors. He described mining investor portfolios and broader relationship networks to identify future prospects and CEO-level intro paths.

Requirements:

- Investor profile: portfolio companies, relationship owner, permitted ask types, last touch, and sensitivity.
- Target-account warm-path lookup through investors and advisors.
- Intro request drafts tailored to the investor and account.
- Human approval gate for every investor ask.
- Ability to include investor-network opportunities in weekly GTM brief.

### 4. Target Account Universe by Regulated Source

Eric noted that account universes are often discoverable from structured public or semi-structured sources:

- Banks are licensed/registered.
- Payment companies may appear in Visa/Mastercard or ecosystem lists.
- Fintechs show up in market maps and fintech VC portfolios.
- Remittance companies are registered with states.

Requirements:

- Segment-specific source map.
- Source reliability rating.
- Deduplication and canonical account naming.
- Reason-code capture for why an account belongs in the universe.
- Refresh cadence and last-reviewed timestamp.

### 5. Competitive Intelligence and Battlecards

Eric and Luis discussed competitive intelligence as a deliverable/capability, not as an "agent count." The system should scan competitors, alternatives, and status quo workflows, then support battlecards and positioning.

Requirements:

- Competitor/status-quo record.
- Source-backed battlecard template.
- Objection library from calls and transcripts.
- Review gate for claims before external use.
- Monthly refresh cadence once active selling begins.

### 6. Design Partner Feedback Capture

Earlier discussions emphasized that most design-partner interactions will be recorded and should feed product, positioning, and GTM follow-up. This is GTM-critical because customer language should improve account scoring, messaging, and follow-up.

Requirements:

- Capture meeting summaries and transcript-derived signals.
- Classify feedback as product, compliance, legal, pricing/willingness-to-pay, objection, buyer language, or follow-up.
- Route follow-ups to the right owner.
- Preserve permission boundaries, especially for HR/legal/finance or sensitive design partner context.
- Make reviewed learnings available to account briefs and messaging.

### 7. Proposal, RFP, and Deck Production Line

Eric described a longer-term production line for proposals and RFP responses: research the client, understand pain points, pull the right positioning, and produce collateral. This is related to GTM but should follow the account-brief and messaging foundation.

Requirements:

- Approved snippet library.
- Brand and claim rules.
- Account-context input from the dossier.
- Product/legal/founder review before external delivery.
- Delay full automation until repeated proposal/RFP demand appears.

## Functional Requirements

### FR1. Segment and ICP Management

- Maintain active target segments and exclusion criteria.
- Store segment-specific buyer personas and source maps.
- Support Eric approval of active segment priority.

### FR2. Account List Generation

- Generate 10-20 day-one accounts for one active segment.
- Expand to about 40 accounts when fractional seller enablement starts.
- Track source URLs, reason codes, fit score, owner, stage, and last-reviewed date.

### FR3. Buyer and Contact Research

- Map buyer personas to real people where possible.
- Mark confidence by person and source.
- Flag missing data that blocks action.
- Support a paid-enrichment decision only after manual gaps are visible.

### FR4. Complexity Signal Scoring

- Detect Cordant-specific operational complexity signals.
- Store evidence snippets and source links.
- Separate evidence from inference.
- Allow Eric/product reviewers to adjust scoring weights.

### FR5. Warm-Path and Investor Mapping

- Search known investors, advisors, LinkedIn/network exports, and team relationships.
- Classify path as strong intro, weak path, no path, or cold.
- Require approval before investor activation.

### FR6. Account Dossier Generation

- Produce a one-account brief with:
  - account overview
  - why now
  - relevant Cordant use case
  - likely buyers
  - complexity signals
  - warm path
  - suggested ask
  - talking points
  - source links
  - reviewer notes

### FR7. Outreach Drafts

- Generate intro request, first-touch note, follow-up, and meeting recap drafts.
- Use only approved messaging and source-backed claims.
- Keep all sends human-approved.

### FR8. Meeting Capture and Learning Loop

- Ingest Circleback summaries/transcripts after review.
- Extract GTM signals and route them to account, product, and messaging records.
- Update account status and next actions only through a reviewed path.

### FR9. Weekly GTM Operating Brief

- Summarize active segment, top accounts, warm paths, outreach-ready items, blocked items, and decisions needed from Eric.
- Include evidence links and next-action owner.
- Separate "ready to act" from "needs review."

### FR10. Build/Buy/Configure Decision Support

- Classify each capability as buy, build, configure, or delay.
- Evaluate Monaco and comparable tools against the ISO workflow, not abstract feature lists.
- Preserve the anchor-store decision: HubSpot or equivalent should remain the durable CRM/contact/account source unless a stronger reason emerges.

## Non-Functional Requirements

### Governance

- No autonomous external sends.
- No unreviewed CRM truth writes.
- All external-facing claims require human review.
- Investor asks require explicit Eric approval.

### Provenance

- Every account score, buyer recommendation, and complexity signal must include source links or be marked as an inference.
- Meeting-derived learnings must retain meeting/source references and permission boundaries.

### Permissioning

- GTM context should not automatically include HR, legal, finance, or CEO-only materials.
- Sensitive transcripts should be routed into the correct access bucket before they are reused.
- Claude/Hermes/Google Drive/HubSpot access should reflect least-privilege role boundaries.

### Maintainability

- Buy commodity infrastructure where maintenance is not strategic.
- Build Cordant-specific logic: ICP, complexity scoring, account dossiers, messaging, learning loops, and review gates.
- Avoid custom GTM platform work until volume proves need.

### Usability

- A fractional seller should be able to answer:
  - Who should I call?
  - Why this account?
  - Who matters inside the account?
  - Who can introduce me?
  - What do I say?
  - What should I learn on the call?
  - What do I log after the call?

## Data Objects

### Account

- name
- canonical URL
- segment
- account type
- geography
- fit score
- complexity score
- reason codes
- source URLs
- owner
- stage/status
- last reviewed
- next action

### Contact / Buyer

- name
- role/title
- persona type
- company
- source URL
- email/contact status
- confidence
- relationship path
- recommended ask

### Complexity Signal

- signal type
- evidence
- source URL
- account
- confidence
- reviewer
- scoring impact

### Relationship Path

- target account/contact
- relationship owner
- investor/advisor/team source
- path strength
- approved ask
- sensitivity notes

### Account Dossier

- account summary
- why now
- buyer map
- signal evidence
- warm path
- recommended outreach
- meeting prep
- deck/demo guidance
- source list

### Meeting Learning

- meeting/source
- account/contact
- signal type
- product feedback
- objection
- willingness-to-pay or pricing note
- follow-up
- permission classification
- reviewer

## MVP Scope

### V0: 20-Hour Requirements-to-Pilot Sprint

1. Pick one primary segment, ideally wholesale ISOs or the most review-ready equivalent.
2. Define segment source map and qualification rules.
3. Build 10-20 account list with source-backed reason codes.
4. Create buyer-persona taxonomy and map real contacts for 5 priority accounts.
5. Add warm-path check for those 5 accounts.
6. Produce 5 account dossiers.
7. Draft intro/cold/follow-up templates.
8. Define HubSpot/Sheets field schema.
9. Produce the first weekly GTM operating brief.
10. Evaluate Monaco and comparable tools against this workflow.

### V1: Fractional Seller Toolkit

1. Expand to about 40 accounts for a named segment seller.
2. Give the seller a reviewed account/contact list.
3. Provide a Claude/Hermes context pack with approved messaging, deck guidance, and outreach drafting rules.
4. Add weekly activity review and CRM hygiene routine.
5. Track conversion from target account to meeting to design-partner/pilot opportunity.

### V2: Scaled GTM OS

1. Support 3-5 GTM contributors.
2. Run 2-3 segments in parallel.
3. Add paid enrichment only when missing data repeatedly blocks action.
4. Add sequencing/outbound tools only after ownership, compliance, and review rules are clear.
5. Integrate design-partner feedback with product/Linear and investor/board reporting.

## Acceptance Criteria

The first GTM requirements implementation is successful when:

- Eric can review one segment and approve whether it is the right starting point.
- The system produces 10-20 source-backed target accounts.
- At least 5 priority accounts have usable dossiers.
- Each dossier includes buyer/persona mapping, complexity signals, warm-path status, and a recommended next action.
- Outreach drafts are useful but remain human-approved.
- Meeting feedback can be captured and routed without violating permission boundaries.
- The buy/build/configure decision can be made against a real workflow, not a vendor demo.
- The weekly brief tells Eric what to approve, what is blocked, and what is ready to act on.

## Open Decisions

1. Confirm the first active segment: wholesale ISOs, card issuers, sponsor banks, fintech/payment hubs, remittance, or another segment.
2. Confirm whether HubSpot is the account/contact source of truth now, or whether Sheets is a short interim staging layer.
3. Confirm whether to evaluate Monaco only, or compare Monaco against Muty plus one broader stack option.
4. Confirm which relationship sources can be used for warm-path mapping.
5. Confirm whether Eric has sent the ChatGPT BD/GTM artifacts and whether they can be used in the GTM context hub.
6. Confirm source boundaries for Claude/Hermes: what can be included from Drive, Circleback, Gmail, investor docs, product docs, and legal/HR folders.
7. Confirm who reviews product claims before deck/demo guidance is used externally.

## Recommended Next Step

Use the wholesale ISO workflow as the benchmark for the buy-vs-build comparison. Any vendor under review should be scored on whether it can support the actual steps Eric described:

- source account universe
- identify buyer personas
- discover contacts
- map warm paths
- generate draft outreach
- support account-specific talking points
- prepare deck/demo guidance
- capture meeting outcomes
- write back to CRM/knowledge base with review gates

If a tool handles the commodity pieces well, buy/configure it. If the value depends on Cordant-specific ICP logic, regulated-payments complexity scoring, source-linked account dossiers, investor-network activation, or design-partner learning loops, build that logic as Cordant-owned workflow assets.
