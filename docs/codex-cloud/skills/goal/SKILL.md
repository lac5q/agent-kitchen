---
name: goal
description: Create or resume a MemRoOS /goal work session with acceptance criteria, lane selection, context packet, and proof requirements.
---

# Goal

Use this skill when Luis invokes `/goal`, asks to start a goal, resume a goal,
define acceptance criteria, or turn a request into a durable MemRoOS work item.

## Intent

`/goal` is the lightweight front door for MemRoOS Agent OS work. It should make
the current objective durable before planning or coding continues.

## Workflow

1. Restate the goal in product terms.
2. Capture acceptance criteria and verification requirements.
3. Identify the lane: code, research, memory, deployment, email/doc, GTM,
   safety, or ops.
4. Before planning or coding, make the named mandatory `memory_prior_work`
   probe with the goal statement plus repo/project scope and
   `timing: "before_plan"`. Record the returned `receipt` (or receipt id when
   the provider supplies one) in the goal state, including a typed
   `search_skipped` receipt. A failed/unavailable probe is fail-open for the
   work, but the skip/error receipt must remain visible.
5. If `MEMROOS_APP_URL` and `MEMROOS_AGENT_API_KEY` are available, create or
   resume the goal through the MemRoOS `/api/gsd/goal` endpoint.
6. If the API is unavailable, continue with repo-local GSD artifacts and state
   clearly that the durable MemRoOS goal endpoint was unavailable.
7. Before implementation, choose the right workflow:
   - Use `$gsd-plan-phase` / `$gsd-execute-phase` for roadmap phases.
   - Use `$beastmode-cloud` for planner/worker/validator execution.
   - Use direct coding only for small, well-scoped tasks.

## API Shape

When using the MemRoOS app endpoint, send only non-secret goal metadata:

```bash
curl -sS "$MEMROOS_APP_URL/api/gsd/goal" \
  -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "<goal statement>",
    "lane": "code",
    "acceptanceCriteria": ["<criterion>"],
    "verification": ["<check command or proof>"]
  }'
```

Do not include API keys, private email content, legal/financial sensitive text,
or raw secrets in the goal body.

## Output Contract

When the goal is ready, report:

- Goal statement.
- Lane.
- Acceptance criteria.
- Verification plan.
- Durable goal status: created/resumed, or local-only fallback.
- Next action.
