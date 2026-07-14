# Meet-sync providers (public)

Templates for Fathom, Circleback, and Zoom transforms/ingest.

- Secrets: env / envFile / 1Password only — never commit API keys
- Idempotent filenames: `{date}-{recording_or_meeting_id}.md`
- Frontmatter: `calendar_title`, `share_url`, `meeting_id`, `source`

See `docs/integrations/meet-recordings.md` and parent `../README.md`.
