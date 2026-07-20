---
title: GWS OAuth client failure and fallback
model: gpt-5.6-terra
sources:
  - Local gws auth output on 2026-07-20
  - Local Hermes Google Workspace token validation
derived_from: merchant-payment-readiness-agent-one-pager
regen_prompt: Diagnose a GWS OAuth sign-in that reports success but fails on Drive or Docs calls.
---

# GWS OAuth Client Failure and Fallback

## Symptom

`gws auth login` reported success. Drive and Docs writes then returned `403` or token refresh returned `invalid_client`.

## Cause

The GWS OAuth client requires repair. `gws auth setup` used the active Google Cloud account and project `gen-lang-client-0619799109`. That account did not have permission to enable Drive or Docs APIs or create OAuth credentials.

## Verified path

The Hermes Google Workspace token at `~/.hermes/google_token.json` refreshed successfully and had Drive and Docs scopes. A direct Google Docs API call created and verified the native document `Merchant Payment Readiness Agent | One-Pager`.

## Fix

A project owner must configure the OAuth consent screen, enable Drive and Docs APIs, create a Desktop OAuth client, and replace `~/.config/gws/client_secret.json`. Then rerun `gws auth login`.

Use the Hermes `google_api.py` token path for an immediate, authorized operation while the project-level GWS repair is pending.
