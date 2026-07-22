"""Contract tests for the canonical envelope (Phase 176 CONNMEM-02).

The field set is FROZEN against the Phase 176 plan file reference (line
67-69 of 176-01-PLAN.md). Renames require amending the plan AND this
test together. This test guards the invariant.

Run with::
    python -m pytest services/connmem/tests/test_canonical_envelope.py -v
or::  python -m unittest services.connmem.tests.test_canonical_envelope
"""
from __future__ import annotations

import hashlib
import unittest

from services.connmem.canonical_envelope import (
    CANONICAL_FIELDS,
    CanonicalRecord,
    SCHEMA_VERSION,
    VALID_SENSITIVITIES,
    VALID_SOURCES,
    VALID_VISIBILITIES,
    assert_field_set_frozen,
    compute_content_hash,
    make_captured_at_now,
    to_canonical_record,
)


class FieldSetTests(unittest.TestCase):
    """Frozen contract: field set must match the plan file reference."""

    EXPECTED_FIELDS = (
        "source", "workspace_id", "object_type", "source_id", "source_url",
        "created_at", "updated_at", "deleted_at", "content_hash",
        "parent_ids", "participants", "owners", "visibility", "sensitivity",
        "captured_at", "schema_version",
    )

    def test_canonical_fields_tuple_matches_plan(self):
        """CANONICAL_FIELDS is the verifier-approved reference. Renames
        require amending the plan AND this test together."""
        self.assertEqual(CANONICAL_FIELDS, self.EXPECTED_FIELDS)

    def test_dataclass_field_order_matches(self):
        from dataclasses import fields
        actual = tuple(f.name for f in fields(CanonicalRecord))
        self.assertEqual(actual, self.EXPECTED_FIELDS)

    def test_assert_field_set_frozen_passes_at_import(self):
        # The runtime check fires; calling it here proves it passes.
        assert_field_set_frozen()


class RecordConstructionTests(unittest.TestCase):

    def _base_kwargs(self):
        return dict(
            source="circleback",
            workspace_id="acme-circleback",
            object_type="meeting",
            source_id="m-001",
            source_url="https://app.circleback.example/m/m-001",
            created_at="2026-07-21T10:00:00Z",
            updated_at="2026-07-21T10:30:00Z",
            deleted_at=None,
            content_body=b"hello world",
        )

    def test_minimal_record_builds(self):
        r = to_canonical_record(**self._base_kwargs())
        self.assertEqual(r.source, "circleback")
        self.assertEqual(len(r.content_hash), 64)
        self.assertEqual(r.schema_version, SCHEMA_VERSION)
        # captured_at was set by ingest, not by provider
        self.assertEqual(len(r.captured_at), 20)

    def test_content_hash_is_sha256_of_body(self):
        r = to_canonical_record(**self._base_kwargs())
        expected = hashlib.sha256(b"hello world").hexdigest()
        self.assertEqual(r.content_hash, expected)

    def test_compute_content_hash_helper_matches_dataclass(self):
        h1 = compute_content_hash(b"hello world")
        h2 = to_canonical_record(**self._base_kwargs()).content_hash
        self.assertEqual(h1, h2)

    def test_invalid_source_rejected(self):
        bad = self._base_kwargs()
        bad["source"] = "twitter"
        with self.assertRaises(ValueError):
            to_canonical_record(**bad)

    def test_invalid_visibility_rejected(self):
        bad = self._base_kwargs()
        bad["visibility"] = "public-but-kinda"
        with self.assertRaises(ValueError):
            to_canonical_record(**bad)

    def test_invalid_sensitivity_rejected(self):
        bad = self._base_kwargs()
        bad["sensitivity"] = "top-secret"
        with self.assertRaises(ValueError):
            to_canonical_record(**bad)

    def test_nonhex_content_hash_rejected_at_dataclass_level(self):
        # Manually crafted hash to test the dataclass validator.
        with self.assertRaises(ValueError):
            CanonicalRecord(
                source="circleback",
                workspace_id="acme",
                object_type="meeting",
                source_id="m-001",
                source_url="https://x/m-001",
                created_at="2026-07-21T10:00:00Z",
                updated_at="2026-07-21T10:30:00Z",
                deleted_at=None,
                content_hash="not-a-hash",
                parent_ids=(),
                participants=(),
                owners=(),
                visibility="private",
                sensitivity="sensitive",
                captured_at=make_captured_at_now(),
            )

    def test_stable_key_is_source_workspace_sourceid(self):
        r = to_canonical_record(**self._base_kwargs())
        self.assertEqual(r.stable_key(), ("circleback", "acme-circleback", "m-001"))

    def test_to_dict_round_trip(self):
        r = to_canonical_record(**self._base_kwargs())
        d = r.to_dict()
        self.assertEqual(d["source"], "circleback")
        self.assertEqual(d["object_type"], "meeting")
        self.assertEqual(d["content_hash"], r.content_hash)

    def test_parent_ids_canonical_to_tuple(self):
        r = to_canonical_record(parent_ids=["a", "b", "c"], **{k: v for k, v in self._base_kwargs().items() if k != "parent_ids"})
        self.assertIsInstance(r.parent_ids, tuple)
        self.assertEqual(r.parent_ids, ("a", "b", "c"))


class ProviderEnumTests(unittest.TestCase):

    def test_sources_only_three_for_now(self):
        # Notion is scaffolded but not adapter-impl. Other providers would
        # require phase-routing through .planning/ first.
        self.assertEqual(VALID_SOURCES, frozenset({"circleback", "linear", "notion"}))

    def test_visibilities_closed_set(self):
        self.assertEqual(
            VALID_VISIBILITIES,
            frozenset({"public", "internal", "private", "team"}),
        )

    def test_sensitivities_closed_set(self):
        self.assertEqual(
            VALID_SENSITIVITIES,
            frozenset({"safe", "sensitive", "restricted"}),
        )


if __name__ == "__main__":
    unittest.main()
