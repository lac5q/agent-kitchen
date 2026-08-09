---
name: nango-self-hosting-boundary-2026-08-09
title: "MemroOS Nango self-hosting boundary"
description: "Current Nango API surface used by MemroOS and the self-hosted feature boundary."
publishedAt: "2026-08-09"
tags: [nango, self-hosting, connectors, memroos]
keywords: [Nango Auth, Nango Proxy, Functions, Webhooks, MCP, OpenTelemetry]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6-codex"
sources:
  - "https://nango.dev/docs/guides/platform/self-hosting"
  - "https://nango.dev/pricing"
  - "file:/home/lac5q/github/memroos-product/apps/memroos/src/lib/tool-auth/nango-client.ts"
derived_from:
  - "content/ops/nango-self-hosting-assessment-2026-08-09.md"
regen_prompt: "Re-audit MemroOS Nango call sites and compare them with the current official Nango self-hosting feature matrix."
---

# MemroOS Nango self-hosting boundary (2026-08-09)

MemroOS currently uses Nango only as the connector auth/credential broker: list connections, create Connect sessions, fetch connection credentials, delete connections, read connection usage, and list configured integration keys. The application does not call Nango Functions, Nango webhook processing/forwarding, Nango MCP, or Nango OpenTelemetry/log-export APIs. MemroOS owns its connector adapters, sync/ingestion paths, issue intake, and runtime/memory observability.

Therefore a self-hosted deployment that supplies Nango Auth/Proxy and Connect UI/API is sufficient for the current product path. The Nango self-hosting documentation describes the limited self-hosted tier as Auth + Proxy only; Functions, Webhooks, MCP, and OpenTelemetry export are part of the full Enterprise self-hosted feature set. Moving to Cordant-hermes-01 would add the Nango operational stack (server, orchestrator, jobs, runner, persist, Postgres, object storage, Elasticsearch, and Redis) and is not required merely to remove the 10-connection cloud cap.

Decision: keep the current Nango Cloud integration for now unless the connection cap or data-residency requirement justifies an Enterprise self-hosted deployment. If self-hosting is selected, scope Phase 176 as an Auth/Proxy-compatible migration first and retain MemroOS-owned sync and observability; do not add Nango Functions/Webhooks/MCP solely because they exist in the product.

## Clarification: what “MCP” means here

A provider integration named `linear-mcp` or `circleback-mcp` is not a dependency on Nango's Management MCP server. MemroOS retrieves a provider-scoped token from Nango and calls the provider's MCP endpoint directly (`mcp.linear.app` or Circleback); Notion and Google Drive use direct REST calls. The Nango client currently uses only `/connection`, `/connect/sessions`, `/connection/:id`, `/connect/sessions/usage`, and `/integrations`. The API base is hardcoded to `https://api.nango.dev`, so a self-host migration would require making that base URL configurable and re-authorizing or migrating connections before cutover.
