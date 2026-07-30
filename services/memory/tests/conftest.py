import sys

import pytest

# mem0-server.py uses `X | None` union syntax, which requires Python 3.10+.
# CI already pins 3.12 (.github/workflows/ci.yml) and normal shells resolve
# `python3` to a modern interpreter -- but macOS ships its own `/usr/bin/python3`
# stub (3.9.6), and it wins the moment something puts /usr/bin ahead of
# /opt/homebrew/bin on PATH (easy to do by accident in a scoped debugging
# shell). Under that shadowed PATH the whole suite fails at IMPORT time with
# a bare `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
# deep inside mem0-server.py -- correct in isolation, but it gives no hint
# that the actual cause is "wrong python resolved," not a real regression.
if sys.version_info < (3, 10):
    pytest.exit(
        "services/memory/tests requires Python 3.10+ (mem0-server.py uses "
        f"`X | None` union syntax). Resolved interpreter is {sys.version.split()[0]} "
        f"at {sys.executable}. If this is macOS's /usr/bin/python3 stub, check "
        "whether /usr/bin is ahead of /opt/homebrew/bin on PATH and fix the "
        "ordering rather than the version pin.",
        returncode=1,
    )
