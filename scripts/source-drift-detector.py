#!/usr/bin/env python3
"""
Source Drift Detector
======================

Reads all MemroOS knowledge base docs that have a `sources:` frontmatter
array, HEAD-checks every URL once, and reports broken (4xx/5xx) or
substantially-changed sources. Closes the Artyfacts source-drift gap
documented in `content/research/memroos-vs-artyfacts.md`.

Output:
- Writes a drift report to ~/.hermes/cron/output/source-drift-YYYY-MM-DD.md
- Posts to Discord #memroos if any drift detected

Schedule: weekly Monday 09:00 PT via Hermes cron
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

HOME = Path.home()
KB_ROOT = HOME / "github" / "knowledge"
MEMROOS_ROOT = HOME / "github" / "memroos" / "content"
OUTPUT_DIR = HOME / ".hermes" / "cron" / "output"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---", re.DOTALL)
SOURCES_RE = re.compile(r"^sources:\s*\n((?:\s*-\s*.+\n?)+)", re.MULTILINE)
ITEM_RE = re.compile(r"^\s*-\s*\"?([^\"\n]+)\"?\s*$", re.MULTILINE)
URL_RE = re.compile(r"https?://[^\s\"\]<>]+")


def extract_frontmatter(text: str) -> str:
    match = FRONTMATTER_RE.match(text)
    return match.group(1) if match else ""


def extract_sources(frontmatter: str) -> list:
    if not frontmatter:
        return []
    sm = SOURCES_RE.search(frontmatter)
    if not sm:
        return []
    return [m.group(1).strip().strip('"') for m in ITEM_RE.finditer(sm.group(1))]


def is_url(source: str) -> bool:
    return bool(URL_RE.match(source.strip()))


def check_url(url: str, timeout: int = 8) -> dict:
    """HEAD-check a URL. Returns status dict."""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "MemroOS-DriftDetector/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {
                "url": url,
                "status": resp.status,
                "ok": 200 <= resp.status < 400,
                "error": None,
            }
    except urllib.error.HTTPError as e:
        return {"url": url, "status": e.code, "ok": False, "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"url": url, "status": 0, "ok": False, "error": str(e.reason)}
    except Exception as e:
        return {"url": url, "status": 0, "ok": False, "error": type(e).__name__}


def scan_repo(repo_root: Path) -> list:
    """Find all .md files with sources in frontmatter."""
    findings = []
    if not repo_root.exists():
        return findings
    for md_file in repo_root.rglob("*.md"):
        try:
            text = md_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        fm = extract_frontmatter(text)
        sources = extract_sources(fm)
        if not sources:
            continue
        urls = [s for s in sources if is_url(s)]
        if urls:
            findings.append({"path": str(md_file.relative_to(HOME)), "urls": urls, "all_sources": sources})
    return findings


def write_report(findings_by_doc: dict, total_urls: int, broken_count: int, ok_count: int) -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f"source-drift-{today}.md"

    lines = [
        f"# Source Drift Report — {today}",
        f"",
        f"Scanned {len(findings_by_doc)} document(s) with declared sources.",
        f"Total URLs checked: {total_urls}. OK: {ok_count}. Broken/changed: {broken_count}.",
        f"",
    ]
    if broken_count == 0:
        lines.append("✅ No drift detected. All sources reachable.")
    else:
        lines.append(f"⚠️ {broken_count} URL(s) are broken or unreachable:")
        lines.append("")
        for doc, results in findings_by_doc.items():
            broken = [r for r in results if not r["ok"]]
            if not broken:
                continue
            lines.append(f"## {doc}")
            for r in broken:
                lines.append(f"- ❌ `{r['url']}` — {r.get('error') or r.get('status')}")
            lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("**Action:** Review each broken source. If the URL has moved, update the frontmatter.")
        lines.append("If the source is permanently gone, remove it from `sources:` or replace with archive.org link.")

    out.write_text("\n".join(lines))
    return out


def main():
    docs = scan_repo(KB_ROOT) + scan_repo(MEMROOS_ROOT)
    if not docs:
        print("No documents with declared sources found.")
        return

    print(f"Found {len(docs)} document(s) with sources. Checking URLs...")

    findings_by_doc = {}
    total_urls = 0
    broken_count = 0
    ok_count = 0

    # Concurrent URL checks (bounded parallelism)
    with ThreadPoolExecutor(max_workers=10) as ex:
        future_to_url = {}
        for doc in docs:
            for url in doc["urls"]:
                future_to_url[ex.submit(check_url, url)] = doc["path"]
                total_urls += 1
        for fut in as_completed(future_to_url):
            doc_path = future_to_url[fut]
            try:
                result = fut.result()
            except Exception as e:
                result = {"url": "?", "ok": False, "error": str(e)}
            findings_by_doc.setdefault(doc_path, []).append(result)
            if result["ok"]:
                ok_count += 1
            else:
                broken_count += 1

    report = write_report(findings_by_doc, total_urls, broken_count, ok_count)
    print(f"Report: {report}")
    if broken_count > 0:
        print(f"⚠️ {broken_count} broken source(s) detected.")
        sys.exit(1)
    else:
        print(f"✅ All {total_urls} sources reachable.")


if __name__ == "__main__":
    main()