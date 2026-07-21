# Linear fixture for CONNMEM-02 contract tests.
#
# Provenance tag (per CONNMEM-01): doc-derived.
# Source: references/linear/SDL-STUBS.graphql — built from public Linear
# GraphQL docs (https://linear.app/developers/graphql,
# https://developers.linear.app/docs/graphql/working-with-the-graphql-api).
# NOT generated from a live introspection query (no Linear API key on
# cordant-hermes-01 yet). Replace with live introspection output when
# keys are dropped in .env and the Linear adapter is built in Phase 176
# Session 2.
PROVENANCE_TAG = "doc-derived"

DOC_DERIVED_LINEAR_ISSUE_RAW = {
    "id": "8a4c8e0f-1234-4abc-9def-0123456789ab",
    "createdAt": "2026-07-21T08:30:00.000Z",
    "updatedAt": "2026-07-21T09:15:00.000Z",
    "archivedAt": None,
    "identifier": "ACM-101",
    "title": "Implement canonical envelope per CONNMEM-02",
    "description": "Phase 176 introduces a provider-agnostic envelope.",
    "priority": 2,
    "estimate": 5,
    "state": {"name": "In Progress", "type": "started"},
    "team": {"id": "team-001", "key": "ACM", "name": "Acme"},
    "assignee": {"id": "user-001", "name": "minimax implementor", "email": "minimax@acme.example"},
    "creator":  {"id": "user-000", "name": "founder",             "email": "founder@acme.example"},
    "labels": [{"id": "lbl-1", "name": "Phase-176", "color": "#888"}],
    "project": {"id": "proj-176", "name": "v8.20 Connected Work Memory"},
    "cycle": None,
    "parent": None,
    "url": "https://linear.app/acme/issue/ACM-101",
}

# Canonical projection of DOC_DERIVED_LINEAR_ISSUE_RAW through the Linear
# adapter (Phase 176 Session 2 implementation; this fixture is the
# expected output for the adapter's projection test).
DOC_DERIVED_LINEAR_ISSUE_CANONICAL = {
    "source": "linear",
    "workspace_id": "team-001",       # team key in Linear maps to workspace_id
    "object_type": "issue",
    "source_id": "8a4c8e0f-1234-4abc-9def-0123456789ab",
    "source_url": "https://linear.app/acme/issue/ACM-101",
    "created_at": "2026-07-21T08:30:00.000Z",
    "updated_at": "2026-07-21T09:15:00.000Z",
    "deleted_at": None,
    "content_hash": None,            # computed at projection time
    "parent_ids": (),
    "participants": ("user-001", "user-000"),
    "owners": ("user-000",),          # creator is the owner
    "visibility": "team",            # Linear issues default to team-visible
    "sensitivity": "sensitive",       # internal teams default to sensitive
    "captured_at": None,             # stamped at ingest time, not in fixture
    "schema_version": "connmem/canonical-envelope/v1",
}
