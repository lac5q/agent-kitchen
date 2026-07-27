#!/usr/bin/env python3
"""Unit tests for Fathom meeting markdown rendering (no network)."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "fathom_ingest.py"


def load_module():
    spec = importlib.util.spec_from_file_location("fathom_ingest", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FathomIngestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_module()

    def test_render_includes_transcript_marker_and_account(self):
        meeting = {
            "title": "Luis <> Eric GTM",
            "recording_id": 10123864,
            "created_at": "2026-07-02T18:00:00Z",
            "recording_start_time": "2026-07-02T17:00:00Z",
            "recording_end_time": "2026-07-02T17:45:00Z",
            "share_url": "https://fathom.video/share/abc",
            "recorded_by": {"name": "Luis Calderon", "email": "<you>@epiloguecapital.com"},
            "calendar_invitees": [
                {"name": "Luis", "email": "<you>@epiloguecapital.com"},
                {"name": "Eric", "email": "eric@example.com"},
            ],
            "default_summary": {"markdown_formatted": "Discussed retainer and GTM stack."},
            "action_items": [
                {
                    "description": "Send revised proposal",
                    "completed": False,
                    "assignee": {"email": "<you>@epiloguecapital.com"},
                }
            ],
            "transcript": [
                {
                    "speaker": {"display_name": "Luis"},
                    "timestamp": "00:01:02",
                    "text": "Let's review the stack.",
                }
            ],
        }
        md = self.mod.render_meeting_markdown(
            meeting, account_email="<you>@epiloguecapital.com"
        )
        self.assertIn("# Luis <> Eric GTM", md)
        self.assertIn("## Transcript", md)
        self.assertIn("**Luis** (00:01:02): Let's review the stack.", md)
        self.assertIn("Account: <you>@epiloguecapital.com", md)
        self.assertIn("- [ ] Send revised proposal", md)

    def test_write_dedupes_by_recording_id_filename(self):
        meeting = {
            "title": "Sync",
            "recording_id": 42,
            "recording_start_time": "2026-07-14T12:00:00Z",
            "recorded_by": {"email": "luis.calderon@gmail.com", "name": "Luis"},
            "transcript": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            n1 = self.mod.write_meetings(
                [meeting],
                output_dir=out,
                account_email="luis.calderon@gmail.com",
                account_label="gmail",
                dry_run=False,
            )
            n2 = self.mod.write_meetings(
                [meeting],
                output_dir=out,
                account_email="luis.calderon@gmail.com",
                account_label="gmail",
                dry_run=False,
            )
            self.assertEqual(n1, 1)
            self.assertEqual(n2, 1)
            files = list(out.glob("*.md"))
            self.assertEqual(len(files), 1)
            self.assertTrue(files[0].name.startswith("2026-07-14-fathom-gmail-42-"))

    def test_resolve_prefers_env_over_op(self):
        account = {
            "email": "<you>@epiloguecapital.com",
            "api_key_env": "FATHOM_API_KEY_EPILOGUE",
            "api_key_op_ref": "op://Private/missing/credential",
        }
        import os

        os.environ["FATHOM_API_KEY_EPILOGUE"] = "env-key-epilogue"
        try:
            self.assertEqual(self.mod.resolve_api_key(account), "env-key-epilogue")
        finally:
            del os.environ["FATHOM_API_KEY_EPILOGUE"]

    def test_accounts_example_covers_both_requested_emails(self):
        example = json.loads((ROOT / "accounts.example.json").read_text())
        emails = {a["email"] for a in example["accounts"]}
        self.assertEqual(
            emails,
            {"<you>@epiloguecapital.com", "luis.calderon@gmail.com"},
        )


if __name__ == "__main__":
    unittest.main()
