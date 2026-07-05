---
title: "Microsoft IQ Feature Adoption Analysis — What MemroOS Should Replicate, Label, Integrate, or Skip"
description: "Feature-by-feature decision matrix for Microsoft IQ (Work IQ, Fabric IQ, Foundry IQ, Web IQ): adopt/replicate in open source, integrate as storage labels, complement with Microsoft's own OSS, or skip. Prioritized with probability of success and counterarguments."
publishedAt: "2026-07-05"
tags: ["comparison", "Microsoft IQ", "strategy", "roadmap", "agentic-memory"]
keywords: ["Microsoft IQ features", "MemroOS roadmap", "Foundry IQ open source alternative", "Purview sensitivity labels", "GraphRAG", "Microsoft Agent Framework", "Kernel Memory"]
author: "Alba [bot]"
model: "claude-sonnet-5"
derived_from: "content/blog/memroos-vs-microsoft-iq.md (fa5baad)"
sources:
  - https://learn.microsoft.com/en-us/fabric/iq/overview
  - https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-foundry-iq
  - https://blog.fabric.microsoft.com/en-us/blog/from-data-platform-to-intelligence-platform-introducing-microsoft-fabric-iq
  - https://www.jamesserra.com/archive/2026/02/making-sense-of-microsofts-ai-strategy-work-iq-fabric-iq-foundry-iq/
  - https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
  - https://devblogs.microsoft.com/foundry/introducing-microsoft-agent-framework-the-open-source-engine-for-agentic-ai-apps/
regen_prompt: "Compare Microsoft IQ's feature set (Work IQ, Fabric IQ, Foundry IQ, Web IQ) against MemroOS. For each feature decide: replicate in open source, integrate as storage labels/metadata, adopt Microsoft's own OSS as a complement, or skip. Prioritize, give probability of success, and give the strongest counterargument for each."
---

# Microsoft IQ Feature Adoption Analysis

Follow-up to `content/blog/memroos-vs-microsoft-iq.md`. That doc positioned the two products. This one answers the build question: **of everything Microsoft IQ does, what should MemroOS replicate, what should it reduce to metadata labels, what should it borrow from Microsoft's own open source, and what is MemroOS's platform wedge?**

## 1. Microsoft IQ Feature Inventory

Microsoft IQ is not a SKU — analysts note it's an architectural label over four pillars, most still partly in preview as of mid-2026:

| Pillar | What it actually is |
|---|---|
| **Work IQ** | Data (email/chat/files via Graph API) + memory of work habits/workflows + inference that routes the right agent/action. Powers Copilot in Teams/Outlook/Word. |
| **Fabric IQ** | Semantic foundation over enterprise data: **Ontology** (business entities/relationships, no-code), **Semantic Model** (reuses Power BI definitions), **Graph engine** (multi-hop reasoning), **Data Agents**, NL2Ontology query layer. Sits on OneLake. |
| **Foundry IQ** | Unified knowledge/retrieval layer on Azure AI Search: federates M365, SharePoint, Fabric, OneLake, Blob, web, and MCP sources; **Entra ID identity trimming** + **Purview sensitivity labels** respected at retrieval time. |
| **Web IQ** | Real-time web grounding for agent responses. |

## 2. Decision Matrix

### REPLICATE in MemroOS (open source)

**R1. Retrieval-time permission trimming (from Foundry IQ).**
Foundry IQ's killer enterprise feature: an agent can only retrieve what the *requesting identity* is allowed to see. MemroOS already has per-agent **write** policy gates and audit rows; the symmetric **read** gate is missing. Implement as: agent identity → allowed knowledge tiers/paths → filter applied inside `knowledge_search`/`knowledge_read` before results return.
- Effort: moderate — the agent-identity and policy plumbing already exists on the write side.
- **Probability of success: 75%**
- Counterargument: most current MemroOS deployments are single-operator; read-trimming adds latency and config surface nobody asked for yet. Mitigation: default-open, opt-in per tier.

**R2. Agentic/federated retrieval planner (Foundry IQ-lite).**
Foundry IQ's core UX: one query, decomposed across many knowledge sources, no per-source RAG pipeline. MemroOS equivalent: a retrieval planner that fans a query across knowledge base + memory tiers + registered external MCP sources and merges ranked results. MemroOS is MCP-native, so "registered external sources" is just MCP servers — Microsoft is only now adding MCP sources in *private preview*; this is a place MemroOS is structurally ahead.
- **Probability of success: 65%**
- Counterargument: connector/federation quality is where Microsoft's army of engineers wins; a half-good federated search is worse than a great local one. Mitigation: cap scope at "local tiers + N user-registered MCP sources," never chase connector breadth.

**R3. Ontology-lite over the knowledge base (from Fabric IQ).**
Fabric IQ's ontology gives agents a shared business vocabulary (customer, product, revenue) with typed relationships. MemroOS already proved this pattern for code with GitNexus (symbols, relationships, execution flows). The replicate move is a *knowledge* graph tier: typed entities + relationships extracted from `content/`, queryable for multi-hop questions. Bootstrap it with Microsoft's own **GraphRAG** (OSS, see §4) rather than building extraction from scratch.
- **Probability of success: 55%**
- Counterargument: ontology maintenance is where these projects go to die. Fabric IQ bootstraps from 30M+ existing Power BI semantic models; MemroOS has no equivalent cold-start asset, so the graph starts empty and stale-drifts. Mitigation: auto-extract on knowledge_write, never require manual ontology curation.

### INTEGRATE AS STORAGE LABELS (metadata, not features)

This is the highest-leverage/lowest-cost bucket: don't build Purview or "authoritative source" machinery — encode them as frontmatter labels the existing policy gate and search layer already understand.

**L1. Sensitivity labels (Purview-equivalent).** `sensitivity: public | internal | confidential | restricted` in frontmatter. Policy gate enforces on write (which agents may create `restricted` docs) and, once R1 lands, on read. Audit rows already capture who wrote what.
- **Probability of success: 85%** — it's a schema addition plus two gate checks.
- Counterargument: labels without enforcement are compliance theater; if R1 never ships, `confidential` is decoration. Mitigation: ship L1 and R1 as one milestone.

**L2. Authoritative-source flag (Foundry IQ concept).** `authoritative: true` marks docs that win ranking conflicts — the difference between "an agent once wrote this" and "this is the canonical answer." Retrieval boosts authoritative docs; agents cite them preferentially.
- **Probability of success: 85%**
- Counterargument: who decides authoritativeness? In M365 it's IT; in MemroOS it's ambiguous between operator and agents. Mitigation: only operator-approved writes (existing approval gate) can set it.

**L3. Freshness/verification labels.** `verified_at`, `expires_at`, `source_drift_risk`. Cheap, and directly feeds the existing research-without-persist detector and future re-verification crons.
- **Probability of success: 90%**
- Counterargument: metadata nobody updates becomes misinformation with a timestamp. Mitigation: cron that flags expired docs, not humans.

### ADOPT Microsoft's own open source as complements

Microsoft's IQ stack is proprietary, but the surrounding ecosystem is genuinely OSS (MIT) and *complements* rather than competes:

| OSS project | Role for MemroOS | Note |
|---|---|---|
| **Microsoft Agent Framework** (successor to Semantic Kernel + AutoGen, v1.0 GA April 2026) | Demand-side: MAF agents speak MCP → they're MemroOS clients for durable memory MAF itself lacks (its state is session-based; durable memory is a *Foundry-hosted* paid feature). Ship a "MemroOS memory for MAF" integration guide/adapter. | Highest strategic value: every MAF team that won't pay for Foundry hosted memory is a MemroOS prospect. |
| **GraphRAG** | Supply-side: entity/relationship extraction engine for R3's ontology tier. | Indexing cost is real (LLM-heavy); run incrementally on write, not full-corpus. |
| **Presidio** | PII detection/redaction before memory writes. Already referenced in `.planning/research/STACK.md` and `services/memory/pii_guard.py` fixtures — formalize it. | Near-free adoption. |
| **Kernel Memory** (microsoft/kernel-memory) | Study, don't adopt: it's Microsoft's own OSS memory-service pattern (ingestion pipeline, citations). Mine its ingestion/citation design for MemroOS's pipeline. | Overlaps MemroOS core — integrate ideas, not the dependency. |
| **A2A protocol** | Interop: accept A2A task handoffs and persist their context into MemroOS threads, giving A2A the durable memory it deliberately lacks (task-scoped only). | Spike-sized; builds on existing `.planning/spikes/2026-06-27-adk-a2a-contract-compliance.md`. |

**Probability of success for the MAF adapter: 70%.** Counterargument: Microsoft ships managed memory in Foundry (already in preview) and bundles it "free enough" with Copilot credits, closing the gap before MemroOS captures the segment. Mitigation: the wedge is *self-hosted/portable* memory — a segment Microsoft structurally won't serve because it undermines tenant lock-in.

### SKIP (or integrate trivially)

- **Web IQ replica** — web grounding is commodity via existing search MCPs (Perplexity, Brave, etc.). Integration note in docs, zero build. (Success 90% precisely because it's not a build.)
- **Work IQ replica** (email/calendar/work-habit ingestion) — requires deep Graph API integration, consent flows, and a privacy posture MemroOS shouldn't own. If users want work signals, they connect Graph via MCP and MemroOS stores the *derived learnings*. Probability of success as a replica: **35%** — the strongest skip in this doc. Counterargument to skipping: work-habit memory is Work IQ's stickiest feature and "MemroOS remembers how you work" is a great pitch. Rebuttal: the pitch survives if MemroOS stores habit-memories written by *other* tools; ingestion isn't the moat, durable governed storage is.
- **NL2Ontology no-code UI** — Fabric IQ's visual ontology builder. Wrong audience (MemroOS users are agent operators, not business analysts). Revisit only if R3 succeeds.

## 3. Priority Order

| # | Item | Bucket | Effort | P(success) | Why this order |
|---|---|---|---|---|---|
| 1 | L1+L2+L3 storage labels | Label | Days | 85–90% | Cheapest, unlocks R1, immediately marketable ("Purview-style labels, self-hosted") |
| 2 | R1 read-side permission trimming | Replicate | Weeks | 75% | Completes the governance story (currently write-only); pairs with labels |
| 3 | MAF memory adapter + integration guide | Adopt-OSS | Weeks | 70% | Rides Microsoft's own distribution; converts their framework users |
| 4 | R2 federated retrieval planner (MCP-source fan-out) | Replicate | Weeks–months | 65% | Structural head start vs. Foundry IQ's MCP private preview |
| 5 | R3 ontology tier via GraphRAG | Replicate | Months | 55% | Highest ceiling, highest death-by-maintenance risk; gate behind #1–4 |
| 6 | A2A context persistence | Adopt-OSS | Spike | 60% | Cheap optionality; do as a bounded spike first |
| — | Work IQ replica, Web IQ replica, no-code ontology UI | Skip | — | — | Integration notes only |

## 4. The Platform Thesis — why MemroOS is the right seed to grow into an "IQ"

Microsoft built IQ top-down from distribution (they own the data, so context is easy; memory and write governance are afterthoughts). MemroOS is built bottom-up from the parts Microsoft *can't* bundle without weakening lock-in:

1. **Write governance + audit lineage** — IQ is read-only context; MemroOS's policy-gated, git-versioned writes are the foundation an "open IQ" needs and the hardest part to retrofit.
2. **Durable cross-session memory** — the explicitly acknowledged gap in Work IQ/MAF (session state only; durable memory is a paid Foundry hosted feature).
3. **Framework neutrality via MCP** — IQ serves Microsoft agents; MemroOS serves Claude, MAF, LangChain, CrewAI equally. Every non-Microsoft framework is addressable market.
4. **A benchmark culture** — `evals/marketplace-agentic-memory` (MemroOS 84 vs Letta 71 / Mem0 70 / Zep 69) is a credibility asset none of the label-layer competitors have.

Growth path: labels (governance vocabulary) → read trimming (governance enforcement) → federated retrieval (context breadth) → ontology (context depth). That sequence rebuilds IQ's pillars in reverse order of Microsoft's — starting from governance, where MemroOS is already ahead, instead of from data distribution, where it can never win.

**Global counterargument (steelman):** Microsoft could ship durable, governed, MCP-federated memory inside Foundry within 12 months and bundle it into Copilot credits — they've already shipped managed memory in preview and MCP sources in private preview. If that happens, MemroOS's differentiation compresses to "self-hosted + open source + non-Microsoft frameworks." That's still a real market (data residency, regulated industries, the entire non-M365 world), but it caps the enterprise ceiling. The response is speed on #1–3 above: own the open, portable governance layer before Microsoft's preview features GA.
