# Secrets & Durability Runbook

> **Phase 147 — FLEET-22..26.** This runbook documents the MemroOS secrets
> path, kernel durability, LangGraph checkpoint durability, stretch
> multi-machine identity (not v8.5), and the auto-provision industry gap.
> It is the final phase of the v8.5 Agent Fleet Plane milestone.

## FLEET-22: Secrets Path

### Where Adapter API Keys Live Today

MemroOS uses environment variables for all secrets. No secrets are stored in
git, in configuration files, or in audit receipts. The canonical secret
locations are:

| Secret | Env Var | Location | Purpose |
|--------|---------|----------|---------|
| Operator API key | `MEMROOS_OPERATOR_API_KEY` | `.env.local` (gitignored) or Heroku config var | Protects operator-privileged registry writes (`authorizeRegistryWrite` in `operator-auth.ts`) |
| JWT signing secret | `MEMROOS_JWT_SECRET` | `.env.local` (gitignored) | HS256 signing secret for JWT access tokens (team auth, Phase 63) |
| Onboarding signing secret | `MEMROOS_ONBOARDING_SECRET` | `.env.local` (gitignored) | HMAC-SHA256 signing secret for agent onboarding tokens (`agent-onboarding.ts`); falls back to `MEMROOS_OPERATOR_API_KEY` if unset |
| Vault key material | `MEMROOS_VAULT_KEY_PATH` | `~/.memroos/vault.key` (file, mode 0600) | AES-256-GCM wrapping key for envelope encryption of sensitive vault entries |
| Agent API keys | Per-agent, generated at provisioning | `~/.memroos/agent-keys/<agent-id>.key` (file, mode 0600) | Bearer keys for agent runtime writes; stored as SHA-256 hashes in `agent_api_keys` table |
| Paperclip integration | `PAPERCLIP_BASE_URL` | `.env.local` (gitignored) | Paperclip parallel tenant endpoint; no secrets — just a URL |
| Litestream credentials | `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` | Environment variables (sidecar container) | S3-compatible storage credentials for WAL replication |
| Qdrant Cloud | `QDRANT_API_KEY` | `.env.local` (gitignored) | Vector search cloud endpoint |
| Neo4j Aura | `NEO4J_PASSWORD` | `.env.local` (gitignored) | Graph database cloud endpoint |

**Key principle:** `.env.local` is gitignored. `.env.example` contains
placeholders only (`change-me`, `your-key-here`, `YOUR_*_HERE` patterns).
No real secret value ever appears in a committed file.

### How Agent API Keys Are Provisioned

Agent API keys are provisioned through two paths:

1. **`scripts/provision-agent-keys.sh`** — reads `agents.config.json`, ensures
   the SQLite schema (`registered_agents`, `agent_api_keys`,
   `agent_capabilities`, `agent_context_messages`), registers each agent,
   generates a per-agent bearer key (`ak_<agentId>_<32-random-bytes-base64url>`),
   stores the SHA-256 hash in `agent_api_keys`, and writes the plaintext key
   to `~/.memroos/agent-keys/<agent-id>.key` with mode 0600.

2. **Onboarding token flow** (`apps/memroos/src/lib/agent-onboarding.ts`) —
   the operator creates a signed onboarding token using
   `MEMROOS_ONBOARDING_SECRET` (or `MEMROOS_OPERATOR_API_KEY` as fallback).
   The token is an HMAC-SHA256-signed base64url payload with a 15-minute
   default TTL. The agent presents the token to the MemroOS MCP endpoint to
   receive its configuration. Token verification uses `crypto.timingSafeEqual`
   to prevent timing attacks.

**Key storage model:** the `agent_api_keys` table stores `key_prefix` (first
12 characters) and `key_hash` (SHA-256 of the full key). The plaintext key is
never stored in the database. Agents present the full key as a Bearer header;
the server hashes it and looks up the hash. Revoked keys have a `revoked_at`
timestamp.

### Envelope Encryption

The vault module (`apps/memroos/src/lib/vault/envelope.ts`) provides
AES-256-GCM envelope encryption for sensitive vault entries:

- **Wrapping key:** stored in `~/.memroos/vault.key` (mode 0600), managed by
  `LocalFileKeyProvider`. The key file contains a `currentKeyId` and a list
  of keys with `active`/`retired` status.
- **Data key:** a fresh 256-bit random key is generated per encryption. The
  data key is encrypted (wrapped) with the wrapping key using AES-256-GCM.
- **Envelope structure:** `VaultEncryptedEnvelope` contains the key ID, IV,
  auth tag, ciphertext, and the wrapped data key (with its own IV and tag).
- **Rotation:** `LocalFileKeyProvider.rotate()` generates a new wrapping key,
  marks the old one as `retired`, and updates `currentKeyId`. Existing
  envelopes can be re-wrapped with `rewrapVaultEnvelope()` to use the new
  wrapping key without re-encrypting the underlying plaintext.
- **Key selection:** `shouldEncryptVaultLabel()` decides whether a vault entry
  should be encrypted based on its `VaultLabel` — entries with `sensitivity`
  set, `visibility: "private"`, or `policy` in `sealed` /
  `requires_human_review` / `requires_redaction` are encrypted.

### Audit Receipt Hygiene

Policy receipts (POLGOV) never carry content, secrets, or auth headers. The
receipt shape (Phase 145 gate, `adapter-policy-gate.ts`) contains:

- `policyVersion` — the policy manifest version
- `domain` — policy domain (memory-use, capability, knowledge, gsd)
- `action` — the requested action
- `ruleMatched` — the rule that fired
- `outcome` — allow / deny / redact
- `reason` — human-readable denial reason (no sensitive content)
- `actorId` — the acting agent or operator identity
- `createdAt` — timestamp

The HTTP 403 response from the GSD adapter policy gate deliberately omits
`detail` and other internal fields. Audit rows are written via the POLGOV
receipt path and carry IDs, labels, codes, and reasons only — never raw
content, never auth headers, never secret values.

This is enforced by:
- `MEMSEC-08` security regression corpus (25/25 tests, Phase 78)
- POLGOV-02 receipt contract (Phase 128)
- The Phase 145 pre-execution policy gate (FLEET-13..16)

### Rotation Guidance

#### Rotating `MEMROOS_OPERATOR_API_KEY`

1. Generate a new key: `openssl rand -hex 32`
2. Update `.env.local` (local dev) or Heroku config var (production):
   ```
   MEMROOS_OPERATOR_API_KEY=<new-key>
   ```
3. Restart the MemroOS app.
4. Old key immediately fails auth (`authorizeRegistryWrite` returns false).
5. Update any scripts or tools that reference the old key.
6. No database migration needed — the key is compared in-memory at request
   time.

#### Rotating `MEMROOS_JWT_SECRET`

1. Generate a new secret: `openssl rand -base64 32`
2. Update `.env.local` or Heroku config var.
3. Restart the app.
4. All existing JWT tokens become invalid immediately (signature mismatch).
5. Users must re-authenticate.

#### Rotating Agent API Keys

1. Re-run `bash scripts/provision-agent-keys.sh` — the script revokes old
   keys (`revoke_other_keys_direct`) and generates new ones.
2. Old keys are marked `revoked_at` in `agent_api_keys` and fail auth.
3. New keys are written to `~/.memroos/agent-keys/<agent-id>.key` (mode 0600).
4. Update agent configurations to use the new keys:
   ```
   export MEMROOS_AGENT_API_KEY="$(cat ~/.memroos/agent-keys/<agent-id>.key)"
   ```

#### Rotating Vault Wrapping Keys

1. Call `LocalFileKeyProvider.rotate()` — generates a new key, retires the old.
2. Run `rewrapVaultEnvelope()` on existing encrypted entries to re-wrap with
   the new key.
3. The old key remains in the key file (status: `retired`) so legacy
   envelopes can still be decrypted if re-wrapping is incomplete.

### No Secrets in Git

- `.env.local` is in `.gitignore` — never committed.
- `.env.example` contains placeholders only: `change-me`, `your-key-here`,
  `YOUR_*_HERE` patterns, and commented-out examples.
- `services/orchestration/litestream.yml.example` uses `${LITESTREAM_*}`
  environment variable references — no hardcoded credentials.
- Audit receipts carry IDs, labels, codes, and reasons only — never content,
  never auth headers, never secret values (enforced by MEMSEC-08 and POLGOV-02).
- The `provision-agent-keys.sh` script stores keys in `~/.memroos/agent-keys/`
  with mode 0600 — outside the repo, never committed.
- Agent onboarding tokens are short-lived (15-minute default TTL) and signed
  with `MEMROOS_ONBOARDING_SECRET` — the token itself is not a secret, but
  the signing key is.

---

## FLEET-23: Kernel Durability

### Current State

The MemroOS kernel uses SQLite as its canonical registry store. The database
file lives at `data/conversations.db` (or `SQLITE_DB_PATH` env override). It
contains the agent registry, audit log, A2A task store, episodic memory,
agent context bus, telemetry, and governance tables. The schema is managed
by `apps/memroos/src/lib/db-schema.ts` with ordered `PRAGMA user_version`
migrations (ARCHREV-03, Phase 115, current schema version 10).

**Single-host limitation:** SQLite is a single-host database. In v8.5, the
kernel runs on one host. This is acceptable for the current deployment model
(single operator + agents on one or more machines communicating over
Tailscale/trusted LAN). Multi-host active-active is explicitly out of scope
for v8.5 (see FLEET-25).

### Litestream Path (Primary, Recommended for v8.5)

[Litestream](https://litestream.io/) is an MIT-licensed sidecar that
continuously replicates SQLite WAL frames to S3-compatible storage (AWS S3,
Cloudflare R2, MinIO, Backblaze B2). It works with the existing SQLite store
without any code changes.

**How it works:**
1. Litestream runs as a sidecar process alongside the MemroOS app.
2. It monitors the SQLite WAL file and replicates new frames to the remote
   replica at a configurable sync interval (default: 1s).
3. On host loss, the DB can be restored from the remote replica.

**Configuration:**
- The litestream config example for the orchestration DB is at
  `services/orchestration/litestream.yml.example` (Phase 144, FLEET-11).
- The same pattern applies to the kernel DB — create a `litestream.yml` that
  points at `data/conversations.db` and replicates to a separate S3 path.
- Credentials are passed via environment variables (`LITESTREAM_ACCESS_KEY_ID`,
  `LITESTREAM_SECRET_ACCESS_KEY`) — never hardcoded.
- The `.env.example` file documents the litestream env vars as placeholders.

**Kernel DB litestream config (example):**

```yaml
dbs:
  - path: /data/conversations.db
    replicas:
      - type: s3
        bucket: ${LITESTREAM_BUCKET}
        path: kernel
        endpoint: ${LITESTREAM_ENDPOINT}
        region: ${LITESTREAM_REGION}
        access-key-id: ${LITESTREAM_ACCESS_KEY_ID}
        secret-access-key: ${LITESTREAM_SECRET_ACCESS_KEY}
        sync-interval: 1s
```

**Restore from litestream:**
```bash
litestream restore -config litestream.yml -o data/conversations.db
```

### Postgres Migration Path (Future, Not v8.5)

A future option is migrating the kernel DB to Postgres for multi-host
active-active deployments. This is **documented but not implemented** in v8.5.

Migration path (high-level):
1. Provision a Postgres instance (self-hosted or managed).
2. Write a schema migration script that creates the equivalent tables in
   Postgres (the SQLite schema is well-structured with typed columns and
   indexes).
3. Run a one-time data migration from SQLite to Postgres.
4. Update `getDb()` in the kernel to use a Postgres driver instead of
   `better-sqlite3`.
5. Update all SQL queries to Postgres-compatible syntax (minimal changes
   expected — the schema avoids SQLite-specific features beyond
   `PRAGMA user_version`).

This is a future milestone decision, not a v8.5 deliverable. Litestream
replication provides sufficient durability for the current single-host
deployment model.

### Restore Drill

The restore drill script is at `scripts/restore-drill.sh`. It:

1. Creates a consistent backup of the kernel DB using `sqlite3 .backup`
   (read-only on the source — does not touch the production DB).
2. Creates a restore copy from the backup (simulates restoring from a
   litestream replica or file backup).
3. Verifies the restored DB:
   - `PRAGMA integrity_check` — confirms the DB is not corrupt.
   - Counts `registered_agents` — confirms the agent registry survived.
   - Counts `audit_log` entries — confirms the audit trail survived.
   - Counts `audit_entries` (POLGOV receipts) — confirms policy receipts
     survived.
   - Reads `PRAGMA user_version` — confirms the schema version is intact.
   - Counts total tables — confirms the schema is complete.
4. Tests the orchestration DB if it exists (or skips with a note).
5. Logs all steps to stdout and a log file.
6. Exits 0 on success, non-zero on failure.

**Run the drill:**
```bash
bash scripts/restore-drill.sh
```

The drill log is saved to `.planning/phases/147-secrets-fleet-ha/restore-drill-log.md`.

**If the kernel DB doesn't exist (fresh checkout):** the script creates a
minimal test DB with the required tables (`registered_agents`, `audit_log`,
`audit_entries`) and one test row each, then runs the drill against that.

---

## FLEET-24: LangGraph Checkpoint Durability

### Alignment with Phase 144 (FLEET-11)

LangGraph checkpoint durability was established in Phase 144 (FLEET-11). The
key artifacts are:

- **`services/orchestration/litestream.yml.example`** — litestream
  replication config for `data/orchestration.db` (the LangGraph checkpoint
  store). Replicates to S3-compatible storage with 1s sync interval.
- **`docs/integrations/langgraph.md`** → "Checkpoint Durability" section —
  documents Option A (litestream, primary for v8.5) and Option B (Postgres
  checkpointer, future flag). Includes restore drill steps for the
  orchestration DB.
- **SQLite ownership split** — the MemroOS kernel DB
  (`apps/memroos/data/conversations.db` or `data/conversations.db`) and the
  LangGraph orchestration DB (`data/orchestration.db`) are separate files
  owned by separate layers. Litestream replicates each file independently.

### Restore Drill Coverage

The `scripts/restore-drill.sh` script (FLEET-23) covers both databases:

- **Kernel DB** (`data/conversations.db`): always drilled (or creates a
  minimal test DB if missing).
- **Orchestration DB** (`data/orchestration.db`): drilled if present. If the
  LangGraph orchestration service is not running and the DB doesn't exist,
  the drill logs a skip note explaining that the orchestration DB is created
  on first startup of the Python service and that litestream replication
  config is available at `services/orchestration/litestream.yml.example`.

This ensures the restore drill is idempotent and can run in any environment
(dev, CI, production) without requiring both services to be running.

---

## FLEET-25: Stretch Multi-Machine Identity (Not v8.5)

### SPIFFE/SPIRE + Envoy Rate-Limit

**Status: explicitly not v8.5. Documented as future stretch work only.**

At 50+ machine fleet scale, the industry-standard identity and rate-limiting
stack is:

- **SPIFFE/SPIRE** (CNCF, Apache 2.0) — provides cryptographic identity for
  workloads across machines. Each agent host gets a SPIFFE Verifiable
  Identity Document (SVID). Services verify identity through the SPIRE
  agent/server infrastructure. This replaces ad-hoc API key sharing with
  short-lived, automatically rotated cryptographic identities.

- **Envoy + rate-limit service** — Envoy proxy with a rate-limit filter
  provides per-identity, per-route rate limiting. The rate-limit service
  (e.g. `envoyproxy/ratelimit`) reads rules from a config file or external
  store and enforces limits at the proxy layer.

### Why Not v8.5

1. **Current scope:** MemroOS runs on a single host with agents on one or
   more machines communicating over Tailscale or a trusted LAN. The
   deployment model does not require cryptographic workload identity or
   proxy-layer rate limiting. API keys + loopback detection
   (`operator-auth.ts`) + per-agent bearer keys provide sufficient
   authentication for the current fleet size.

2. **Complexity:** SPIFFE/SPIRE requires a SPIRE server, SPIRE agents on
   each host, a registration API, and SVID rotation logic. Envoy requires a
   proxy deployment, filter configuration, and a rate-limit service. This is
   a significant infrastructure investment that is not justified at current
   scale.

3. **Industry context:** 50-machine fleet identity is a solved problem in
   industry (SPIFFE/SPIRE is production-ready at Google, Bloomberg, Square,
   and others), but it is overkill for MemroOS's current single-host SQLite
   deployment. The v8.5 durability story is: single-host SQLite + litestream
   replication to S3-compatible storage. Multi-cluster identity is future
   work.

4. **Dependencies:** SPIRE and Envoy are external infrastructure
   dependencies that would need to be deployed, configured, and maintained.
   The v8.5 milestone avoids new runtime dependencies (hard constraint).

**Future trigger:** SPIFFE/SPIRE + Envoy rate-limiting becomes relevant when
MemroOS moves to multi-host active-active deployment (Postgres kernel,
multiple operator instances, 50+ agent machines). That is a future milestone
beyond v8.5.

---

## FLEET-26: Auto-Provision Out of Scope

### Paperclip Audit Finding

The Paperclip control-plane audit (`content/audits/paperclip-control-plane-audit-2026-07-08.md`,
Phase 146, FLEET-21) established that:

- **Paperclip does not provision agent hosts.** Paperclip owns companies,
  issues, budgets, and board UI — it does not create or configure agent
  runtime machines. The runtime must already exist.
- **Hermes/OpenClaw adapter behavior is passive:** adapters connect to
  existing runtimes; they do not provision new ones. This is documented in
  `docs/integrations/paperclip.md` (FLEET-21).

### Industry Gap

Auto-provisioning new agent hosts on demand — spinning up a new Mac, VM, or
container, installing the agent runtime, configuring it with the correct
MCP endpoints, API keys, and skill sets, and registering it with the fleet
plane — is an industry gap. None of the surveyed platforms own it cleanly:

| Platform | Auto-provision support | Gap |
|----------|----------------------|-----|
| Paperclip | No — passive adapters, runtime must exist | Does not provision hosts |
| LangGraph | No — orchestration runtime, not infrastructure provisioning | Does not provision hosts |
| Archestra | Partial — AGPL, infrastructure-heavy | License + complexity barriers |
| CrewAI ACP | No — cloud-only, no self-hosted provisioning | Cloud-only, not self-hosted |
| Factory Droid | Partial — can create environments but does not auto-register with MemroOS | Not integrated with fleet plane |

### Explicit Out-of-Scope Statement

**Auto-provisioning of new agent hosts on demand is explicitly out of scope
for v8.5.** This is an industry gap that requires infrastructure automation
(Terraform, Ansible, MDM, cloud APIs) that is beyond the MemroOS fleet
plane's responsibility. Operators must provision and configure agent hosts
manually (or through their existing infrastructure automation) before
registering them with MemroOS via `scripts/provision-agent-keys.sh` or the
onboarding token flow.

**Future consideration:** A future milestone could add a "host provisioning
contract" that integrates with infrastructure automation tools (Terraform,
Ansible, MDM) to automate the "runtime must already exist" prerequisite.
This would be a separate milestone, not part of the v8.5 Agent Fleet Plane.

---

## Verification

The following verification was performed for Phase 147:

| Check | Command | Result |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` | See phase summary |
| Lint | `cd apps/memroos && npm run lint` | 37 pre-existing warnings, 0 errors |
| MEMSEC-08 regression | `npm test -- --run src/lib/policy/__tests__/regression.test.ts` | 25/25 pass |
| Restore drill | `bash scripts/restore-drill.sh` | Exit 0, all checks pass |
| Contract manifest | `npm run check:contracts` | See phase summary |

---

## Cross-References

- [LangGraph Peer Contract](integrations/langgraph.md) — checkpoint durability section (Phase 144)
- [Architecture](architecture.md) — fleet plane subsection
- [Paperclip Integration](integrations/paperclip.md) — passive adapter behavior (Phase 146)
- [Runtime Adapter Maturity](runtime-adapter-maturity.md) — T1/T2/T3 classification (Phase 143)
- Envelope encryption: `apps/memroos/src/lib/vault/envelope.ts`
- Agent onboarding: `apps/memroos/src/lib/agent-onboarding.ts`
- Operator auth: `apps/memroos/src/lib/operator-auth.ts`
- Key provisioning: `scripts/provision-agent-keys.sh`
- Restore drill: `scripts/restore-drill.sh`
- Litestream example: `services/orchestration/litestream.yml.example`
- Env var patterns: `.env.example`
