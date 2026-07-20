#!/usr/bin/env python3
"""Pre-flight scope checks for meet-sync providers (MEETREL-FOLLOWUP-05).

Each provider (Circleback / Fathom / Zoom / Google) registers:

  - REQUIRED_SCOPES: tuple of OAuth/API scope strings without which the
    provider MUST NOT proceed past pre-flight.
  - REQUIRED_ENV: tuple of (env_var, regex) pairs without which the provider
    cannot authenticate.

`preflight(provider, *, env=None, probe_fn=None)` returns a dict:

  {
    "ok": bool,
    "status": SourceStatus,
    "missingScopes": [...],
    "missingEnv": [...],
    "repairHint": "...",
  }

INVARIANT (MEETREL-FOLLOWUP-05): when ANY required scope or env var is
missing, `ok` MUST be False. The pre-flight must NEVER return `ok=True`
when scopes are insufficient. This kills the "OAuth failure → successful
empty sync" defect (scheduled Google/Spark sync reported `ok: true` while
returning zero documents because Google Meet/Drive scopes were denied).
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any, Callable, Iterable

# Reuse the canonical SourceStatus enum from knowledge-mcp.
_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parents[2]
_KNOWN_MCP_ROOT = _REPO_ROOT / "services" / "knowledge-mcp"
if str(_KNOWN_MCP_ROOT) not in sys.path and _KNOWN_MCP_ROOT.is_dir():
    sys.path.insert(0, str(_KNOWN_MCP_ROOT))

try:  # pragma: no cover - falls through to literal fallback
    from knowledge_system.source_status import SourceStatus  # type: ignore
except Exception:  # noqa: BLE001
    SourceStatus = None  # type: ignore


STATUS_LITERAL = {
    None: "provider_auth_blocked",
    True: "recalled",
}


def _literal(value: str | None) -> str:
    if value is None:
        return "provider_auth_blocked"
    return str(value)


# Each provider declares its required scopes + env. These are *enforced*
# before any ingest runs. The check is pure (no I/O); callers can extend
# with a probe_fn for live OAuth introspection.
PROVIDER_REQUIREMENTS: dict[str, dict[str, Any]] = {
    "circleback": {
        "requiredScopes": (
            "meetings:read",
            "transcripts:read",
        ),
        "requiredEnv": (
            ("CIRCLEBACK_API_TOKEN", r".+"),
        ),
        "scopesHelp": (
            "Re-run `circleback auth login` and accept both the "
            "Meetings and Transcript scopes."
        ),
    },
    "fathom": {
        "requiredScopes": (
            "recordings:read",
        ),
        "requiredEnv": (
            ("FATHOM_API_KEY", r"^[A-Za-z0-9_-]{8,}$"),
        ),
        "scopesHelp": (
            "Rotate the Fathom API key under Settings → API → Personal "
            "Access Tokens. The current scope covers recordings only."
        ),
    },
    "zoom": {
        "requiredScopes": (
            "meeting:read",
            "recording:read",
            "user:read",
        ),
        "requiredEnv": (
            ("ZOOM_ACCOUNT_ID", r".+"),
            ("ZOOM_CLIENT_ID", r".+"),
            ("ZOOM_CLIENT_SECRET", r".+"),
        ),
        "scopesHelp": (
            "Re-create a Server-to-Server OAuth app with the Meeting, "
            "Recording, and User scopes enabled, then update envFile."
        ),
    },
    "google": {
        "requiredScopes": (
            # The Cordant failure mode — these were missing on 2026-07-16.
            "https://www.googleapis.com/auth/meetings.space.created",
            "https://www.googleapis.com/auth/drive.readonly",
        ),
        "requiredEnv": (
            ("GOOGLE_OAUTH_CLIENT_ID", r".+"),
            ("GOOGLE_OAUTH_CLIENT_SECRET", r".+"),
            ("GOOGLE_OAUTH_REFRESH_TOKEN", r".+"),
        ),
        "scopesHelp": (
            "Run scripts/integrations/google/oauth-reauthorize.sh and "
            "grant BOTH Meet conference records AND Drive read-only. "
            "Without these scopes the meet-sync loop silently produces "
            "zero documents."
        ),
    },
}


def preflight(
    provider: str,
    *,
    env: dict[str, str] | None = None,
    granted_scopes: Iterable[str] | None = None,
    probe_fn: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run a pure pre-flight check for a provider.

    Args:
        provider: one of PROVIDER_REQUIREMENTS keys.
        env: optional override of os.environ (used for tests).
        granted_scopes: optional iterable of scope strings the provider
            currently has. When None, preflight only checks env (tests
            where the operator has just minted credentials).
        probe_fn: optional callable that introspects the live provider for
            granted scopes. Returns a dict with `scopes` list.

    Returns:
        dict with `ok`, `status`, `missingScopes`, `missingEnv`, `repairHint`.

    INVARIANT: ok == False iff there is at least one missing scope or env var.
    """
    env = env if env is not None else dict(os.environ)
    req = PROVIDER_REQUIREMENTS.get(provider)
    if req is None:
        return {
            "ok": False,
            "status": _literal("provider_absent"),
            "missingScopes": [],
            "missingEnv": [],
            "repairHint": (
                f"Provider {provider!r} is not registered in preflight.py. "
                "Add PROVIDER_REQUIREMENTS entry before running meet-sync."
            ),
            "provider": provider,
        }

    missing_env: list[str] = []
    for var, pat in req.get("requiredEnv", ()):
        if not re.match(pat, env.get(var, "") or ""):
            missing_env.append(var)

    granted = set(granted_scopes or ())
    if probe_fn is not None:
        try:
            probe_payload = probe_fn(provider) or {}
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "status": _literal("provider_auth_blocked"),
                "missingScopes": [],
                "missingEnv": [],
                "repairHint": (
                    f"Live auth probe for {provider} failed: {exc}. "
                    f"{req.get('scopesHelp','')}"
                ).strip(),
                "provider": provider,
            }
        granted = set(probe_payload.get("scopes") or ())

    missing_scopes = [s for s in req.get("requiredScopes", ()) if s not in granted]

    ok = not missing_env and not missing_scopes
    status_value = _literal("recalled") if ok else _literal("provider_auth_blocked")
    hint_parts: list[str] = []
    if missing_env:
        hint_parts.append(
            "Set the following env vars in the provider envFile: "
            + ", ".join(missing_env)
        )
    if missing_scopes:
        hint_parts.append(req.get("scopesHelp", "Re-authorize the provider."))
    if ok:
        hint_parts = ["No action required."]

    return {
        "ok": ok,
        "status": status_value,
        "missingScopes": missing_scopes,
        "missingEnv": missing_env,
        "repairHint": " ".join(hint_parts).strip() or "No action required.",
        "provider": provider,
    }


__all__ = [
    "PROVIDER_REQUIREMENTS",
    "preflight",
]
