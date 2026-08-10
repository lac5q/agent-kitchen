---
title: "Phase 243 Agent Engagement and Dispatch Huddle concept"
description: "Kimi-K3 high-thinking concept and roadmap sequencing for replacing duplicate Workflow/Dispatch controls with one reliable Huddle surface."
publishedAt: "2026-08-10"
tags: [memroos, huddle, engagement, dispatch, ux, connector, mcp, roadmap]
keywords: [phase-243, agent-wake, live-chat, voice-call, room-history, dispatch-capability]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "kimi-coding/k3"
sources:
  - "label:operator-ux-defect-report-2026-08-10"
  - "label:phase-176-connector-plane"
  - "label:phase-238-remote-first-mcp"
derived_from:
  - ".planning/phases/243-agent-engagement-dispatch-huddle/243-01-PLAN.md"
regen_prompt: "Recreate the Phase 243 Huddle concept from the operator screenshots and requirements, preserving tenant/auth/policy/audit boundaries and explicit connector/MCP failure states."
---

# Phase 243 concept

## Sequence decision

Phase 176 (connector/adapter parity) and Phase 238 (authenticated remote-first MCP) are P0 because they are the reliability dependencies for waking agents and scaling integrations. Phase 243 is queued as P2: design now, implement only after those gates are green enough to prove a truthful wake path.

## Huddle principles

- One surface and one mental model: roster, room, composer, and history live together.
- Agent state is explicit: available, selected, waking, live, sleeping, or unreachable.
- Replies carry live, fallback, or policy-blocked provenance; fallbacks never masquerade as agent turns.
- Tenant scope, auth, policy, and audit are reused for rooms, wake calls, messages, voice sessions, and history.
- Degraded connectors and MCP failures show a stable error code, plain-language reason, and next action.
- Desktop uses roster + room columns; mobile collapses to tabs without horizontal overflow.

## User flow

Select agents into a room, wake one or all, start typed chat when at least one is live, optionally upgrade the same room to a voice/live call, and revisit paginated history. Removing a member closes participation and asks the runtime to sleep; removing the last member archives the room while retaining history.

## Runtime contract

Use a tenant-scoped room/membership/session model, a bounded wake endpoint returning `live|failed`, stable failure codes (`CONNECTOR_UNREACHABLE`, `MCP_HANDSHAKE_TIMEOUT`, `AUTH_EXPIRED`, `POLICY_DENIED`, `DISPATCH_UNDECLARED`, `QUOTA_EXCEEDED`), live-member-only fan-out, shared chat/voice transcript, SSE/streamed member events, and audit receipts for wake, message, fallback, denial, removal, and call start/end.

## Acceptance

Mixed connector wake results remain visible per agent; only live members receive chat; remove preserves history and stops fan-out; voice markers and transcripts share history; cross-tenant requests return 403; API and UI capability/policy decisions agree; desktop and 320px mobile checks show no overflow or duplicate controls.

## Model lanes

Kimi-K3 high-thinking supplied the concept draft. Implementation is deferred to Luna-Max in isolated worktrees (three independent slices at most). Fable via `claude -p` is the judgment validator; Opus xhigh is only a fallback if Fable is rejected.

## Provenance note

The `bm` console did not emit an ACN `meta.json` for this bounded concept pass. The Kimi-K3 selection was preflighted and the concept returned, but it is recorded as an unverified design draft—not as an implementation or validation verdict.
