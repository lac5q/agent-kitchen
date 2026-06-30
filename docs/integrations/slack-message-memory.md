# Slack message memory add-on

MemroOS can ingest Slack Events API messages into the same provider-agnostic message memory layer used for Discord.

## What it adds

- `GET /api/integrations/slack/events` returns a copy/paste Slack app manifest with the correct request URL.
- `POST /api/integrations/slack/events` verifies Slack's HMAC signature, handles URL verification, normalizes message events, and stores them via `ingestPlatformMessageMemory`.
- Messages are mirrored into the existing `messages` table with `policy = indexable`, so hot recall works immediately and the normal indexing path can catch up asynchronously.

## Setup

1. Expose MemroOS over HTTPS and set the public base URL:

   ```bash
   MEMROOS_PUBLIC_BASE_URL=https://memroos.example.com
   ```

2. Open the manifest endpoint:

   ```text
   https://memroos.example.com/api/integrations/slack/events
   ```

3. In Slack, create an app from manifest and paste the returned JSON.

4. Copy Slack's signing secret into your private environment or secret store:

   ```bash
   SLACK_SIGNING_SECRET=...
   ```

5. Restrict accepted workspaces by team id:

   ```bash
   MESSAGE_MEMORY_SLACK_ALLOW_TEAM_IDS=T0123456789,T9876543210
   ```

6. Restart MemroOS and install the Slack app into the workspace.

## Events and scopes

The generated manifest subscribes to:

- `message.channels`
- `message.groups`
- `message.im`
- `message.mpim`

And requests bot scopes:

- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`

## Freshness model

Slack events go through two paths:

1. **Hot path:** the route immediately writes the normalized message to `platform_message_memory` and mirrors it into `messages`. Agents can query recent Slack context right away.
2. **Index path:** existing MemroOS indexing/FTS/embedding workflows pick up the mirrored `messages` rows for longer-term semantic recall.

This means agents do not have to wait for embeddings to catch up before they can use fresh Slack context.

## Safety defaults

- Every POST must pass Slack HMAC verification using `SLACK_SIGNING_SECRET`.
- Requests older than 5 minutes are rejected by default. Override only if your deployment has clock skew:

  ```bash
  MESSAGE_MEMORY_SLACK_MAX_SKEW_SECONDS=300
  ```

- Bot messages are ignored by default to avoid agent echo loops. Enable only for trusted bot sources:

  ```bash
  MESSAGE_MEMORY_SLACK_INCLUDE_BOT_MESSAGES=1
  ```

- Real tokens, signing secrets, and private team allowlists must not be committed.

## Dedupe

Slack retries are safe. The provider-agnostic dedupe key uses:

```text
provider + workspaceId + channelId + (threadId || messageId) + messageId
```

For Slack, `workspaceId = team_id`, `channelId = event.channel`, and `messageId = event.ts`.
