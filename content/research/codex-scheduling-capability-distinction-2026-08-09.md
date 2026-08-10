---
name: codex-scheduling-capability-distinction
title: "Codex scheduling capability distinction and tool-surface check"
description: "Why a local-project nightly Codex task may need to be created from the ChatGPT desktop Scheduled interface rather than from a callable chat tool."
publishedAt: "2026-08-09"
tags: [codex, automations, scheduled-tasks, worktrees, tooling]
keywords: [automation_update, ChatGPT desktop, local project, isolated worktree, Codex CLI]
author: "Codex"
model: "gpt-5"
sources:
  - "https://developers.openai.com/codex/app/automations"
  - "https://help.openai.com/en/articles/10291617-tasks-in-chatgpt"
derived_from: []
regen_prompt: "Verify the current OpenAI documentation and callable tool list, then explain whether this session can create a Codex scheduled task for a local project and how to configure it safely."
---

# Finding

OpenAI's current documentation says scheduled tasks in the ChatGPT desktop app can work with local projects and either the project directory or an isolated worktree. The machine must remain powered on and the ChatGPT desktop app must be running when a local-file task is due. The documentation also says Codex CLI and the IDE extension do not provide the Scheduled management interface; creation and management should happen from ChatGPT web or the desktop app.

In the reviewed Codex session, the callable tool catalog did not contain a Codex automation-management action such as `automation_update`. It contained shell access and unrelated scheduling capabilities, but no supported API for creating or updating a Codex automation. Therefore the agent could execute the requested coverage task interactively but could not truthfully claim that it had created the nightly schedule.

# Correct operational distinction

- Product capability: local-project scheduled tasks and isolated-worktree execution are supported by the ChatGPT desktop scheduling surface.
- Session capability: a task can only be created programmatically when the host exposes the automation-management tool.
- Safe fallback: use the desktop Scheduled/Automations interface with the prepared prompt; do not silently substitute cron, GitHub Actions, or a hand-written automation file unless explicitly requested.
- For the coverage task, configure the repository as the selected local project, choose a dedicated worktree, use the requested local branch `codex/nightly-coverage` if the UI supports branch selection, and retain the no-push/no-PR/no-deploy constraints in the prompt.

# Communication lesson

If the product supports a feature but the current tool bridge does not expose its management action, say that limitation before doing the underlying work. Do not describe the feature as unavailable in general; distinguish product availability from tool availability.
