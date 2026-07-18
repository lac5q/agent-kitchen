# oracle-1 Live Cutover Verification

- **Document version:** 2026-07-18.2
- **Creation date/time (UTC):** 2026-07-18T09:06:00Z
- **Update date/time (UTC):** 2026-07-18T10:25:00Z
- **Sources:** Tailscale API (`TAILSCALE_API_KEY` / 1Password), userspace Tailscale client, Cloudflare API, Heroku API, public operator URL, on-host SSH session as `opc@oracle-1`

## Summary

v8.15 Phases 163–165 operator cutover is **live**. Cursor Cloud joined the Luis tailnet with the Tailscale API key, reached `oracle-1`, enabled **Tailscale SSH** (`sudo tailscale set --ssh --accept-risk=lose-ssh`), installed the agent pubkey, fast-forwarded host `main`, fixed a blocking `model-usage` type error, rebuilt, and restarted units.

## SSH path (working)

```bash
# Tailscale SSH (preferred after host enablement)
sudo tailscale --socket=/var/run/tailscale/tailscaled.sock ssh opc@oracle-1 -- 'hostname; whoami'

# Helper
bash scripts/ssh-oracle1.sh 'hostname; whoami'
```

ACL (tailnet): accept `luis@` → `luis@` as `opc` / `lcalderon` / `ubuntu` / `root` / `autogroup:nonroot`.

## On-host evidence (2026-07-18T10:20Z)

| Check | Result |
|-------|--------|
| Tailscale SSH `opc@oracle-1` | **PASS** (`TS_SSH_OK` / `FINAL_OK`) |
| Units `memroos-web` `memroos-mem0` `ollama` `cloudflared` | **active** |
| Ollama `nomic-embed-text` embed smoke | **PASS** (`embeddingLength` 768) |
| Disk free | **7.1G** (≥5G) |
| `MEMROOS_EMBEDDING_PROVIDER` | `ollama` |
| Local onboarding bad token | **403** |
| Local `/api/health` | mem0/graph/agents/APO **up** |
| Host git | `main` @ `a755daa` (+ local type fix for build) |

## Public checks

| Check | Result |
|-------|--------|
| `scripts/verify-onboarding-deploy.sh` | PASS (HTTP 403) |
| Cloudflare tunnel `memroos-oracle` | healthy → `:3000` |
| Heroku `memroos-agent-onboarding` | `web=0`, no custom domain |

## Notes

- OCI PEM for console API remains Mac-only; not required once Tailscale SSH works.
- Host had dirty WIP stashed as `cursor-cloud-2026-07-18` before `git pull --ff-only`.
- Build required arm64 optional natives: `lightningcss-linux-arm64-gnu`, `@tailwindcss/oxide-linux-arm64-gnu`.
- Voyage / Phase 166 still out of scope.
