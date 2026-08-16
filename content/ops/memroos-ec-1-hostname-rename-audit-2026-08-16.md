---
name: memroos-ec-1-hostname-rename-audit
title: "MemRoOS EC-1 hostname rename audit"
description: "Read-only audit of the oracle-1 to memroos-ec-1 rename across the live host, MemroOS product repository, deployment contracts, agent identity, and operator tooling."
publishedAt: "2026-08-16"
tags: [memroos, operations, hostname, deployment, tailscale]
keywords: [oracle-1, memroos-ec-1, memroos-product, host identity, agent registry, systemd, Cordant]
author: "pi"
source_session: "pi-2026-08-16"
model: "gpt-5.6-luna"
sources:
  - "local:/home/lac5q/github/memroos-product"
  - "live:tailscale-ssh:opc@memroos-ec-1"
  - "live:tailscale-status"
derived_from: []
regen_prompt: "Re-audit the oracle-1 to memroos-ec-1 hostname migration, separating runtime-critical references from historical documentation and verifying both the live host and memroos-product checkout."
---

# Summary

The Linux hostname and Tailscale MagicDNS name are already `memroos-ec-1` (`100.90.196.33`), and `tailscale ssh opc@memroos-ec-1` works. The old `oracle-1` name no longer resolves from maeve-u1. The public URL and Cloudflare tunnel remain operational and should not be renamed merely because the machine hostname changed.

The rename is not complete. The live MemroOS stack still advertises `oracle-1` in host identity and MCP agent configuration:

- `/etc/memroos/host-profile.env`: `MEMROOS_HOST_ID=oracle-1`
- `/home/opc/memroos/.env`: `MEMROOS_HOST_ID=oracle-1`
- `/home/opc/.memroos/memroos-mcp-http.env`: `MEMROOS_AGENT_ID=oracle-1:mcp`
- `/home/opc/.memroos/agent-keys/`: `oracle-1:mcp.key` and `oracle-1-droid.key`
- `/home/opc/.bashrc`: sources `/home/opc/.config/oracle-1-agent/env.sh`
- production container environment: `MEMROOS_HOST_ID=oracle-1`

The production SQLite registry currently has five rows whose `registered_agents.host` is `oracle-1`; `fleet_hook_receipts` currently has zero rows. The forwarder committed on Cordant still dials `opc@oracle-1`, which is a runtime break now that the old MagicDNS name is gone.

# MemroOS product repository: runtime-critical changes

The active repo is `/home/lac5q/github/memroos-product`; its working tree was already dirty (`apps/memroos/src/proxy.ts` and `scripts/ship-hook-receipts.sh` modified), so this audit made no code edits.

Update the canonical host ID and deployment path in:

- `agents.config.json`: all explicit `metadata.hosts: ["oracle-1"]` entries and `defaultHost`.
- `apps/memroos/src/lib/agent/registry-seed.ts`: `DEFAULT_SEED_HOST` and its comments.
- `apps/memroos/src/lib/runtime-topology.json`: production `host`, `deployRoot`, every `deployUnit`, and production comments.
- `scripts/check-runtime-topology.mjs` and `scripts/check-runtime-topology.test.mjs`: production deploy root and fixtures.
- `scripts/check-cordant-central-mcp-cutover.mjs` and its test: production unit path and expected `opc@memroos-ec-1` target.
- `deploy/cordant-hermes-01/systemd/memroos-mcp-cordant-forward.service`: actual SSH target must become `opc@memroos-ec-1`.
- `scripts/host-profiles/oracle-1.env`: rename to `scripts/host-profiles/memroos-ec-1.env` and change `MEMROOS_HOST_ID`.
- `scripts/install-regression/install-regression.sh`: profile path list.
- The `deploy/oracle-1/` directory: recommended rename to `deploy/memroos-ec-1/`, followed by updating all references. If path churn is intentionally avoided, keep a compatibility directory but make the topology's canonical host/path new.

Host-specific agent keys and the MCP service identity need an explicit migration, not a blind text replace. Either provision a new `memroos-ec-1:mcp` key/agent and retire the old one after verification, or keep the old key as a temporary compatibility alias while the canonical profile uses the new host ID. Do not delete or overwrite keys during the rename.

# Memroos product repository: operator tooling and docs

Rename or update active operator-facing names:

- `scripts/ssh-oracle1.sh` → preferably `scripts/ssh-memroos-ec-1.sh`; default host `memroos-ec-1`; retain `ORACLE1_HOST`/old wrapper temporarily if existing automation depends on it.
- `scripts/configure-nango-oracle1.sh` → preferably a memroos-ec-1 name; update its default/usage text and target variable semantics.
- `scripts/check-oracle1-readiness.mjs` and `docs/cloud-operator-oracle1-runbook.md` → preferably memroos-ec-1 names, plus all references from the readiness checker and renderer.
- `scripts/render-topology-docs.mjs`, `docs/production-deployment.md`, `docs/integrations/mcp.md`, `docs/operations/host-inventory.md`, `docs/.topology-prod.md`, and `services/healthcheck/README.md`.
- `AGENTS.md`, `agents/AGENTS_TEMPLATE.md`, `bin/memroos`, `bin/memroos-bootstrap-agent.md`, `bin/memroos-bootstrap-agent.sh`, and host-health/verification scripts.
- Runtime health labels/user-agent/issue text in `services/healthcheck/memroos-healthcheck.py` and relevant systemd unit descriptions under the production deploy directory.

The application comments and historical incident records can be updated for clarity, but they are not all runtime dependencies. Historical `.planning`, `.beastmode`, `.evidence-push`, reports, and UAT records should normally retain `oracle-1` as the historical name, optionally with a note that it was renamed to `memroos-ec-1`; do not bulk replace them.

# Live-host changes

On `memroos-ec-1`, update and then restart/reload only the affected services after a verified repo deploy:

1. `/etc/hostname` is already correct; `/etc/hosts` has no old-name entry.
2. Change `/etc/memroos/host-profile.env` and `/home/opc/memroos/.env` to `MEMROOS_HOST_ID=memroos-ec-1`.
3. Migrate the MCP agent identity/key and update `/home/opc/.memroos/memroos-mcp-http.env`.
4. Rename or compatibility-link `/home/opc/.config/oracle-1-agent/` and update `/home/opc/.bashrc`.
5. Update the installed systemd units/descriptions from the new deploy directory, `systemctl daemon-reload`, then restart MCP/healthcheck/stack as appropriate.
6. Run host-agent synchronization so new heartbeats/registrations use `memroos-ec-1`.
7. In the production SQLite DB, backfill only rows whose host is exactly `oracle-1` after taking a backup and confirming the key/agent migration; preserve historical content and ownership history.

The remote checkout is `/home/opc/memroos`, its `origin` is `https://github.com/lac5q/memroos-product.git`, and it contains unrelated untracked files. Preserve those files during deployment.

# Things that should stay unchanged

- `https://memroos.epiloguecapital.com` and its Cloudflare ingress: the config routes to loopback, not the machine hostname.
- Cloudflare tunnel name `memroos-oracle`, unless there is a separate naming goal; it is a logical tunnel identifier, not the Linux hostname.
- Product/workspace terms such as `Oracle`, `MEMROOS_KNOWLEDGE_GROUP=oracle`, and old historical incident names unless the user intends a broader product rename.
- Tailscale IP `100.90.196.33`, assuming the machine was renamed in place.

# Verification gates

After implementation:

- `rg -n -i "oracle-1|oracle1"` over active code/deploy/config paths returns no unexpected runtime references; historical paths are explicitly allowlisted.
- `npm run check:runtime-topology -- production` (or the repository's supported production invocation) passes.
- `npm run check:cordant-central-mcp` passes with `opc@memroos-ec-1`.
- `npm run check:agents`, host-profile/install-regression checks, and relevant unit tests pass.
- From Cordant, the SSH forwarder reaches `memroos-ec-1`; from the host, MCP auth and health checks pass.
- Public `https://memroos.epiloguecapital.com/api/health` remains healthy.
- Query the production registry to confirm the intended host migration and no duplicate agent identities.
