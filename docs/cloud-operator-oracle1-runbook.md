# Always-On Cloud Operator Runbook (oracle-1)

**Version:** v8.15 live verification 2026-07-18.2  
**Created:** 2026-07-18  
**Last updated:** 2026-07-18  
**Scope:** v8.15 Phases 163-165 only: oracle host readiness, operator deploy/data cutover, public tunnel, and Heroku operator decommission.  
**Out of scope:** Phase 166 / Voyage / `MEMROOS_EMBEDDING_PROVIDER=voyage`. Do not implement or enable Voyage as part of this runbook.

**Live status (2026-07-18):** Public cutover is **verified** (see `docs/uat/2026-07-18-oracle1-live-cutover-verification.md`). Cursor Cloud can join Tailscale and reach `oracle-1:22`, but `opc` SSH still needs the agent pubkey installed (or Tailscale SSH enabled on the host).

## Sources

- `.planning/ROADMAP.md`, section `v8.15 Always-On Cloud Operator - oracle-1 (Phases 163-166)`.
- `docs/production-deployment.md`, document version 2.0, updated 2026-07-18.
- Existing local verification script: `scripts/verify-onboarding-deploy.sh`.
- Existing memory resilience/catchup scripts: `scripts/install-memory-resilience.mjs`, `scripts/run-graph-catchup.mjs`, `scripts/run-graph-catchup-cron.mjs`.

## Operator model

- Canonical operator host: `oracle-1` on Tailscale.
- Public operator URL: `https://memroos.epiloguecapital.com`.
- Cloudflare tunnel: `memroos-oracle` routes the public hostname to oracle-1 `:3000`.
- Shared stores: Neo4j Aura and Qdrant Cloud.
- Embeddings on oracle-1: Ollama `nomic-embed-text` with `MEMROOS_EMBEDDING_PROVIDER=ollama`.
- Mac is development only. Vercel is marketing/preview only. Heroku is not the operator brain.

## Non-destructive local readiness check

From the repository root:

```bash
node scripts/check-oracle1-readiness.mjs
```

This script only checks local files, local process environment names, and expected repository scripts. It does not SSH, call Heroku, call Cloudflare, destroy apps, scale dynos, rotate secrets, or mutate production.

## STOP gates

| Gate | 2026-07-18 status |
|------|-------------------|
| Tailscale reachability to oracle-1 | **PASS** (Cursor Cloud userspace Tailscale; ping + TCP 22) |
| `opc` SSH shell / Tailscale SSH | **STOP** — install agent pubkey (below) or enable `sudo tailscale set --ssh` |
| Cloudflare tunnel / DNS | **PASS** (API: `memroos-oracle` healthy → `:3000`) |
| Heroku operator decommission | **PASS** (API: `web=0`, custom domain removed) |
| Production secrets file read on host | **STOP** until SSH shell works |
| Destructive SQLite overwrite | **STOP** — not required; inventory already non-zero |

### Agent SSH pubkey install (unblocks Cursor Cloud)

```bash
# on oracle-1 as opc
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEIkdPLarR4WZK0dOPkOuZzKkymjLQMoo97nNseAx2tG cursor-cloud-memroos-2026-07-18' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

1Password: AgentWritable notes `Cursor Cloud oracle-1 SSH pubkey 2026-07-18` + private key sibling item.

## Phase 163 - host readiness checklist

Use this checklist on oracle-1 after the SSH/Tailscale STOP gate is satisfied.

### Baseline capacity

Target budget from the v8.15 roadmap:

- Host class: aarch64, 2 CPU.
- RAM evidence before install: about 10 GiB total, about 8.7 GiB available.
- Disk evidence before install: 30 GiB total, about 13 GiB free.
- Day-1 workload only: Next.js operator, mem0 service, SQLite, Cloudflare Tunnel, and Ollama `nomic-embed-text`.
- Not in budget: heavy chat LLM serving or multi-LLM workloads.

Required post-install budget:

- At least 5 GiB disk free after model install.
- Sufficient RAM headroom for `memroos-web.service`, `memroos-mem0.service`, `ollama.service`, and `cloudflared.service`.
- Disk watch remains enabled; production deployment docs note warnings at <=6 GiB free and critical at <=4 GiB free.

### Host commands

Run only on oracle-1:

```bash
uname -a
free -h
df -h /
node --version
npm --version
systemctl status ollama --no-pager
ollama pull nomic-embed-text
ollama list
```

Embedding smoke:

```bash
curl -sS http://localhost:11434/api/embeddings \
  -H 'content-type: application/json' \
  -d '{"model":"nomic-embed-text","prompt":"MemRoOS oracle-1 readiness smoke"}' \
  | jq '{embeddingLength: (.embedding | length)}'
```

Expected result: `embeddingLength` is non-zero and `df -h /` still shows at least 5 GiB available.

## Phase 164 - deploy and data cutover steps

Run only after the oracle-1 host access, production secrets, and data migration STOP gates are satisfied.

1. Confirm the host environment files exist and are readable by the service owner:

   ```bash
   sudo test -r /etc/memroos/web.env
   sudo test -r /etc/memroos/mem0.env
   ```

2. Confirm required production configuration names are present without printing secret values:

   ```bash
   sudo awk -F= '
     BEGIN {
       split("MEMROOS_PUBLIC_BASE_URL MEMROOS_APP_URL MEMROOS_EMBEDDING_PROVIDER SQLITE_DB_PATH QDRANT_URL QDRANT_API_KEY NEO4J_HTTP_URL NEO4J_URI NEO4J_DATABASE NEO4J_USERNAME NEO4J_PASSWORD MEMROOS_ONBOARDING_SECRET MEMROOS_OPERATOR_API_KEY", want, " ")
       for (i in want) required[want[i]] = 1
     }
     $1 in required { print FILENAME ":" $1 "=<present>" }
   ' /etc/memroos/web.env /etc/memroos/mem0.env
   ```

   Expected non-secret values:

   ```text
   MEMROOS_PUBLIC_BASE_URL=https://memroos.epiloguecapital.com
   MEMROOS_APP_URL=https://memroos.epiloguecapital.com
   MEMROOS_EMBEDDING_PROVIDER=ollama
   ```

3. Deploy the repository on oracle-1:

   ```bash
   cd /home/<user>/github/memroos
   git pull --ff-only
   npm --prefix apps/memroos ci
   npm --prefix apps/memroos run build
   sudo systemctl restart memroos-mem0 memroos-web
   sudo systemctl status memroos-web memroos-mem0 ollama cloudflared --no-pager
   ```

4. Migrate or sync SQLite only with an approved source and backup:

   ```bash
   sudo systemctl stop memroos-web memroos-mem0
   cp -a /home/<user>/github/memroos/data/conversations.db "/home/<user>/github/memroos/data/conversations.db.backup.$(date +%Y%m%d%H%M%S)"
   # Copy the approved source conversations.db to the configured SQLITE_DB_PATH here.
   sudo systemctl start memroos-mem0 memroos-web
   ```

5. Enable graph catchup on the operator host using the existing memory resilience install path:

   ```bash
   cd /home/<user>/github/memroos
   node scripts/install-memory-resilience.mjs install
   node scripts/run-graph-catchup.mjs --dry-run
   ```

6. Verify on-host health and inventory before public cutover:

   ```bash
   curl -sS http://localhost:3000/api/health | jq '.services[] | {service,status}'
   ```

## Phase 165 - tunnel and Heroku decommission steps

Run only after the Cloudflare and Heroku STOP gates are satisfied.

1. Ensure the dedicated Cloudflare tunnel routes the operator hostname to oracle-1:

   ```bash
   cloudflared tunnel info memroos-oracle
   sudo systemctl status cloudflared --no-pager
   ```

2. Confirm the public smoke reaches oracle-1, not Heroku, Vercel, or a Mac tunnel:

   ```bash
   bash scripts/verify-onboarding-deploy.sh
   curl -sS 'https://memroos.epiloguecapital.com/api/health' | jq '.services[] | {service,status}'
   ```

   The bad-token onboarding script check must return HTTP 403, not HTTP 401.

3. After oracle-1 public smoke passes, decommission the Heroku operator path:

   ```bash
   heroku domains --app memroos-agent-onboarding
   heroku domains:remove memroos.epiloguecapital.com --app memroos-agent-onboarding
   heroku ps:scale web=0 --app memroos-agent-onboarding
   heroku ps --app memroos-agent-onboarding
   ```

4. Rotate any backend secrets that were exposed through Heroku config, shell logs, or chat logs. Update `/etc/memroos/web.env` and `/etc/memroos/mem0.env` after rotation.

5. Confirm agents and MCP clients point at:

   ```text
   https://memroos.epiloguecapital.com
   ```

## Completion criteria

Phases 163-165 are ready to close only when:

- Ollama `nomic-embed-text` is installed and smoke-tested on oracle-1.
- At least 5 GiB disk remains free after model install.
- Operator and mem0 systemd units are healthy on oracle-1.
- Aura and Qdrant configuration is present on host without leaking secrets.
- SQLite inventory is non-zero on the host after migration/sync.
- Graph catchup scheduler is enabled or its blocked reason is documented.
- `memroos.epiloguecapital.com` routes through `memroos-oracle` to oracle-1.
- `scripts/verify-onboarding-deploy.sh` passes against the public hostname.
- Heroku custom domain is removed and web dynos are scaled to 0, or the remaining blocker is documented.
- Phase 166 Voyage remains unimplemented and out of scope.
