"""
voice-server/tests/test_health.py

Tests for health.py FastAPI /health endpoint.
Uses httpx.AsyncClient (TestClient requires synchronous ASGI).
"""
import json
import os
import tempfile
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient


@pytest.fixture
def state_file(tmp_path):
    """Return path to a temp state file; cleaned up after each test."""
    return str(tmp_path / "voice-session-state.json")


@pytest.fixture
def health_app(state_file, monkeypatch):
    """
    Provide a TestClient for health.py with SESSION_STATE_FILE pointing to a
    temp file (not /tmp/voice-session-state.json).
    """
    import health
    import importlib
    monkeypatch.setattr(health, "SESSION_STATE_FILE", state_file)
    return TestClient(health.app)


def test_health_no_state_file_returns_inactive(health_app):
    """When no state file exists, /health returns {active: false}."""
    resp = health_app.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is False
    assert data["session_id"] is None
    assert data["duration_secs"] is None


def test_health_inactive_session(health_app, state_file):
    """When state file shows inactive, /health returns {active: false}."""
    with open(state_file, "w") as f:
        json.dump({"active": False, "session_id": None, "started_at": None}, f)

    resp = health_app.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is False
    assert data["duration_secs"] is None


def test_health_active_session_returns_duration(health_app, state_file):
    """When state file shows an active session, duration_secs is computed."""
    # Started 5 seconds ago
    started = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    with open(state_file, "w") as f:
        json.dump({
            "active": True,
            "session_id": "test-session-123",
            "started_at": started,
        }, f)

    resp = health_app.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is True
    assert data["session_id"] == "test-session-123"
    assert data["duration_secs"] is not None
    assert data["duration_secs"] >= 4  # at least ~5 seconds


def test_health_active_session_has_started_at(health_app, state_file):
    """Active session response includes started_at field."""
    started = datetime.now(timezone.utc).isoformat()
    with open(state_file, "w") as f:
        json.dump({
            "active": True,
            "session_id": "abc",
            "started_at": started,
        }, f)

    resp = health_app.get("/health")
    data = resp.json()
    assert data["started_at"] == started


def test_health_corrupted_state_file_returns_inactive(health_app, state_file):
    """A corrupted JSON state file causes /health to return inactive."""
    with open(state_file, "w") as f:
        f.write("NOT_VALID_JSON{{{")

    resp = health_app.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is False
