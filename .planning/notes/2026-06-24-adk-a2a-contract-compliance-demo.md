# ADK/A2A Contract-Compliance Demo Fit - 2026-06-24

## Source

Luis asked whether the repo linked from Shubham Saboo's X post had value for MemRoOS.

- X post: https://x.com/Saboo_Shubham_/status/2069608203273609606
- Google Developers blog: https://developers.googleblog.com/build-cross-language-multi-agent-team-with-google-agent-development-kit-and-a2a/
- Reference repo: https://github.com/GoogleCloudPlatform/generative-ai/tree/main/agents/adk/contract-compliance-pipeline

## Judgment

The repo has value as an integration and demo fixture, not as core infrastructure.

The useful pattern is a Python FastAPI / Google ADK orchestrator delegating contract validation to a Go A2A service over JSON-RPC. The Go side is deterministic and policy-shaped, which aligns with MemRoOS's governance posture: LLM-friendly extraction or orchestration upstream, deterministic validation and receipts downstream.

## MemRoOS Fit

Best-fit surfaces:

- A2A agent-card registration and canonical agent registry.
- Dispatch handoff to remote A2A agents.
- Evidence receipts for extracted terms, validator result, timeout/retry behavior, and fail-closed decisions.
- NOC/operator visibility for cross-language agent health and delegation failures.
- A stronger ADK/A2A demo than the current prime-check fixture.

## Non-Goals

- Do not add ADK or Gemini as a core MemRoOS dependency.
- Do not copy the full app into MemRoOS.
- Do not treat contract compliance as a product vertical claim until MemRoOS has its own evals, fixtures, and compliance language reviewed.
- Do not bypass existing A2A registration, policy, dispatch, or evidence surfaces.

## Proposed GSD Requirement

Add `ADKA2A-FOLLOWUP-01` as a deferred, approval-gated future spike:

- Build or adapt a small non-sensitive cross-language A2A fixture.
- Prove Python orchestration can register and dispatch to a Go deterministic validator through MemRoOS.
- Capture evidence receipts for request, response, validation result, retries, timeout, and fail-closed behavior.
- Show the run in NOC/agent registry surfaces.
- Compare against the current `examples/adk-a2a-agent` fixture and keep only the smallest useful pattern.

## Verification Standard

Minimum acceptance for a future spike:

- Local fixture starts without cloud credentials.
- Agent card ingestion passes existing A2A registration policy.
- Dispatch handoff records task id, remote agent id, latency, status, and error mode.
- Deterministic validator returns repeatable verdicts from the same inputs.
- Failure simulation proves timeout, retry, and fail-closed receipts.
- No private contract text or sensitive payload is committed as fixture data.
