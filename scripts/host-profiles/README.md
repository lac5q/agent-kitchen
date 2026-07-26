# Host Profiles (CFGDUR-01, Phase 196)

A host profile declares **which backends a host is supposed to use**. It is
committed, non-secret topology. Secrets stay in `.env` / 1Password and never
appear here.

This exists because oracle-1 silently ran for months with `NEO4J_HTTP_URL`
pointed at a throwaway local container instead of Neo4j Aura. Nothing alerted,
because nothing had ever written down what "correct" was. A profile makes the
expectation explicit and machine-checkable.

## Fields

| Field | Values | Meaning |
|---|---|---|
| `MEMROOS_HOST_ID` | free text | Which host this profile describes |
| `EXPECT_GRAPH_BACKEND` | `aura` \| `local` | Where graph writes must land |
| `EXPECT_VECTOR_BACKEND` | `qdrant-cloud` \| `local` \| `none` | Where vectors must land |
| `EXPECT_LOCAL_NEO4J_RUNNING` | `yes` \| `no` | Whether a local neo4j container is correct |
| `CONTAINER_NAME` | free text | The app container to inspect |
| `ALERT_EMAIL` | email | Where health failures go (empty = no email) |

## Why divergence is allowed

oracle-1 uses Aura; cordant-hermes-01 deliberately runs local Neo4j (it has no
verified backup, so migrating it would violate the no-data-loss rule). Both are
correct. What is *not* allowed is undocumented divergence — a host whose actual
topology nobody wrote down.

The health check asserts **conformance to the declared profile**, not a fixed
topology. A check hardcoded to oracle-1's expectations would alert continuously
on cordant-hermes-01 and get muted, which is worse than no check at all.

## Usage

    MEMROOS_HOST_PROFILE=scripts/host-profiles/oracle-1.env \
      scripts/memroos-health-check.sh

If unset, the check looks for `/etc/memroos/host-profile.env`, then
`$MEMROOS_ROOT/host-profile.env`.
