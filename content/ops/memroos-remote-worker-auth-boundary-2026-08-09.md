---
name: memroos-remote-worker-auth-boundary-2026-08-09
title: MemroOS remote worker authentication boundary RCA
description: RCA and verification for installer-generated MCP clients receiving anonymous 401 responses.
date: 2026-08-09
model: gpt-5.6
sources:
  - scripts/install-agent-integrations.sh
  - scripts/setup-codex-cloud.sh
  - scripts/memroos-mcp.sh
  - scripts/memroos-operator-stub.sh
  - live MCP discovery and unauthenticated/credentialed smoke checks
derived_from: user-reported agent onboarding and Google OAuth/worker integration defects
regen_prompt: Recheck installer-generated MCP command paths, scoped-key loading, OAuth discovery, and a sanitized initialize smoke without recording credentials.
---

## RCA

The installer wrote clients directly to the operator stub. That bypassed the canonical launcher’s client-scoped key loader, so remote workers sent anonymous requests and received HTTP 401 even though the hosted MCP protocol and OAuth discovery were healthy.

## Fix

The installer and Codex Cloud setup now enter through `memroos-mcp.sh`. The launcher loads a client-scoped key, then delegates to the Streamable HTTP operator stub. The installer also has a validated stdlib-only TOML section rewrite for hosts without `tomli-w`. Regression coverage now asserts the wrapper path and preserves the existing remote-first/stdio protocol tests.

## Verification

- Installer convergence check: passed for all detected targets.
- Shell syntax, remote-first launcher, operator-stub bridge, and handoff runtime tests: passed.
- Both public MCP protected-resource and authorization-server discovery documents: HTTP 200.
- Public deployment verifier and both host-local required-service probes: passed.
- Existing Maeve agent keys: HTTP 401 on both public hosts; they are stale/revoked and require fresh onboarding credentials. No key values are stored here.
- Google OAuth status remains `configured:true` on both public hosts; signed-in consent remains an operator browser step.

## Remaining action

Mint fresh per-agent invites/keys and rerun the native MCP initialize plus `knowledge_health` smoke. ChatGPT/Cowork should use the OAuth path on the same host as the MCP URL.
