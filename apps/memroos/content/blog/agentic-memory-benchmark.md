---
title: "Agentic Memory Benchmark: How We Evaluate Memory Platforms"
description: "We evaluate agentic memory platforms across recall quality, governance, orchestration, deployment, and proof surfaces. Here's the methodology and what we found."
publishedAt: "2026-05-11"
tags: ["benchmark", "evaluation", "research"]
keywords: ["agentic memory benchmark", "AI agent memory comparison", "agent memory evaluation", "best agentic memory platform", "agent memory platform comparison"]
author: "MemroOS"
---

When we started building MemroOS, we looked for a public benchmark comparing agentic memory platforms. There wasn't one. There were product comparisons written by vendors, analyst overviews that didn't go deep on technical capabilities, and a few academic papers on specific memory retrieval techniques — but nothing that systematically evaluated production-grade agentic memory systems on the criteria that matter for deployment.

So we built one: the Marketplace Agentic Memory Benchmark.

This is the methodology behind it, the criteria we chose, and the findings.

## Why This Benchmark Exists

Teams choosing a memory layer for their agent infrastructure need answers to specific questions:

- How well does the platform retrieve relevant context versus irrelevant noise?
- Does it support multiple memory types or just vector search?
- What governance controls does it provide for enterprise deployment?
- Does it integrate with orchestration systems, or is it standalone?
- Can it be self-hosted, or is it cloud-only?
- What does the operator experience look like?
- Which agent frameworks does it work with?

None of the existing comparisons answered these questions systematically. The benchmark was designed to.

## The 8 Evaluation Criteria

We scored each platform on eight dimensions, each on a 5-point scale with defined rubrics.

### 1. Recall Quality (Weight: High)

Measures how accurately the platform retrieves relevant memories when queried. A platform that retrieves everything scores low on precision; one that retrieves nothing relevant scores low on recall.

Evaluation approach: designed synthetic memory stores with known content, queried against them with ambiguous and precise queries, measured precision-at-K and recall-at-K.

### 2. Memory Tier Depth (Weight: High)

Measures whether the platform supports distinct memory types — episodic, semantic, procedural, declarative, working — or treats all memory as a flat store.

Why it matters: different memory types have different retrieval patterns, decay rates, and appropriate use cases. A platform that flattens all memory into a single tier loses the ability to differentiate between "this happened last session" and "this is always true."

### 3. Governed Write Paths (Weight: High)

Measures per-agent access control and operator review capabilities. Specifically: can you grant different write permissions to different agents? Can writes to high-trust tiers require approval before committing?

### 4. Orchestration Integration (Weight: Medium-High)

Measures how well the platform integrates with workflow orchestration — specifically, whether memory context is available to orchestrated agents and whether checkpoint/rollback is supported at the memory level.

### 5. Audit Trail (Weight: Medium-High)

Measures whether every memory mutation is logged with agent identity, timestamp, and source. Full audit lineage scores 5; no logging scores 1.

### 6. Deployment Flexibility (Weight: Medium)

Measures self-hosting capability, data residency controls, and on-premises deployment support. Cloud-only platforms score lower because enterprise deployments frequently cannot accept external data egress.

### 7. Observability (Weight: Medium)

Measures operator visibility: can operators see memory health metrics, active agent counts, write/read rates, and anomaly alerts? A NOC-style console scores higher than CLI-only tooling.

### 8. Framework Breadth (Weight: Lower)

Measures integration support across agent frameworks: Claude Code (MCP), LangGraph, CrewAI, AutoGen, Google ADK, REST-compatible agents. More integrations = higher score.

## Scoring Methodology

Each criterion is scored 1–5 by two independent reviewers based on public documentation, source code review (where available), and hands-on testing. Scores are averaged and weighted by importance.

The weighting reflects what enterprise and developer teams consistently tell us they care most about: recall quality, governance, and orchestration integration are the table-stakes capabilities. Deployment flexibility matters significantly for regulated environments. Framework breadth matters less because most teams use one or two frameworks.

Scores are based on publicly available information and hands-on evaluation as of the benchmark date. They reflect our interpretation and may differ from vendor self-assessments.

## The Platforms Evaluated

We evaluated platforms that either specifically target agentic memory or are commonly used as memory layers for agent workflows: MemroOS, Letta, Mem0, Zep, Midbrain, gBrain, EverMemos, AXME, AgenticMemory, Tytan, and WorldFlow.

Mem0 is included as a memory-engine baseline, with the conflict called out explicitly because MemroOS can use Mem0 as one component of its stack. Midbrain is included as a research-led retrieval and continual-learning competitor; its SmartSearch paper metrics are not treated as the same thing as MemroOS's architecture/governance score.

## Key Findings

**MemroOS scored 84.06/100** — the highest among evaluated platforms. Strongest on governed write paths, audit trail, orchestration integration, observability, and operator proof surfaces. Improvement areas: external retrieval benchmarks and comparative recall harnesses should be added alongside the existing operational evals.

**Letta scored 70.58/100.** Strong on stateful agent persistence and memory-first agent architecture. Weaker on governed enterprise memory as an operator control plane.

**Mem0 scored 70.44/100.** Strong managed memory baseline and relevant to the ecosystem; less differentiated on orchestration and governance as a complete operator control plane.

**Zep scored 68.64/100.** Strong on temporal knowledge graph memory and fact invalidation. Weaker on orchestration and enterprise governance as the central product surface.

**Midbrain scored 65.21/100.** Strongest on retrieval research and continual-learning direction through SmartSearch. Weaker on visible deployment controls, audit lineage, dispatch, and operator governance.

**Remaining platforms** scored below Midbrain, primarily limited by narrow memory scope, cloud-only deployment, absent governance features, or limited public proof.

The pattern across all evaluated platforms: recall quality and basic storage are table stakes. The differentiators are governance, orchestration integration, and deployment flexibility — exactly the capabilities that matter most when moving from prototype to production.

## How to Use This Benchmark

The benchmark is a starting point, not a verdict. Your specific requirements may weight criteria differently:

- If data residency is non-negotiable, deployment flexibility weight should be higher
- If you're building a consumer product, governance matters less than recall quality
- If you're deploying a single specialized agent, framework breadth is less important than if you have a heterogeneous agent fleet

Use the criteria as a checklist for your evaluation. The benchmark scores tell you where each platform is strong and where it isn't — your job is to decide which dimensions matter most for your deployment.

The full benchmark data, including per-criterion scores, is available via the MemroOS platform evaluation framework.
