---
title: "Mark Kashef / Marc Winitz Agent Stack and Hermes Analysis"
date: 2026-07-06
model: "GPT-5 Codex"
sources:
  - "Circleback: Marc <> Luis Cordant GTM, 2026-06-29, linkId 5shYsB3o5x6bJcmCTpiRP"
  - "Circleback: Eric <> Luis, 2026-07-02, linkId e27tgr4kovaAi3zLMbSz8"
  - "Circleback: Luis <> Eric: GTM Stack & Retainer Check-in, 2026-06-24, linkId nFc0MvQVTonaqwVLpcvBv"
  - "Circleback: Brendan <> Luis, 2026-06-23, linkId lhzMidwBNy3UEzuMyNk9V"
  - "Circleback: Juan <> Luis, 2026-06-10, linkId 9efu8WHWzhOh8SgagGaYQ"
  - "Circleback: Meeting with Luis Calderon, 2026-05-25, linkId apSR89UxuIYjQYq8ntYQ6"
  - "YouTube: Mark Kashef channel, https://www.youtube.com/@Mark_Kashef"
  - "YouTube captions: I Replaced OpenClaw and Hermes With This Claude Code Setup, https://www.youtube.com/watch?v=rVzGu5OYYS0"
  - "YouTube captions: This Is What Comes After OpenClaw and Hermes, https://www.youtube.com/watch?v=T17DYl_4Z-U"
  - "YouTube captions: Master All 5 Layers of Every Agentic OS, https://www.youtube.com/watch?v=YjkteijEyzQ"
  - "YouTube captions: Master ALL 7 Levels of Claude Code Memory, https://www.youtube.com/watch?v=OMkdlwZxSt8"
  - "YouTube captions: This Claude Code Setup Runs My Entire Business, https://www.youtube.com/watch?v=7aQbN543Mec"
  - "YouTube captions: How to Use /goal to Build a Self-Improving OS, https://www.youtube.com/watch?v=5xrjO38WUYY"
  - "YouTube captions: Why 90% of Your Claude Skills Are Dead Weight, https://www.youtube.com/watch?v=cgWZcFKx2lQ"
  - "YouTube captions: How to INSTANTLY Run ANY Skill in Claude + Codex, https://www.youtube.com/watch?v=tjjX43FoAUg"
  - "LinkedIn: Mark Kashef post on Hermes/OpenClaw enterprise readiness, https://www.linkedin.com/posts/mkashef_most-companies-still-cant-touch-hermes-or-activity-7476316431408578560-L3Vt"
  - "MindStudio: Mark Kashef's Claude Code Hive Mind, https://www.mindstudio.ai/blog/mark-kashef-claude-code-hive-mind-sqlite-telegram-multi-agent-council"
derived_from:
  - "User request: identify areas to improve Luis's agent stack and why Mark may not like Hermes"
  - "Circleback search for Mark Kashef, Mark, Marc, Hermes, OpenClaw, Claude Code"
  - "Public channel/video transcript review for Mark Kashef agent-stack content"
regen_prompt: "Re-run Circleback searches for Mark Kashef/Marc Winitz/Hermes/OpenClaw/Claude Code and re-review Mark Kashef public YouTube videos about Hermes, OpenClaw, agentic OS, memory, skills, Claude Code, and enterprise readiness. Produce an evidence-backed improvement backlog for Luis's agent stack and a concise explanation of Mark's Hermes objections."
---

# Mark Kashef / Marc Winitz Agent Stack and Hermes Analysis

## Scope and Evidence Boundary

Circleback did not return captured meetings with a `Mark Kashef` profile, name, or transcript match. Searches for `Mark Kashef`, `Kashef`, and `Hermes` returned no direct Mark Kashef meeting evidence. A broader `Mark` search surfaced:

- a real Marc Winitz meeting with Luis about Cordant GTM;
- Eric/Brendan/Juan/Lior meetings where Mark/Marc input, Hermes setup, memory, governance, and GTM operating-system priorities were discussed.

The Hermes-specific "why Mark may not like it" evidence is public: Mark Kashef's YouTube channel, captions for his Hermes/OpenClaw/Claude Code/agentic OS videos, his LinkedIn post about Hermes/OpenClaw enterprise readiness, and a MindStudio writeup summarizing his Claude Code hive-mind architecture.

## Bottom Line

Mark Kashef does not appear to dislike Hermes because it is weak technically. The clearer read is that Hermes/OpenClaw are fine personal-agent systems, but his current bar has moved to enterprise defensibility and Claude Code-centered portability:

- clear answers for data location and retention;
- secrets not sitting in local plain files;
- least-privilege access, kill switches, cost caps, and audit logs;
- owned cloud environment, especially AWS/Bedrock for regulated customers;
- portable skills and harness rules that can move across Claude Code, Codex, and future tools;
- a real data/logging layer before graph views, war rooms, or agent spectacle.

That maps well to the improvement path for Luis's stack: keep Hermes as a useful personal/desktop harness, but make MemRoOS + a governed execution plane the source of truth.

## Private Meeting Takeaways

### Marc Winitz: GTM OS should start smaller

Marc's feedback was strongly product/MVP oriented:

- Start with four capabilities max, not a broad agentic GTM platform.
- Build a fast alpha, ideally in a day, and put it in Eric's hands.
- Get Eric to define 6-8 minimum ICP criteria before scoring or enrichment work gets too sophisticated.
- Do not buy Clay/Apollo/ZoomInfo too early; HubSpot Starter plus one LinkedIn Sales Navigator seat is enough for now.
- Clay/Apollo/ZoomInfo should wait until account-fit logic and buyer mapping are stable, with 40-50 active accounts or a small enrichment pilot that proves field completeness and cleanup time.
- Treat this as an internal top-of-funnel business-development system, not a generic "agentic OS".

Implication for Luis: the stack should show useful workflow proof before architecture depth. Use the architecture to make the alpha reliable, not to justify a larger build.

### Eric: bill and scope by capability, not agent count

Eric repeatedly framed the deliverable as GTM capabilities and work output:

- competitive intelligence;
- prospect/account list building;
- buyer persona mapping;
- relationship/network mapping;
- tailored outreach/deck prep;
- logging and learning from calls;
- a buy-vs-build matrix, starting with Monaco and similar tools.

He does not want "I built X agents" as the unit of value. He wants "this sales/marketing function now works."

Implication for Luis: present agents as implementation details under named capabilities.

### Brendan: keep Hermes in research mode for now

Brendan aligned with a phased stack: HubSpot, Clay, Smartlead, Sales Navigator later as needed. On Hermes, his advice was conservative:

- useful for research and analysis;
- not ready for autonomous outreach without validation;
- use human review and avoid premature vendor lock-in;
- report progress in a single surface such as Notion or a live status dashboard.

Implication for Luis: Hermes can be a workbench, but external-action workflows need gates.

### Juan and Lior: enterprise agents need harness engineering, not just agents

Juan and Lior's meetings reinforce the same theme as Mark's public content:

- Memory is the foundation for observability and source-of-truth reconstruction.
- Harness engineering is the next layer: security, brand consistency, model routing, evals, permissions, and sandboxes.
- A company-level harness has a different problem shape than a personal harness like Hermes.
- Cordant's customer-facing product likely should act as a governed "brain" that packages context for customer systems, not as an agent acting directly inside customer infrastructure.
- Sensitive content needs tagging and pre-send gates.
- Deterministic, auditable microservices remain the near-term standard for bank-grade workflows.

Implication for Luis: productize the "brain/context payload" and governance layer, not just agent execution.

## Mark Kashef Public Takeaways

### Why Hermes/OpenClaw fall short for him

Mark's enterprise critique is direct: companies ask where data goes and how long it is retained, and personal agent tools often cannot answer at the level IT, healthcare, banks, nonprofits, or EU-regulated teams need.

In his AWS/Bedrock video and LinkedIn post, his replacement architecture maps personal-agent conveniences to enterprise equivalents:

- local `.env` secrets -> encrypted secrets manager and per-call access;
- local files -> locked S3 buckets with customer-controlled keys;
- one powerful operator -> least-privilege roles;
- arbitrary model routing -> Bedrock-native model access inside the customer's environment;
- no hard spend boundary -> rate limits, kill switches, and cost caps;
- unmanaged outputs -> inbound and outbound scans for PII, secrets, and do-not-leak data;
- informal trust -> logs retained long enough for audit and compliance review;
- opaque readiness -> SOC 2/HIPAA posture scoring and remediation suggestions.

This is not "Hermes bad." It is "Hermes personal stack is not enough for enterprise buyers."

### Why he prefers Claude Code as the center

Across the "I Replaced OpenClaw and Hermes..." and agentic OS videos, Mark's preference is to build a command center around the existing Claude Code ecosystem rather than depend on a specific agent app.

The recurring reasons:

- use an existing Claude Code subscription and avoid extra API costs where possible;
- keep the core in a repo: `claude.md`, YAML metadata, skills, database, logs, and scripts;
- make the system portable across Claude Code, Codex, and future tools;
- use Hermes/OpenClaw-like interfaces as replaceable layers, not the core;
- invest in the data layer and task log first.

### What his stack values

Mark's stack pattern is concrete:

- shared SQLite database for agent identities, conversations, tasks, memories, schedules, and hive-mind entries;
- list view before graph view;
- Telegram bridge/mobile command center;
- `/standup` and `/discuss` style agent coordination;
- cheap model routing for classification/summarization;
- frontier models for reasoning and final work;
- explicit memory policy: importance, salience, recency, pinning, decay;
- skill hygiene: trim dead skills, simulate/score skills, make global vs project-specific promotion an explicit choice;
- scheduled goals and cron-like recurring jobs;
- war-room context threading so agents see each other's replies and relevant role files.

## Recommended Improvements to Luis's Agent Stack

### 1. Separate personal harness from enterprise control plane

Keep Hermes for fast personal execution and experiments. But define MemRoOS as the durable control plane:

- knowledge store;
- audit log;
- memory and recall layer;
- policy and retention metadata;
- source-of-truth status for agents, skills, and connectors.

Do not sell or explain Hermes as the system. Explain the governed control plane, with Hermes as one client.

### 2. Build an enterprise readiness answer sheet

Create a one-page answer for:

- where data lives;
- how long it is retained;
- who can access it;
- where secrets live;
- how prompts/outputs are logged;
- how data is deleted;
- how PII and sensitive client data are gated;
- what model sees which data;
- what happens when an agent fails mid-task.

This is the fastest way to turn Mark's Hermes critique into a MemRoOS selling point.

### 3. Add a visible task/event ledger before more UI

Mark's strongest implementation advice is "list view before graph view." For Luis, this means:

- every agent task gets a durable row/event;
- status, owner, model, tools, sources, cost, and output path are recorded;
- crashes and resumptions have receipts;
- Circleback/Gmail/Drive/Slack-derived work includes source links and access boundaries;
- the ledger can drive dashboards later.

### 4. Formalize model-routing tiers

Adopt the pattern already emerging in Luis's stack:

- frontier model: planning, high-stakes synthesis, validation;
- cheap large-context model: routing, summarization, classification, transcript/corpus scans;
- local/open model: low-risk grunt work and pre-processing;
- validator/adversarial model: checks, evals, source coverage, brand/compliance.

Make this a declared routing policy, not an ad hoc habit.

### 5. Put Hermes behind gates for external actions

For Hermes or any agent touching email, outreach, files, CRM, or client-facing work:

- require dry-run previews;
- require human approval for send/write actions;
- log every attempted action and final state;
- keep research and autonomous execution as separate modes;
- add PII/secrets scans before any external message leaves.

This aligns with Brendan, Juan, Lior, and Mark.

### 6. Treat skills as governed assets

Implement a skill registry with:

- owner;
- scope: global, project, client, agent-specific;
- last used;
- expected input/output;
- test prompt;
- known failure modes;
- promotion criteria;
- retirement criteria.

Run periodic skill hygiene: consolidate duplicate skills, remove stale ones, and simulate/score critical skills.

### 7. Reframe GTM OS as four initial capabilities

For Cordant specifically, start with:

1. ICP and target-segment definition.
2. Target account list generation.
3. Account brief and exec meeting prep.
4. Weekly GTM operating brief.

Do not lead with "12 agents." Lead with "four capabilities Eric can use this week."

### 8. Make buy-vs-build a first-class artifact

For each GTM capability, classify:

- buy now;
- build now;
- configure with existing tools/context;
- delay until threshold.

Initial likely answer:

- Buy now: HubSpot Starter, one LinkedIn Sales Navigator seat.
- Test lightly: Apollo free plan or sample enrichment if needed.
- Delay: Clay/Apollo/ZoomInfo paid rollout until account model proves itself.
- Build now: scoring/briefing/weekly intelligence loop, because it is Cordant-specific.

### 9. Add a "context payload" product lane

Lior's strongest strategic point matches Mark's enterprise critique: customers may not accept a third-party agent in their environment, but they may accept a governed brain that prepares context for their own systems.

MemRoOS should package:

- source-bounded context;
- provenance;
- permissions;
- retention;
- confidence and gaps;
- recommended next action;
- payload format for downstream agents/tools.

This is more enterprise-plausible than "our agent acts inside your stack."

### 10. Define the crash/recovery contract

Luis already knows agents crash. Make the contract explicit:

- every long-running task must checkpoint;
- every checkpoint includes objective, state, sources, next action, and blocker;
- resumed agents must read the checkpoint before acting;
- stale checkpoints expire or require review;
- cross-harness resumptions are tested, not assumed.

## Why Mark Is Probably Not Liking Hermes

The best answer:

He is not rejecting Hermes as a personal productivity tool. He is rejecting Hermes as the center of a serious enterprise agent stack.

Reasons:

- Hermes/OpenClaw do not naturally answer enterprise data-location, retention, and deletion questions.
- Local secrets and local documents are acceptable for solo builders but not for regulated customers.
- A personal harness is not the same as an enterprise control plane.
- He prefers owning the repo, data model, memory policy, skill layer, and execution logs.
- He wants the agent interface to be swappable. Today it may be Hermes; tomorrow it may be Claude Code, Codex, Telegram, Slack, or a custom command center.
- He is cost-sensitive: use cheap models for routing and summarization, reserve expensive models for reasoning.
- He sees data engineering and auditability as the actual foundation.

For Luis, the move is not "abandon Hermes." It is "make Hermes one execution surface attached to MemRoOS, not the brain."

## Immediate Next Actions

1. Write the enterprise readiness answer sheet for MemRoOS/Hermes.
2. Create the task/event ledger view before adding graph/war-room polish.
3. Turn the GTM OS into the four-capability alpha Marc suggested.
4. Add explicit human-in-the-loop gates to Hermes external actions.
5. Start a skill registry and run the first skill-hygiene pass.
6. Build the Cordant buy-vs-build matrix with Monaco, HubSpot, Sales Nav, Apollo, Clay, Smartlead, and custom MemRoOS loops.
7. Publish "Hermes as client, MemRoOS as control plane" as the internal architecture framing.

