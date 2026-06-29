# Provider-agnostic message memory

MemroOS can ingest human/team conversation messages from chat providers without coupling the memory layer to a single vendor.

## Architecture

- `src/lib/message-memory/types.ts` defines the provider-neutral `NormalizedPlatformMessage` and `MessageMemoryAdapter` contracts.
- `src/lib/message-memory/adapters.ts` contains Discord normalization plus a Slack-ready Events API normalizer.
- `src/lib/message-memory/store.ts` persists normalized records in `platform_message_memory` and mirrors them into the existing `messages` table for recall/FTS.
- `src/lib/message-memory/dedupe.ts` computes a stable dedupe key from provider, workspace, channel, thread, and provider message id.

## Dedupe policy

The canonical dedupe key is:

```text
provider + workspaceId + channelId + (threadId || messageId) + messageId
```

The key is SHA-256 hashed and stored as `platform_message_memory.dedupe_key` with a unique constraint. Re-ingesting the same provider message returns the existing record and does not create another row in `messages`. Content is deliberately excluded, so message edits are first-write-wins until an explicit edit-ingest policy is added.

## Public-safe config

Use `message-memory.config.example.json` as the template. It contains only environment variable names and placeholder workspace ids. Do not commit real tokens, webhook secrets, server ids, or channel allowlists from private deployments.

Required deployment pattern:

1. Copy `message-memory.config.example.json` to a private config path.
2. Replace placeholder allowlists with deployment-specific workspace ids.
3. Store provider tokens in the secret store or environment variables named by the config.
4. Apply deployment-specific filters before ingestion: enforce workspace/channel allowlists, signature verification, and bot-message policy (`includeBotMessages`) in the webhook/API boundary. The provider adapters only normalize payload shape.
5. Feed provider webhook payloads through the matching adapter and then call `ingestPlatformMessageMemory(db, normalized)`.

## Discord adapter shape

The Discord normalizer expects message-create-style payload fields:

- `id`
- `guild_id`
- `channel_id`
- optional `thread_id`
- `content`
- `timestamp`
- `author.id`, `author.username`, `author.global_name`, `author.bot`
- optional `member.nick`
- optional `attachments[]`
- optional `jump_url`

## Slack-ready adapter shape

The Slack normalizer accepts Events API envelopes with `event.type === "message"` and uses:

- `team_id` or `authorizations[].team_id`
- `event.channel`
- `event.ts` as provider message id
- optional `event.thread_ts`
- `event.user` or `event.bot_id`
- `event.text`
- optional `event.files[]`
- optional `event.permalink`

## Recall integration

`ingestPlatformMessageMemory` mirrors normalized content into the existing `messages` table using:

- `session_id = platform:{provider}:{workspaceId}:{channelId}`
- `project = platform:{provider}` unless overridden
- `agent_id = {provider}:{authorId}`
- `request_id = dedupeKey`
- default `visibility = internal`
- default `policy = indexable`

That keeps provider-specific metadata available in `platform_message_memory` while making message content available to existing MemroOS recall paths.
