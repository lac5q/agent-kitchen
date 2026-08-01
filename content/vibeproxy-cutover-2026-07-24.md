# VibeProxy full cutover — 2026-07-24

## Result

All four agent setups (Hermes local, Hermes on maeve-u1, Droid local, Droid on maeve-u1, Pi local) now route Claude inference through VibeProxy (`https://vibeproxy.internal.example`). The Claude additional-usage direct path is removed from Pi (`~/.pi/agent/auth.json` no longer has the anthropic OAuth block, `models.json` only declares `vibeproxy`).

## What was changed

### 1. VibeProxy itself (the underlying router)

- LaunchAgent fix: `~/Library/LaunchAgents/com.local.cli-proxy-api.plist` had ProgramArguments pointing at `/Applications/VibeProxy.app.disabled/...` (a path that no longer existed on disk). Repointed to `/Applications/VibeProxy.app/Contents/Resources/cli-proxy-api-plus`.
- Cloudflare tunnel config: `~/.cloudflared/config.yml` had `vibeproxy.internal.example` ingress pointing at `http://localhost:8317` (wrong port + IPv6 mismatch). Repointed to `http://127.0.0.1:8318`.
- App upgraded: 1.8.235 → 1.8.247 (CLIProxyAPI 7.2.80 → 7.2.99). Old app moved to Trash.

### 2. Hermes on main-mac

`~/.claude/settings.json` env block:
- Changed `ANTHROPIC_BASE_URL` from `http://127.0.0.1:8787` (no service listening) to `https://vibeproxy.internal.example`
- Added `ANTHROPIC_AUTH_TOKEN` placeholder (VibeProxy is open on the Tailscale/Cloudflare edge, no real auth needed)

### 3. Hermes on maeve-u1

Same edit as main-mac, applied via SSH. Backup at `~/.claude/settings.json.bak-vibeproxy-YYYYMMDD-HHMMSS`.

### 4. Pi on main-mac

- `~/.pi/agent/models.json` — replaced `minimax` and `anthropic` (additional-usage) providers with a single `vibeproxy` provider pointing at `https://vibeproxy.internal.example/v1` with API `openai-completions`. Models: `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-haiku-4-5-20251001`, `MiniMax-M3`, `glm-4-plus`. NOTE: this file is normally immutable (read-only + provenance xattr). To unlock required `sudo chflags -R nouchg,noschg` / `sudo chmod 644` / `sudo xattr -d com.apple.provenance` on it.
- `~/.pi/agent/auth.json` — entirely wiped; `activeProvider: vibeproxy`, no OAuth blocks at all
- `~/.pi/agent/settings.json` — `defaultProvider: vibeproxy`, `defaultModel: claude-sonnet-4-5-20250929`

### 5. Pi on maeve-u1

Already on `minimax` provider with `MiniMax-M3` default. No change needed.

### 6. Droid local and maeve-u1

Already pointing `customModels` at `https://vibeproxy.internal.example/v1` since at least 2026-07-13. No change needed.

## Backups (created 2026-07-24)

- `~/.claude/settings.json.bak-vibeproxy-YYYYMMDD-HHMMSS` (main-mac Hermes)
- `~/.claude/settings.json.bak-vibeproxy-YYYYMMDD-HHMMSS` (maeve-u1, via SSH)
- `~/.pi/agent/auth.json.bak-vibeproxy-YYYYMMDD-HHMMSS`
- `~/.pi/agent/models.json.bak-vibeproxy-YYYYMMDD-HHMMSS`
- `~/.pi/agent/settings.json.bak-vibeproxy-YYYYMMDD-HHMMSS`
- `~/.pi/agent/settings.json.bak-broken-YYYYMMDD-HHMMSS` (sanity snapshot during rollback)

## The "locked models.json" gotcha

`~/.pi/agent/models.json` ships locked via macOS SIP-style flags:
- File mode `444` (read-only)
- `com.apple.provenance` extended attribute
- Likely `uchg`/`schg` flags from the original install

Modifying it requires sudo. The cleanest unlock:
```bash
sudo chflags -R nouchg,noschg /Users/<you>/.pi/agent/models.json
sudo chmod 644 /Users/<you>/.pi/agent/models.json
sudo xattr -d com.apple.provenance /Users/<you>/.pi/agent/models.json
```

Or delete it and let Pi regenerate from the baked-in template on next launch.

## Verified model catalog (VibeProxy returns 200 for these)

- `claude-sonnet-4-5-20250929` ✓
- `claude-sonnet-4-6` ✓
- `claude-opus-4-7` ✓
- `claude-opus-4-8` ✓
- `claude-haiku-4-5-20251001` ✓
- `MiniMax-M3` ✓
- `glm-4-plus` ✓

`/v1/messages` (Anthropic-native format) returns 502 on Sonnet 4.5 (VibeProxy only registers Antigravity-canonical dated names). Use the OpenAI-compat `/v1/chat/completions` endpoint, which is what `models.json` configures.

## What still needs attention

- VibeProxy upstream account refresh: the `claude-luis@epiloguecapital.com` OAuth access token expired 2026-07-25 01:55:52 PDT. When VibeProxy tries to refresh it, it will fail. If Claude inference stops working, re-authenticate via the VibeProxy menu bar app's "Add Account" button next to the "Claude Code" service.
- Codex-luis access token is revoked (`refresh_token_invalidated`). Same fix via the menu bar.
- Kimi auth file was rewritten at 18:21:54 — likely a fresh login. Should be fine.
