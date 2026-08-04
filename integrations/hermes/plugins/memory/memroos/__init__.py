"""MemRoOS Hermes memory provider — dual-mode (opt-in observe).

Built-in Hermes MEMORY.md / USER.md remain always-on and are NEVER rewritten
by this plugin. When activated via ``memory.provider: memroos``, MemRoOS
mirrors built-in memory writes to POST /api/native-memory/ingest in
``observe`` mode (fail-open: ingest errors never block Hermes).

Modes (``$HERMES_HOME/memroos-memory.json``):
  observe   — default when provider is on; mirror only (safe for local testing)
  governed  — reserved / deferred; still does not rewrite MEMORY.md in v1

Disable entirely with ``hermes memory off`` or unset ``memory.provider``.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)

_DEFAULT_MODE = "observe"
_ALLOWED_MODES = frozenset({"observe", "governed"})
_CONFIG_NAME = "memroos-memory.json"
_RECEIPTS_DIR = "memroos-memory"
_TIMEOUT_S = 5.0


def _hermes_home(kwargs_home: Optional[str] = None) -> Path:
    if kwargs_home:
        return Path(kwargs_home)
    env = os.environ.get("HERMES_HOME", "").strip()
    if env:
        return Path(env)
    return Path.home() / ".hermes"


def load_memroos_config(hermes_home: Path) -> Dict[str, Any]:
    path = hermes_home / _CONFIG_NAME
    if not path.is_file():
        return {
            "mode": _DEFAULT_MODE,
            "operator_url": os.environ.get("MEMROOS_OPERATOR_URL")
            or os.environ.get("MEMROOS_APP_URL")
            or "",
            "rewrite_local": False,
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"mode": _DEFAULT_MODE, "operator_url": "", "rewrite_local": False}
        mode = str(data.get("mode") or _DEFAULT_MODE).strip().lower()
        if mode not in _ALLOWED_MODES:
            mode = _DEFAULT_MODE
        url = str(
            data.get("operator_url")
            or os.environ.get("MEMROOS_OPERATOR_URL")
            or os.environ.get("MEMROOS_APP_URL")
            or ""
        ).strip().rstrip("/")
        # Hard rule: never rewrite local MEMORY.md in v1.
        return {
            "mode": mode,
            "operator_url": url,
            "rewrite_local": False,
            "agent_id": str(data.get("agent_id") or "hermes"),
            "user_id": str(data.get("user_id") or os.environ.get("USER") or "local"),
        }
    except Exception as exc:
        logger.warning("memroos: failed to read %s: %s", path, exc)
        return {"mode": _DEFAULT_MODE, "operator_url": "", "rewrite_local": False}


def append_local_receipt(hermes_home: Path, receipt: Dict[str, Any]) -> Path:
    """Persist an observe receipt under HERMES_HOME (never touches MEMORY.md)."""
    out_dir = hermes_home / _RECEIPTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "observe-receipts.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(receipt, ensure_ascii=False) + "\n")
    return path


def post_native_memory_ingest(
    *,
    operator_url: str,
    api_key: str,
    body: Dict[str, Any],
    timeout_s: float = _TIMEOUT_S,
) -> Dict[str, Any]:
    """POST to MemRoOS native-memory ingest. Raises on HTTP/network errors."""
    url = f"{operator_url.rstrip('/')}/api/native-memory/ingest"
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


class MemroosMemoryProvider(MemoryProvider):
    """Additive MemRoOS memory provider — observe-mode mirror."""

    def __init__(self) -> None:
        self._session_id = ""
        self._hermes_home = _hermes_home()
        self._config: Dict[str, Any] = {}
        self._agent_context = "primary"
        self._last_ingest_ok: Optional[bool] = None
        self._last_error: Optional[str] = None
        self._mirror_count = 0

    @property
    def name(self) -> str:
        return "memroos"

    def is_available(self) -> bool:
        """No network — available when URL + API key are present OR dry-run allowed."""
        cfg = load_memroos_config(_hermes_home())
        key = (
            os.environ.get("MEMROOS_AGENT_API_KEY")
            or os.environ.get("MEMROOS_OPERATOR_API_KEY")
            or ""
        ).strip()
        # Allow activation for local dry-run (receipts only) even without URL,
        # so Luis can enable the provider and inspect receipts offline.
        if cfg.get("operator_url") and key:
            return True
        if os.environ.get("MEMROOS_HERMES_DRY_RUN", "").strip() in {"1", "true", "yes"}:
            return True
        # Still list as available so setup can complete; initialize will warn.
        return True

    def initialize(self, session_id: str, **kwargs) -> None:
        self._session_id = session_id
        self._hermes_home = _hermes_home(kwargs.get("hermes_home"))
        self._config = load_memroos_config(self._hermes_home)
        self._agent_context = str(kwargs.get("agent_context") or "primary")
        logger.info(
            "memroos memory provider initialized mode=%s rewrite_local=%s url=%s",
            self._config.get("mode"),
            self._config.get("rewrite_local"),
            bool(self._config.get("operator_url")),
        )

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return [
            {
                "key": "api_key",
                "description": "MemRoOS agent or operator API key",
                "secret": True,
                "required": False,
                "env_var": "MEMROOS_AGENT_API_KEY",
            },
            {
                "key": "operator_url",
                "description": "MemRoOS operator base URL (e.g. http://127.0.0.1:3000)",
                "default": "http://127.0.0.1:3000",
            },
            {
                "key": "mode",
                "description": "observe = mirror only (recommended); governed = reserved",
                "default": "observe",
                "choices": ["observe", "governed"],
            },
        ]

    def save_config(self, values: Dict[str, Any], hermes_home: str) -> None:
        home = Path(hermes_home)
        home.mkdir(parents=True, exist_ok=True)
        path = home / _CONFIG_NAME
        existing = load_memroos_config(home)
        mode = str(values.get("mode") or existing.get("mode") or _DEFAULT_MODE).lower()
        if mode not in _ALLOWED_MODES:
            mode = _DEFAULT_MODE
        payload = {
            "mode": mode,
            "operator_url": str(
                values.get("operator_url") or existing.get("operator_url") or ""
            ).strip().rstrip("/"),
            "rewrite_local": False,
            "agent_id": existing.get("agent_id") or "hermes",
            "user_id": existing.get("user_id") or os.environ.get("USER") or "local",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def system_prompt_block(self) -> str:
        mode = self._config.get("mode", _DEFAULT_MODE)
        return (
            "MemRoOS memory provider is active in "
            f"**{mode}** mode. Built-in MEMORY.md remains the local source of truth. "
            "MemRoOS receives mirrored copies for governance testing; it does not "
            "replace Hermes memory. Prefer skills for procedural lessons."
        )

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "memroos_memory_status",
                "description": (
                    "Show MemRoOS Hermes dual-mode memory status (mode, mirror count, "
                    "last ingest result). Does not change MEMORY.md."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            }
        ]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        if tool_name != "memroos_memory_status":
            return json.dumps({"error": f"unknown tool {tool_name}"})
        return json.dumps(
            {
                "provider": "memroos",
                "mode": self._config.get("mode"),
                "rewrite_local": False,
                "operator_url_configured": bool(self._config.get("operator_url")),
                "mirror_count": self._mirror_count,
                "last_ingest_ok": self._last_ingest_ok,
                "last_error": self._last_error,
                "builtin_memory": "always_on",
            }
        )

    def on_memory_write(self, action: str, target: str, content: str) -> None:
        """Mirror built-in writes. Never rewrite MEMORY.md. Fail-open."""
        if self._agent_context not in {"primary", ""}:
            return
        if action not in {"add", "replace"}:
            # removals: record receipt only; MemRoOS tombstone is separate path
            self._record(
                action=action,
                target=target,
                content=content,
                ingest=None,
                error="skipped_non_add",
            )
            return

        mode = self._config.get("mode", _DEFAULT_MODE)
        if mode not in _ALLOWED_MODES:
            mode = _DEFAULT_MODE

        # Hard guarantee: never rewrite local files in v1 (even if config lies).
        if self._config.get("rewrite_local") is True:
            logger.warning("memroos: rewrite_local ignored — v1 forbids rewriting MEMORY.md")

        api_key = (
            os.environ.get("MEMROOS_AGENT_API_KEY")
            or os.environ.get("MEMROOS_OPERATOR_API_KEY")
            or ""
        ).strip()
        operator_url = str(self._config.get("operator_url") or "").strip()
        dry_run = os.environ.get("MEMROOS_HERMES_DRY_RUN", "").strip() in {
            "1",
            "true",
            "yes",
        }

        body = {
            "source": "hermes",
            "agentId": str(self._config.get("agent_id") or "hermes"),
            "userId": str(self._config.get("user_id") or "local"),
            "content": content,
            "memoryPath": f"MEMORY.md#{target}",
        }

        ingest_result: Optional[Dict[str, Any]] = None
        error: Optional[str] = None

        if operator_url and api_key and not dry_run:
            try:
                ingest_result = post_native_memory_ingest(
                    operator_url=operator_url,
                    api_key=api_key,
                    body=body,
                )
                self._last_ingest_ok = True
                self._last_error = None
            except Exception as exc:
                # Fail-open: Hermes built-in write already succeeded.
                error = str(exc)
                self._last_ingest_ok = False
                self._last_error = error
                logger.warning("memroos observe ingest failed (Hermes memory unchanged): %s", exc)
        else:
            error = "dry_run_or_missing_credentials"
            self._last_ingest_ok = None
            self._last_error = error

        self._mirror_count += 1
        self._record(
            action=action,
            target=target,
            content=content,
            ingest=ingest_result,
            error=error,
            mode=mode,
        )

    def _run_lifecycle_hook(
        self,
        hook_name: str,
        payload: Optional[Dict[str, Any]] = None,
        timeout_s: float = 5.0,
    ) -> str:
        """Run the shared fail-open hook and return only its injection text."""
        hook_root = Path(os.environ.get("MEMROOS_HOOK_ROOT") or (Path.home() / ".memroos"))
        script = hook_root / "hooks" / hook_name
        if not script.is_file():
            # The plugin can load before the central installer has converged;
            # Hermes must continue with its native lifecycle in that state.
            return ""
        body = {
            "sourceAgentId": str(self._config.get("agent_id") or "hermes"),
            "runtime": "hermes",
            "sessionId": self._session_id,
            **(payload or {}),
        }
        try:
            completed = subprocess.run(
                ["/bin/bash", str(script)],
                input=json.dumps(body),
                text=True,
                capture_output=True,
                timeout=timeout_s,
                check=False,
            )
            if completed.returncode != 0:
                logger.warning("memroos lifecycle hook %s returned %s (fail-open)", hook_name, completed.returncode)
                return ""
            return completed.stdout.strip() if hook_name.endswith("brief.sh") else ""
        except subprocess.TimeoutExpired:
            logger.warning("memroos lifecycle hook %s timed out (fail-open)", hook_name)
            return ""
        except Exception as exc:
            logger.warning("memroos lifecycle hook %s failed (fail-open): %s", hook_name, exc)
            return ""

    def on_session_start(self, payload: Optional[Dict[str, Any]] = None, **kwargs: Any) -> str:
        """Portable Hermes session-start equivalent; empty output is a miss."""
        merged = {**(payload or {}), **kwargs}
        return self._run_lifecycle_hook("memroos-memory-brief.sh", merged, timeout_s=2.0)

    def on_session_end(self, payload: Optional[Dict[str, Any]] = None, **kwargs: Any) -> None:
        """Portable Hermes stop equivalent. Never blocks the native session."""
        merged = {"phase": "stop", **(payload or {}), **kwargs}
        self._run_lifecycle_hook("memroos-capture-gate.sh", merged, timeout_s=5.0)

    def on_pre_compact(self, payload: Optional[Dict[str, Any]] = None, **kwargs: Any) -> None:
        """Portable Hermes pre-compaction equivalent. Never blocks compaction."""
        merged = {"phase": "pre_compact", **(payload or {}), **kwargs}
        self._run_lifecycle_hook("memroos-capture-gate.sh", merged, timeout_s=5.0)

    def _record(
        self,
        *,
        action: str,
        target: str,
        content: str,
        ingest: Optional[Dict[str, Any]],
        error: Optional[str],
        mode: Optional[str] = None,
    ) -> None:
        receipt = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "session_id": self._session_id,
            "mode": mode or self._config.get("mode"),
            "action": action,
            "target": target,
            "content_chars": len(content or ""),
            "content_preview": (content or "")[:120],
            "ingest_ok": ingest is not None and error is None,
            "budget_status": (ingest or {}).get("budgetStatus"),
            "alerts": (ingest or {}).get("alerts"),
            "error": error,
            "rewrite_local": False,
        }
        try:
            append_local_receipt(self._hermes_home, receipt)
        except Exception as exc:
            logger.debug("memroos: receipt write failed: %s", exc)


def register(ctx) -> None:
    """Hermes plugin entry — register the MemRoOS memory provider instance."""
    ctx.register_memory_provider(MemroosMemoryProvider())
