---
name: "memroos-memory-architecture-video-package-2026-08-12"
title: "MemroOS Memory Architecture — Accessible Teaching Video Package and Enterprise Comparison"
description: "A source-backed, NotebookLM-ready lesson package with an accessible transcript, storyboard, diagrams, technical deep dive, and a category-aware comparison of MemroOS with Hindsight, Cognee, Mem0, Zep/Graphiti, AWS AgentCore Memory, Microsoft Foundry Memory, and Letta."
publishedAt: "2026-08-12"
tags:
  - memroos
  - agent-memory
  - architecture
  - video-script
  - notebooklm
  - competitive-analysis
keywords:
  - memory architecture
  - recall-v2
  - vector memory
  - graph memory
  - episodic memory
  - governance
  - enterprise agent memory
author: "Codex"
source_session: "Codex task 019ff4f0-eab4-7dc2-8777-888ef9c7f8c5"
model: "gpt-5.6"
sources:
  - "repo:docs/memory-architecture.md"
  - "repo:docs/architecture.md"
  - "repo:docs/client/recall-contracts.md"
  - "repo:apps/memroos/src/lib/memory/tiers.ts"
  - "repo:apps/memroos/src/lib/memory-engine/contracts.ts"
  - "repo:apps/memroos/src/lib/memory-engine/recall-v2.ts"
  - "repo:apps/memroos/src/lib/memory-engine/scope.ts"
  - "repo:apps/memroos/src/lib/memory-engine/mem0-adapter.ts"
  - "repo:apps/memroos/src/lib/memory-engine/hindsight-adapter.ts"
  - "repo:apps/memroos/src/lib/memory-engine/shadow-orchestrator.ts"
  - "repo:apps/memroos/src/app/api/memory/add/route.ts"
  - "repo:apps/memroos/src/app/api/recall/route.ts"
  - "repo:apps/memroos/src/app/api/recall/ingest/route.ts"
  - "repo:apps/memroos/src/lib/db-ingest.ts"
  - "repo:apps/memroos/src/lib/memory/policy-gate.ts"
  - "repo:services/knowledge-mcp/knowledge_system/memory_recall.py"
  - "repo:services/knowledge-mcp/knowledge_system/store.py"
  - "https://hindsight.vectorize.io/developer/retain"
  - "https://hindsight.vectorize.io/developer/api/recall"
  - "https://docs.cognee.ai/core-concepts/architecture"
  - "https://docs.cognee.ai/core-concepts/main-operations/remember"
  - "https://docs.mem0.ai/api-reference/organizations-projects"
  - "https://docs.mem0.ai/platform/faqs"
  - "https://help.getzep.com/zep-vs-graphiti"
  - "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html"
  - "https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/memory-usage"
  - "https://docs.letta.com/v1-sdk/memory/memory-blocks"
derived_from: []
regen_prompt: "Create an accessible 10–12 minute educational video package explaining the shipped MemroOS memory architecture from the cited repository files. Clearly separate implemented behavior from conceptual material. Compare category-aware capabilities and tradeoffs against the cited official documentation for Hindsight, Cognee, Mem0, Zep/Graphiti, AWS AgentCore Memory, Microsoft Foundry Memory, and Letta. Use plain language, captions, transcript-first narration, text descriptions for diagrams, and never invent benchmark results."
---

# MemroOS Memory Architecture — Accessible Teaching Video Package

## Purpose and learning goals

This is a transcript-first, NotebookLM-ready lesson for someone who wants the technical details of MemroOS without already knowing vector databases, knowledge graphs, or agent infrastructure.

The central idea is:

> MemroOS is not just a memory database. It is an agent operating layer that governs how memories are captured, stored, retrieved, filtered, explained, and evaluated.

After the lesson, the learner should be able to:

- explain why one vector index is not enough for an enterprise agent;
- trace a memory write from an authenticated caller to durable capture and later enrichment;
- name the three executable storage tiers;
- explain how Claude, Qwen, Hermes, and Codex sessions become searchable episodic records;
- walk through recall-v2's five retrieval arms;
- explain why scope and policy checks happen before context injection;
- distinguish the memory subsystem from the separate Knowledge MCP service;
- compare MemroOS with specialist memory products without treating unlike products as identical;
- separate shipped implementation from conceptual architecture language.

## Plain-language glossary

- **Memory:** Information that persists beyond one model turn.
- **Context:** The bounded material supplied to a model for the current turn.
- **Recall:** Finding useful prior information for the current task.
- **Ingestion:** Turning existing sessions, documents, or connector records into indexed records.
- **Durable capture:** Safely saving an input before enrichment finishes.
- **Enrichment:** Extracting facts, embeddings, entities, or other searchable representations.
- **Vector / embedding:** A numeric representation used to find similar meaning.
- **ANN:** Approximate nearest-neighbor search for similar vectors.
- **BM25 / FTS5:** Keyword-oriented full-text search, useful for exact names and identifiers.
- **Graph:** Entities and relationships, such as “service A depends on service B.”
- **Episodic memory:** Events and conversations with time and provenance.
- **Scope:** The server-controlled tenant/project/user/agent/space boundary of an operation.
- **Policy gate:** A decision that allows, redacts, reviews, seals, or denies use.
- **Context pack:** The small ordered set of retrieved items injected into the model.
- **Receipt:** An audit-safe record of what the system did, without repeating private payloads.
- **Shadow read/write:** A secondary experiment that cannot become the answer source.

## One-sentence architecture

An authenticated agent sends a governed write or recall request to the MemroOS broker; MemroOS captures and classifies data, routes it to SQLite, Mem0/Qdrant, or Neo4j as appropriate, retrieves through several independent search arms, filters by policy, builds a bounded context pack, and emits receipts that explain the operation.

## What MemroOS is responsible for

The repository describes MemroOS as an agent OS or broker kernel. It provides agent registration and authentication, protocol boundaries, memory routing and receipts, an agent context bus, orchestration boundaries, operator control surfaces, audit, and telemetry. It is not a replacement for every agent runtime; it sits around agents and gives their interactions a governed substrate.

Primary sources:

- \`docs/architecture.md\`
- \`docs/memory-architecture.md\`
- \`apps/memroos/src/lib/memory-engine/contracts.ts\`
- \`apps/memroos/src/lib/memory-engine/scope.ts\`

## The three shipped memory tiers

### Vector

Vector memory finds similar meaning: “What previous work is like this?” MemroOS reaches a Mem0 HTTP service for vector search; the architecture docs describe Mem0 backed by Qdrant Cloud. The adapter hides direct provider details from the rest of the application.

Best for semantic similarity and fuzzy discovery.

### Graph

Graph memory finds entities and relationships: people, agents, services, projects, and dependencies. MemroOS uses a Neo4j-backed path plus local semantic entity-graph data. Results are scoped by tenant, project, and space before recall.

Best for relationships, dependencies, and reasoning paths.

### Episodic

Episodic memory stores what happened, when, and with what provenance. MemroOS keeps operational events and conversation data in SQLite, with FTS5 keyword search and temporal indexes.

Best for exact history, chronology, and audit-oriented evidence.

### Shipped versus conceptual

Some product material describes a five-tier conceptual model: vector, graph, episodic, knowledge, and skill. That is useful teaching language, but the executable memory tier resolver currently exposes only:

- \`vector\`
- \`graph\`
- \`episodic\`

Knowledge is handled by a separate Knowledge MCP/library layer; skills are reusable procedures. The video must label the five-tier model as conceptual and the three-tier model as shipped.

Sources:

- Shipped resolver: \`apps/memroos/src/lib/memory/tiers.ts\`
- Conceptual discussion: \`apps/memroos/content/blog/agentic-memory-architecture.md\`

## Write path

~~~mermaid
sequenceDiagram
    participant A as Authenticated agent
    participant K as MemroOS API
    participant P as Scope and policy
    participant V as Bronze vault and queue
    participant M as Mem0 / vector
    participant G as Neo4j / graph
    participant S as SQLite / episodic

    A->>K: POST /api/memory/add
    K->>K: Authenticate and resolve server-owned scope
    K->>P: Normalize tier, labels, sensitivity, provenance
    P-->>K: Allow, redact, review, seal, or deny
    K->>V: Capture governed bronze record
    K-->>A: Receipt: capture complete, enrichment pending
    V->>M: Eligible vector enrichment
    V->>G: Eligible graph projection
    V->>S: Episodic path owned by SQLite ingestion
~~~

1. **Authenticate and scope.** The scope contains tenant, project, user, agent, space, label, purpose, and belief-stage information. A caller cannot escape its tenant by changing a query label or agent hint.
2. **Normalize and classify.** Tier aliases are resolved. Labels such as private, internal, public-safe, and public-approved are considered alongside domains and sensitivities such as PII, secrets, credentials, contracts, payments, or health.
3. **Capture before enrichment.** The route captures a bronze record in a durable vault/artifact path and queues enrichment. The immediate response can say that bronze capture succeeded while enrichment is pending.
4. **Enrich and project.** Later workers may extract facts, produce embeddings, and project eligible data to the vector, graph, or episodic path. Provider access remains behind adapters and receipts are audit-safe.

Primary code:

- \`apps/memroos/src/app/api/memory/add/route.ts\`
- \`apps/memroos/src/lib/memory/tiers.ts\`
- \`apps/memroos/src/lib/memory/save-enrichment.ts\`
- \`apps/memroos/src/lib/memory/policy-gate.ts\`

## Session ingestion path

~~~mermaid
flowchart LR
    C[Claude JSONL] --> I[Session ingester]
    Q[Qwen chats] --> I
    H[Hermes sessions] --> I
    X[Codex sessions] --> I
    I --> F[Parse user and assistant text]
    F --> D[SQLite messages]
    D --> T[FTS5 and temporal indexes]
    I --> A[Vault artifact and classification]
    A --> E[Enrichment queue]
    E --> M[Memory backends when eligible]
~~~

MemroOS can scan supported session directories, skip unchanged files using ingestion metadata, parse user and assistant text while avoiding tool/thinking noise, and store message rows with session, project, agent, role, timestamp, working directory, branch, request, and tenant metadata. Those rows support episodic recall, full-text search, and time-aware retrieval. The ingestion route is \`POST /api/recall/ingest\`.

Primary code:

- \`apps/memroos/src/lib/db-ingest.ts\`
- \`apps/memroos/src/app/api/recall/ingest/route.ts\`

## Read path: recall-v2

~~~mermaid
flowchart TD
    R[Authenticated recall request] --> S[Build authorized scope]
    S --> I[Parse intent and temporal hints]
    I --> A1[BM25 / SQLite FTS5]
    I --> A2[ANN / Mem0-Qdrant]
    I --> A3[Graph / Neo4j entity graph]
    I --> A4[Temporal / SQLite index]
    I --> A5[Derived / SQLite facts]
    A1 --> P[Policy filter]
    A2 --> P
    A3 --> P
    A4 --> P
    A5 --> P
    P --> F[RRF rank fusion]
    F --> X[Deterministic local rerank]
    X --> D[Deduplicate]
    D --> B[Context budget and context pack]
    B --> O[Answer plus receipt and telemetry]
~~~

The five arms are:

- **BM25:** exact words and lexical matches;
- **ANN:** approximate semantic similarity through the Mem0/Qdrant path;
- **graph:** entity and relationship traversal;
- **temporal:** time-aware SQLite retrieval;
- **derived:** structured facts computed or materialized locally.

The arms cover different failure modes. Keyword search is strong for exact identifiers; vectors handle paraphrases; graph search handles relationships; temporal search distinguishes old from current evidence; derived facts answer structured questions.

Candidates are policy-checked before fusion. Checks include tenant, project, space, agent, label, sensitivity, and erased status. A denied candidate becomes an opaque policy-filtered receipt event rather than leaking its text.

Allowed candidates use reciprocal-rank fusion (RRF). Simplified:

\[
\mathrm{RRFContribution} = \frac{1}{60 + \mathrm{rank}}
\]

The implementation's constant is 60. Fusion rewards candidates that appear consistently across arms rather than trusting incomparable backend scores. Then the pipeline performs deterministic local reranking, deduplication by source hash or normalized text hash, context-budget enforcement, truncation, and context-pack assembly.

The main implementation is \`apps/memroos/src/lib/memory-engine/recall-v2.ts\`; the direct API entry point is \`apps/memroos/src/app/api/recall/route.ts\`.

## Receipts and observability

A receipt is not the memory. It is an audit-safe explanation of the operation. It can record which arms ran, retrieved and filtered counts, fusion/rerank/dedup counts, context-pack counts, latency, degraded dependencies, and hashed request/scope identities. It intentionally avoids raw payloads and backend identifiers so the audit trail does not become a second data-exfiltration path.

## Knowledge MCP is separate from memory

MemroOS has a separate Knowledge MCP service. It manages Markdown-backed durable knowledge, safe paths, tenant-aware roots, frontmatter and sensitivity validation, audited reads, progressive workspaces, meeting/QMD sources, and connector recall.

Its \`memory_recall\` facade can federate knowledge files, meeting collections, connectors, and memory at query time. Storage remains federated. A policy document, reusable skill, conversation event, and learned user preference have different lifecycles and should not be forced into one undifferentiated vector record.

Sources:

- \`services/knowledge-mcp/knowledge_system/memory_recall.py\`
- \`services/knowledge-mcp/knowledge_system/store.py\`
- \`docs/architecture.md\`

## Governance and the Hindsight boundary

The server owns scope, policy, and lifecycle authority. Important controls include tenant and space authorization, agent identity matching, labels and sensitivity, fail-closed decisions, redaction or denial before context injection, canonical hashes, provenance, raw-vault separation, receipts, review states, retention, and erasure paths.

MemroOS contains a Hindsight adapter, but the current integration is deliberately conservative:

- Hindsight bank IDs are derived from authorized scope with a server-only secret.
- The primary MemroOS path runs first.
- Hindsight can receive a governed shadow write after primary success.
- Shadow reads are trace-only; Hindsight text is not returned as answer context.
- \`isHindsightAnswerInjectionEnabled()\` is currently false.
- Curate and erase authority remains governed by MemroOS.

Therefore, “MemroOS has a Hindsight integration boundary” is accurate. “MemroOS currently answers from Hindsight” is not.

Sources:

- \`apps/memroos/src/lib/memory-engine/hindsight-adapter.ts\`
- \`apps/memroos/src/lib/memory-engine/shadow-orchestrator.ts\`
- \`apps/memroos/src/lib/memory-engine/scope.ts\`

## Evaluation

The repository treats retrieval as measurable. Metrics include recall@k, precision@k, mean reciprocal rank (MRR), tier coverage, false-positive rate, latency, and degraded-dependency behavior. Documented MemroOS targets include recall@5 at least 0.85, precision@5 at least 0.70, MRR at least 0.75, and latency below 5 seconds.

These are system evaluation targets, not scores against competitors. A fair head-to-head benchmark would need the same corpus, queries, policies, latency budget, and deployment conditions.

Sources:

- \`docs/memory-architecture.md\`
- \`apps/memroos/src/lib/memory/recall-evals.ts\`
- \`docs/client/recall-contracts.md\`

# Category-aware comparison

This is not a fresh head-to-head benchmark. The products occupy different categories: broker kernel, specialist memory service, data-to-memory pipeline, context graph, managed cloud memory, and agent runtime.

| Product | Primary category | Memory / retrieval shape | Enterprise posture | Difference from MemroOS |
|---|---|---|---|---|
| **MemroOS** | Agent OS / broker kernel | Three shipped tiers—vector, graph, episodic—plus recall-v2 BM25, ANN, graph, temporal, and derived arms; separate federated Knowledge MCP | Server-owned scope, policy gates, receipts, SQLite kernel, external Mem0/Qdrant/Neo4j, governed shadow integration | Broad operating boundary; tradeoff is more moving parts and more self-operation |
| **Hindsight** | Dedicated memory service | \`retain\`, \`recall\`, \`reflect\`; official docs describe semantic, BM25, graph, and temporal retrieval with fusion/reranking and structured facts | Embedded or database-backed options; isolated memory banks; specialist memory operating model | Close memory-subsystem comparison; MemroOS adds broker, policy, ingestion, knowledge, and fleet boundaries |
| **Cognee** | Open memory platform / pipeline | Relational provenance and document/chunk store plus vector embeddings and graph entities/relationships; remember/recall/improve/forget | Local defaults and production backends; pipeline and dataset abstractions | Strong data-to-memory pipeline; MemroOS emphasizes agent identity, policy, receipts, and operating-plane boundaries |
| **Mem0** | Memory component / platform | User/agent-linked memories distributed across vector and graph stores; organization/project controls in platform docs | Managed platform, OSS/self-host options, project/org membership and keys | MemroOS uses Mem0 as a provider; Mem0 alone is not MemroOS's broker, episodic path, policy gate, or Knowledge MCP |
| **Zep / Graphiti** | Managed context graph plus open temporal graph | Temporal graph with hybrid vector, full-text, and graph retrieval | Zep's official comparison describes RBAC/ABAC, audit, retention, isolation, encryption, and cloud/BYOK/BYOC options | Strong graph-native and managed posture; MemroOS is more self-owned and multi-backend |
| **AWS AgentCore Memory** | Managed AWS memory capability | Configurable strategies for extraction and consolidation; built-in or self-managed strategy paths | AWS-managed resources and strategy controls; self-managed strategies add infrastructure burden | Strong AWS-native choice; MemroOS is more provider-neutral but requires more operations |
| **Microsoft Foundry Memory** | Managed cloud memory store/API | Memory stores, scope isolation, item CRUD, retention, remember/forget flows; documented as preview | Azure-managed identity and operations | Strong Microsoft/Azure-native choice; MemroOS is broader and self-owned |
| **Letta** | Agent runtime | Persistent in-context memory blocks plus archival/external memory options | Runtime-centric rather than a standalone enterprise memory database | Useful persistent-state comparison, not a direct equivalent to multi-tier governed memory |

### How to interpret the table

- Choose **MemroOS** when the hard problem is the whole operating boundary: many agents, multiple sources, tenant-safe access, auditable retrieval, local and external substrates, and a knowledge layer that must coexist with memory.
- Choose **Hindsight** for a focused structured-memory service with hybrid recall and reflective synthesis.
- Choose **Cognee** for an open pipeline that turns data into vector-plus-graph memory and lets you compose the surrounding control plane.
- Choose **Mem0** for a memory component or managed platform; plan to build broader governance and operations around it.
- Choose **Zep/Graphiti** for temporal context graphs and a managed context service.
- Choose **AWS AgentCore Memory** or **Microsoft Foundry Memory** when matching-cloud operations and identity are more important than provider neutrality.
- Choose **Letta** when persistent agent state is the central problem.

Official evidence used:

- [Hindsight retain](https://hindsight.vectorize.io/developer/retain) describes structured memories, entities, graph links, and temporal grounding.
- [Hindsight recall API](https://hindsight.vectorize.io/developer/api/recall) describes semantic, keyword/BM25, graph, and temporal retrieval with fusion and reranking.
- [Cognee architecture](https://docs.cognee.ai/core-concepts/architecture) describes relational provenance, vector embeddings, graph relationships, and hybrid recall; [Cognee remember](https://docs.cognee.ai/core-concepts/main-operations/remember) describes permanent versus session memory behavior.
- [Mem0 organizations and projects](https://docs.mem0.ai/api-reference/organizations-projects) documents platform access controls; [Mem0 FAQ](https://docs.mem0.ai/platform/faqs) describes user/agent-linked memory and vector/graph distribution.
- [Zep versus Graphiti](https://help.getzep.com/zep-vs-graphiti) describes Graphiti's temporal graph and Zep's managed enterprise context posture.
- [AWS AgentCore Memory strategies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html) documents built-in, override, and self-managed strategy options.
- [Microsoft Foundry Memory](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/memory-usage) documents preview memory stores, scopes, CRUD, and retention.
- [Letta memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks) documents persistent in-context blocks and read/write controls.

No performance ranking is claimed. Vendor benchmark numbers, certification claims, and marketing adjectives are not treated as cross-product evidence unless directly supported and comparable.

# Accessible 10–12 minute video script

Use this transcript as captions and as the spoken track. Target 125–145 words per minute. Every visual has a spoken description. Do not rely on color alone; label every tier and arrow in text. Use high contrast, large type, short on-screen text, pauses after each layer, and audio description for diagrams.

## 00:00–00:45 — The question

**On screen:** “How MemroOS remembers” and “A governed memory architecture for agents.”

**Visual description:** Agent request → MemroOS broker → several memory stores → small context pack → agent answer.

**Narration:**

“Imagine an agent that helped with an incident last month. Today you ask, ‘What did we learn, and is it still true?’ A memory system has to do more than find similar words. It must find the right evidence, understand time and relationships, respect permissions, and fit the answer into a limited context window.

MemroOS treats this as an operating-layer problem. It provides a governed path for capturing, storing, retrieving, and evaluating memory. In this lesson we will follow one write, one recall, and one comparison with other enterprise memory products.”

## 00:45–01:35 — Memory is not one database

**On screen:** “Vector: similar meaning,” “Graph: relationships,” “Episodic: what happened and when.”

**Narration:**

“MemroOS ships three physical memory tiers. Vector memory finds similar meaning. Graph memory finds entities and relationships. Episodic memory preserves events, time, and provenance.

These tiers complement one another. A vector result may find a similar incident. A graph result may identify the service involved. An episodic result may show the exact sequence of decisions. Asking one store to do every job would leave predictable gaps.”

## 01:35–02:55 — The governed write path

**On screen:** authenticate → scope → classify → capture bronze → enrich → project.

**Narration:**

“When an agent writes memory, MemroOS authenticates the request and resolves a server-owned scope. The scope includes tenant, project, agent, user, and space. The caller cannot escape its tenant by changing a label in the request.

MemroOS normalizes the tier and classifies the content. It can distinguish private, internal, public-safe, and public-approved material, and it can recognize sensitive classes such as personal information, credentials, contracts, payments, or health data.

The system captures a bronze record into durable storage and queues enrichment. The response can say capture succeeded while enrichment is pending. This means a temporary embedding or graph outage does not silently lose the original governed input.

Later, eligible data can become a vector fact, a graph projection, or an episodic record. Provider details stay behind adapters.”

## 02:55–03:55 — Existing sessions become memory

**On screen:** Claude, Qwen, Hermes, and Codex session files → SQLite messages → FTS5, temporal indexes, enrichment.

**Narration:**

“MemroOS also ingests existing sessions. It can scan supported Claude, Qwen, Hermes, and Codex files, parse user and assistant text, skip tool and thinking noise, and store message rows with session, project, agent, role, timestamp, branch, and tenant data.

Those rows become episodic memory. Full-text search is useful for exact names and identifiers. Temporal indexes help answer questions about recency and sequence. Unchanged files are skipped using ingestion metadata, and the ingestion path can create a governed artifact for later enrichment.”

## 03:55–05:55 — How recall-v2 works

**On screen:** BM25, ANN, graph, temporal, derived → policy filter → RRF → rerank → dedupe → context pack.

**Narration:**

“Recall-v2 is not just a vector lookup. It builds an authorized scope, parses the query, and runs five arms in parallel.

BM25 is keyword search over SQLite full-text indexes. ANN, or approximate nearest-neighbor search, finds semantic similarity through the Mem0 and Qdrant path. Graph retrieval finds entities and relationships. Temporal retrieval finds time-aware evidence. Derived facts answer structured questions from local data.

Each arm covers a different failure mode. Exact names favor keyword search. Paraphrases favor vectors. Relationships favor graphs. ‘Most recent’ favors temporal retrieval.

Before candidates are fused, policy checks verify tenant, project, space, agent, label, sensitivity, and erased status. A denied candidate is recorded opaquely rather than exposed.

Allowed candidates are combined with reciprocal-rank fusion, or RRF. A simplified contribution is one divided by 60 plus the candidate’s rank. A candidate that appears consistently across several arms can outrank one that appears only once.

The pipeline then reranks locally, removes duplicates using source hashes or normalized text hashes, applies a context budget, and builds the final context pack. The answer comes with a receipt and telemetry.”

## 05:55–06:55 — Knowledge is separate from memory

**On screen:** “Memory: facts, events, relationships” and “Knowledge MCP: Markdown, meetings, connectors,” joined by “federated recall.”

**Narration:**

“MemroOS also has a Knowledge MCP layer. It is related to memory, but it is not simply another physical memory tier.

Knowledge can remain in Markdown, meeting indexes, or connector records. The Knowledge MCP layer applies safe paths, tenant-aware roots, frontmatter and sensitivity validation, and audited reads. Its recall facade can query knowledge, meetings, connectors, and memory, then merge the lanes at query time.

This separation matters. A policy document, a reusable skill, a conversation event, and a learned preference have different lifecycles. They should not automatically become the same kind of learned fact.”

## 06:55–08:05 — Governance and Hindsight

**On screen:** “tenant,” “space,” “label,” “sensitivity,” “receipt,” plus a secondary “Hindsight shadow” lane.

**Narration:**

“Governance is part of the architecture. The server owns scope, policy, and lifecycle authority. Receipts explain what happened without copying private content into the audit trail.

MemroOS includes a Hindsight adapter, but the current boundary is conservative. MemroOS can write to Hindsight as a governed shadow after the primary write succeeds. It can run shadow reads for evaluation. The shadow payload is not returned as answer context, and Hindsight answer injection is currently disabled.

So the precise statement is: MemroOS has a Hindsight integration boundary. The imprecise statement is: MemroOS currently answers from Hindsight.”

## 08:05–08:45 — Measuring quality

**On screen:** recall@5, precision@5, MRR, tier coverage, false positives, latency.

**Narration:**

“Memory quality must be measured. MemroOS tracks recall, precision, mean reciprocal rank, tier coverage, false positives, latency, and degraded dependencies. Its documented targets include recall at five of at least point-eight-five, precision at five of at least point-seven-zero, mean reciprocal rank of at least point-seven-five, and latency below five seconds.

Those are MemroOS evaluation targets, not scores against competitors. A fair comparison needs the same corpus, queries, policy, latency budget, and deployment conditions.”

## 08:45–10:25 — Enterprise comparison

**On screen:** Category labels, not a leaderboard: broker, specialist memory, pipeline, graph, managed cloud, runtime.

**Narration:**

“Hindsight is a specialist memory service. Its documentation describes structured retention and recall combining semantic, keyword, graph, and temporal retrieval. It is a close comparison for the memory subsystem.

Cognee is an open memory platform with relational, vector, and graph stores plus remember, recall, improve, and forget operations. It is a strong comparison for data-to-memory pipelines.

Mem0 is a memory component and managed platform. MemroOS uses Mem0 as a provider, so this is not simply one whole product versus another. Mem0 supplies a substrate; MemroOS adds the broker, episodic SQLite path, policy gates, receipts, ingestion, and Knowledge MCP.

Zep and Graphiti focus on temporal context graphs. Zep emphasizes a managed enterprise context service, while Graphiti is the open-source temporal graph foundation.

AWS AgentCore Memory and Microsoft Foundry Memory are managed cloud capabilities. They are attractive when the team wants matching cloud identity and operations, with cloud coupling as the tradeoff.

Letta is an agent runtime whose memory blocks persist in context. It helps explain persistent agent state, but it is not a direct equivalent to MemroOS’s multi-tier governance plane.”

## 10:25–11:05 — Takeaway

**On screen:** “Capture → classify → store → retrieve → govern → evaluate.”

**Narration:**

“The key lesson is that enterprise agent memory is a pipeline, not a single database.

MemroOS captures before enrichment, separates vector, graph, and episodic concerns, searches through several arms, filters before ranking, budgets the final context, and leaves a receipt. It keeps durable knowledge and connector sources in a federated layer instead of forcing every artifact into one memory store.

If you remember one sentence, remember this: MemroOS is trying to make memory useful, bounded, and accountable at the same time.”

# NotebookLM source set and prompts

Add this package with:

1. \`docs/memory-architecture.md\`
2. \`docs/architecture.md\`
3. \`apps/memroos/src/lib/memory/tiers.ts\`
4. \`apps/memroos/src/lib/memory-engine/recall-v2.ts\`
5. \`apps/memroos/src/lib/memory-engine/contracts.ts\`
6. \`apps/memroos/src/lib/memory-engine/scope.ts\`
7. \`apps/memroos/src/app/api/memory/add/route.ts\`
8. \`apps/memroos/src/app/api/recall/route.ts\`
9. \`apps/memroos/src/lib/db-ingest.ts\`
10. \`apps/memroos/src/lib/memory/policy-gate.ts\`
11. \`services/knowledge-mcp/knowledge_system/memory_recall.py\`
12. \`services/knowledge-mcp/knowledge_system/store.py\`
13. Hindsight retain and recall documentation
14. Cognee architecture and remember documentation
15. Mem0 organization/project and FAQ documentation
16. Zep versus Graphiti documentation
17. AWS AgentCore Memory strategies documentation
18. Microsoft Foundry Memory documentation
19. Letta memory blocks documentation

Useful prompts:

- “Explain the MemroOS write path in plain language, then repeat it with exact implementation names.”
- “Make a two-column table of shipped behavior versus conceptual architecture.”
- “Trace one recall request through all five recall-v2 arms and explain why policy filtering precedes fusion.”
- “Compare MemroOS and Hindsight only on retrieval, governance, and operating boundary, citing every row.”
- “Explain why Mem0 is a component in MemroOS rather than a complete substitute.”
- “Create a glossary for a new engineer and expand every acronym.”
- “Produce an audio-described version of the architecture diagram.”
- “List every comparison claim that would require a same-corpus benchmark before it could be called a performance claim.”

## Handoff status

This package has not been uploaded to NotebookLM or shared with a third party. No NotebookLM/Google Notebook connector or skill was available in the current session, so the external handoff remains pending.

Proposed handoff after the connector is enabled and the user explicitly approves:

- **Target account:** \`luis.calderon@gmail.com\`
- **Notebook title:** \`MemroOS Memory Architecture — Accessible Deep Dive and Enterprise Comparison\`
- **Source payload:** this package plus the cited repository files and official product documentation
- **Requested artifact:** accessible narrated video overview with captions/transcript, architecture diagrams, and the category-aware comparison
- **Privacy boundary:** do not upload secrets, credentials, private customer data, raw bearer tokens, or unredacted sensitive session content


## Independent validation notes

A high-reasoning, read-only review (Sol, \`gpt-5.6-sol\`, 2026-08-12) checked the repository implementation against this package.

- **Shipped boundary:** The executable memory resolver has three tiers—vector, graph, and episodic. Recall-v2 independently has five arms—BM25, ANN, graph, temporal, and derived. Knowledge/QMD is a separate federated subsystem. Sources: \`apps/memroos/src/lib/memory/tiers.ts\`, \`apps/memroos/src/lib/memory-engine/recall-v2.ts\`, and \`docs/architecture.md\`.
- **Write-path boundary:** The older diagram in \`docs/memory-architecture.md\` presents a synchronous provider-write shape. The current route is the authority for the video: authenticate and classify, capture durable bronze data, defer adapter push/enrichment, and return pending enrichment status. Source: \`apps/memroos/src/app/api/memory/add/route.ts\`.
- **Classification nuance:** Policy denial is enforced, but if the classification module cannot load, the route logs a warning and continues for compatibility. The lesson must not claim that every write is unconditionally classified before persistence. Source: \`apps/memroos/src/app/api/memory/add/route.ts\`.
- **Reranking name:** Recall-v2's local reranker is deterministic lexical-overlap, phrase, and density scoring. It should not be described as a learned transformer cross-encoder. Source: \`apps/memroos/src/lib/memory-engine/recall-v2.ts\`.
- **Separate pipelines:** Keep API memory capture, agent-session JSONL ingestion into SQLite/FTS, and Knowledge MCP federation across QMD, knowledge, Mem0, and connectors as three related but distinct paths. Sources: \`apps/memroos/src/lib/db-ingest.ts\` and \`services/knowledge-mcp/knowledge_system/memory_recall.py\`.
- **Accessibility completion gate:** The transcript and storyboard are prepared, but a generated video still needs timed-caption review, a transcript check, spoken diagram descriptions, no color-only distinctions, acronym expansion, chapters, deliberate pacing, and periodic summaries. To reduce cognitive load, publish two chapters: “MemroOS architecture walkthrough” and “Enterprise comparison.”

The reviewer made no file edits, did not write to MemroOS, and performed no upload or share action.