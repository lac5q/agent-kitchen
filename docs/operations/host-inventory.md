# Host Inventory (HOSTPAR-01, Phase 197)

*Captured 2026-07-26. Update when a host's topology changes.*

The point of this file is not that the hosts are identical — they are not, and
that is fine. The point is that every divergence is **written down**. oracle-1
ran for months with graph writes going to the wrong backend precisely because
nobody had recorded what "right" was.

| | **oracle-1** | **cordant-hermes-01** |
|---|---|---|
| Role | Public operator (`memroos.epiloguecapital.com` via Cloudflare Tunnel) | v8.21 deploy target |
| Login | `opc` | `ubuntu` |
| Repo root | `/home/opc/memroos` | `/home/ubuntu/memroos` |
| Graph backend | **Neo4j Aura** (cloud) | **local `neo4j` container** |
| Vector backend | **Qdrant Cloud** | none |
| Embeddings | none yet — provider disabled (STORECON-03) | **Ollama container running** |
| SQLite | `/data/conversations.db` in-container (~642 MB) | same (~2.5 MB) |
| Restart path | `scripts/memroos-restart.sh` (**never** bare `docker compose -f`) | standard compose |
| Host profile | `/etc/memroos/host-profile.env` (aura / qdrant-cloud / no-local-neo4j) | `/etc/memroos/host-profile.env` (local / none / local-neo4j-required) |
| Health check | cron `*/15`, profile-conformance | cron `*/15`, profile-conformance |
| Liveness watchdog | cron `*/20` | cron `*/20` |
| systemd timers | `memroos-healthcheck.timer`, `memroos-disk-watch.timer` | none (watchdog skips them) |
| Alert channel | SendGrid → `luis@epiloguecapital.com`; GitHub issues via the Python checker | SendGrid → same |
| Disk | 30 G total, ~6.9 G free (77%) | 96 G total, ~26 G free (73%) |
| Verified snapshot | `/home/opc/memroos-snapshots/` (642 MB DB, 2026-07-26) | `/home/ubuntu/memroos-snapshots/` (2.5 MB DB, 2026-07-26) |
| Users / agents | 2 / 59 | 2 / 0 |

## Intentional divergences

**cordant-hermes-01 uses local Neo4j, not Aura (HOSTPAR-04, decided 2026-07-26).**
Migrating its graph data would have meant moving data on a host that had no
verified backup — the exact risk the standing no-data-loss rule exists to
prevent. It now *has* a verified backup (taken 2026-07-26 during this
deployment), so the decision can be revisited if cross-host graph recall
becomes a requirement. Until then, local is correct here.

The health check enforces **conformance to each host's declared profile**, not
a fixed topology. On oracle-1 a running local `neo4j` container is a failure;
on cordant-hermes-01 its *absence* is the failure. A check hardcoded to
oracle-1's shape would alert continuously on cordant and get muted, which is
worse than no check.

**cordant-hermes-01 has no systemd timers.** The liveness watchdog treats an
uninstalled unit as "skipped", not "failed", so the same script runs on both.

**cordant-hermes-01 already runs Ollama; oracle-1 does not.** This matters for
STORECON-03 (Phase 198): the $0 embedding provider is already present on one
host and still needs installing on the other.

## Disk headroom

oracle-1 is the constrained host: 30 G total, and it hit 4 G free / 89% used on
2026-07-23 — which is when its systemd timers stopped firing. Before installing
anything sizeable there (e.g. the ~275 MB `nomic-embed-text` model), check
headroom against the 6 G disk-watch warn threshold. cordant-hermes-01 has
roughly four times the headroom.

## Where the runbook lives

- Host profiles: `scripts/host-profiles/`
- Health check: `scripts/memroos-health-check.sh` (+ `.test.sh`)
- Liveness watchdog: `scripts/memroos-scheduler-liveness.sh` (+ `.test.sh`)
- Topology assertion (boot gate): `apps/memroos/src/lib/host-profile/assert-topology.ts`
