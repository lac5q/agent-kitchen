---
name: memroos-recall
description: Check MemroOS for prior work before starting a task, and re-check when the task shifts. Use at the start of any non-trivial task, when the topic changes, when an unexpected error appears, or when a question repeats. Calls memory_prior_work and returns a pointer-sized digest, never raw memories.
version: 1.0.0
auto_load: true
source_repo: https://github.com/lac5q/memroos/blob/main/.agents/skills/memroos-recall/SKILL.md
---

# Memroos Recall — Check for Prior Work First

## The problem this exists to solve

A team already solved, discussed, debugged, or decided something, and the next
agent starts from zero. That is the failure the whole memory layer exists to
prevent, and it happens by default because nothing forces a check.

Prose directives did not change this behavior. A named tool call with a receipt
does.

## When to call `memory_prior_work`

**At the start of any non-trivial task.** Before the first substantive edit,
before choosing an approach, before declaring an answer. Orientation (listing
files, reading a spec) is not substantive work — probing before that is fine but
not required.

**Re-probe mid-task when any of these fire:**

| Trigger | Why |
|---|---|
| Topic shift | You are now working on something the first probe did not cover |
| Unexpected error | Someone may have already hit and solved this exact failure |
| A question repeats | A repeated question is the signature of a rediscovered fact |
| You are about to cite a source | Check whether a better-grounded one is already stored |

**Skip it** for trivial single-file edits, pure conversation, and follow-up
questions about work already in your context. A skip is a legitimate outcome —
the probe records one either way.

## How to call it

```
memory_prior_work(task: "<one sentence describing what you are about to do>",
                  repo/project/entity/recency hints as available)
```

Give it the *task statement*, not a keyword. "Fix the 104s mem0 write path" is a
task; "mem0" is a keyword and will return noise.

## What comes back, and how much to trust it

The response is a **digest pack**: at most five items of
`{title, one_liner, belief_stage, age, salience, fetch_ref}`, plus a headline
that says either how many items exist or that none were found and which tiers
were searched.

It is deliberately **pointers, not payloads**. Pull the full memory with its
`fetch_ref` only when you are going to use it.

**Belief stage governs how much weight an item carries. This is the part most
often gotten wrong:**

- **`gold_operational_truth`** — admitted truth. Rely on it directly. It passed
  provenance, freshness, policy, conflict and dedupe checks.
- **`silver_candidate_claim`** — a claim, not yet admitted. Use it, but **caveat
  it**: "a previous session recorded X (unconfirmed)". Do not state it as fact.
- **`bronze_raw_source`** — raw evidence only. It is a pointer to where
  something was said, not a finding. Never present bronze as a conclusion.

Treating silver as gold is how a stale guess becomes an asserted fact three
sessions later. If the stage is silver and the claim matters, verify it against
the live system before relying on it.

## The receipt

Every probe — served **or** skipped — emits a `retrieval_trace` receipt. That is
what makes recall-before-work measurable rather than aspirational, so do not
route around the tool to avoid a "miss" receipt. A truthful miss is worth more
than a skipped probe: it is what tells the operator the memory is thin on that
topic.

## Failure behavior

Recall **fails open**. If a tier is unreachable the pack degrades and says so;
it does not block your task. Proceed, and note that recall was partial if it
affects your confidence.

## Relationship to saving

This skill is the read half. The write half is `memroos-save`, which runs at
task end. They share one ordering rule:

> **Skills > Memory.** Procedures and "how this class of work goes" belong in a
> skill. Decisions, outcomes, project facts and handoff state belong in memory.

If a probe returns something that is really a procedure, the right follow-up is
to propose a skill, not to copy it forward as a memory.
