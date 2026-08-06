---
name: "beastmode-cloudflare-langsmith-dns-2026-08-06"
title: "Beastmode Cloudflare and LangGraph/LangSmith DNS RCA"
description: "Root-cause analysis for the unavailable beastmode.epiloguecapital.com endpoint and the related LangGraph Studio/LangSmith tunnel."
publishedAt: "2026-08-06"
tags: [beastmode, cloudflare, langgraph, langsmith, dns, incident, rca]
keywords: [beastmode.epiloguecapital.com, langsmith.epiloguecapital.com, cloudflared, NXDOMAIN, LangGraph Agent Server]
author: "Codex"
source_session: "2026-08-06-beastmode-live-diagnosis"
model: "gpt-5"
sources:
  - "https://beastmode.epiloguecapital.com"
  - "https://langsmith.epiloguecapital.com"
  - "label:local-/home/lac5q/.cloudflared/config-maria.yml"
  - "label:local-/home/lac5q/.config/systemd/user/beastmode-langsmith-studio.service"
  - "label:local-/tmp/cloudflared-maria-persistent.log"
derived_from: []
regen_prompt: "Recheck the two public hostnames with authoritative DNS, inspect the local LangGraph service, compare local and effective cloudflared ingress rules, and update the RCA with timestamped evidence."
---

# RCA

## Summary

As of 2026-08-06, `beastmode.epiloguecapital.com` fails before HTTP because authoritative DNS returns NXDOMAIN. The hostname is also absent from the local Cloudflare ingress map, where it would match the default `http_status:404` rule even if DNS were added.

The related `langsmith.epiloguecapital.com` name also returns NXDOMAIN. A local LangGraph Agent Server is healthy on `127.0.0.1:2024`, and the local YAML contains a LangSmith hostname mapping to that port, but the running tunnel's startup log shows an effective ingress configuration that does not contain that mapping. The local edit therefore has not been applied to the effective tunnel configuration, or the running tunnel has not reloaded it.

## Evidence

- Cloudflare authoritative DNS over HTTPS returned status 3 (NXDOMAIN) for both `beastmode.epiloguecapital.com` and `langsmith.epiloguecapital.com`.
- The parent zone and known hostnames such as `maria.epiloguecapital.com` and `pc2.epiloguecapital.com` resolve through Cloudflare, so this is not a general zone or Cloudflare outage.
- `http://127.0.0.1:2024/` returns HTTP 200 and `{"ok":true}`.
- `http://127.0.0.1:2024/openapi.json` identifies the service as `LangSmith Deployment` and exposes 49 API paths.
- `beastmode-langsmith-studio.service` runs `langgraph dev` bound to `127.0.0.1:2024` with `LANGSMITH_TRACING=false`. This is a local LangGraph Agent Server/Studio-compatible API, not the hosted LangSmith control plane.
- The local `config-maria.yml` maps `langsmith.epiloguecapital.com` to `http://127.0.0.1:2024`, but has no `beastmode.epiloguecapital.com` rule. Cloudflared's local rule matcher reports Beastmode as the default rule #6 (`http_status:404`).
- The effective configuration recorded when the running Maria tunnel started contains `vexa`, `maria`, `sophia`, `bot`, and `huly`, but neither `langsmith` nor `beastmode`.
- The Maria tunnel has four active HA connections and known public tunnel routes work: `maria` reaches Cloudflare Access and `pc2` returns HTTP 200. The tunnel infrastructure itself is running.

## Repair boundary

1. Choose the canonical public hostname: `beastmode.epiloguecapital.com` or `langsmith.epiloguecapital.com`.
2. Add that hostname to the effective Cloudflare tunnel ingress configuration, targeting `http://127.0.0.1:2024`.
3. Create the matching Cloudflare DNS tunnel route/CNAME for the chosen hostname.
4. Apply the change through the tunnel's actual management plane and reload/restart the connector if it is locally managed.
5. Verify authoritative DNS, then HTTPS and the Agent Server health endpoint.
6. If actual LangSmith tracing is intended, separately enable `LANGSMITH_TRACING` and provide the API credentials; the current service explicitly disables tracing.

## Non-cause

The public GitHub repository does not contain a Cloudflare deployment manifest or a web frontend deployment. Its LangGraph runtime is optional source code; the outage is in the external DNS/tunnel publication layer, not a failing application route in this checkout.
