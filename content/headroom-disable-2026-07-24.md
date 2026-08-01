# Headroom permanently disabled — 2026-07-24

## What it was

Headroom (headroomlabs-ai) was running as a **persistent LLM proxy** with the LLMLingua prompt-compression extension enabled (rate 0.67, 12000-char threshold). It sat between Hermes / Claude Code and the upstream API, compressing every prompt and response.

For every shell it was wired in via:

- **LaunchAgent** on main-mac (`~/Library/LaunchAgents/com.headroom.proxy.plist`) — daemon running `headroom proxy --port 8787 --no-telemetry --proxy-extension llmlingua`
- **systemd user service** on maeve-u1 (`~/.config/systemd/user/headroom.proxy.service`) — same daemon, same args
- **hooks** registered in both `~/.claude/settings.json` files — `PreToolUse:Bash` and `SessionStart` invoked `headroom init hook ensure` with a 15 second timeout, adding latency to every Bash call and every session start
- **environment variables** injected via install/headroom-managed blocks in `~/.zshrc`, `~/.bashrc`, `~/.profile`, `~/.bash_profile` so that any new shell that started from the affected context would auto-route `ANTHROPIC_BASE_URL` and `OPENAI_BASE_URL` to `127.0.0.1:8787`
- **plugin marketplace** registered in `enabledPlugins` and `known_marketplaces.json`

The proxy was also pointing at a dead port (`http://127.0.0.1:8317`) — VibeProxy had moved to 8318 — but it didn't matter because the daemon was killing incoming requests before they could fail downstream.

## What was changed

### Shell configs (main-mac)

Each of these files had a `>>> headroom persistent env <<<` block of `export` statements overriding `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `HEADROOM_LLMLINGUA_ENABLED`, etc. All replaced with `>>> VibeProxy direct <<<` blocks that:

1. **Unset** all headroom-injected vars (defensive — in case the parent shell inherited them)
2. **Export** `ANTHROPIC_BASE_URL=https://vibeproxy.internal.example` and `OPENAI_BASE_URL=https://vibeproxy.internal.example/v1`
3. **Export** the matching placeholder token

Files touched: `~/.zshrc`, `~/.bashrc`, `~/.profile`, `~/.bash_profile`. The droid `claude-vibe` function in `~/.zshrc` (which had been pointing at `http://localhost:8317`) was also updated to use VibeProxy HTTPS.

### Daemon control

- **main-mac**: `launchctl unload -w ~/Library/LaunchAgents/com.headroom.proxy.plist` — daemon dies, plist file kept on disk so it's easy to re-enable if you ever want headroom back
- **maeve-u1**: `systemctl --user stop headroom.proxy.service; systemctl --user disable headroom.proxy.service` — same shape, daemon dead, unit disabled

### Hermes hooks (both machines)

`~/.claude/settings.json` had `PreToolUse:Bash` and `SessionStart` hooks that ran `headroom init hook ensure`. Both hook blocks removed on both machines. Also: headroom plugin entry removed from `enabledPlugins`, headroom marketplace entry deleted from `extraKnownMarketplaces` and `known_marketplaces.json`.

### Plugin marketplace folders

`~/.claude/plugins/headroom-marketplace` (and `~/.claude/plugins/cache/headroom-marketplace` on maeve-u1) disabled by suffix `.disabled`.

## What was NOT changed

The headroom binary itself (`~/.local/bin/headroom` on main-mac, `~/.local/share/headroom/venv/bin/headroom` on maeve-u1) is left in place. The launchd plist and systemd unit files are also kept. This makes the change **reversible** in seconds: `launchctl load -w ~/Library/LaunchAgents/com.headroom.proxy.plist` brings it back on main-mac; `systemctl --user enable --now headroom.proxy.service` brings it back on maeve-u1. If you want to permanently delete the binaries, that's a separate step.

## Verification

```
─── 1. Headroom process state ───
headroom processes: 0
port 8787 listener: 0 line(s)

─── 2. LaunchAgent on main-mac ───
(empty = no headroom LaunchAgent loaded)

─── 3. systemd unit on maeve-u1 ───
disabled
active: inactive

─── 4. Shell env after clean login ───
  bash -l -c:
    ANTHROPIC_BASE_URL=https://vibeproxy.internal.example
    OPENAI_BASE_URL=https://vibeproxy.internal.example/v1
  zsh -l -c:
    (no headroom vars leaked)

─── 5. Hermes settings.json (no headroom hooks) ───
main-mac: 0 refs
maeve-u1: 0 refs

─── 6. Live VibeProxy response (curl, no compression) ───
HTTP 200 — full response, no LLMLingua shrinkage applied
```

The login shell env test deliberately uses `env -i HOME=... PATH=... USER=...` to clear all parent env vars before bash/zsh starts. This proves any new shell starts clean — the headroom env vars that the user might have seen in their active terminal session are frozen in that session's environment and will go away once they open a new terminal.

## Caveats / things to watch

- **The current shell session** the user is using still has the headroom env vars in its environment. They were baked in when the shell session was opened, before the cleanup. To flush them, just close the terminal and open a new one.
- **`claude-vibe` function** in `~/.zshrc` previously pointed at `http://localhost:8317` (a dead port). Updated to use VibeProxy. If you wrote any other shell functions that pointed at the headroom proxy, update them.
- **VibeProxy needs Claude Pro OAuth token** to keep working. The `claude-luis@epiloguecapital.com.json` access token expired 2026-07-25 01:55:52 PDT. If you start getting 401s on Claude calls, open the VibeProxy menu bar app and re-authenticate.
