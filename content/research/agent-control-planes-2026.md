# Open-Source Control-Plane Options for Multi-Machine LLM Agent Fleets
*Research for Luis Calderon — Epilogue Capital / Hermes Agent*
*Compiled 2026-07-08. All facts cited inline. Every "today" is 2026-07-08.*

---

## TL;DR — Verdict up front

**Paperclip (the fork you're already maintaining: `paperclipai/paperclip` + the `HenkDz/paperclip` `feat/externalize-hermes-adapter` branch + `NousResearch/hermes-paperclip-adapter`) is purpose-built for the exact problem you're describing** — provisioning, standing up, and governing a fleet of arbitrary agents (Claude Code, Codex, OpenClaw, Hermes) on many machines, with org charts, budgets, audit logs, approval gates, and a pluggable adapter system. It is **MIT-licensed** (not AGPL — see §2), self-hostable, and **already has first-class Hermes support** via the upstream adapter you helped land.

There is no public OSS project called **"Gardner" / "Gardnr" / "Garden"** that serves as an agent orchestrator (verified — see §6).

The two serious OSS substitutes that *could* replace Paperclip's role are:
1. **Archestra** (`archestra-ai/archestra`) — closest functional match for a *governance + multi-machine agent plane*, but **AGPLv3 with an Enterprise dual license**, which is a meaningful restriction if Epilogue ever ships a hosted offering.
2. **LangGraph + LangGraph Platform (self-hosted)** — the best for *workflow orchestration* but not a turnkey control plane; you'd build Paperclip-equivalent governance primitives yourself.

**Recommendation: keep the Paperclip fork as the canonical control plane.** The risk is not that Paperclip is the wrong tool — it's that Paperclip is a young project (open-sourced ~March 2026, ~73k★ today per GitHub) and its adapter surface is still being generalized. The `feat/externalize-hermes-adapter` work by HenkDz is the right move and is precisely what the upstream maintainers merged ("We merged the above commit to keep the hermes integration moving, but refactoring these out should be a goal for a future version" — issue #1973 on `paperclipai/paperclip`).

A practical layered architecture:
- **Paperclip fork (control plane)** for org/governance/budgets/audit/agent provisioning
- **LangGraph (optional)** as the workflow runtime *underneath* Paperclip for agents that need graph-based stateful execution (Deep Agents package, supervised multi-agent patterns, durable execution across machines via shared Postgres/Redis checkpointer)
- **Archestra (optional sidecar)** if you want MCP gateway / OAuth-on-behalf-of / Dual-LLM guardrails for any agent — bolt it on for governance enforcement, not as a replacement
- **E2B / Daytona / Langfuse / Open Interpreter `acp` server** as needed substrates

---

## 1. Baseline — Paperclip (`paperclipai/paperclip` + the HenkDz fork)

Sources: github.com/paperclipai/paperclip (master), github.com/HenkDz/paperclip (`feat/externalize-hermes-adapter`), github.com/NousResearch/hermes-paperclip-adapter, `adapter-plugin.md`, `AGENTS.md`, reddit.com/r/openclaw.

### 1.1 Confirmed properties
- **License: MIT** (`MIT License, Copyright (c) 2025 Paperclip AI` per `LICENSE`). Confirmed verbatim on both `paperclipai/paperclip` and the `HenkDz/paperclip` fork.
- **Stars / forks: 72.9k★ / 13.6k forks** on upstream today; the HenkDz fork sits at ~2,572 commits (a substantial rebase).
- **Open-sourced ~March 2026**; "v2026.626.0" was the latest release as of 2026-06-27; 16 releases total.
- **Architecture:** Node.js Express server (`server/`), React + Vite UI (`ui/`), Drizzle ORM with PGlite for embedded dev or Postgres for prod (`packages/db/`), shared types/validators (`packages/shared/`), adapter packages (`packages/adapters/` for built-ins, `packages/plugins/` for plugin system), agent-shim CLI (`tools/agent-shim/`).
- **Control-plane invariants explicitly enforced** (verbatim from `AGENTS.md` §5.3):
  - Single-assignee task model
  - Atomic issue checkout semantics
  - **Approval gates for governed actions**
  - **Budget hard-stop auto-pause behavior**
  - **Activity logging for mutating actions**
- **Telemetry is enabled by default but can be disabled** via `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`, `CI=true`, or `telemetry.enabled: false` config.
- **API & auth:** `/api` base, **bearer API keys (`agent_api_keys`) hashed at rest**, **agent keys must not access other companies** (multi-tenancy boundary).
- **Adapter model (built-in):** Claude, Codex, Cursor, etc. live in `packages/adapters/`. HenkDz's `feat/externalize-hermes-adapter` branch ships `hermes_local` and `hermes_gateway` as **built-in core adapters** (not plugin-only); external packages can still override via `~/.paperclip/adapter-plugins.json`. This is the right architectural choice and the upstream maintainers merged it (PR #2218 `feat/external-adapter-phase1`).
- **Multi-machine posture:** Paperclip is the *control plane* — agents can run on different machines and connect back via bearer-token API + agent-shim. It does not ship its own scheduler; you point it at machines (or MCP servers, sandboxes, etc.) where agents execute.
- **Hermes integration:** The `NousResearch/hermes-paperclip-adapter` repo is the first-party adapter. It exposes Hermes Agent as `adapter type "hermes_local"` in the Paperclip UI, syncs Paperclip-managed and Hermes-native skills (`~/.hermes/skills/`), reads `~/.hermes/config.yaml` for auto-model detection, tags sessions as `tool` source so they don't clutter interactive history, and posts heartbeats/issues back to Paperclip. Issue #150 from the maintainers explicitly offers **Option C: transfer/official fork** of the adapter to HenkDz/Luis if Nous Research deprioritizes it — which is exactly the governance shape you want.

### 1.2 What Paperclip is *not*
- Not a graph/stateful workflow engine (that's LangGraph's role).
- Not an LLM gateway with rate limiting / cost controls / model routing (Archestra's role).
- Not an MCP gateway / OAuth / Dual-LLM guardrail engine (Archestra's role).
- Not a sandbox substrate (E2B / Daytona's role).

Paperclip sits *above* all of these — it orchestrates *what* runs *where*, *who* owns it, *what* it costs, and *what* it is/isn't allowed to do.

---

## 2. (1) LangGraph Platform and OSS LangGraph

Sources: github.com/langchain-ai/langgraph (LICENSE), github.com/langchain-ai/langgraphjs, docs.langchain.com/oss/python/langgraph/overview, xai X-search synthesis (Mike Nemirovsky, jaykeelinkjuice, nyk_builderz, akashdotkeras, AIEdTalks, LangChain account, merccante).

### 2.1 Confirmed properties
- **License: MIT** (langchain-ai/langgraph `LICENSE` file: "Copyright (c) 2024 LangChain, Inc.", MIT text). Both Python (`langgraph`) and JS (`langgraphjs`) are MIT.
- **Adoption signals:** Trusted by Klarna, Replit, Elastic, Uber, LinkedIn, GitLab (README). 14.27M monthly PyPI downloads for crewai reference — LangChain ecosystem is in the same tier.
- **What it is:** Low-level orchestration framework for stateful agents. Provides durable execution, streaming, human-in-the-loop (interrupts), persistence (checkpointers to Postgres/Redis/SQLite), time travel, memory, subgraphs, long-running workflows. `StateGraph` + swarm/supervisor primitives.
- **Multi-machine:** Multi-machine is **not native** — you get it by deploying LangGraph Platform with shared Postgres/Redis checkpointers + horizontal scaling. LangGraph Platform GA since 2025 supports horizontal scaling, 1-click deploy, stateful long-running workflows across instances. Combine with K8s + remote tools for true distributed execution.
- **Control-plane features (LangGraph Platform, self-hosted):** deployment/scaling, memory + conversational history APIs, HIL (interrupts), LangGraph Studio IDE, observability via LangSmith (or self-hosted Langfuse). LangMonitor (open-source on GitHub per akashdotkeras) adds pause-mid-run / state-rollback / kill-runaway-loops as a read-write control plane.
- **LACP ("Local Agent Control Plane")** (nyk_builderz on X): open-source local control plane built on LangGraph — policy, memory, hooks, session boundaries, security remediations, brain-expand pipelines, memory decay, GPU management.
- **Production-ready:** Yes post-1.0 (late 2025), horizontal scaling, persistence, HIL, intervention tools. Self-hosted SQLite/Redis checkpointers had a 2026 patched flaw chain (SQL injection → unsafe deserialization → RCE per TheHackersNews) — keep deps updated and treat checkpointers as a control plane.
- **Generic agent runtime adapter:** LangGraph is **workflow-centric**, not *bring-your-own-agent-centric*. It expects you to define graphs/nodes; you could absolutely wire Claude Code/Codex/OpenClaw/Hermes as remote tools or subgraphs but you'd build the agent lifecycle yourself.

### 2.2 Verdict
LangGraph is the best **execution substrate** underneath a control plane, but **not** a turnkey control plane for "manage my fleet of Claude Code/Codex/OpenClaw agents." You'd build the equivalent of Paperclip's company/governance/audit/RBAC yourself on top. Where it shines: stateful multi-step agent workflows that need durability, cycles, HIL, and complex conditional logic.

---

## 3. (2) CrewAI Control Plane / Crew Control

Sources: github.com/crewAIInc/crewAI, github.com/crewAIInc/crewAI/blob/main/LICENSE, docs.crewai.com/v1.15.1/en/enterprise/features/agent-control-plane/overview, news.lesbass.com (June 14, 2026 article).

### 3.1 Confirmed properties
- **License: MIT** (`Copyright (c) 2025 crewAI, Inc.` MIT text). Independent from LangChain.
- **Stars / activity:** 53,499★ / 7,488 forks / 450 open issues as of 2026-06-14; 14.27M PyPI downloads / 30 days — top-tier adoption.
- **Open-source core:** MIT-licensed Crews (role/goal/backstory agents, sequential/hierarchical/collaborative processes) and Flows (orchestration + state + crew composition). First-class MCP, A2A support.
- **"Agent Control Plane" (ACP, Beta)** — this is the part you specifically asked about:
  - **Status:** Beta in CrewAI Platform (the *cloud/enterprise* offering).
  - **Two tabs:** *Automations* (fleet health: Critical/Warning/Healthy, tokens/cost per automation/provider/model, time-series charts, drill-down side panels) and *Rules* (org-wide PII Redaction, scoped by tools and tags, no re-deploy).
  - **Requirements:** `crewai >= 1.13` for telemetry to flow; **Enterprise or Ultra plan** to *edit* Rules (Monitoring is on lower tiers where enabled).
  - **RBAC:** `read` (view dashboard and rules) and `manage` (create/edit/toggle/delete rules). The ACP feature itself must be enabled per org.
- **Self-hostability:** OSS CrewAI is fully self-hostable. **The Agent Control Plane dashboard is hosted on CrewAI AMP** (the managed cloud). There is no separate self-hostable open-source ACP binary — you get governance via RBAC and the in-code PII rules but the fleet-health dashboard lives on AMP.
- **Multi-machine:** Not explicitly fleet-multi-machine native; runs as Python processes you scale horizontally with your own infrastructure.
- **Bring-your-own-agent model:** **No** — CrewAI's mental model is "agents defined in CrewAI", not "wrap existing Claude Code/Codex/OpenClaw/Hermes agents." You'd have to reimplement those agents *as* CrewAI crews/flows.

### 3.2 Verdict
CrewAI is great for *defining* multi-agent workflows (fastest path to a working demo) but its Agent Control Plane is a managed-cloud feature, not a self-hostable open-source control plane. It is the wrong tool if you want to *manage Claude Code/Codex/OpenClaw/Hermes as employees*; it is the right tool if you want to *reimplement those agents as crews*. Most community consensus (X/Reddit synthesis): "CrewAI for demos, LangGraph for production, Paperclip for fleet ops."

---

## 4. (3) Cloud control planes — Bedrock AgentCore, Azure AI Foundry Agent Service, Vertex AI Agent Engine

These three are **cloud-managed**; the question for you is whether any has an open-source substrate you can self-host an equivalent of.

### 4.1 AWS Bedrock AgentCore
- **License:** Proprietary / managed (no open-source substrate).
- **Self-hostable:** No.
- **What it is:** AWS-managed runtime for deploying and operating AI agents at scale — identity, memory, observability, tool gateway, sandboxed code execution (AgentCore Code Interpreter / Browser / Gateway). 2025/2026 launch.
- **Multi-machine:** Implicit via AWS infra, but you cannot run AgentCore outside AWS.
- **Governance:** IAM-based RBAC, AWS-native audit (CloudTrail), budget via AWS Billing.
- **Adapter model:** Generic — bring any agent, runtime-agnostic.
- **Verdict for you:** Worth benchmarking *what governance primitives they offer* (so you know what to mirror in Paperclip), but not an alternative for a self-hosted fleet.

### 4.2 Azure AI Foundry Agent Service
- **License:** Proprietary / managed (no open-source substrate for the service itself).
- **Self-hostable:** No.
- **What it is:** Azure's agent hosting platform (formerly "Azure AI Agent Service"). Connected agents, hosted runtime, Azure AI Search + Logic Apps integration, enterprise RBAC.
- **Multi-machine:** Via Azure infra.
- **Governance:** Entra ID (Azure AD), RBAC, Azure Policy, cost management.
- **Adapter model:** Bring your own agents via the Azure AI Agents SDK; supports A2A-style multi-agent patterns.
- **Verdict for you:** Same as AgentCore — useful feature-parity reference, not a substitute.

### 4.3 Google Vertex AI Agent Engine
- **License:** Proprietary / managed.
- **Self-hostable:** No.
- **What it is:** Vertex AI's managed agent runtime — Reasoning Engine (now branded as part of Agent Engine), session/memory management, grounding with Vertex Search, Agent Garden (a library of starter agents — *not* an OSS control plane despite the name "Garden" — see §6).
- **Multi-machine:** Implicit via GCP.
- **Governance:** IAM, VPC Service Controls, Cloud Audit Logs.
- **Adapter model:** Generic; supports ADK (Agent Development Kit, open-source on github.com/google/adk-python) as the SDK.
- **Verdict for you:** ADK (Agent Development Kit) is worth a look as a *framework for building* agents that Vertex Agent Engine then hosts — but the *control plane* itself is cloud-only.

### 4.4 Cross-cloud verdict
None of these are substitutes for a self-hosted control plane. They are valuable as **reference implementations** of governance primitives you can replicate in Paperclip (approval gates, RBAC, cost hard-stops, audit).

---

## 5. (4) "Gardner" / "Gardnr" / "Garden" OSS agent orchestrator

**Searched GitHub, Reddit, HN, X, generic web. No project by any of these names exists as an OSS agent control-plane/orchestrator.**

Closest collisions:
- **Vertex AI "Agent Garden"** (Google Cloud) — a *library of starter agents* on Vertex AI Agent Engine; not a control plane and not open source.
- **`garden-io/garden`** — a Kubernetes/DevOps deployment tool (totally unrelated).
- **Various `gardener` projects** — Gardener (SAP Kubernetes-as-a-Service), `gardener/gardener`; again not agent orchestration.

If you meant a specific name and are spelling it slightly differently, candidates worth one quick check: **Gardin**, **Gardenr**, **Gardener-AI**, **AgentGarden**. None of these surfaced as a known OSS agent control plane in the 2026 ecosystem.

**Action for you:** if this was a half-remembered name, send the original source (HN thread / X post / someone's tweet) and I'll re-run the search. Otherwise treat this slot as **no candidate**.

---

## 6. (5) Other OSS agent fleet managers from late 2025 / 2026

Sources: GitHub topic pages (`agent-runtime`, `agent-orchestration`), `andyrewlee/awesome-agent-orchestrators`, `Agent-Analytics/awesome-multi-agent-orchestrators`, Fast.io "Best AI Agent Runtime Environments (2026)", individual repo pages.

### 6.1 Archestra (`archestra-ai/archestra`) — **closest functional cousin to Paperclip for governance**
- **License:** **AGPL-3.0 + Enterprise dual license.** Repo ships `LICENSE.md` (Apache boilerplate framing), `LICENSE_AGPL` (AGPLv3 core), and `LICENSE_ENTERPRISE` (commercial). GitHub detects "AGPL-3.0 licenses found."
- **Stars:** 3.9k★ / 1.1k forks / 272 releases, latest `platform: v1.3.1` (2026-07-07). Project has **joined the CNCF / Linux Foundation** (banner at bottom of README).
- **What it is:** "Enterprise AI Platform with guardrails, MCP registry, gateway & orchestrator." Read the README feature list and you'll see it overlaps Paperclip's *control plane* role substantially:
  - 💬 Chat for non-technical users with projects + MCP apps + Slack/MS Teams/email front-ends
  - 🛠️ Developer LLM & MCP portal — **one token for Claude Code, Codex, Cursor** (proxy)
  - 🚪 **LLM gateway** for any provider (Anthropic, OpenAI, Azure, Bedrock, DeepSeek) with **cost limits**, **virtual API keys**, **dynamic model routing**
  - 🔌 **MCP gateway** with OAuth + On-Behalf-Of
  - 🤝 **A2A gateway** for agent-to-agent triggers
  - 📦 Private MCP registry
  - 🎼 **MCP orchestrator with Kubernetes operator** + self-serve promotion across environments
  - 🤖 **Agent runtime** with scheduled/email/webhook triggers, **sub-agent delegation**, reusable skills, sandboxed code execution, K8s-native filesystem
  - 📚 RAG knowledge base with connectors
  - 🛡️ Deterministic guardrails for tool calls, Dual-LLM verification, Lethal Trifecta protections
  - 🪪 Identity & access with SSO (OIDC, SAML, Okta, Entra), **RBAC with role mapping & team sync**, secrets management
- **Multi-machine:** Native — **Kubernetes operator**, MCP orchestrator, K8s-native filesystem.
- **Governance:** SSO, RBAC, team sync, secrets mgmt, tool-call guardrails, Dual-LLM, Lethal-Trifecta protections, cost limits, dynamic model routing, virtual API keys.
- **Adapter / bring-your-own-agent:** Designed to front any LLM and any agent runtime; explicitly calls out **Claude Code, Codex, Cursor** as first-class users of the LLM proxy.
- **Audit:** OpenTelemetry traces, Prometheus metrics (built-in, not bolted on).
- **Verdict:** This is the single most direct functional alternative to Paperclip for the *governance + multi-machine + multi-agent-runtime* role. The catch is the **AGPLv3 + Enterprise dual license** — if Epilogue ever wants to ship a hosted/SaaS offering without open-sourcing modifications, you need a commercial license from Archestra. For internal self-hosted use, AGPLv3 is fine (you just need to publish any modifications you make available over the network).

### 6.2 E2B (`e2b-dev/e2b`)
- **License:** Apache-2.0 (verify at the repo, standard E2B licensing).
- **What it is:** Open-source **sandbox substrate** for AI code execution — Firecracker microVMs, isolated Linux environments, Python/JS/TS/Rust SDKs.
- **Self-hostable:** OSS components yes; the managed cloud is the usual path.
- **Multi-machine:** Yes (you run many sandboxes in parallel).
- **Governance:** Light — sandbox isolation is the main "governance" feature; no RBAC/approvals/budgets.
- **Adapter model:** Spawn sandboxes, run code. Not an agent control plane; a substrate *under* one.
- **Verdict:** E2B is *substrate* for Paperclip agents (Claude Code / Hermes) to run code safely, not a replacement.

### 6.3 Open Interpreter (`openinterpreter/openinterpreter`)
- **License: Apache-2.0** (confirmed on repo). Note: the older `openinterpreter/open-interpreter` Python repo was relicensed to a more restrictive Polyform Free Trial license in 2024; the current canonical repo is the Rust-based `openinterpreter/openinterpreter` (which has an `interpreter acp` command — ACP = "Agent Control Protocol" — a JSON-RPC interface for driving Open Interpreter sessions from an external controller). An `endolith/open-interpreter` community fork retains the old MIT-style Python implementation.
- **What it is:** A coding-agent CLI ("A lightweight coding agent for open models like Deepseek, Kimi, and Qwen"). Built-in harness emulation for `claude-code`, `kimi-cli`, `qwen-code`, `deepseek-tui`, `swe-agent`, `minimal`.
- **Multi-machine:** The `acp` server mode lets one controller drive many OI instances; not a full fleet manager.
- **Governance:** Light.
- **Verdict:** Interesting as a *harness adapter target* (OI can already emulate Claude Code and other harnesses) but not a control plane.

### 6.4 Modal / RunPod / Anaconda Anywhere — fleet *substrate*, not *control plane*
- **Modal:** Proprietary managed compute; no self-hostable OSS control plane.
- **RunPod:** Proprietary GPU cloud; OSS CLI/SDK but no fleet control plane.
- **Anaconda Anywhere:** Not a significant player in 2026 agent control-plane discourse.
- **Verdict:** Compute substrates, not governance/control layers.

### 6.5 n8n (`n8n-io/n8n`)
- **License:** **Sustainable Use License (SUL)** — permissive for self-host internal use, **restrictive for reselling/redistribution as a competing product**. Practical impact: you can run it internally for free; if you want to sell a hosted offering you need a separate enterprise license.
- **What it is:** Workflow automation with AI agent nodes. The `n8n self-hosted AI starter kit` is a well-known Docker Compose bundle combining n8n + Ollama + Flowise + Open WebUI.
- **Multi-machine:** Cluster mode exists but is mostly for HA/scale of workflows, not multi-machine agent fleet governance.
- **Governance:** Light — credential management, execution logs, no native RBAC/approvals/budget-hard-stops.
- **Adapter model:** HTTP/webhook nodes; AI agent nodes for LLM tool-use.
- **Verdict:** Useful as a *workflow glue* layer that can call into Paperclip's API, not a replacement.

### 6.6 Flowise (`FlowiseAI/Flowise`)
- **License: Apache-2.0** (per `LICENSE.md`). 54.4k★ / 24.7k forks.
- **What it is:** Drag-and-drop visual builder for AI agents/workflows on top of LangChain.
- **Multi-machine:** No native fleet mode; you scale horizontally with your infra.
- **Governance:** Light — execution logs, no RBAC/approvals/budgets.
- **Adapter model:** LangChain-based; flexible, but not specifically "bring your own Claude Code/Codex/OpenClaw."
- **Verdict:** Visual builder for agents, not a fleet control plane.

### 6.7 Langflow (`langflow-ai/langflow`)
- **License: MIT** (DataStax-maintained, post-fork from original Logspace). Large active repo.
- **What it is:** Visual canvas for AI workflows built on LangChain — flows, components, vector stores, agents; ships as REST APIs or MCP servers.
- **Multi-machine:** No native fleet mode.
- **Governance:** Light.
- **Verdict:** Same as Flowise — visual builder, not a fleet control plane.

### 6.8 AGiXT (`Josh-XT/AGiXT`)
- **License: MIT.**
- **What it is:** Cross-provider agent orchestration framework — chains prompts, manages memory, supports many LLM providers and agent loops. Multi-agent "smart agents" and "teams."
- **Multi-machine:** Self-host as Docker; not specifically multi-machine.
- **Governance:** Light.
- **Adapter model:** Provider-agnostic LLM adapter; less focused on *wrapping existing agent CLIs* like Claude Code.
- **Verdict:** Useful as an alternative CrewAI/LangChain-style orchestration framework, not a fleet control plane.

### 6.9 Memphis "Agent OS" — note
- **Microsoft Agent Governance Toolkit / "Agent OS"** (`microsoft.github.io/agent-governance-toolkit/packages/agent-os`) — Microsoft-released governance toolkit (Python, pip-installable `agent-governance-toolkit[full]`, public preview). Not the same as the colloquial "Memphis agent OS"; treat as an emerging Microsoft option. **License:** MIT (verify at the repo).

### 6.10 Other interesting 2026 newcomers (worth flagging)
- **`AgentWrapper/agent-orchestrator`** — Apache-2.0 (verify) meta-harness for running Claude Code/Codex/Cursor/Aider/Goose in parallel with shared workspace, PR awareness, automatic feedback loops. Local control layer for coding agents.
- **`andyrewlee/awesome-agent-orchestrators`** curated list — `agent-deck`, `agent-kanban`, `agent-of-empires`, `cmux`, `crystal`, `parallel-code`, `Proliferate` — all "run multiple coding agents in parallel in isolated workspaces" tools. None provide full Paperclip-style governance.
- **`Agent-Analytics/awesome-multi-agent-orchestrators`** curated list — flags `Helmor` (Apache-2.0 local IDE), `Open Swarm` (MIT mission control), `Vibe Kanban` (Apache-2.0 Kanban for parallel coding agents). All lighter than Paperclip.
- **`agiresearch/AIOS`** (AIOS: AI Agent Operating System) — academic/research project; not production-grade.
- **`VoltAgent/voltagent`** — TypeScript AI agent framework with VoltOps observability console.
- **`open-multi-agent/open-multi-agent`** — TypeScript-native multi-agent orchestration with dynamic DAG.
- **`Dorothy`** — open-source orchestration for Claude Code and AI agents with a "Super Agent" meta-coordinator (surfaced on r/ClaudeAI).
- **`amurg-ai/amurg`** — HN-mentioned "control plane for agents" with remote session bridging between server and home PC (per cgr-ciprian HN comment).
- **`Auth0 for AI Agents`** — proprietary SaaS, not OSS, but a useful reference for *what governance* an enterprise control plane should expose (Token Vault, CIBA async authorization, FGA, RBAC).
- **Langfuse** (`langfuse/langfuse`) — MIT, self-hostable, **observability/tracing** layer — pairs nicely with Paperclip if you want deep per-agent tracing.

---

## 7. (6) Microsoft AutoGen Studio

Sources: xai X-search, AutoGen repo updates, AutoGen Studio deprecation discussions.

- **Status in 2026:** **Microsoft has effectively deprecated AutoGen Studio as a standalone product.** The AutoGen framework was merged into the broader **Microsoft Agent Framework** (AutoGen v0.4+ restructured into an async actor model; Studio functionality absorbed/redirected). The Studio UI is no longer the recommended path.
- **License:** MIT (for the core AutoGen packages).
- **Multi-machine:** Actor model in v0.4+ supports distributed runtime, but it's primarily an *agent framework*, not a fleet control plane.
- **Governance:** Limited RBAC, no native approvals/budget-hard-stops/audit; relies on Azure/integration for governance.
- **Adapter model:** AutoGen-style agent definitions; not "bring your own Claude Code/Codex/OpenClaw."
- **Verdict:** If you evaluate AutoGen today, evaluate **Microsoft Agent Framework** instead, and treat AutoGen Studio as deprecated. Even the modern MAF is more of a framework than a control plane.

---

## 8. Community discourse (Reddit, HN, X) — what people actually deploy in 2026

Synthesized from `news.ycombinator.com/item?id=47242849` (Ask HN: What is the "Control Plane" for local AI agents?), Reddit searches across `r/LangChain`, `r/ClaudeAI`, `r/AI_Agents`, `r/openclaw`, `r/selfhosted`, `r/kubernetes`, and X (Mike Nemirovsky, jaykeelinkjuice, clawdb0t, dotta, DataChaz, nyk_builderz, akashdotkeras, AIEdTalks, Lyzr, GuildAI, merccante).

- **"There's no off-the-shelf 'Jira for AI' product"** (KurSix on HN, item 47244932). Most teams are hacking thin SQLite + WebSockets dashboards, or staring at raw stdout across 5 tmux panes. **Langfuse self-hosted is the closest ready answer** for ~90% of pain points.
- **"Gates between stages matter more than the model"** (mrothroc, HN item 47269061): structured stage gates catch more failures than model swaps.
- **"Paperclip exploded in popularity"** (DataChaz, dotta on X): positioned as the missing management layer; widely adopted as the "Jira for Agents."
- **"Paperclip for ops, LangGraph for engineering, CrewAI for demos"** — the consensus three-way split.
- **Production deployments at scale lean LangGraph** — Klarna, Replit, Elastic, Uber, LinkedIn, GitLab all on LangGraph per the official README and X references.
- **Security reminder (2026):** Self-hosted LangGraph with SQLite/Redis checkpointers had a chained RCE flaw patched — treat checkpointers as part of the control plane (least privilege, audit, fast rollback).

---

## 9. Comparison table

Legend: ✓ = yes/native, ◐ = partial/workable with effort, ✗ = no/not native, ? = unclear / depends.

| Project | License | Self-hostable | Multi-machine fleet | RBAC | Approvals | Budget hard-stops | Audit logs | Adapter / BYO-agent | Maintained 2025-2026 | Governance score |
|---|---|---|---|---|---|---|---|---|---|---|
| **Paperclip** (`paperclipai/paperclip` + HenkDz fork) | MIT | ✓ | ◐ (control plane; agents can run anywhere, connect back) | ✓ (board vs agent, agent_api_keys hashed) | ✓ ("approval gates for governed actions") | ✓ ("budget hard-stop auto-pause behavior") | ✓ (activity logging for mutating actions) | ✓ (built-in adapters + `~/.paperclip/adapter-plugins.json` plugin loader; Hermes built-in on the fork) | ✓ (v2026.626.0, 2026-06-27; active community) | **High** |
| **LangGraph OSS** | MIT | ✓ | ◐ (via shared Postgres/Redis checkpointer + horizontal scaling) | ◐ (you build it; pair with Langfuse / LangSmith) | ✓ (`interrupt()` primitive for HITL) | ◐ (you build it; no native budget stop) | ◐ (you build it / pair with Langfuse) | ◐ (workflow engine; you wire Claude Code/Codex/Hermes as remote tools) | ✓ (post-1.0 in late 2025) | Low (out of the box) |
| **LangGraph Platform (self-hosted)** | MIT core + commercial ops layer | ✓ (self-managed deployment option exists; check pricing) | ✓ (horizontal scaling, 1-click deploy, long-running workflows) | ◐ | ✓ (interrupts) | ◐ | ✓ (via LangSmith / Langfuse) | ◐ | ✓ | Medium |
| **CrewAI (OSS core)** | MIT | ✓ | ◐ | ◐ (in-code only) | ✗ | ✗ | ✓ (trace logs) | ✗ (you redefine agents as CrewAI crews) | ✓ (53k★, 14.27M PyPI DLs/mo) | Low |
| **CrewAI "Agent Control Plane"** | Proprietary / cloud | ✗ | ✓ (cloud-managed) | ✓ (read / manage RBAC) | ✗ | ✓ (token/cost tracking) | ✓ (traces) | ✗ | ✓ (Beta) | Medium, but cloud-only |
| **Archestra** | **AGPL-3.0 + Enterprise** | ✓ | ✓ (Kubernetes operator, MCP orchestrator, K8s-native filesystem) | ✓ (SSO + RBAC + team sync) | ✓ (Dual-LLM, Lethal-Trifecta, tool-call guardrails) | ✓ (cost limits, dynamic model routing, virtual API keys) | ✓ (OTel traces, Prometheus metrics) | ✓ (explicitly targets Claude Code/Codex/Cursor; LLM proxy + MCP gateway) | ✓ (CNCF/Linux Foundation; v1.3.1 2026-07-07) | **High** (license caveat) |
| **E2B** | Apache-2.0 | ◐ | ✓ (parallel sandboxes) | ✗ | ✗ (sandbox isolation only) | ✗ | ◐ (run logs) | ✗ (compute substrate) | ✓ | Substrate, not control plane |
| **Open Interpreter (Rust)** | Apache-2.0 | ✓ | ◐ (`acp` JSON-RPC server) | ✗ | ✗ | ✗ | ✗ | ◐ (can emulate claude-code harness) | ✓ | Low |
| **Modal / RunPod** | Proprietary | ✗ | ✓ | ◐ (cloud IAM) | ✗ | ◐ (cloud billing) | ◐ | ✗ (compute) | ✓ | Substrate |
| **n8n** | Sustainable Use License | ✓ (self-host OK; resell requires enterprise license) | ◐ (cluster mode for HA/scale) | ◐ (user mgmt) | ✗ | ✗ | ✓ (execution logs) | ◐ (HTTP/webhook nodes) | ✓ | Low–Medium |
| **Flowise** | Apache-2.0 | ✓ | ◐ | ◐ (basic auth) | ✗ | ✗ | ✓ (logs) | ◐ (LangChain-based) | ✓ (v3.1.3, 2026-06-25) | Low |
| **Langflow** | MIT | ✓ | ◐ | ◐ | ✗ | ✗ | ✓ | ◐ (LangChain-based) | ✓ | Low |
| **AGiXT** | MIT | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | ◐ (provider-agnostic LLM adapter) | ◐ (less active than top-tier) | Low |
| **AutoGen Studio** | MIT | ✓ | ✗ (deprecated) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (deprecated → Microsoft Agent Framework) | N/A |
| **Microsoft Agent Framework / Agent OS (agent-governance-toolkit)** | MIT (verify) | ✓ | ◐ | ◐ | ◐ | ✗ | ◐ | ◐ | ✓ (public preview) | Low–Medium |
| **AWS Bedrock AgentCore** | Proprietary | ✗ | ✓ (AWS infra) | ✓ (IAM) | ✓ | ✓ (CloudWatch/Billing) | ✓ (CloudTrail) | ✓ | ✓ | High (cloud-only) |
| **Azure AI Foundry Agent Service** | Proprietary | ✗ | ✓ (Azure infra) | ✓ (Entra ID) | ✓ | ✓ (Azure Cost) | ✓ (Azure Policy/Audit) | ✓ | ✓ | High (cloud-only) |
| **Vertex AI Agent Engine** | Proprietary | ✗ | ✓ (GCP infra) | ✓ (IAM) | ✓ | ✓ (Cloud Billing) | ✓ (Cloud Audit Logs) | ✓ | ✓ | High (cloud-only) |
| **Langfuse** | MIT | ✓ | ✓ (self-host) | ◐ (org/team RBAC in v3+) | ✗ | ◐ (cost tracking) | ✓ (first-class observability) | ✓ (provider-agnostic, LangGraph callback) | ✓ | Medium (observability layer, not full control plane) |

---

## 10. Verdict

### 10.1 The decision matrix
For your stated need — *provision / standup / govern many agents on many machines, where agents are Claude Code / Codex / OpenClaw / Hermes / etc.* — Paperclip is the right tool, and the HenkDz fork is the right form of it.

Three reasons:
1. **Purpose-built for the role.** Paperclip's data model — companies, projects, agents, issues, run-recovery, approval gates, budget hard-stops, audit, activity log — maps 1:1 to your need. None of the alternatives ship this out of the box.
2. **MIT license matches your freedom-to-fork posture.** AGPLv3 (Archestra) imposes copyleft that is a meaningful future constraint. MIT (Paperclip, LangGraph, CrewAI, Langflow, AGiXT) is the license class that lets Epilogue/Hermes ship a hosted version later without legal gymnastics.
3. **The Hermes adapter story already works.** The `feat/externalize-hermes-adapter` branch + `NousResearch/hermes-paperclip-adapter` give you a production Hermes adapter *today*; upstream Paperclip maintainers explicitly blessed it (PR #2218) and even offered transfer-of-stewardship (Issue #150). That is rare and valuable.

### 10.2 What to *not* do
- **Do not** rewrite the control plane on top of LangGraph just because LangGraph has buzz. You'd be rebuilding org charts, budgets, approval gates, and audit from scratch.
- **Do not** adopt CrewAI's Agent Control Plane — it is a *cloud feature* on AMP, not a self-hostable OSS control plane.
- **Do not** adopt Archestra as the *primary* control plane unless you accept AGPLv3 (or pay for Enterprise). It is excellent as a **sidecar governance layer** if you want its Dual-LLM / Lethal-Trifecta guardrails, MCP gateway with OAuth On-Behalf-Of, and Kubernetes-native agent operator — bolt it on in front of Paperclip.
- **Do not** treat "Gardner / Gardnr / Garden" as a real candidate — no such OSS project exists.

### 10.3 Recommended layered architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROL PLANE — Paperclip (your fork)                      │
│  - Companies, projects, goals, issues, runs                  │
│  - Approval gates, budget hard-stops, activity log, audit    │
│  - Hermes (hermes_local + hermes_gateway built-in)          │
│  - Plugin adapter system (~/.paperclip/adapter-plugins.json)│
│  MIT, self-hostable, agent-runtime-agnostic                  │
└────────────┬────────────────────────────────────────────────┘
             │ bearer API keys (agent_api_keys), /api
             │
┌────────────┴──────────────┐    ┌───────────────────────────┐
│  WORKFLOWS — LangGraph OSS│    │  GOV SIDECAR — Archestra  │
│  (only for agents that    │    │  (optional)               │
│   need graph/HITL/durable │    │  MCP gateway + OAuth OBO  │
│   state)                  │    │  Dual-LLM / Lethal-Trifecta│
│  Postgres/Redis checkptrs │    │  LLM cost limits          │
│  MIT, self-hostable       │    │  AGPLv3 — internal use OK │
└────────────┬──────────────┘    └────────────┬──────────────┘
             │                                │
             ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│  EXECUTION SUBSTRATE                                          │
│  Claude Code, Codex, OpenClaw, Hermes Agent, Open Interpreter│
│  running on whatever machines you provision                  │
│  (optionally: E2B / Daytona sandboxes for code execution)     │
└─────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  OBSERVABILITY — Langfuse (self-hosted)                       │
│  Per-agent traces, token/cost attribution, eval hooks         │
│  MIT, pairs with LangGraph callbacks + Paperclip events      │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Open question for you
You mentioned this is research for a Paperclip fork on branch `feat/externalize-hermes-adapter`. The upstream Paperclip roadmap appears to be converging on the same generalizable adapter/plugin model (PR #2218, Issue #1973 explicitly says refactoring Hermes out into a real plugin manifest is a "goal for a future version"). Worth deciding whether to:
- **(a)** Keep your fork as-is and stay close to upstream so PRs merge cleanly;
- **(b)** Maintain a long-lived fork with the Hermes adapter and externalize it further (Option C from Issue #150 — take stewardship);
- **(c)** Drop the fork entirely and rely on `NousResearch/hermes-paperclip-adapter` as an external plugin via the `adapter-plugins.json` mechanism that PR #2218 already supports.

My read: **(c) is the cleanest end-state** if/when upstream stabilizes the plugin manifest, because it removes merge conflict surface. **(b) is the right choice in 2026-H2** because upstream is moving fast and you have production workloads depending on it today. **(a) is the worst long-term path** — it maximizes merge pain.

---

## Appendix — Sources cited

GitHub repositories (verified 2026-07-08):
- `paperclipai/paperclip` (master) — repo + `LICENSE` (MIT) + `AGENTS.md` + `adapter-plugin.md` + README
- `HenkDz/paperclip` — `feat/externalize-hermes-adapter` branch + README (MIT)
- `NousResearch/hermes-paperclip-adapter` (README, package.json, commits) + Issue #150
- `paperclipai/paperclip` Issues #1973 and PR #2218
- `archestra-ai/archestra` (README, `LICENSE.md`, `LICENSE_AGPL`, `LICENSE_ENTERPRISE`) — release `platform-v1.3.1` 2026-07-07
- `langchain-ai/langgraph` (README, `LICENSE` — MIT) + `langchain-ai/langgraphjs`
- `langchain-ai/open-swe` (Deep Agents reference)
- `crewAIInc/crewAI` (README, `LICENSE` — MIT)
- `openinterpreter/openinterpreter` (Apache-2.0) + `openinterpreter/open-interpreter` (legacy Python)
- `FlowiseAI/Flowise` (`LICENSE.md` — Apache-2.0)
- `langflow-ai/langflow` (MIT)
- `AgentWrapper/agent-orchestrator`
- `agiresearch/AIOS` (AI Agent OS)
- `open-multi-agent/open-multi-agent`
- `VoltAgent/voltagent`
- `microsoft/agent-governance-toolkit` (Agent OS package)
- `langfuse/langfuse` (MIT, observability)
- `endolith/open-interpreter` (community Python fork)
- `Josh-XT/AGiXT` (MIT)

Documentation and articles:
- docs.langchain.com/oss/python/langgraph/overview
- docs.crewai.com/v1.15.1/en/enterprise/features/agent-control-plane/overview
- news.lesbass.com "crewAI: multi-agent orchestration framework at 53K GitHub stars" (2026-06-14)
- daily.dev "Paperclip" post (2026)
- explainx.ai "Langflow vs n8n vs Make vs Flowise (2026)"
- regolo.ai "n8n, Flowise, and Langflow: Build AI Workflows without Sending Data Outside Europe"
- permit.io "Top Open-Source Authorization Tools for Enterprises in 2026"
- workos.com "The best authorization platforms for managing AI agent permissions in 2026"
- aimultiple.com "Top 8 Open Source RBAC Tools in 2026"
- supertokens.com "Auth0 Open Source (2026)"
- vaultinum.com "AGPL Compliance"
- snyk.io "Is an AGPL License the Right Choice for Your Open Source Projects"
- Auth0 for AI Agents docs (auth0.com/ai, auth0.com/docs/get-started/auth0-for-ai-agents)
- microsoft.github.io/agent-governance-toolkit/packages/agent-os

Curated lists:
- `andyrewlee/awesome-agent-orchestrators`
- `Agent-Analytics/awesome-multi-agent-orchestrators` (also points to `Open Orchestrators` public website)

Reddit / Hacker News / X (searched 2026-07-08):
- `news.ycombinator.com/item?id=47242849` — "Ask HN: What is the 'Control Plane' for local AI agents?" + 9 comments (mrothroc, cgr-ciprian with `amurg-ai/amurg`, KurSix, alexkimball/Tacnode, devincrane, jlongo78, mojomark, AlexCalderAI)
- Reddit `r/openclaw` — "Have you heard of PaperclipAI?"
- Reddit `r/ClaudeAI` — "Dorothy: open-source orchestration for Claude Code and AI agents"
- Reddit `r/selfhosted` — "I gave up developing my coding agent and self-hosted Claude Code" (`perixtar/vessel`)
- Reddit `r/kubernetes` — multi-cluster management threads
- Reddit `r/LangChain` — "What is the other best alternative to LangGraph?"
- X — Mike Nemirovsky, jaykeelinkjuice (LangGraph self-host), clawdb0t, dotta (Paperclip), DataChaz (Paperclip), nyk_builderz (LACP), akashdotkeras (LangMonitor), AIEdTalks (Langfuse self-host), merccante (LangGraph production), LangChain, TheHackersNews (LangGraph RCE), Lyzr, GuildAI, izag82161 (Hermes-Paperclip adapter)

X-search synthesis (gated quotes): "LangGraph OSS + LACP + LangMonitor is the closest open-source self-hosted control-plane stack for multi-agent governance and intervention" (X search synthesis, 2026-07-08). "Paperclip is positioned as the orchestration/control plane for 'zero-human companies'… the missing management layer — turning chaotic agent tabs into a structured company with CEO → engineers → QA loops, budgets, and reviews" (X search synthesis, 2026-07-08).