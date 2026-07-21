#!/usr/bin/env python3
"""
MemroOS oracle-1 healthcheck watchdog.

Hits two endpoints on oracle-1:
  - http://127.0.0.1:3000/api/health   (Next.js operator; services + disk)
  - http://127.0.0.1:3201/health      (mem0; vector store + queue)

When any non-optional service reports "down" or "degraded", or disk hits
"warning"/"critical",
opens (or reuses) a GitHub issue on lac5q/memroos with a fixed, deduplicated
title per failure signature. Cooldown: don't re-open a signature for 6h.

Cron: systemd timer every 30 min (matches memroos-disk-watch cadence).
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

WEB_HEALTH = os.environ.get("MEMROOS_WEB_HEALTH", "http://127.0.0.1:3000/api/health")
WEB_MEMORY_HEALTH = os.environ.get("MEMROOS_WEB_MEMORY_HEALTH", "http://127.0.0.1:3000/api/memory/health")
MEMROOS_RECALL_STALE_HOURS = float(os.environ.get("MEMROOS_RECALL_STALE_HOURS", "6"))
MEM0_HEALTH = os.environ.get("MEMROOS_MEM0_HEALTH", "http://127.0.0.1:3201/health")
GH_REPO = os.environ.get("MEMROOS_GH_REPO", "lac5q/memroos")
GH_TOKEN_FILE = os.environ.get("MEMROOS_GH_TOKEN_FILE", "/etc/memroos/gh-token")
STATE_DIR = Path(os.environ.get("MEMROOS_HEALTHCHECK_STATE", "/run/memroos-healthcheck"))
LOG_FILE = os.environ.get("MEMROOS_HEALTHCHECK_LOG", "/var/log/memroos/healthcheck.log")
COOLDOWN_S = int(os.environ.get("MEMROOS_HEALTHCHECK_COOLDOWN_S", str(6 * 3600)))
REQUEST_TIMEOUT = 8
GH_REQUEST_TIMEOUT = 12
RUN_TIMEOUT_S = 85
OPEN_ISSUES_PER_PAGE = 100
OPEN_ISSUES_MAX_PAGES = 10
LABELS = ["healthcheck", "oracle-1", "automated"]
OPTIONAL_LOCAL_TOOL_SERVICES = frozenset({"RTK", "QMD", "Knowledge Index"})
RUN_DEADLINE: Optional[float] = None


def start_run_deadline(timeout_s: float = RUN_TIMEOUT_S) -> None:
    """Set the monotonic deadline shared by all HTTP calls in this run."""
    global RUN_DEADLINE
    RUN_DEADLINE = time.monotonic() + timeout_s


def remaining_request_timeout(default_timeout: float, *, now: Optional[float] = None) -> float:
    """Return the request timeout clipped to the watchdog's remaining runtime."""
    if RUN_DEADLINE is None:
        return default_timeout
    remaining = RUN_DEADLINE - (time.monotonic() if now is None else now)
    if remaining <= 0:
        raise TimeoutError("healthcheck run deadline exceeded")
    return min(default_timeout, remaining)


def is_intentional_optional_degradation(name: str, detail: str) -> bool:
    """Allow only explicit optional-local-tool absence to suppress a degradation."""
    if name not in OPTIONAL_LOCAL_TOOL_SERVICES or not isinstance(detail, str):
        return False
    normalized = detail.lower()
    is_optional = bool(re.search(r"\boptional\b", normalized))
    is_absent_or_skipped = bool(
        re.search(r"\b(not installed|missing|absent|unavailable|skipped)\b", normalized)
    )
    return is_optional and is_absent_or_skipped


def http_json(url: str) -> Optional[dict]:
    try:
        with urllib.request.urlopen(url, timeout=remaining_request_timeout(REQUEST_TIMEOUT)) as r:
            return json.load(r)
    except Exception as e:
        return {"__error__": str(e), "__url__": url}


def gh_token() -> Optional[str]:
    p = Path(GH_TOKEN_FILE)
    if not p.exists():
        return None
    tok = p.read_text().strip()
    return tok or None


def gh_api(method: str, path: str, body: Optional[dict] = None) -> Tuple[int, object]:
    token = gh_token()
    if not token:
        return 0, {"error": "no_token"}
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "memroos-oracle-1-healthcheck/1.0",
        },
    )
    data = json.dumps(body).encode() if body else None
    try:
        with urllib.request.urlopen(
            req, data=data, timeout=remaining_request_timeout(GH_REQUEST_TIMEOUT)
        ) as r:
            payload = json.load(r)
            return r.status, payload
    except urllib.error.HTTPError as e:
        try:
            payload = json.load(e)
        except Exception:
            payload = {"error": e.reason}
        return e.code, payload
    except Exception as e:
        return 0, {"error": str(e)}


def find_open_issue(signature: str) -> Tuple[str, Optional[dict]]:
    """Find an issue, returning found, missing, or unknown if lookup was incomplete."""
    for page in range(1, OPEN_ISSUES_MAX_PAGES + 1):
        status, data = gh_api(
            "GET",
            f"/repos/{GH_REPO}/issues?state=open&per_page={OPEN_ISSUES_PER_PAGE}"
            f"&labels=healthcheck&page={page}",
        )
        if status != 200 or not isinstance(data, list):
            return "unknown", None
        for item in data:
            if isinstance(item, dict) and item.get("title", "").startswith(
                f"[healthcheck] {signature}"
            ):
                return "found", item
        if len(data) < OPEN_ISSUES_PER_PAGE:
            return "missing", None
    return "unknown", None


def open_issue(signature: str, title_suffix: str, body_md: str) -> Optional[dict]:
    title = f"[healthcheck] {signature} — {title_suffix}"
    payload = {
        "title": title[:240],
        "body": body_md[:65000],
        "labels": LABELS,
    }
    status, data = gh_api("POST", f"/repos/{GH_REPO}/issues", payload)
    if status == 201 and isinstance(data, dict):
        return data
    log(f"  → GitHub issue create FAILED status={status} body={json.dumps(data)[:200]}")
    return None


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    line = f"[{ts}] {msg}"
    print(line)
    Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass  # best-effort; do not let log write break healthcheck


def signature_key(sig: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", sig)[:120]
    return STATE_DIR / f"{safe}.last"


def should_fire(sig: str) -> bool:
    p = signature_key(sig)
    if not p.exists():
        return True
    try:
        last = float(p.read_text().strip().splitlines()[0])
    except (ValueError, IndexError):
        return True
    return (time.time() - last) >= COOLDOWN_S


def mark_fired(sig: str, issue_url: str) -> None:
    p = signature_key(sig)
    p.write_text(f"{time.time()}\n{issue_url}\n")


def disk_path_for_state(disk: dict, state: str) -> dict:
    """Return the path entry responsible for a disk state, including home advisory."""
    paths = [entry for entry in disk.get("paths") or [] if isinstance(entry, dict)]
    home_advisory = disk.get("home_advisory")
    if isinstance(home_advisory, dict):
        paths.append(home_advisory)
    for path in paths:
        if path.get(state):
            return path
    return paths[0] if paths else {}


def collect_failures() -> list:
    failures = []

    web = http_json(WEB_HEALTH)
    mem = http_json(MEM0_HEALTH)

    for label, data in (("operator-web", web), ("mem0", mem)):
        if isinstance(data, dict) and "__error__" in data:
            failures.append({
                "signature": f"endpoint-down:{label}",
                "summary": f"{label} unreachable",
                "body_md": (
                    f"## {label} unreachable\n\n"
                    f"- URL: `{data.get('__url__', '?')}`\n"
                    f"- Error: `{data.get('__error__', '?')}`\n\n"
                    f"Detected by memroos-oracle-1-healthcheck. Auto-reopens every 6h.\n"
                ),
                "severity": "high",
            })

    if isinstance(web, dict) and "services" in web:
        for svc in web["services"]:
            name = svc.get("service", "?")
            status = svc.get("status", "down")
            detail = svc.get("detail", "")
            should_alert = status == "down" or (
                status == "degraded"
                and not is_intentional_optional_degradation(name, detail)
            )
            if should_alert:
                failures.append({
                    "signature": f"service-{status}:web:{name}",
                    "summary": f"{name} is {status} on operator web",
                    "body_md": (
                        f"## {name} reports `{status}` on operator `/api/health`\n\n"
                        f"- Service: `{name}`\n"
                        f"- Status: `{status}`\n"
                        f"- Detail: `{detail}`\n"
                        f"- Checked at: `{web.get('timestamp', '?')}`\n\n"
                        f"Auto-opened by memroos-oracle-1-healthcheck.\n"
                    ),
                    "severity": "high",
                })

    # MEMX-6: probe /api/memory/health for tier + recallIngest status.
    # A stale recall signal (no Mac-side ship run landing) is critical because
    # it means the memory pipeline has stalled.
    memory = http_json(WEB_MEMORY_HEALTH)
    if isinstance(memory, dict) and "__error__" in memory:
        failures.append({
            "signature": "endpoint-down:memory-health",
            "summary": "memory health endpoint unreachable",
            "body_md": (
                "## \`/api/memory/health\` unreachable on oracle-1\n\n"
                f"- URL: \`{memory.get('__url__', '?')}\`\n"
                f"- Error: \`{memory.get('__error__', '?')}\`\n\n"
                "Detected by memroos-oracle-1-healthcheck. Auto-reopens every 6h.\n"
            ),
            "severity": "high",
        })
    elif isinstance(memory, dict):
        recall = memory.get("recallIngest")
        if isinstance(recall, dict):
            stale_after = recall.get("staleAfterHours")
            age = recall.get("ageHours")
            status = recall.get("status")
            last_ingest = recall.get("lastIngest")
            is_stale = (
                status != "up"
                or (isinstance(age, (int, float)) and age > MEMROOS_RECALL_STALE_HOURS)
            )
            if is_stale:
                failures.append({
                    "signature": f"recallIngest-stale:{status}:{age}",
                    "summary": (
                        f"recallIngest stale on oracle-1 "
                        f"(status={status}, age={age}h > {MEMROOS_RECALL_STALE_HOURS}h threshold)"
                    ),
                    "body_md": (
                        "## Recall ingest stale on oracle-1\n\n"
                        f"- \`recallIngest.status\`: \`{status}\`\n"
                        f"- \`recallIngest.ageHours\`: \`{age}\`\n"
                        f"- \`recallIngest.staleAfterHours\`: \`{stale_after}\`\n"
                        f"- \`recallIngest.lastIngest\`: \`{last_ingest}\`\n"
                        f"- Threshold (env \`MEMROOS_RECALL_STALE_HOURS\`): \`{MEMROOS_RECALL_STALE_HOURS}h\`\n\n"
                        "This means the Mac->oracle ship pipeline has not landed rows in over 6h.\n"
                        "Check:\n"
                        "1. LaunchAgent \`com.memroos.recall-ship\` on the Mac\n"
                        "2. SSH tunnel \`localhost:3838\` -> oracle-1:3000\n"
                        "3. \`/home/opc/inbox/{claude,hermes,qwen,codex}\` on oracle-1\n"
                        "4. \`cat /Users/lcalderon/github/memroos/services/memory/logs/recall-ship.log\`\n\n"
                        "Auto-opened by memroos-oracle-1-healthcheck.\n"
                    ),
                    "severity": "high",
                })
        for tier in memory.get("tiers") or []:
            tier_status = tier.get("status")
            tier_name = tier.get("tier", "?")
            if tier_status != "up":
                failures.append({
                    "signature": f"tier-{tier_status}:{tier_name}",
                    "summary": f"{tier_name} tier is {tier_status} on oracle-1",
                    "body_md": (
                        f"## Memory tier \`{tier_name}\` is \`{tier_status}\` on oracle-1\n\n"
                        f"- Tier: \`{tier_name}\`\n"
                        f"- Backend: \`{tier.get('backend', '?')}\`\n"
                        f"- Status: \`{tier_status}\`\n"
                        f"- Detail: \`{tier.get('detail', '')}\`\n\n"
                        "Auto-opened by memroos-oracle-1-healthcheck.\n"
                    ),
                    "severity": "high",
                })

    if isinstance(mem, dict) and "disk" in mem:
        disk = mem["disk"]
        if disk.get("critical"):
            critical_path = disk_path_for_state(disk, "critical")
            failures.append({
                "signature": "disk-critical:mem0",
                "summary": "disk critical on oracle-1",
                "body_md": (
                    f"## Disk CRITICAL on oracle-1\n\n"
                    f"- `disk.critical = True`\n"
                    f"- Path: `{critical_path.get('path', '?')}`\n"
                    f"- Path status: `{json.dumps(critical_path)}`\n\n"
                    f"Auto-opened by memroos-oracle-1-healthcheck.\n"
                ),
                "severity": "high",
            })
        elif disk.get("warning"):
            warning_path = disk_path_for_state(disk, "warning")
            free_gb = warning_path.get("free_gb", "?")
            used_pct = warning_path.get("percent_used", "?")
            failures.append({
                "signature": "disk-warning:mem0",
                "summary": f"disk warning: {free_gb} GB free, {used_pct}% used",
                "body_md": (
                    f"## Disk WARNING on oracle-1\n\n"
                    f"- Free GB: `{free_gb}`\n"
                    f"- Used %: `{used_pct}`\n"
                    f"- Path: `{warning_path.get('path', '?')}`\n\n"
                    f"Auto-opened by memroos-oracle-1-healthcheck. Re-fires every 6h while warning persists.\n"
                ),
                "severity": "medium",
            })

    return failures


def check_github_auth() -> bool:
    """Verify read access to the configured repository's issue listing only."""
    if not gh_token():
        log(f"  → ERROR: no GH_TOKEN available at {GH_TOKEN_FILE}")
        return False
    status, data = gh_api(
        "GET", f"/repos/{GH_REPO}/issues?state=open&per_page=1&labels=healthcheck"
    )
    if status == 200 and isinstance(data, list):
        log(f"  → GitHub issue-list access verified for {GH_REPO}")
        return True
    log(f"  → ERROR: GitHub issue-list access failed status={status} body={json.dumps(data)[:200]}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--check-github-auth",
        action="store_true",
        help="verify GitHub issue-list access without creating or modifying issues",
    )
    args = parser.parse_args()

    start_run_deadline()
    log("=== healthcheck run start ===")
    if args.check_github_auth:
        result = 0 if check_github_auth() else 2
        log(f"=== healthcheck run done (github-auth={'ok' if result == 0 else 'failed'}) ===")
        return result

    failures = collect_failures()
    if not failures:
        log("  → all green; no failures detected")
        log("=== healthcheck run done ===")
        return 0

    log(f"  → detected {len(failures)} failure(s):")
    for f in failures:
        log(f"    - {f['signature']}: {f['summary']}")

    if args.dry_run:
        log("  → --dry-run set; skipping issue creation")
        return 1

    token = gh_token()
    if not token:
        log(f"  → ERROR: no GH_TOKEN available at {GH_TOKEN_FILE}")
        return 2

    opened = 0
    deduped = 0
    for f in failures:
        sig = f["signature"]
        if not should_fire(sig):
            deduped += 1
            log(f"  → SKIP (cooldown): {sig}")
            continue
        lookup_status, existing = find_open_issue(sig)
        if lookup_status == "unknown":
            log(f"  → SKIP (open issue lookup unknown; will not risk duplicate): {sig}")
            continue
        if existing:
            mark_fired(sig, existing.get("html_url", ""))
            deduped += 1
            log(f"  → SKIP (open issue exists): {existing.get('html_url')}")
            continue
        issue = open_issue(sig, f["summary"], f["body_md"])
        if issue:
            mark_fired(sig, issue.get("html_url", ""))
            opened += 1
            log(f"  → OPENED: {issue.get('html_url')}")
        else:
            log(f"  → FAILED to open issue for {sig}")
    log(f"=== healthcheck run done (opened={opened}, deduped={deduped}) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())