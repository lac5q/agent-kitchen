---
name: memroos-luna-host-and-knowledge-inventory-2026-08-09
title: Luna-Max host verification and centralized knowledge inventory
description: Records the Cordant Codex upgrade, attested Luna-Max smokes, and sanitized knowledge-root inventory.
date: 2026-08-09
tags:
  - operations
  - beastmode
  - luna-max
  - centralized-knowledge
  - phase-238
keywords:
  - gpt-5.6-luna
  - Cordant
  - Oracle
  - KNOWCENT-03
author: Codex
source_session: 019fdac3-ab4e-7a21-bbef-f37ee440470a
model: gpt-5.6-luna:max
sources:
  - local repository and GitNexus instructions
  - read-only SSH metadata checks on cordant-hermes-01 and oracle-1
  - remote Beastmode smoke receipts
  - Gmail header search via authenticated connector
derived_from:
  - content/ops/memroos-alert-delivery-followup-2026-08-09.md
regen_prompt: Re-run the sanitized host metadata inventory and attested Luna-Max smoke on reachable operator hosts; never include credentials or message bodies.
---

# Outcome

Cordant's Luna-Max worker lane was repaired and verified. Its Codex CLI was 0.141.0, which rejected `gpt-5.6-luna` with HTTP 400 and stated that a newer Codex was required. The host package was upgraded in place to `@openai/codex@0.147.0` using the host's existing privileged package path. No repository files or secrets were changed.

# Verification

- Cordant `bin/beast-luna --smoke`: passed; attested `model=gpt-5.6-luna`, `reasoning=max`, exit 0.
- Oracle `bin/beast-luna --smoke`: passed; attested `model=gpt-5.6-luna`, `reasoning=max`, exit 0.
- Local deterministic gates: remote-first launcher PASS, operator-stub bridge PASS, 158 Connmem tests passed.
- Both public operator checkouts remain clean and on the deployed main revision; no application rebuild was needed for this CLI-only repair.

# Sanitized knowledge-root inventory

- Cordant native MCP service: local operator checkout under the service account; no `~/github/knowledge` or `agent-knowledge` path was present. Its native service is intentionally local-only per Phase 238's non-goal; remote-first agent clients use the Oracle operator endpoint.
- Oracle native MCP service: `/home/opc/github/agent-knowledge` is the configured central git-backed corpus and is owned by the service account. A separate legacy `/home/opc/github/knowledge` checkout also exists. Neither was migrated, deleted, or rewritten because KNOWCENT-03 requires a host-by-host plan and approved retention/deletion decision.
- Main-Mac/Main-man was not reachable from this session, so its inventory remains an external gate.

# Email-routing finding

The authenticated Gmail account has no MemroOS message addressed to `luis.calderon@cordant.ai` in the searched period. Messages to that alias were user-sent tests, daily-content replies, and calendar invitations. The current MemroOS alert path has no production recipient configured; historical MemroOS mail was delivered to the legacy `luis@epiloguecapital.com` alias. Any mailbox alias/forwarding rule and the Main-Mac sender remain outside this session's reachable controls.

# Remaining gates

KNOWCENT-03 still needs Main-Mac inventory and an approved migration/decommission decision. Phase 176 still lacks authorized provider credentials, live introspection, company-total reconciliation, deletion/retention evidence, and Oracle parity. Signed-in Google consent/session smoke remains browser-operator-only.
