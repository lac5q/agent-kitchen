"""Alerts must name the host they came from.

Every alert used to read "Memroos Memory Alert" with no machine anywhere in
the subject or body. The operator runs this same script on the Mac, oracle-1
and cordant-hermes-01, so an alert named the *stack* but never the *box* — and
answering "which server is failing?" meant going and looking.

`hostname` alone is not the fix and is why the host profile exists:
cordant-hermes-01 reports `ip-172-31-43-250` and oracle-1 reports
`paperclip-arm-2026`. Neither is a name an operator recognises at 3am.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

HEALTHCHECK = Path(__file__).resolve().parents[1] / "healthcheck.sh"


def _resolve_label(env_lines: str = "", *, host_id_env: str | None = None, tmp_path: Path) -> str:
    """Run the script's own memroos_host_label() in isolation.

    Sourcing the whole healthcheck would execute every check, so the function
    is extracted and run on its own — this asserts the shipped implementation,
    not a copy of it.
    """
    src = HEALTHCHECK.read_text(encoding="utf-8")
    start = src.index("memroos_host_label() {")
    end = src.index("\n}", start) + 2
    fn = src[start:end]

    profile = tmp_path / "host-profile.env"
    if env_lines:
        profile.write_text(env_lines, encoding="utf-8")

    script = f"set -uo pipefail\n{fn}\nmemroos_host_label\n"
    env = {
        "PATH": "/usr/bin:/bin",
        "MEMROOS_HOST_PROFILE": str(profile),
    }
    if host_id_env is not None:
        env["MEMROOS_HOST_ID"] = host_id_env

    out = subprocess.run(
        ["bash", "-c", script], capture_output=True, text=True, env=env, timeout=30
    )
    assert out.returncode == 0, f"label fn failed: {out.stderr}"
    return out.stdout.strip()


def test_script_is_syntactically_valid():
    out = subprocess.run(
        ["bash", "-n", str(HEALTHCHECK)], capture_output=True, text=True, timeout=30
    )
    assert out.returncode == 0, out.stderr


def test_prefers_explicit_env_over_profile(tmp_path: Path):
    label = _resolve_label(
        "MEMROOS_HOST_ID=from-profile\n", host_id_env="from-env", tmp_path=tmp_path
    )
    assert label == "from-env"


def test_reads_declared_host_id_from_profile(tmp_path: Path):
    # The real cordant-hermes-01 shape: the profile is the only place the
    # recognisable name exists.
    label = _resolve_label('MEMROOS_HOST_ID="cordant-hermes-01"\n', tmp_path=tmp_path)
    assert label == "cordant-hermes-01"


def test_tolerates_quotes_and_whitespace_in_profile(tmp_path: Path):
    label = _resolve_label("   MEMROOS_HOST_ID='oracle-1'  \n", tmp_path=tmp_path)
    assert label == "oracle-1"


def test_falls_back_to_hostname_when_no_profile(tmp_path: Path):
    # An unprofiled host must still label itself with *something*; a blank
    # label would put us back to "which server was that?".
    label = _resolve_label(tmp_path=tmp_path)
    assert label, "an unprofiled host must still produce a non-empty label"


def test_ignores_unrelated_profile_keys(tmp_path: Path):
    label = _resolve_label(
        "OTHER=x\nMEMROOS_HOST_ID=oracle-1\nMEMROOS_HOST_ROLE=operator\n", tmp_path=tmp_path
    )
    assert label == "oracle-1"


def test_alert_and_recover_put_the_host_in_the_subject():
    """The subject is what an email preview and a phone notification show, so
    the host has to be there and not only in the body."""
    src = HEALTHCHECK.read_text(encoding="utf-8")
    assert 'notify "[$HOST_LABEL] Memroos Memory Alert"' in src
    assert 'notify "[$HOST_LABEL] Memroos Memory Recovered"' in src
    # And no bare un-hosted subject survives.
    assert 'notify "Memroos Memory Alert"' not in src
    assert 'notify "Memroos Memory Recovered"' not in src
