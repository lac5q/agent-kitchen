#!/usr/bin/env python3
"""Preflight scope-block regression tests (MEETREL-FOLLOWUP-05).

INVARIANT: preflight(provider, ...) MUST return ok=False when required scopes
or env vars are missing. The pre-flight must NEVER return ok=True when scopes
are insufficient — that was the false-healthy provider-auth defect (scheduled
Google/Spark sync reported ok=true while returning zero documents because
Google Meet/Drive OAuth scopes were denied).
"""
from __future__ import annotations

import importlib.util
import sys
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


class TestPreflightAuthBlock(unittest.TestCase):
    def setUp(self):
        self.preflight = _load("meet_sync_preflight", "preflight.py").preflight

    def test_google_missing_scopes_returns_auth_blocked_not_ok(self):
        """REGRESSION (2026-07-16 Cordant): Google Meet/Drive scope denial
        MUST be reported as provider_auth_blocked with ok=False — never as
        `ok: true` with zero documents (the false-healthy sync defect)."""
        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "x",
                "GOOGLE_OAUTH_CLIENT_SECRET": "y",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "z",
            },
            granted_scopes={"https://www.googleapis.com/auth/userinfo.email"},
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "provider_auth_blocked")
        self.assertIn(
            "https://www.googleapis.com/auth/meetings.space.created",
            result["missingScopes"],
        )
        self.assertIn(
            "https://www.googleapis.com/auth/drive.readonly",
            result["missingScopes"],
        )

    def test_empty_granted_scopes_surfaces_every_required_scope(self):
        """An empty granted_scopes (no probe) must still report the
        required scopes as missing — never silently pass the pre-flight."""
        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "x",
                "GOOGLE_OAUTH_CLIENT_SECRET": "y",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "z",
            },
            granted_scopes=(),
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "provider_auth_blocked")
        self.assertEqual(len(result["missingScopes"]), 2)

    def test_google_full_scopes_returns_recalled(self):
        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "x",
                "GOOGLE_OAUTH_CLIENT_SECRET": "y",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "z",
            },
            granted_scopes={
                "https://www.googleapis.com/auth/meetings.space.created",
                "https://www.googleapis.com/auth/drive.readonly",
            },
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "recalled")

    def test_fathom_missing_api_key_blocks_preflight(self):
        result = self.preflight("fathom", env={})
        self.assertFalse(result["ok"])
        self.assertEqual(result["missingEnv"], ["FATHOM_API_KEY"])
        self.assertEqual(result["status"], "provider_auth_blocked")

    def test_fathom_valid_env_and_scope_returns_ok(self):
        result = self.preflight(
            "fathom",
            env={"FATHOM_API_KEY": "abcdefgh12345678"},
            granted_scopes={"recordings:read"},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "recalled")

    def test_circleback_missing_token_blocks(self):
        result = self.preflight("circleback", env={})
        self.assertFalse(result["ok"])
        self.assertEqual(result["missingEnv"], ["CIRCLEBACK_API_TOKEN"])

    def test_zoom_requires_three_env_vars(self):
        result = self.preflight("zoom", env={})
        self.assertFalse(result["ok"])
        self.assertEqual(
            set(result["missingEnv"]),
            {"ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"},
        )

    def test_unknown_provider_returns_provider_absent(self):
        result = self.preflight("fireflies")
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "provider_absent")

    def test_repair_hint_is_actionable_not_secret(self):
        """repairHint must contain actionable guidance, never credentials."""
        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "",
                "GOOGLE_OAUTH_CLIENT_SECRET": "",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "",
            },
            granted_scopes=(),
        )
        hint = result["repairHint"]
        self.assertTrue(hint)  # non-empty
        self.assertNotIn("Bearer", hint)
        self.assertNotIn("ya29.", hint)  # token prefix
        self.assertNotIn("AIza", hint)  # API key prefix
        self.assertIn("scope", hint.lower())

    def test_probe_fn_exception_returns_auth_blocked(self):
        """If a live probe is configured but raises, preflight must still
        return ok=False (no false-healthy pass)."""
        def boom(_):
            raise RuntimeError("network down")

        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "x",
                "GOOGLE_OAUTH_CLIENT_SECRET": "y",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "z",
            },
            probe_fn=boom,
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "provider_auth_blocked")
        self.assertIn("network down", result["repairHint"])

    def test_probe_fn_passing_scopes_bypasses_env_check(self):
        """When granted_scopes are obtained via probe_fn, env-only check
        remains — but scope check is satisfied."""
        def probe(_):
            return {
                "scopes": [
                    "https://www.googleapis.com/auth/meetings.space.created",
                    "https://www.googleapis.com/auth/drive.readonly",
                ]
            }

        result = self.preflight(
            "google",
            env={
                "GOOGLE_OAUTH_CLIENT_ID": "x",
                "GOOGLE_OAUTH_CLIENT_SECRET": "y",
                "GOOGLE_OAUTH_REFRESH_TOKEN": "z",
            },
            probe_fn=probe,
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "recalled")


if __name__ == "__main__":
    unittest.main()
