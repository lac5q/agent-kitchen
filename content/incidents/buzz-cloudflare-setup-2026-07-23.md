# Buzz (Block/Square Nostr relay) — Cloudflare setup on Maeve-u1
**Date:** 2026-07-23
**Author:** Alba (Hermes agent, taking over from Sophia Hermes)
**Result:** ✅ `https://buzz.epiloguecapital.com` live, returns relay 404 ("no community is configured")

## What Sophia tried
Installed `buzz-relay` on Maeve-u1 in Docker (`buzz-relay:latest` container, port 3000, plus `buzz-postgres` + `buzz-redis`).
Then added a `buzz.epiloguecapital.com` ingress rule to **`/home/lac5q/.cloudflared/config-maria.yml`** (the `maria-hermes` tunnel, UUID `faa2bde0-…`) on the Maeve box.

## Root cause (2 layers)

1. **Wrong tunnel.** `config-maria.yml` drives the `maria-hermes` tunnel, which connects from a different origin host (the Mac, `origin_ip: 24.165.86.146`). The relay runs on Maeve-u1. Even with DNS, traffic would have hit the Mac's localhost:3000 — which has `cclens`, not buzz. The correct Maeve-side tunnel was the **`pc2` tunnel** (`02308b1d-…`), already healthy, already running the same cloudflared process on Maeve that watches `pc2-config.yml`.

2. **DNS record never created.** No CNAME for `buzz.epiloguecapital.com` existed in zone `5aea7fa6c749d5d91cba6aa330a446f4`. She only edited the local cloudflared config; she didn't run any DNS API call or `cloudflared tunnel route dns`.

(Not her fault: the relay WAS already running and healthy in Docker — the symptom looked like a service problem, but the service was fine. So she kept tinkering with config when the problem was DNS + tunnel routing.)

## Fix applied
1. **DNS:** POST `/zones/{zid}/dns_records` → `CNAME buzz → 02308b1d-….cfargotunnel.com` (proxied). Record id `eb06933aa529075b273f1346bb0c9faf`.
2. **Ingress rule:** added `buzz.epiloguecapital.com → http://100.109.19.110:3000` to `/home/lac5q/.cloudflared/pc2-config.yml`, **before the catch-all 404**. Cloudflared watches the file and reloads automatically — no restart.
3. **Cleanup:** removed the `buzz` rule from `config-maria.yml` so it doesn't haunt the next person.
4. **Verify:** `curl https://buzz.epiloguecapital.com/` → `HTTP 404 {"relay":"no community is configured for this host"}` = relay itself answering through the tunnel.

## Recipe for future agents adding a Maeve-u1 service to *.epiloguecapital.com

```bash
# On the Mac, get token + zone id (no 1Password lookup):
python3 -c "
import json, base64
print(open('/Users/lcalderon/.cloudflared/cert.pem').read().splitlines())
" | head -1   # or use the documented decoder in cloudflare skill

# 1. Add DNS CNAME — use the existing PC2 tunnel target (simplest path).
#    Target: 02308b1d-b7ee-4354-9ca6-5680e9bb30dc.cfargotunnel.com
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE>/dns_records" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"<sub>","content":"02308b1d-b7ee-4354-9ca6-5680e9bb30dc.cfargotunnel.com","proxied":true}'

# 2. Add ingress rule to pc2-config.yml on Maeve-u1 (BEFORE the catch-all 404):
#    - hostname: <sub>.epiloguecapital.com
#      service: http://100.109.19.110:<port>
#      originRequest:
#        noTLSVerify: true
#    Cloudflared watches the file — no restart needed.

# 3. Verify:
curl -sI https://<sub>.epiloguecapital.com/
```

## How to choose which tunnel
The Maeve box has TWO cloudflared processes:
| Config | Tunnel name | Tunnel UUID | Origin IP | Use for |
|--------|------------|-------------|-----------|---------|
| `pc2-config.yml` | `pc2` | `02308b1d-…` | Maeve Tailscale `100.109.19.110` | Anything running **on Maeve** (most new services) |
| `config-maria.yml` | `maria-hermes` | `faa2bde0-…` | `24.165.86.146` (Mac) | Services running on the **Mac** |

If the service listens on `100.109.19.110:<port>` on Maeve → use `pc2-config.yml`.
If the service runs on the Mac and listens on `localhost:<port>` → use `config-maria.yml`.
The Mac's main `ollama-mac` tunnel (`e75e37b5-…`) is also an option when the Mac has the service.

## Pitfalls hit
- Don't add the hostname to BOTH tunnels. They'll fight.
- Don't `cloudflared tunnel create` again — credential file collision will fail. Use existing tunnels.
- `cloudflared` watches `pc2-config.yml` — write, don't restart.
- Buzz relay's `/` returns 404 with body `relay: no community is configured for this host` — **that's the success signal**, not a failure. The WS endpoint is `/`, NIP-11 info is at `/v1/info` (or similar per Nostr NIPs).
