---
title: PopSmiths OpenAI plugin submission readiness audit
date: 2026-09-07
model: GPT-5 Codex with GPT-5.6 Luna max subagents
sources:
  - https://developers.openai.com/plugins/deploy/submission
  - https://developers.openai.com/plugins/deploy/app-review
  - https://www.popsmiths.com/mcp/tools
  - https://www.popsmiths.com/health
derived_from:
  - content/uat/popsmiths-store-restart-uat-2026-08-18.md
regen_prompt: Re-run production and staging MCP discovery, OpenAI submission portal requirements, GitHub deployment state, domain verification, sanitizer behavior, and reviewer test cases.
---

# PopSmiths OpenAI submission readiness

## Verified working

- Production health is HTTP 200 with database, image service, and Shopify configured.
- MCP initialize and tools/list work publicly.
- Production exposes 13 tools. All have input and output schemas plus explicit read-only, destructive, open-world, and idempotence hints.
- The latest GitHub deployment workflow for production commit `30973896` succeeded.
- Production privacy, terms, refund, shipping, help, and contact pages respond successfully.
- The production MCP regression suite passed 22 checks, although upload-dependent generation checks were skipped after the upload provider rejected the test image.

## Submission blockers

1. `https://www.popsmiths.com/.well-known/openai-apps-challenge` returns 404. The exact verification token must first be obtained from the authenticated OpenAI plugin portal.
2. `chatgpt-app-submission.json` has 12 positive and 4 negative cases; the submission package should contain exactly 5 positive and 3 negative cases.
3. Submission documentation disagrees on the canonical MCP hostname and still has incomplete screenshot/domain-verification sections.
4. Production and staging tool descriptors differ, so staging is not a faithful release candidate.
5. The REST `/mcp/tools/:toolName` path returns raw tool results while the JSON-RPC MCP path applies an internal-field sanitizer.
6. Upload-dependent reviewer checks currently fail or skip because the upload provider returns a forbidden response.
7. Ownership/SSRF review is still required for share creation, video status, ratings, and tools that fetch supplied URLs.
8. The previously observed cart-to-Shopify price mismatch remains a commerce release blocker until the intended pricing/discount behavior is confirmed and retested.

## Access state

- The local Heroku CLI is unauthenticated.
- 1Password CLI has a service-account context and a PopSmiths admin item, but no available 1Password MCP integration or discoverable OpenAI Platform human-login item.
- No existing OpenAI portal draft ID, submission ID, or review status was found in the repository.

## Required next operator action

Open `https://platform.openai.com/plugins` in the shared Chrome session and sign in to the correct verified OpenAI organization. This enables retrieval of the domain challenge token and completion of the portal-only attestations.
