---
title: "Codex Astra Model Picker Diagnosis"
description: "Diagnosis of GPT-6 Astra missing from the Codex picker despite an up-to-date CLI."
publishedAt: "2026-09-07"
tags: [codex, openai, gpt-6-astra, troubleshooting]
keywords: [Codex CLI, GPT-6 Astra, model picker, rollout, ChatGPT authentication]
author: "Codex"
source_session: "current-codex-session"
model: "gpt-5.6-sol"
sources:
  - "https://developers.openai.com/api/docs/models/gpt"
  - "https://developers.openai.com/api/docs/models/gpt-6-astra"
  - "https://learn.chatgpt.com/fr-FR/docs/enterprise/workspace-model-availability"
derived_from: []
regen_prompt: "Recheck official OpenAI Astra rollout guidance, inspect the local Codex model catalog and authentication mode, and perform a minimal direct Astra invocation."
---

# Codex Astra Model Picker Diagnosis

## Finding

The local Codex CLI was already current at version `0.153.4`, matching the current npm release. The authenticated Codex model catalog contained `gpt-6-astra` with `visibility: list`, and Codex was logged in through ChatGPT.

A minimal direct invocation with `codex exec --model gpt-6-astra` completed successfully and returned the requested sentinel response. This proves that the authenticated account and local client can use Astra.

## Likely cause

The missing picker entry is most consistent with a stale in-memory model catalog in a Codex session that was opened before the account rollout or catalog refresh reached the machine. It is not caused by an outdated CLI or lack of account entitlement on this machine.

Official OpenAI documentation describes Astra as a staged rollout. Model availability depends on the product surface, authentication method, connected identity, workspace controls, and client support. Enterprise workspaces may additionally require administrator enablement during the initial rollout.

## Resolution

1. Exit the existing Codex session completely and start a fresh session.
2. Open the model picker again, or launch directly with `codex -m gpt-6-astra`.
3. If using a desktop or IDE client, fully quit and reopen it so it fetches the refreshed catalog.

If the picker still omits Astra after restart, direct selection remains available on this machine and the remaining issue is a client-surface refresh/display problem.
