# ADK/A2A Contract-Compliance Spike

Requirement: `ADKA2A-FOLLOWUP-01`

Status: completed bounded spike, 2026-06-27

## External Signal

Google's recent ADK/A2A example uses a Python ADK agent to extract contract terms and a Go service to validate those terms deterministically over A2A. The useful pattern is cross-language orchestration with deterministic validation and protocol-level boundaries.

Sources:

- https://developers.googleblog.com/build-cross-language-multi-agent-team-with-google-agent-development-kit-and-a2a/
- https://adk.dev/a2a/quickstart-consuming-go/

## Repo Baseline

MemRoOS already has:

- A2A task lifecycle and agent cards in `apps/memroos/src/lib/a2a`
- `/api/a2a/openapi` and `memroos-a2a.v1` contract checks
- registered remote A2A card ingestion in `apps/memroos/src/lib/a2a/card-ingestion.ts`
- JSON-RPC dispatch surfaces and route tests
- evidence/NOC receipts for dispatch and agent context

## Comparison Result

The Google pattern maps cleanly to a MemRoOS fixture: Python-like extractor output becomes an A2A task artifact, Go-like deterministic validation becomes a local TypeScript validator, and MemRoOS records task state, timeout/retry/fail-closed behavior, and evidence receipts.

The spike does not justify adopting ADK or Gemini as core runtime dependencies. The value is a contract-compliance demo fixture that proves MemRoOS can broker cross-language agents while keeping validation deterministic.

## Decision

Do not add ADK/Gemini dependencies, copy the sample app wholesale, or claim a compliance vertical. If implemented later, build a tiny fixture around existing A2A task contracts and deterministic local validation.

## Guardrails

- No ADK/Gemini core dependency.
- No wholesale app copy.
- No compliance-vertical product claim.
- No runtime replacement.
- Fail closed on timeout, malformed artifact, or validator disagreement.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
