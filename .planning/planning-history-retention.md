# Planning History Retention Policy

Status: decided for `ARCHREV-08` on 2026-06-27.

## Decision

MemRoOS keeps current planning context in the repo, keeps historical phase records in a tracked archive, and treats screenshots or operational evidence as private-release material before any wider public release.

This is a retention decision, not a destructive cleanup. No planning files are deleted by default.

## Public Release Surface

Before a wider public release, the public documentation surface is:

- `README.md`
- `docs/`
- current `.planning/PROJECT.md`, `.planning/GOAL.md`, `.planning/MILESTONES.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `.planning/LEARNINGS.md`
- current active phase plans needed to explain unfinished roadmap work

Older phase internals are not part of the public product surface unless explicitly linked from the current roadmap.

## Retention Rules

| Material | Default location | Public-release rule |
| --- | --- | --- |
| Current milestone state | `.planning/*.md` | Keep in repo |
| Active phase work | `.planning/phases/<current-or-open-phase>/` | Keep while active |
| Completed historical phase work | `.planning/archive/phases/` | Move here when pruning old phase internals; do not delete |
| Milestone summaries | `.planning/milestones/` | Keep if linked from roadmap summaries |
| Research notes | `.planning/research/` and `.planning/notes/` | Keep only if sanitized and still referenced; otherwise move to private sibling repo before public release |
| Screenshots and operational evidence | `.planning/screenshots/` | Move to a private sibling repo before public release unless explicitly sanitized and approved |
| Audit/security artifacts | `.planning/audit/` and phase audit reports | Keep private unless a sanitized public report is prepared |

## Release Gate

Before publishing or widening repository access:

1. Run `find .planning/screenshots -type f` and either move each artifact to a private sibling repo or document explicit public approval.
2. Run `rg -n "secret|token|password|private|screenshot|internal|client|legal|financial" .planning docs README.md` and review matches before publishing.
3. Run `find .planning/phases -maxdepth 1 -type d | sort` and move completed historical phase directories that are not needed by the current roadmap into `.planning/archive/phases/`.
4. Run `rg -n "\.planning/phases/" .planning/ROADMAP.md .planning/MILESTONES.md .planning/STATE.md` and update links after any archive move.
5. Run `git status --short .planning` and confirm changes are renames or policy edits, not accidental deletions.

## Non-Goals

- Do not delete GSD history as the first cleanup action.
- Do not move artifacts to a private sibling repo from an agent run without Luis approval.
- Do not publish screenshots, client traces, operational evidence, or audit internals by default.
- Do not make `.planning` the user-facing docs surface; summarize public claims in `README.md` and `docs/`.

## Current Snapshot

As of 2026-06-27:

- `.planning/phases`: about 3.0 MB
- `.planning/archive`: about 144 KB
- `.planning/screenshots`: about 188 KB, two operational screenshots
- `.planning` Markdown files: about 419 files

The repo can continue carrying this history internally. The public-release gate above decides what must be archived or privatized before wider release.
