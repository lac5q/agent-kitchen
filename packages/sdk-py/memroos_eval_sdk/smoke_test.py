"""Live smoke test helper for the MemRoOS Python eval SDK.

Usage:
    MEMROOS_BASE_URL=http://localhost:3000 MEMROOS_API_KEY=... \
      python -m memroos_eval_sdk.smoke_test
"""

from __future__ import annotations

import asyncio
import os
import sys

from .client import MemroosApiError, MemroosClient

SAMPLE_TRACE = {
    "traceId": "py-sdk-smoke-test-001",
    "agentId": "python-smoke-test-agent",
    "agentModel": "gpt-5-mini",
    "agentModelProvider": "openai",
    "agentModelFamily": "openai",
    "role": "ops",
    "input": "Resolve the pending support ticket for account #12345",
    "output": "Reviewed account #12345. Applied standard resolution workflow. Issue closed.",
    "expectedFacts": ["resolved", "account #12345", "closed"],
    "toolCalls": [
        {"name": "ticket.lookup", "valid": True, "schemaValid": True},
        {"name": "ticket.resolve", "valid": True, "schemaValid": True},
    ],
    "outcome": {
        "completed": True,
        "escalated": False,
        "ttrMs": 2400,
        "operatorApproved": True,
        "costUsd": 0.0012,
    },
}


async def run_smoke(base_url: str, api_key: str) -> dict:
    client = MemroosClient(base_url=base_url, api_key=api_key)
    return await client.submit_trace(SAMPLE_TRACE)


async def main() -> int:
    base_url = os.environ.get("MEMROOS_BASE_URL", "http://localhost:3000")
    api_key = os.environ.get("MEMROOS_API_KEY", "")
    if not api_key:
        print("ERROR: MEMROOS_API_KEY environment variable is required", file=sys.stderr)
        return 1

    try:
        result = await run_smoke(base_url, api_key)
    except MemroosApiError as exc:
        print(f"API error {exc.status}: {exc.message}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - CLI smoke should show unexpected failures.
        print(f"Unexpected error: {exc}", file=sys.stderr)
        return 1

    print(f"W score: {result['w']}")
    print(f"Run ID: {result['runId']}")
    print("Smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
