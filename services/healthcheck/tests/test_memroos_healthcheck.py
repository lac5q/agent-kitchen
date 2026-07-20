"""Unit tests for the oracle-1 healthcheck watchdog."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from uuid import uuid4

import pytest


MODULE_PATH = Path(__file__).parents[1] / "memroos-healthcheck.py"


def load_watchdog():
    module_name = f"memroos_healthcheck_under_test_{uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


OPTIONAL_TOOL_DEGRADED_HEALTH = {
    "timestamp": "2026-07-19T00:00:00Z",
    "services": [
        {
            "service": "RTK",
            "status": "degraded",
            "detail": "optional — rtk binary not installed (local dev tool)",
        },
        {
            "service": "QMD",
            "status": "degraded",
            "detail": "optional — qmd binary not installed (local library search)",
        },
        {
            "service": "Knowledge Index",
            "status": "degraded",
            "detail": "skipped — optional knowledge index is not installed",
        },
    ],
}
NO_DISK_FAILURE = {"disk": {"critical": False, "warning": False, "paths": []}}


def collect_from_payloads(module, web, mem=NO_DISK_FAILURE):
    module.http_json = lambda url: web if url == module.WEB_HEALTH else mem
    return module.collect_failures()


def test_ignores_only_explicit_optional_local_tool_degradations():
    module = load_watchdog()

    assert collect_from_payloads(module, OPTIONAL_TOOL_DEGRADED_HEALTH) == []


def test_mem0_degraded_opens_a_status_aware_failure():
    module = load_watchdog()
    web = {
        "timestamp": "2026-07-19T00:00:00Z",
        "services": [
            {
                "service": "mem0",
                "status": "degraded",
                "detail": "vector store disconnected",
            }
        ],
    }

    failures = collect_from_payloads(module, web)

    assert len(failures) == 1
    assert failures[0]["signature"] == "service-degraded:web:mem0"
    assert "- Status: `degraded`" in failures[0]["body_md"]
    assert "vector store disconnected" in failures[0]["body_md"]


def test_graph_memory_degraded_opens_a_failure():
    module = load_watchdog()
    web = {
        "timestamp": "2026-07-19T00:00:00Z",
        "services": [
            {
                "service": "Graph Memory",
                "status": "degraded",
                "detail": "Neo4j writes are delayed",
            }
        ],
    }

    failures = collect_from_payloads(module, web)

    assert len(failures) == 1
    assert failures[0]["signature"] == "service-degraded:web:Graph Memory"
    assert "- Status: `degraded`" in failures[0]["body_md"]


def test_down_service_still_opens_a_failure():
    module = load_watchdog()
    web = {
        "timestamp": "2026-07-19T00:00:00Z",
        "services": [{"service": "Agents", "status": "down", "detail": "config missing"}],
    }

    failures = collect_from_payloads(module, web)

    assert len(failures) == 1
    assert failures[0]["signature"] == "service-down:web:Agents"
    assert "- Status: `down`" in failures[0]["body_md"]


def test_degraded_optional_name_without_explicit_absence_alerts():
    module = load_watchdog()
    web = {
        "services": [
            {
                "service": "QMD",
                "status": "degraded",
                "detail": "optional index contract failed",
            }
        ]
    }

    failures = collect_from_payloads(module, web)

    assert len(failures) == 1
    assert failures[0]["signature"] == "service-degraded:web:QMD"


def test_disk_warning_identifies_the_path_that_triggered_it():
    module = load_watchdog()
    mem = {
        "disk": {
            "warning": True,
            "critical": False,
            "paths": [
                {"path": "/var/lib/memroos/queue", "warning": False, "free_gb": 100},
                {
                    "path": "/var/log/memroos",
                    "warning": True,
                    "free_gb": 4,
                    "percent_used": 86,
                },
            ],
        }
    }

    failures = collect_from_payloads(module, {"services": []}, mem)

    assert len(failures) == 1
    assert "- Path: `/var/log/memroos`" in failures[0]["body_md"]


def test_request_timeout_is_limited_by_remaining_run_deadline():
    module = load_watchdog()
    module.RUN_DEADLINE = 20.0

    assert module.remaining_request_timeout(8, now=13.0) == 7.0
    with pytest.raises(TimeoutError, match="deadline exceeded"):
        module.remaining_request_timeout(8, now=20.0)


def test_open_issue_lookup_paginates_until_it_finds_a_match():
    module = load_watchdog()
    calls = []
    first_page = [{"title": f"unrelated {index}"} for index in range(module.OPEN_ISSUES_PER_PAGE)]
    target = {"title": "[healthcheck] service-degraded:web:mem0 — mem0 is degraded"}

    def fake_gh_api(method, path, body=None):
        calls.append((method, path, body))
        if path.endswith("&page=1"):
            return 200, first_page
        return 200, [target]

    module.gh_api = fake_gh_api

    result, issue = module.find_open_issue("service-degraded:web:mem0")

    assert result == "found"
    assert issue == target
    assert len(calls) == 2
    assert "per_page=100" in calls[0][1]
    assert "page=2" in calls[1][1]


def test_open_issue_lookup_returns_unknown_when_github_fails():
    module = load_watchdog()
    module.gh_api = lambda method, path, body=None: (503, {"error": "unavailable"})

    result, issue = module.find_open_issue("service-down:web:Agents")

    assert result == "unknown"
    assert issue is None


def test_main_never_creates_an_issue_when_open_issue_lookup_is_unknown(monkeypatch):
    module = load_watchdog()
    opened = []
    monkeypatch.setattr(module, "log", lambda message: None)
    monkeypatch.setattr(
        module,
        "collect_failures",
        lambda: [
            {
                "signature": "service-degraded:web:mem0",
                "summary": "mem0 is degraded",
                "body_md": "test",
            }
        ],
    )
    monkeypatch.setattr(module, "gh_token", lambda: "test-token")
    monkeypatch.setattr(module, "should_fire", lambda signature: True)
    monkeypatch.setattr(module, "find_open_issue", lambda signature: ("unknown", None))
    monkeypatch.setattr(module, "open_issue", lambda *args: opened.append(args))
    monkeypatch.setattr(sys, "argv", ["memroos-healthcheck.py", "--once"])

    assert module.main() == 0
    assert opened == []


@pytest.mark.parametrize(
    ("token", "status"),
    [
        (None, None),
        ("test-token", 401),
        ("test-token", 403),
    ],
)
def test_check_github_auth_exits_nonzero_without_read_access(monkeypatch, token, status):
    module = load_watchdog()
    calls = []
    monkeypatch.setattr(module, "log", lambda message: None)
    monkeypatch.setattr(module, "gh_token", lambda: token)
    if status is not None:
        monkeypatch.setattr(
            module,
            "gh_api",
            lambda method, path, body=None: (
                calls.append((method, path, body)) or (status, {"error": "denied"})
            ),
        )
    monkeypatch.setattr(sys, "argv", ["memroos-healthcheck.py", "--check-github-auth"])

    assert module.main() == 2
    assert all(method == "GET" for method, _path, _body in calls)


def test_check_github_auth_reads_issue_list_without_writing(monkeypatch):
    module = load_watchdog()
    calls = []
    monkeypatch.setattr(module, "log", lambda message: None)
    monkeypatch.setattr(module, "gh_token", lambda: "test-token")
    monkeypatch.setattr(
        module,
        "gh_api",
        lambda method, path, body=None: (calls.append((method, path, body)) or (200, [])),
    )
    monkeypatch.setattr(sys, "argv", ["memroos-healthcheck.py", "--check-github-auth"])

    assert module.main() == 0
    assert calls == [
        (
            "GET",
            "/repos/lac5q/memroos/issues?state=open&per_page=1&labels=healthcheck",
            None,
        )
    ]
