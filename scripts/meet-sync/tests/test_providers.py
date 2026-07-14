#!/usr/bin/env python3
"""Unit tests for meet-sync provider helpers (no live API)."""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

PROVIDERS = Path(__file__).resolve().parents[1] / "providers"


def _load(name: str, filename: str):
    path = PROVIDERS / filename
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class TestCommon(unittest.TestCase):
    def setUp(self):
        self.common = _load("meet_sync_common", "common.py")

    def test_idempotent_filename_uses_stable_id(self):
        a = self.common.idempotent_filename("2026-07-09", "rec-abc123", "Monaco Cordant")
        b = self.common.idempotent_filename("2026-07-09", "rec-abc123", "Different Title")
        self.assertEqual(a, b)
        self.assertEqual(a, "2026-07-09-rec-abc123.md")
        self.assertNotIn("-2", a)

    def test_frontmatter_keys(self):
        fm = self.common.yaml_frontmatter(
            source="fathom",
            meeting_id="rid-1",
            calendar_title="Impromptu Google Meet Meeting",
            share_url="https://fathom.video/share/x",
            title="Impromptu Google Meet Meeting",
            date="2026-07-10",
        )
        self.assertIn("calendar_title:", fm)
        self.assertIn("share_url:", fm)
        self.assertIn("meeting_id:", fm)
        self.assertIn("source: fathom", fm)


class TestFathomTransform(unittest.TestCase):
    def setUp(self):
        self.ft = _load("fathom_transform_mod", "fathom_transform.py")

    def test_same_recording_id_overwrites(self):
        meeting = {
            "id": "fathom-1",
            "recording_id": "rec-999",
            "title": "Impromptu Google Meet Meeting",
            "calendar_title": "Monaco planning",
            "created_at": "2026-07-10T14:00:00Z",
            "share_url": "https://fathom.video/share/xyz",
            "transcript": [{"speaker": {"name": "Luis"}, "text": "hello"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            name1, content1 = self.ft.meeting_to_markdown(meeting)
            path = out / name1
            path.write_text(content1)
            meeting["title"] = "Impromptu Google Meet Meeting"
            meeting["transcript"] = [{"speaker": {"name": "Luis"}, "text": "hello again"}]
            name2, content2 = self.ft.meeting_to_markdown(meeting)
            self.assertEqual(name1, name2)
            path.write_text(content2)
            # No -2 sibling
            siblings = list(out.glob("*.md"))
            self.assertEqual(len(siblings), 1)
            text = siblings[0].read_text()
            self.assertIn("calendar_title:", text)
            self.assertIn("meeting_id:", text)
            self.assertIn("source: fathom", text)
            self.assertIn("Monaco planning", text)


class TestCirclebackMarkdown(unittest.TestCase):
    def setUp(self):
        self.cb = _load("circleback_ingest_mod", "circleback_ingest.py")

    def test_idempotent_by_meeting_id(self):
        detail = {
            "id": "cb-42",
            "name": "Monaco Cordant Follow-up",
            "createdAt": "2026-07-09T16:00:00Z",
            "url": "https://circleback.ai/m/42",
            "attendees": [{"name": "Luis"}],
            "notes": "Follow-up notes",
        }
        name1, _ = self.cb.meeting_to_markdown("cb-42", detail, [])
        detail["name"] = "Monaco Cordant Follow-up (renamed)"
        name2, content = self.cb.meeting_to_markdown("cb-42", detail, [])
        self.assertEqual(name1, name2)
        self.assertEqual(name1, "2026-07-09-cb-42.md")
        self.assertIn("source: circleback", content)
        self.assertIn("calendar_title:", content)


if __name__ == "__main__":
    unittest.main()
