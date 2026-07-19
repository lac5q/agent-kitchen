#!/usr/bin/env python3
"""
MemroOS oracle-1 healthcheck watchdog.

Hits two endpoints on oracle-1:
  - http://127.0.0.1:3000/api/health   (Next.js operator; services + disk)
  - http://127.0.0.1:3201/health      (mem0; vector store + queue)

When ANY service reports "down" OR disk hits "warning"/"critical",
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
MEM0_HEALTH = os.environ.get("MEMROOS_MEM0_HEALTH", "http://127.0.0.1:3201/health")
GH_REPO = os.environ.get("MEMROOS_GH_REPO", "lac5q/memroos")
GH_TOKEN_FILE = os.environ.get("MEMROOS_GH_TOKEN_FILE", "/etc/memroos/gh-token")
STATE_DIR = Path(os.environ.get("MEMROOS_HEALTHCHECK_STATE", "/run/memroos-healthcheck"))
LOG_FILE = os.environ.get("MEMROOS_HEALTHCHECK_LOG", "/var/log/memroos/healthcheck.log")
COOLDOWN_S = int(os.environ.get("MEMROOS_HEALTHCHECK_COOLDOWN_S", str(6 * 3600)))
REQUEST_TIMEOUT = 8
LABELS = ["healthcheck", "oracle-1", "automated"]


def http_json(url: str) -> Optional[dict]:
    try:
        with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as r:
            return json.load(r)
    except Exception as e:
        return {"__error__": str(e), "__url__": url}


def gh_token() -> Optional[str]:
    p = Path(GH_TOKEN_FILE)
    if not p.exists():
        return None
    tok = p.read_text().strip()
    return tok or None


def gh_api(method: str, path: str, body: Optional[dict] = None) -> Tuple[int, dict]:
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
        with urllib.request.urlopen(req, data=data, timeout=REQUEST_TIMEOUT + 4) as r:
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


def find_open_issue(signature: str) -> Optional[dict]:
    status, data = gh_api("GET", f"/repos/{GH_REPO}/issues?state=open&per_page=50&labels=healthcheck")
    if status != 200 or not isinstance(data, list):
        return None
    for it in data:
        if it.get("title", "").startswith(f"[healthcheck] {signature}"):
            return it
    return None


def open_issue(signature: str, title_suffix: str, body_md: str) -> Optional[dict]:
    title = f"[healthcheck] {signature} — {title_suffix}"
    payload = {
        "title": title[:240],
        "body": body_md[:65000],
        "labels": LABELS,
    }
    status, data = gh_api("POST", f"/repos/{GH_REPO}/issues", payload)
    if status == 201:
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
            if status == "down":
                failures.append({
                    "signature": f"service-down:web:{name}",
                    "summary": f"{name} is down on operator web",
                    "body_md": (
                        f"## {name} reports `down` on operator `/api/health`\n\n"
                        f"- Service: `{name}`\n"
                        f"- Detail: `{detail}`\n"
                        f"- Checked at: `{web.get('timestamp', '?')}`\n\n"
                        f"Auto-opened by memroos-oracle-1-healthcheck.\n"
                    ),
                    "severity": "high",
                })

    if isinstance(mem, dict) and "disk" in mem:
        disk = mem["disk"]
        if disk.get("critical"):
            failures.append({
                "signature": "disk-critical:mem0",
                "summary": "disk critical on oracle-1",
                "body_md": (
                    f"## Disk CRITICAL on oracle-1\n\n"
                    f"- `disk.critical = True`\n"
                    f"- `mem0.health.disk.paths[0]`: "
                    f"`{json.dumps((disk.get('paths') or [{}])[0])}`\n\n"
                    f"Auto-opened by memroos-oracle-1-healthcheck.\n"
                ),
                "severity": "high",
            })
        elif disk.get("warning"):
            p0 = (disk.get("paths") or [{}])[0]
            free_gb = p0.get("free_gb", "?")
            used_pct = p0.get("percent_used", "?")
            failures.append({
                "signature": "disk-warning:mem0",
                "summary": f"disk warning: {free_gb} GB free, {used_pct}% used",
                "body_md": (
                    f"## Disk WARNING on oracle-1\n\n"
                    f"- Free GB: `{free_gb}`\n"
                    f"- Used %: `{used_pct}`\n"
                    f"- Path: `{p0.get('path', '?')}`\n\n"
                    f"Auto-opened by memroos-oracle-1-healthcheck. Re-fires every 6h while warning persists.\n"
                ),
                "severity": "medium",
            })

    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    log("=== healthcheck run start ===")
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
        existing = find_open_issue(sig)
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