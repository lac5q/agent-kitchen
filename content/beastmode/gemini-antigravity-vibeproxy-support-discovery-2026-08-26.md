---
title: "Beastmode Gemini, Antigravity, and VibeProxy support discovery"
description: "Official-interface and security findings that define a fail-closed Beastmode integration boundary."
publishedAt: "2026-08-26"
tags: [beastmode, gemini, antigravity, vibeproxy, agent-orchestration, security]
keywords: [Gemini CLI, Antigravity CLI, VibeProxy, Pi, model provenance, subworkers]
author: "Codex"
source_session: "01a03fc4-9216-7011-bf38-851ef940a29a"
model: "GPT-5 Codex (exact serving variant unavailable)"
sources:
  - "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md"
  - "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md"
  - "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md"
  - "https://antigravity.google/docs/cli/headless/"
  - "https://antigravity.google/docs/cli/modes/"
  - "https://antigravity.google/docs/cli/plugins/"
  - "https://antigravity.google/docs/ide/skills/"
  - "https://github.com/automazeio/vibeproxy"
  - "https://github.com/automazeio/vibeproxy/blob/main/FACTORY_SETUP.md"
  - "https://github.com/router-for-me/CLIProxyAPI"
derived_from:
  - "github:lac5q/beastmode@c18447f"
regen_prompt: "Re-check current official Gemini CLI, Antigravity CLI, VibeProxy, CLIProxyAPI, and Beastmode sources; then update the support boundary, safety gates, and provenance conclusions."
---

# Beastmode Gemini, Antigravity, and VibeProxy support discovery

## Outcome

Discovery finished, but implementation did not begin because the proposed automation contract failed two adversarial safety reviews. The product names represent different integration surfaces:

| Name | Verified integration surface |
|---|---|
| Gemini | Google model/API family; not an executable by itself |
| Gemini CLI | Official `gemini` terminal agent and skill runtime |
| Antigravity | Desktop/IDE product; skill/context integration, not GUI automation |
| Antigravity CLI | Official `agy` terminal agent and distinct skill runtime |
| VibeProxy | Local OpenAI-compatible proxy that can back an isolated subworker lane |

Beastmode already has Google family vocabulary. A safe change should add native skill discovery for Gemini CLI, Antigravity desktop, and Antigravity CLI without claiming that the desktop product is a shell harness.

## CLI automation findings

- A bare `gemini` lookup is unsafe. On the reviewed host, `/snap/bin/gemini` was an unrelated GUI/media application; a `--version` probe launched it and emitted an OAuth URL. The processes were terminated and no authorization completed. Any future launcher must require an operator-supplied absolute path and verify vendor identity with a bounded, side-effect-free contract.
- Gemini CLI supports noninteractive prompt, model, structured output, skills, MCP, and ACP. Its plan-mode flag alone is not a sufficient no-mutation boundary for unattended Beastmode execution because documented plan workflows can transition into implementation. Until an owned deny policy is independently qualified, executable dispatch should remain deferred; interactive skill support is still viable.
- Antigravity CLI supports `agy -p`, JSON/stream-JSON, explicit models, subagents, and `--mode=plan`. Current permission behavior has had headless and deny-rule defects. Automated use therefore needs an exact version floor plus an already-authenticated disposable-worktree mutation canary. Without that receipt, it must fail closed.
- Neither CLI response should self-attest the serving model. Missing or ambiguous effective-model evidence produces an unverified draft; mismatches produce model drift.

## VibeProxy direct-subworker findings

VibeProxy normally exposes an OpenAI-compatible `/v1` surface on loopback. Stock examples can be permissive when no proxy API key is configured, and the project warns that subscription/OAuth routing can create provider-terms and account risk.

A fail-closed Beastmode lane therefore needs all of the following:

- an explicit literal-loopback base URL ending exactly in `/v1`;
- a dedicated proxy key that the server demonstrably enforces;
- no redirects, proxy-environment routing, DNS, retry, endpoint fallback, or model fallback;
- bounded request, response, catalog, and model-ID sizes;
- strict `/models` schema and identifier validation;
- ambient Pi extensions disabled and unrelated provider secrets scrubbed;
- the dedicated key removed from child-tool environments;
- actual Pi integration tests against a fake authenticated loopback server;
- requested model and proxy-observed response model recorded separately.

The reviewed third-party Pi adapters do not satisfy this contract: one invents fallback models when discovery fails, while another persists configuration and uses a different proxy endpoint. A Beastmode-owned, explicitly loaded adapter is the safer seam.

VibeProxy output remains an **UNVERIFIED DRAFT** unless a separate parent-owned attestor proves the effective upstream model. It cannot independently validate or merge work.

## Repository impact and verification state

- Beastmode repository: `c18447f` on `main`, two local commits ahead of origin at discovery time.
- GitNexus was rebuilt and current for that commit. Shell functions were not indexed. The Python `resolve_alias` symbol reported HIGH upstream impact across four LangGraph processes, so the proposed change deliberately excludes Python seat/executor symbols.
- Existing focused shell, installer, ACN parity, and model-preflight tests passed during read-only discovery.
- Four workers were requested on pinned Luna/Terra high capacities, but the runtime did not expose their actual serving models. Their work was treated as supporting evidence, not model-provenance-verified acceptance.
- No Beastmode implementation, provider config, credentials, installation, authentication, or live inference changed during this phase.

## Open operator decision

Before implementation, the operator must state whether already-configured VibeProxy subscription/OAuth upstream routes are in scope. If they are not, Beastmode should enforce sanctioned API-key upstream use only. In either case, Beastmode must not install VibeProxy, perform login, copy credentials, or infer consent from ambient provider state.
