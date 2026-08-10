---
name: "machine-access-routing-2026-08-10"
title: "Machine access routing: Main-Mac, Maeve-u1, and the Tailscale fleet"
description: "Verified routing and troubleshooting rules for reaching the MemroOS development and deployment machines."
publishedAt: "2026-08-10"
tags: ["operations", "machine-access", "tailscale", "beastmode", "ssh"]
keywords: ["Main-Mac", "Maeve-u1", "cordant-hermes-01", "oracle-1", "tailscale ping", "SSH"]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "operator-provided Tailscale device screenshot (2026-08-10)"
  - "verified session routing notes in docs/codex-cloud/skills/beastmode-cloud/SKILL.md"
derived_from:
  - "docs/codex-cloud/skills/beastmode-cloud/SKILL.md"
regen_prompt: "Re-check the Tailscale fleet, identify the current host, and document the safe local-versus-remote command routing and SSH failure interpretation without exposing credentials."
---

# Machine access routing

## Verified roles

- **Main-Mac** (main-mac.tail255306.ts.net, 100.68.222.60) is the operator's local Mac and the source drive for SSH orchestration. Treat it as local to the operator, not as the Linux execution host.
- **Maeve-u1** (maeve-u1.tail255306.ts.net, 100.109.19.110) is the persistent Linux execution host. When the current shell reports Self.HostName=maeve-u1, work there directly and do not SSH back into Maeve from itself.
- **cordant-hermes-01** and **oracle-1** are separate deployment targets. Reach them through the approved Tailscale/SSH route from the current host; do not infer reachability from the browser domain alone.

## Safe access sequence

1. Run tailscale status --json and inspect Self.HostName before choosing a route.
2. If the current host is maeve-u1, execute local repository and service commands directly.
3. From Main-Mac, dispatch Maeve work with bm --on maeve-u1 (or the equivalent Beastmode remote lane).
4. Use tailscale ping <host> to distinguish Tailscale reachability from SSH authentication.
5. Only after Tailscale reachability succeeds, use SSH with the configured user/key and a bounded timeout.
6. A Permission denied (publickey) response from Main-Mac means the Mac-side SSH key/user is not authorized; it is an authentication problem, not evidence that Maeve is offline. Stop retrying the same command and repair the Mac key authorization.
7. Do not use a broad host alias or the old mainman spelling; the canonical local host name is Main-Mac.

## Operational guardrails

- Never print or commit private keys, service-account tokens, onboarding keys, or secret environment values.
- Before deployment, confirm the target host and repository state; after deployment, run the repository's production verification script.
- Record any changed routing or authorization rule back into this artifact so future agents do not repeat the Main-Mac/Maeve confusion.
