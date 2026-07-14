"""
notify.py — Universal multi-channel notifier for memroos.

Sends alerts to whichever channels are configured via env vars.
Always writes to a local fallback file (alerts.log) regardless of
remote channels, so an operator without Discord/Telegram/Slack
still sees failures.

Configuration (env vars, all optional):
    NOTIFY_DISCORD_WEBHOOK   Discord incoming webhook URL
    NOTIFY_TELEGRAM_BOT_TOKEN  Telegram bot token
    NOTIFY_TELEGRAM_CHAT_ID    Telegram chat ID to DM
    NOTIFY_SLACK_WEBHOOK     Slack incoming webhook URL
    NOTIFY_MACOS=1           Enable macOS Notification Center alerts
                             (default: auto-enabled on darwin, no-op elsewhere)
    NOTIFY_FILE_PATH         Local alerts log path
                             (default: <log_dir>/alerts.log)

Quiet no-op if no channel is reachable — never raises, never blocks.
Thread-safe via a single lock; safe to call from request handlers.

Usage:
    from notify import notify
    notify("memory_add_failed", "Ollama unreachable for 3 min",
           details={"agent_id": "alba", "queued": 12})
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    import httpx as _httpx_type
    import requests as _requests_type

try:
    import httpx as _httpx

    HTTPX_AVAILABLE = True
except ImportError:
    _httpx = None  # type: ignore[assignment]
    HTTPX_AVAILABLE = False

try:
    import requests as _requests

    REQUESTS_AVAILABLE = True
except ImportError:
    _requests = None  # type: ignore[assignment]
    REQUESTS_AVAILABLE = False

_LOCK = threading.Lock()
_ALERT_LOG: Path | None = None


def _alert_log_path() -> Path:
    """Resolve the local fallback alerts.log path (env override or default)."""
    global _ALERT_LOG
    if _ALERT_LOG is not None:
        return _ALERT_LOG
    env_path = os.environ.get("NOTIFY_FILE_PATH", "").strip()
    if env_path:
        _ALERT_LOG = Path(env_path)
    else:
        # Default: <log_dir>/alerts.log, where log_dir is the same one
        # mem0-server.py uses (parent of this file / logs).
        _ALERT_LOG = Path(__file__).parent / "logs" / "alerts.log"
    _ALERT_LOG.parent.mkdir(parents=True, exist_ok=True)
    return _ALERT_LOG


def _format_message(event: str, summary: str, details: dict[str, Any]) -> str:
    """Plain-text body used by all channels."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [f"[memroos:{event}] {summary}", f"  when: {ts}"]
    if details:
        for k, v in details.items():
            v_str = str(v)
            if len(v_str) > 200:
                v_str = v_str[:200] + "..."
            lines.append(f"  {k}: {v_str}")
    return "\n".join(lines)


def _send_discord(text: str) -> bool:
    webhook = os.environ.get("NOTIFY_DISCORD_WEBHOOK", "").strip()
    if not webhook:
        return False
    # Discord has a 2000-char limit on content; truncate gracefully.
    if len(text) > 1900:
        text = text[:1900] + "\n... (truncated)"
    payload = {"content": text}
    try:
        if HTTPX_AVAILABLE and _httpx is not None:
            r = _httpx.post(webhook, json=payload, timeout=5.0)
        elif REQUESTS_AVAILABLE and _requests is not None:
            r = _requests.post(webhook, json=payload, timeout=5.0)
        else:
            return False
        return 200 <= r.status_code < 300
    except Exception as e:  # noqa: BLE001 — never raise from notify
        _log_internal(f"discord send failed: {e}")
        return False


def _send_telegram(text: str) -> bool:
    token = os.environ.get("NOTIFY_TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("NOTIFY_TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False
    # Telegram has a 4096-char limit; truncate.
    if len(text) > 4000:
        text = text[:4000] + "\n... (truncated)"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    try:
        if HTTPX_AVAILABLE and _httpx is not None:
            r = _httpx.post(url, json=payload, timeout=5.0)
        elif REQUESTS_AVAILABLE and _requests is not None:
            r = _requests.post(url, json=payload, timeout=5.0)
        else:
            return False
        return 200 <= r.status_code < 300
    except Exception as e:  # noqa: BLE001
        _log_internal(f"telegram send failed: {e}")
        return False


def _send_slack(text: str) -> bool:
    webhook = os.environ.get("NOTIFY_SLACK_WEBHOOK", "").strip()
    if not webhook:
        return False
    if len(text) > 3500:
        text = text[:3500] + "\n... (truncated)"
    payload = {"text": text}
    try:
        if HTTPX_AVAILABLE and _httpx is not None:
            r = _httpx.post(webhook, json=payload, timeout=5.0)
        elif REQUESTS_AVAILABLE and _requests is not None:
            r = _requests.post(webhook, json=payload, timeout=5.0)
        else:
            return False
        return 200 <= r.status_code < 300
    except Exception as e:  # noqa: BLE001
        _log_internal(f"slack send failed: {e}")
        return False


def _send_macos(text: str) -> bool:
    """Native macOS Notification Center alert. No-op on other OSes."""
    if platform.system() != "Darwin":
        return False
    explicit = os.environ.get("NOTIFY_MACOS", "").strip().lower()
    if explicit in ("0", "false", "no", "off"):
        return False
    # First line is the title; rest is the body.
    parts = text.split("\n", 1)
    title = parts[0][:120]
    body = parts[1] if len(parts) > 1 else ""
    # Strip ANSI / control chars to avoid terminal-notifier weirdness.
    body = "".join(ch for ch in body if ch.isprintable() or ch in "\n\t")[:500]
    try:
        # osascript is built into macOS — no extra deps.
        script = (
            f'display notification "{body.replace(chr(34), chr(92)+chr(34))}" '
            f'with title "{title.replace(chr(34), chr(92)+chr(34))}"'
        )
        subprocess.run(
            ["osascript", "-e", script],
            timeout=2,
            check=False,
            capture_output=True,
        )
        return True
    except Exception as e:  # noqa: BLE001
        _log_internal(f"macos notify failed: {e}")
        return False


def _log_internal(msg: str) -> None:
    """Internal errors in the notifier itself go to stderr only — never spam."""
    print(f"[notify internal] {msg}", file=sys.stderr, flush=True)


def _write_alert_file(event: str, text: str, details: dict[str, Any]) -> None:
    """Universal fallback: always append to local alerts.log so nothing is lost."""
    try:
        path = _alert_log_path()
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "details": details,
            "message": text,
        }
        with _LOCK:
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
    except Exception as e:  # noqa: BLE001
        _log_internal(f"alert file write failed: {e}")


def notify(event: str, summary: str, details: dict[str, Any] | None = None) -> dict[str, bool]:
    """
    Send an alert to all configured channels. Returns a dict of channel→ok.

    Never raises. Never blocks longer than ~5s/channel (each has its own timeout).
    Always writes to local alerts.log as the universal fallback.
    """
    details = details or {}
    text = _format_message(event, summary, details)
    results: dict[str, bool] = {}

    # Local file first — guaranteed durable record.
    _write_alert_file(event, text, details)
    results["file"] = True

    # Remote channels in parallel-ish (sequential is fine, each has short timeout).
    results["discord"] = _send_discord(text)
    results["telegram"] = _send_telegram(text)
    results["slack"] = _send_slack(text)
    results["macos"] = _send_macos(text)

    return results


def reset_for_tests() -> None:
    """Clear cached path. Test-only."""
    global _ALERT_LOG
    _ALERT_LOG = None