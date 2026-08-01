# Buzz (Block/Square Nostr relay) — Cloudflare setup on Maeve-u1
**Date:** 2026-07-23
**Author:** Alba (Hermes agent, taking over from Sophia Hermes)
**Result:** ✅ `https://buzz.internal.example` live, returns **HTTP 200** NIP-11 relay info JSON for Nostr clients AND **HTTP 200** `text/html` SPA shell for browsers. No second hostname needed.

## What Sophia tried
Installed `buzz-relay` on Maeve-u1 in Docker (`buzz-relay:latest` container, port 3000, plus `buzz-postgres` + `buzz-redis`).
Then added a `buzz.internal.example` ingress rule to **`/home/<user>/.cloudflared/config-maria.yml`** (the `maria-hermes` tunnel, UUID `faa2bde0-…`) on the Maeve box.

## Root cause (2 layers)

1. **Wrong tunnel.** `config-maria.yml` drives the `maria-hermes` tunnel, which connects from a different origin host (the Mac, `origin_ip: 24.165.86.146`). The relay runs on Maeve-u1. Even with DNS, traffic would have hit the Mac's localhost:3000 — which has `cclens`, not buzz. The correct Maeve-side tunnel was the **`pc2` tunnel** (`02308b1d-…`), already healthy, already running the same cloudflared process on Maeve that watches `pc2-config.yml`.

2. **DNS record never created.** No CNAME for `buzz.internal.example` existed in zone `5aea7fa6c749d5d91cba6aa330a446f4`. She only edited the local cloudflared config; she didn't run any DNS API call or `cloudflared tunnel route dns`.

(Not her fault: the relay WAS already running and healthy in Docker — the symptom looked like a service problem, but the service was fine. So she kept tinkering with config when the problem was DNS + tunnel routing.)

## Fix applied
1. **DNS:** POST `/zones/{zid}/dns_records` → `CNAME buzz → 02308b1d-….cfargotunnel.com` (proxied). Record id `eb06933aa529075b273f1346bb0c9faf`.
2. **Ingress rule:** added `buzz.internal.example → http://<maeve-tailnet-ip>:3000` to `/home/<user>/.cloudflared/pc2-config.yml`, **before the catch-all 404**. Cloudflared watches the file and reloads automatically — no restart.
3. **Cleanup:** removed the `buzz` rule from `config-maria.yml` so it doesn't haunt the next person.
4. **Verify (first time):** `curl https://buzz.internal.example/` → `HTTP 404` with **empty body**. I read this as "tunnel is working, relay answers with its own 404" — wrong. The relay's actual response body is 47 bytes of JSON. The empty-body 404 was Cloudflare's edge, not the relay. **Lesson: always check response body, not just status code.** See "Follow-up" below.

## Follow-up: restart required to push config to Cloudflare edge
**Date:** 2026-07-23 22:23–23:26 (same day)

After step 2 above (editing `pc2-config.yml`), my HTTPS verification returned 404 and I declared it done. Luis reported the page wasn't loading — screenshot showed Cloudflare's sad-face 404, not the relay's 404.

**Real root cause:** `cloudflared tunnel run` does **NOT** push config changes to Cloudflare's edge automatically. The local YAML is re-read for live routing (so live requests to known hostnames still hit the right backend), but Cloudflare's `cfd_tunnel/{id}/configurations` API table keeps the old config and **edge-404s on any hostname it doesn't know about** — even if the running cloudflared process would happily route it.

**Proof:**
- Before restart: `GET /accounts/{a}/cfd_tunnel/{t}/configurations` → version 2, only `pc2` ingress
- After restart (kill + relaunch with same command): version 3, both `pc2` AND `buzz` ingress, `created_at: 2026-07-23T23:25:10Z`

**Fix:**
```bash
# On the host running cloudflared (Maeve-u1 in this case):
ssh maeve-u1
ps -ef | awk '/[c]loudflared tunnel.*pc2-config.yml/ {print $2; exit}' | xargs -r kill
sleep 2
setsid bash -c '/usr/local/bin/cloudflared tunnel --config ~/.cloudflared/pc2-config.yml --logfile /tmp/cloudflared-pc2.log --no-autoupdate run </dev/null >/dev/null 2>&1 &'
# OR: pkill -f cloudflared.pc2-config.yml  (will also match any SSH session whose cmdline contains that string — dangerous)
```

**Verify the edge config picked it up:**
```bash
curl -s -H "Authorization: Bearer <token>" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel/$TUNNEL/configurations" \
  | jq '.result.config.ingress[] | {hostname, service}'
```

**Final verify (after restart):** `curl https://buzz.internal.example/` → `HTTP 200` with NIP-11 relay info: `{"name":"Buzz Relay","description":"Buzz — private team communication relay","software":"https://github.com/block/buzz", ...}`.

## Key pitfall — save this one
**Editing `~/.cloudflared/*.yml` while `cloudflared tunnel run` is alive does NOT propagate to Cloudflare's edge.** You must restart the cloudflared process (it pushes config to the edge on startup). The local file is read for ingress routing live, but Cloudflare's edge uses its own `cfd_tunnel/{id}/configurations` table to decide which hostnames this tunnel serves; unknown hostnames get a Cloudflare-origin 404 even when DNS resolves correctly and the connector is healthy.

## Web UI on the same hostname (2026-07-23, same day)

Initial setup only exposed the **relay API**. Browsers hitting `https://buzz.internal.example/` got the NIP-11 JSON (because the relay hard-wires `/` to the Nostr/NIP-11 handler — `/` never reaches the SPA fallback, see `crates/buzz-relay/src/router.rs:63,256`).

**Fix:** set **`BUZZ_SERVE_GIT_WEB_GUI=true`** in the relay container. The `BUZZ_WEB_DIR` env var already points at `/srv/buzz/web` (a prebuilt `dist/` shipped in the image). With this flag, the relay serves `index.html` at `/` to browsers (`Accept: text/html`) and the SPA fallback serves all other paths. Nostr clients still get NIP-11 because they send `Accept: application/nostr+json`. Same port (3000), same hostname. No reverse proxy needed.

```bash
# Recreate the relay container with the flag (no image rebuild — env-only):
docker rm -f buzz-relay
docker run -d --name buzz-relay --network buzz-net \
  -e DATABASE_URL=postgres://buzz_dev:buzz_dev@172.18.0.2:5432/buzz \
  -e REDIS_URL=redis://172.18.0.3:6379 \
  -e BUZZ_BIND_ADDR=0.0.0.0:3000 \
  -e RELAY_URL=wss://buzz.internal.example \
  -e BUZZ_WEB_DIR=/srv/buzz/web \
  -e BUZZ_ADMIN_WEB_DIR=/srv/buzz/admin-web \
  -e BUZZ_SERVE_GIT_WEB_GUI=true \   # <-- the one new flag
  -e RUST_LOG=buzz_relay=info \
  -e AWS_ACCESS_KEY_ID=buzz_dev -e AWS_SECRET_ACCESS_KEY=buzz_dev_secret \
  -e AWS_REGION=us-east-1 -e BUZZ_S3_BUCKET=buzz-media \
  -e BUZZ_S3_ENDPOINT=http://172.18.0.4:9000 -e BUZZ_S3_FORCE_PATH_STYLE=true \
  --restart unless-stopped -p 3000:3000 buzz-relay:latest
```

**If `BUZZ_WEB_DIR` weren't already populated in the image**, you'd need to build locally and either rebuild the image or mount the dist:
```bash
ssh maeve-u1
cd /home/<user>/github/buzz
. ./bin/activate-hermit
(cd web && pnpm install --prefer-offline && pnpm build)
# then mount web/dist into the container via -v /home/<user>/github/buzz/web/dist:/srv/buzz/web
# OR rebuild the image with the dist baked in (Dockerfile COPY).
```

**Verify (raw socket, in case curl tunnels don't behave):**
```bash
python3 -c '
import socket
s = socket.socket(); s.settimeout(5)
s.connect(("127.0.0.1", 3000))
s.sendall(b"GET / HTTP/1.1\r\nHost: x\r\nAccept: text/html\r\nConnection: close\r\n\r\n")
print(s.recv(4096)[:600].decode())
'
```
Expected: `HTTP/1.1 200 OK\r\ncontent-type: text/html; charset=utf-8` + `<!doctype html><html lang="en"><head>...<title>Buzz</title>...`.

## Key pitfall #2 — `BUZZ_SERVE_GIT_WEB_GUI`
The flag's name suggests it's about serving a Git web GUI, but the code path at `router.rs:256` actually enables **the SPA fallback at `/` for any `Accept: text/html` browser request**. Misnomer; the right knob for "give me the web UI on the same hostname as the relay".

## Recipe for future agents adding a Maeve-u1 service to *.epiloguecapital.com

```bash
# On the Mac, get token + zone id (no 1Password lookup):
python3 -c "
import json, base64
print(open('/Users/<you>/.cloudflared/cert.pem').read().splitlines())
" | head -1   # or use the documented decoder in cloudflare skill

# 1. Add DNS CNAME — use the existing PC2 tunnel target (simplest path).
#    Target: 02308b1d-b7ee-4354-9ca6-5680e9bb30dc.cfargotunnel.com
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE>/dns_records" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"<sub>","content":"02308b1d-b7ee-4354-9ca6-5680e9bb30dc.cfargotunnel.com","proxied":true}'

# 2. Add ingress rule to pc2-config.yml on Maeve-u1 (BEFORE the catch-all 404):
#    - hostname: <sub>.epiloguecapital.com
#      service: http://<maeve-tailnet-ip>:<port>
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
| `pc2-config.yml` | `pc2` | `02308b1d-…` | Maeve Tailscale `<maeve-tailnet-ip>` | Anything running **on Maeve** (most new services) |
| `config-maria.yml` | `maria-hermes` | `faa2bde0-…` | `24.165.86.146` (Mac) | Services running on the **Mac** |

If the service listens on `<maeve-tailnet-ip>:<port>` on Maeve → use `pc2-config.yml`.
If the service runs on the Mac and listens on `localhost:<port>` → use `config-maria.yml`.
The Mac's main `ollama-mac` tunnel (`e75e37b5-…`) is also an option when the Mac has the service.

## Pitfalls hit
- **The big one (above):** editing the YAML while cloudflared runs doesn't push to edge. Restart required.
- Don't add the hostname to BOTH tunnels. They'll fight.
- Don't `cloudflared tunnel create` again — credential file collision will fail. Use existing tunnels.
- **Verification gotcha:** an HTTP 404 from Cloudflare with **empty body** is an edge 404 (host not in tunnel config). An HTTP 404 from Cloudflare with a **body** is your origin answering. Always check `curl -i` body, not just status.
- `pkill -f "cloudflared.pc2-config.yml"` will also kill any SSH session whose command line contains that literal string (because SSH wraps the remote command in `bash -c "..."`). Use `ps -ef | awk '/[c]loudflared tunnel.*pc2-config.yml/ {print $2}' | xargs -r kill` to only target the binary.
- **Relay `/` is NIP-11 hard-wired** unless `BUZZ_SERVE_GIT_WEB_GUI=true` is set. Without it, browsers see the relay's Nostr JSON instead of the SPA. Setting it makes the relay serve `web_dir/index.html` to `Accept: text/html` requests; Nostr clients still get NIP-11 because they send `Accept: application/nostr+json`. WS upgrade still works because the WS check runs before the HTML branch (router.rs:256+).
- **curl HTTP 000 from this SSH session** kept showing false negatives during debugging. Raw `python3 socket` worked fine. If you see 000 with empty body from a long-lived SSH session, suspect the SSH session's TCP buffering, not the server.
