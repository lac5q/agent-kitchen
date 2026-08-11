---
name: "nango-tenant-materialization-reconciliation-2026-08-10"
title: "Nango tenant materialization reconciliation — Oracle and Cordant"
description: "Read-only production evidence separating shared Nango connections from local owner materialization."
date: "2026-08-10"
model: "Codex lead; Beastmode Luna Max executor lane"
sources:
  - "Read-only SSH checks on oracle-1 and cordant-hermes-01"
  - "Nango /connection API response shape and counts"
  - "MemroOS SQLite tool_connections/users tables"
derived_from: "Phase 176 connector/adapter-plane acceptance evidence"
regen_prompt: "Re-run read-only Nango connection listing and compare end-user identities with local MemroOS users and tool_connections rows on both production hosts."
---

# Finding

The shared Nango workspace currently exposes 9 connections on both production hosts. MemroOS intentionally materializes only connections whose Nango end-user identity matches an enabled local user by ID or email; it does not import unowned rows into `tool_connections`, which prevents cross-user credential leakage.

## Oracle

- Nango connections: 9.
- Local enabled users: 2 (`admin@example.com`, `luis@epiloguecapital.com`).
- Nango identities matched to a local user: 2.
- Unmatched Nango identities: 7, chiefly end-user `adc486a532a013ed25d5` (Eric's connections), `test_luis_calderon`, and `memroos-operator`.
- Local `tool_connections` rows: 2 (Circleback and google-mail-ctnh).

## Cordant

- Nango connections: 9.
- Local enabled users: 3 (`luis.calderon@cordant.ai`, `luis.calderon@gmail.com`, `eric@cordant.ai`); the seeded admin is disabled.
- Nango identities matched to a local user: 6.
- Unmatched Nango identities: 3 (the `luis@epiloguecapital.com` connection, `test_luis_calderon`, and `memroos-operator`).
- Local `tool_connections` rows: 6, including Eric-owned Linear, Notion, Circleback, Google Mail, Drive, and Calendar.

## Root cause

This is an identity/materialization parity gap, not a Nango connection-count gap. The Nango workspace is shared by both deployments, but local user directories differ. The application correctly fails closed for Nango connections with no local owner. Automatically importing the seven Oracle-unmatched rows as shared would violate the ownership boundary.

## Acceptance implications

Phase 176 remains open until the owner mapping is explicit and tested:

1. Decide which Nango end-user identities belong to Oracle versus Cordant.
2. Create or onboard the corresponding local users through the supported invite/auth flow; do not write password rows or ownership rows by hand.
3. Trigger authenticated connection reconciliation and verify the expected `tool_connections` rows, owner IDs, and private/shared flags.
4. Run provider read/write smoke tests for Linear, Circleback, and Notion under each intended owner.
5. Keep unmatched identities visible as an operator warning rather than silently dropping them.

No credentials, tokens, or secret values are included in this report.
