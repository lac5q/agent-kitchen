#!/usr/bin/env python3
"""Ingest Fathom meetings for one or more accounts into meet-recordings Markdown.

Resolves API keys from (in order):
1. Environment variable named by account.api_key_env
2. 1Password secret reference via `op read <api_key_op_ref>`
3. Auto-discovery: `op item list` entries whose title contains the account email
   and the word Fathom (field: credential | password | api key)

Usage:
  python3 fathom_ingest.py --accounts-config ~/.memroos/integrations/fathom-accounts.json
  python3 fathom_ingest.py --probe
  python3 fathom_ingest.py --dry-run --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FATHOM_API_BASE = "https://api.fathom.ai/external/v1"
DEFAULT_ACCOUNTS = [
    {
        "email": "luis@epiloguecapital.com",
        "label": "epilogue",
        # Note: op:// refs cannot contain '@'. Prefer titles without the at-sign.
        "api_key_op_ref": "op://Private/Fathom API Epilogue/credential",
        "api_key_env": "FATHOM_API_KEY_EPILOGUE",
    },
    {
        "email": "luis.calderon@gmail.com",
        "label": "gmail",
        "api_key_op_ref": "op://Private/Fathom API Gmail/credential",
        "api_key_env": "FATHOM_API_KEY_GMAIL",
    },
]


class SecretResolutionError(RuntimeError):
    pass


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "meeting"


def load_accounts(path: Path | None) -> list[dict[str, Any]]:
    if path is None:
        return [dict(a) for a in DEFAULT_ACCOUNTS]
    data = json.loads(path.read_text(encoding="utf-8"))
    accounts = data.get("accounts")
    if not isinstance(accounts, list) or not accounts:
        raise SystemExit(f"No accounts found in {path}")
    return accounts


def run_op(args: list[str], *, timeout: int = 60) -> str:
    env = os.environ.copy()
    try:
        completed = subprocess.run(
            ["op", *args],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
    except FileNotFoundError as exc:
        raise SecretResolutionError(
            "1Password CLI `op` is not installed. Install it or export FATHOM_API_KEY_* env vars."
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise SecretResolutionError(f"op {' '.join(args)} failed: {detail}") from exc
    return completed.stdout.strip()


def resolve_api_key(account: dict[str, Any]) -> str:
    email = str(account.get("email") or "")
    env_name = account.get("api_key_env")
    if env_name:
        env_value = os.environ.get(str(env_name), "").strip()
        if env_value:
            return env_value

    op_ref = str(account.get("api_key_op_ref") or "").strip()
    if op_ref:
        try:
            value = run_op(["read", op_ref])
            if value:
                return value
        except SecretResolutionError as exc:
            eprint(f"[{email}] op read {op_ref} failed: {exc}")

    # Auto-discover a 1Password item titled like "Fathom ... <email>"
    if email:
        try:
            raw = run_op(["item", "list", "--format=json"])
            items = json.loads(raw or "[]")
            needle = email.lower()
            # Match titles that include the email, email-with-%40, or account label hints.
            label = str(account.get("label") or "").lower()
            email_no_at = needle.replace("@", " ")
            email_pct = needle.replace("@", "%40")

            def title_matches(title: str) -> bool:
                t = title.lower()
                if "fathom" not in t:
                    return False
                if needle in t or email_pct in t or email_no_at in t:
                    return True
                if label and label in t and "fathom" in t:
                    return True
                # Heuristic labels used in accounts.example.json
                if label == "epilogue" and "epilogue" in t:
                    return True
                if label == "gmail" and "gmail" in t:
                    return True
                return False

            candidates = [
                item
                for item in items
                if isinstance(item, dict) and title_matches(str(item.get("title") or ""))
            ]
            for item in candidates:
                item_id = item.get("id")
                if not item_id:
                    continue
                for field in ("credential", "password", "api key", "API Key"):
                    try:
                        value = run_op(
                            [
                                "item",
                                "get",
                                str(item_id),
                                f"--fields=label={field}",
                                "--reveal",
                            ]
                        )
                        if value:
                            eprint(
                                f"[{email}] resolved API key from 1Password item "
                                f"{item.get('title')!r} field {field!r}"
                            )
                            return value
                    except SecretResolutionError:
                        continue
                # Fallback: full item JSON and pick a concealed/secret field
                try:
                    detail_raw = run_op(
                        ["item", "get", str(item_id), "--format=json", "--reveal"]
                    )
                    detail = json.loads(detail_raw)
                    for field in detail.get("fields") or []:
                        if not isinstance(field, dict):
                            continue
                        label = str(field.get("label") or "").lower()
                        ftype = str(field.get("type") or "").lower()
                        if ftype in {"concealed", "otp"} or any(
                            token in label
                            for token in ("api", "credential", "password", "token", "secret")
                        ):
                            value = str(field.get("value") or "").strip()
                            if value:
                                eprint(
                                    f"[{email}] resolved API key from item field "
                                    f"{field.get('label')!r}"
                                )
                                return value
                except SecretResolutionError:
                    continue
        except SecretResolutionError as exc:
            eprint(f"[{email}] 1Password auto-discovery failed: {exc}")

    raise SecretResolutionError(
        f"Could not resolve Fathom API key for {email or account.get('label') or 'account'}. "
        "Set the account api_key_env, fix api_key_op_ref (no '@' in op:// refs), or ensure an "
        "op item titled like 'Fathom API Epilogue' / 'Fathom API Gmail' exists and `op` is authenticated."
    )


def fathom_get(api_key: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params, doseq=True)
    url = f"{FATHOM_API_BASE}{path}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "X-Api-Key": api_key,
            "Accept": "application/json",
            "User-Agent": "memroos-fathom-ingest/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Fathom API {path} HTTP {exc.code}: {body[:500]}") from exc
    return json.loads(payload or "{}")


def list_meetings(
    api_key: str,
    *,
    include_transcript: bool = True,
    include_summary: bool = True,
    include_action_items: bool = True,
    created_after: str | None = None,
    max_pages: int = 50,
    sleep_s: float = 1.05,
) -> list[dict[str, Any]]:
    """Paginate GET /meetings. Sleeps to stay under the 60 req/min rate limit."""
    meetings: list[dict[str, Any]] = []
    cursor: str | None = None
    pages = 0
    while pages < max_pages:
        params: dict[str, Any] = {
            "include_transcript": str(include_transcript).lower(),
            "include_summary": str(include_summary).lower(),
            "include_action_items": str(include_action_items).lower(),
        }
        if created_after:
            params["created_after"] = created_after
        if cursor:
            params["cursor"] = cursor
        page = fathom_get(api_key, "/meetings", params)
        items = page.get("items") or []
        if isinstance(items, list):
            meetings.extend(item for item in items if isinstance(item, dict))
        cursor = page.get("next_cursor") or None
        pages += 1
        if not cursor:
            break
        time.sleep(sleep_s)
    return meetings


def meeting_date(meeting: dict[str, Any]) -> str:
    for key in ("recording_start_time", "scheduled_start_time", "created_at"):
        value = meeting.get(key)
        if isinstance(value, str) and len(value) >= 10:
            return value[:10]
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def transcript_to_markdown(transcript: Any) -> str:
    if not transcript:
        return ""
    if isinstance(transcript, str):
        return transcript.strip()
    lines: list[str] = []
    if isinstance(transcript, list):
        for item in transcript:
            if not isinstance(item, dict):
                continue
            speaker_obj = item.get("speaker") or {}
            speaker = (
                speaker_obj.get("display_name")
                if isinstance(speaker_obj, dict)
                else None
            ) or "Speaker"
            stamp = item.get("timestamp") or ""
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            prefix = f"**{speaker}**"
            if stamp:
                prefix = f"{prefix} ({stamp})"
            lines.append(f"{prefix}: {text}")
    return "\n\n".join(lines)


def render_meeting_markdown(meeting: dict[str, Any], *, account_email: str) -> str:
    title = (
        meeting.get("title")
        or meeting.get("meeting_title")
        or f"Fathom meeting {meeting.get('recording_id')}"
    )
    recorded_by = meeting.get("recorded_by") or {}
    recorder_email = ""
    recorder_name = ""
    if isinstance(recorded_by, dict):
        recorder_email = str(recorded_by.get("email") or "")
        recorder_name = str(recorded_by.get("name") or "")

    invitees = meeting.get("calendar_invitees") or []
    invitee_lines: list[str] = []
    if isinstance(invitees, list):
        for invitee in invitees:
            if not isinstance(invitee, dict):
                continue
            name = invitee.get("name") or invitee.get("email") or "Unknown"
            email = invitee.get("email") or ""
            invitee_lines.append(f"- {name}" + (f" <{email}>" if email else ""))

    summary = ""
    default_summary = meeting.get("default_summary")
    if isinstance(default_summary, dict):
        summary = str(default_summary.get("markdown_formatted") or "").strip()
    elif isinstance(default_summary, str):
        summary = default_summary.strip()

    action_items = meeting.get("action_items") or []
    action_lines: list[str] = []
    if isinstance(action_items, list):
        for item in action_items:
            if not isinstance(item, dict):
                continue
            desc = str(item.get("description") or "").strip()
            if not desc:
                continue
            assignee = item.get("assignee") or {}
            who = ""
            if isinstance(assignee, dict) and assignee.get("email"):
                who = f" (@{assignee.get('email')})"
            done = "x" if item.get("completed") else " "
            action_lines.append(f"- [{done}] {desc}{who}")

    transcript_md = transcript_to_markdown(meeting.get("transcript"))
    share_url = meeting.get("share_url") or meeting.get("url") or ""

    parts = [
        f"# {title}",
        "",
        f"- Source: Fathom",
        f"- Account: {account_email}",
        f"- Recording ID: {meeting.get('recording_id')}",
        f"- Created: {meeting.get('created_at')}",
        f"- Recording start: {meeting.get('recording_start_time')}",
        f"- Recording end: {meeting.get('recording_end_time')}",
        f"- Recorded by: {recorder_name} <{recorder_email}>".rstrip(),
    ]
    if share_url:
        parts.append(f"- Share URL: {share_url}")
    parts.append("")

    if invitee_lines:
        parts.extend(["## Participants", "", *invitee_lines, ""])
    if summary:
        parts.extend(["## Summary", "", summary, ""])
    if action_lines:
        parts.extend(["## Action Items", "", *action_lines, ""])
    parts.extend(["## Transcript", ""])
    if transcript_md:
        parts.append(transcript_md)
    else:
        parts.append("_Transcript not included in API response._")
    parts.append("")
    return "\n".join(parts)


def meeting_filename(meeting: dict[str, Any], *, account_label: str) -> str:
    date = meeting_date(meeting)
    title = slugify(str(meeting.get("title") or meeting.get("meeting_title") or "meeting"))
    recording_id = meeting.get("recording_id") or "unknown"
    label = slugify(account_label or "fathom")
    return f"{date}-fathom-{label}-{recording_id}-{title[:60]}.md"


def write_meetings(
    meetings: list[dict[str, Any]],
    *,
    output_dir: Path,
    account_email: str,
    account_label: str,
    dry_run: bool,
) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for meeting in meetings:
        filename = meeting_filename(meeting, account_label=account_label)
        path = output_dir / filename
        body = render_meeting_markdown(meeting, account_email=account_email)
        if dry_run:
            eprint(f"[dry-run] would write {path} ({len(body)} bytes)")
            written += 1
            continue
        path.write_text(body, encoding="utf-8")
        written += 1
    return written


def probe_account(account: dict[str, Any]) -> dict[str, Any]:
    email = str(account.get("email") or "")
    label = str(account.get("label") or email or "account")
    api_key = resolve_api_key(account)
    meetings = list_meetings(
        api_key,
        include_transcript=False,
        include_summary=False,
        include_action_items=False,
        max_pages=1,
        sleep_s=0,
    )
    return {
        "email": email,
        "label": label,
        "ok": True,
        "meeting_count_sample": len(meetings),
        "sample_titles": [m.get("title") for m in meetings[:3]],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    default_root = Path(os.environ.get("MEMROOS_ROOT") or Path(__file__).resolve().parents[3])
    parser.add_argument(
        "--accounts-config",
        type=Path,
        default=Path(
            os.environ.get(
                "FATHOM_ACCOUNTS_CONFIG",
                str(Path.home() / ".memroos" / "integrations" / "fathom-accounts.json"),
            )
        ),
        help="JSON file listing Fathom accounts + 1Password refs",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(
            os.environ.get(
                "FATHOM_OUTPUT_DIR",
                str(default_root / "data" / "context" / "meet-recordings"),
            )
        ),
    )
    parser.add_argument("--created-after", default=os.environ.get("FATHOM_CREATED_AFTER") or None)
    parser.add_argument("--limit", type=int, default=None, help="Max meetings per account")
    parser.add_argument("--max-pages", type=int, default=50)
    parser.add_argument("--probe", action="store_true", help="Validate both account keys and exit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--allow-missing-config",
        action="store_true",
        help="Use built-in Epilogue/Gmail account defaults when config file is missing",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    config_path: Path = args.accounts_config
    if config_path.exists():
        accounts = load_accounts(config_path)
    elif args.allow_missing_config or not config_path.as_posix().endswith("fathom-accounts.json"):
        eprint(f"Accounts config missing at {config_path}; using built-in defaults")
        accounts = load_accounts(None)
    else:
        # Default path: fall back to built-ins so install-local can probe early
        eprint(f"Accounts config not found at {config_path}; using built-in defaults")
        accounts = load_accounts(None)

    if args.probe:
        results = []
        failures = 0
        for account in accounts:
            email = account.get("email")
            try:
                result = probe_account(account)
                results.append(result)
                eprint(
                    f"[ok] {email}: sample={result['meeting_count_sample']} "
                    f"titles={result['sample_titles']}"
                )
            except Exception as exc:  # noqa: BLE001 - surface per-account probe failures
                failures += 1
                results.append({"email": email, "ok": False, "error": str(exc)})
                eprint(f"[fail] {email}: {exc}")
        print(json.dumps({"ok": failures == 0, "accounts": results}, indent=2))
        return 0 if failures == 0 else 1

    total = 0
    errors: list[str] = []
    for account in accounts:
        email = str(account.get("email") or "")
        label = str(account.get("label") or slugify(email) or "fathom")
        try:
            api_key = resolve_api_key(account)
            meetings = list_meetings(
                api_key,
                created_after=args.created_after,
                max_pages=args.max_pages,
            )
            if args.limit is not None:
                meetings = meetings[: args.limit]
            count = write_meetings(
                meetings,
                output_dir=args.output_dir,
                account_email=email,
                account_label=label,
                dry_run=args.dry_run,
            )
            total += count
            eprint(f"[{email}] wrote {count} meeting file(s) -> {args.output_dir}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{email}: {exc}")
            eprint(f"[{email}] ERROR: {exc}")

    if errors:
        eprint(f"Completed with {len(errors)} account error(s); wrote {total} file(s)")
        return 1
    eprint(f"Done. Wrote {total} meeting file(s) across {len(accounts)} account(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
