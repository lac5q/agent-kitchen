# VibeProxy — config error & 502 troubleshooting

_2026-07-24 — Luis fix session_

## Symptom

VibeProxy menu bar app shows a red "Configuration Error" banner:

> Failed to parse YAML at `/Applications/VibeProxy.app.disabled/Contents/Resources/config.yaml`. The file "config.yaml" couldn't be opened because there is no such file.

Every API call to `https://vibeproxy.epiloguecapital.com/v1/...` returns HTTP 502.

## Root cause

The macOS LaunchAgent at `~/Library/LaunchAgents/com.local.cli-proxy-api.plist` points the backend (`cli-proxy-api-plus`) at a path that no longer exists on disk:

- `/Applications/VibeProxy.app.disabled/Contents/Resources/cli-proxy-api-plus` ← missing

The actual app is installed at `/Applications/VibeProxy.app` (no `.disabled` suffix). The plist was created by an older install and was never updated when the live bundle was renamed.

Result: launchd launches a binary from a path that doesn't exist → the process can't find its bundled `config.yaml` → backend returns 502 on every request.

## The fix (smallest, cleanest)

1. Unload + patch + reload the LaunchAgent. Don't reinstall.

```bash
# Kill anything currently running
pkill -f 'cli-proxy-api-plus'
pkill -f 'CLIProxyMenuBar'

# Unload the stale plist
launchctl unload ~/Library/LaunchAgents/com.local.cli-proxy-api.plist

# Edit the plist: replace `.app.disabled` with `.app`
# Old: /Applications/VibeProxy.app.disabled/Contents/Resources/cli-proxy-api-plus
# New: /Applications/VibeProxy.app/Contents/Resources/cli-proxy-api-plus

# Reload
launchctl load ~/Library/LaunchAgents/com.local.cli-proxy-api.plist
```

2. Verify the proxy is actually up and serving:

```bash
# Check the listening process
lsof -i :8318 -sTCP:LISTEN

# Check the model catalog
curl -s https://vibeproxy.epiloguecapital.com/v1/models | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))"

# Test a real chat call
curl -s -X POST https://vibeproxy.epiloguecapital.com/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"MiniMax-M3","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'
```

## Important: 502s can mean TWO different things

After the config fix, you may still see 502s. Two flavours:

- **Stale / missing auth on individual providers.** Look at `~/.cli-proxy-api/logs/standalone.log` for `Token refresh failed … refresh_token_invalidated`. The Codex auth file frequently rotates — re-auth via the GUI's "Add Account" button. Kimi / antigravity / claude entries also have refresh cycles.

- **The gateway itself is down.** Look for `proxy service exited with error: failed to start HTTP server: listen tcp 127.0.0.1:8318: bind: address already in use`. That means two processes are fighting for the port — kill the old one and let launchd respawn the new one.

## Files involved

- `~/Library/LaunchAgents/com.local.cli-proxy-api.plist` — the path to patch
- `/Applications/VibeProxy.app/Contents/Resources/config.yaml` — the real config (embedded in the app bundle, do NOT edit by hand; the GUI regenerates `~/.cli-proxy-api/merged-config.yaml`)
- `~/.cli-proxy-api/merged-config.yaml` — the live config the proxy reads (auto-merged from GUI)
- `~/.cli-proxy-api/*.json` — one auth file per provider (claude-luis@…, codex-luis@…, kimi-…, etc.)
- `~/.cli-proxy-api/logs/standalone.log` — main log (grows fast; consider log rotation)

## Don't reinstall VibeProxy unless the plist path fix doesn't work

The reinstall would re-create the same broken LaunchAgent unless the upstream installer has been updated. The plist edit is the durable fix.
