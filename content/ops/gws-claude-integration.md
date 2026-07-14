---
name: gws
description: Drive Google's Workspace APIs (Gmail, Drive, Calendar, Sheets, Docs, Slides, Tasks, Chat, etc.) from Claude via the `gws` CLI. Use when a user asks Claude to read/send email, list Drive files, edit Sheets, create Calendar events, send Chat messages, or any other Google Workspace action. Single-account gws is the default; multi-account is supported via `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` env override.
---

# gws — Google Workspace CLI Bridge (v0.22.5)

## TL;DR for the Agent

`gws` is a Rust CLI on this machine at `/opt/homebrew/bin/gws`. v0.22.5 removed the built-in MCP server (`gws mcp` was removed in v0.8.0) but the CLI itself is fully functional and reachable via the Bash tool. **Use Bash, not MCP.**

```bash
gws <service> <resource> [sub-resource] <method> --params '<JSON>' [--json '<JSON>'] [--format json|table|yaml]
```

The response is structured JSON. Parse the JSON; don't paste walls of text back to the user.

## Critical rules

- **Default scope = gmail.** All of Gmail + Drive + Calendar + Sheets + Docs + Slides + Tasks + Chat + Meet + Forms + Keep + People + Classroom are accessible. Verify with `gws auth status`.
- **NO `--account` flag** — it was removed in v0.7.0. To act as a different Google account, swap the credentials file via env var before the call:

  ```bash
  GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=~/.config/gws/credentials.luis@epiloguecapital.com.enc \
    gws gmail users messages list ...
  ```

  Do not refactor this into `GWS_CREDENTIALS` — the CLI reads exactly `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`.
- **`--dry-run` is your friend.** Preview the request body before destructive ops (send, delete, share, update).
- **API not enabled?** `gws` prints a clickable `enable_url` to stderr. Honor it; don't fake-enable and don't loop on retry.
- **Don't read or print OAuth secrets.** Token caches are AES-256-GCM, key in macOS Keychain. Don't `cat ~/.config/gws/credentials*.json` or echo env vars.

## Authorized accounts on this machine

Stored under `~/.config/gws/credentials.<base64-of-email>.enc`:

| Account | Filename hint | Default? |
|---|---|---|
| `luis.calderon@gmail.com` | `credentials.bHVpcy5jYWxkZXJvbkBnbWFpbC5jb20=.enc` | no |
| `luis@epiloguecapital.com` | `credentials.bHVpc0BlcGlsb2d1ZWNhcGl0YWwuY29t.enc` | no |
| `luis@cordant.ai` (= `luis.calderon@cordant.ai`) | `credentials.bHVpc0Bjb3JkYW50LmFp.enc` | **yes (default)** |

To switch accounts, prefix the Bash call with `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=~/.config/gws/credentials.<file>.enc `.

## Cookbook (verified command shapes)

```bash
# Search inbox
gws gmail users messages list --params '{"userId":"me","q":"from:stripe newer_than:7d","maxResults":10}'

# Read a single message body
gws gmail users messages get --params '{"userId":"me","id":"<msgId>","format":"full"}'

# Send an email
gws gmail users messages send --params '{"userId":"me"}' --json '{"raw":"<base64url-of-RFC822>"}'

# List Drive files
gws drive files list --params '{"pageSize":10,"orderBy":"modifiedByMeTime desc","q":"trashed=false"}'

# Create a Calendar event
gws calendar events insert --params '{"calendarId":"primary"}' \
  --json '{"summary":"Lunch","start":{"dateTime":"2026-07-09T12:00:00-07:00"},"end":{"dateTime":"2026-07-09T13:00:00-07:00"}}'

# Append a row to a sheet
gws spreadsheets values append \
  --params '{"spreadsheetId":"<sid>","range":"Sheet1!A:E","valueInputOption":"USER_ENTERED"}' \
  --json '{"values":[["a","b","c","d","e"]]}'
```

## Pagination

`--page-all` + `--page-limit N` streams as NDJSON, one record per line. Use this when you need more than `maxResults` and don't want to manually thread `pageToken`.

```bash
gws drive files list --params '{"pageSize":100}' --page-all --page-limit 50 \
  | jq -c '.files[] | {id,name,mimeType,modifiedTime}'
```

## Schema introspection

If you don't know the params shape, ask `gws` directly:

```bash
gws schema <service>.<resource>.<method>              # short
gws schema <service>.<resource>.<method> --resolve-refs  # fully expanded
```

This avoids hallucinated parameter names — always better than guessing.

## Failure modes I have seen

| Symptom | Cause | Fix |
|---|---|---|
| `Unknown service 'X'` | Service not enabled in GCP project, or typo. | Hit the `enable_url` from stderr; or run `gws auth setup` to bulk-enable. |
| `401 Unauthorized` after a long session | Refresh token rotated. | Run `gws auth login --scopes gmail,drive,calendar,sheets,docs` to re-authorize. |
| `403 accessNotConfigured` | GCP-side API not enabled. | `enable_url` in stderr; enable and wait 10s. |
| Empty response from a list call | Wrong query filter, or hard-deleted items. | Drop the `q` filter and try again. |
| Multi-account switch silently using default | Forgot the env override. | Always export the credentials file BEFORE calling `gws`; remember gws v0.7.0 dropped `--account`. |

## What this skill is NOT

- **Not an MCP wrapper.** The `mcp` subcommand was removed in v0.8.0. Don't try to register `gws` as an `mcpServers` entry — it has no `mcp` command anymore. Current Claude integration is via Bash + this skill.
- **Not a multi-account switcher.** You pick ONE account per Bash call by setting the credentials file in the env. To act on two accounts in one task, run them in separate Bash calls.
- **Not a way to create OAuth clients.** `gws auth setup` requires `gcloud` installed and authenticated. Use the manual OAuth flow (Desktop-app client JSON from GCP console) otherwise.
- **Not version-pinned.** The CLI is pre-1.0 (currently v0.22.5, March 31 2026). Expect breaking changes — re-read the changelog at https://github.com/googleworkspace/cli/blob/main/CHANGELOG.md before bumping.

## Operational notes

- **Default-account change:** set `GOOGLE_WORKSPACE_CLI_DEFAULT_ACCOUNT` env var OR swap the file at `~/.config/gws/credentials.enc`. The bare `credentials.enc` is whatever account was last authenticated as.
- **Logging:** set `GOOGLE_WORKSPACE_CLI_LOG=gws=debug` to get verbose output on stderr. Useful when an auth call is mysteriously failing.
- **Sanitization:** `GOOGLE_WORKSPACE_CLI_SANITIZE_MODE=block` will block tool calls that detect PII/PHI patterns. Default is `warn`. Turn on `block` if you suspect prompt-injection via email bodies.
