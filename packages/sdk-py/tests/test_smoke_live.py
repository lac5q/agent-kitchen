import os

import pytest

from memroos_eval_sdk.smoke_test import run_smoke


@pytest.mark.skipif(
    os.environ.get("MEMROOS_SDK_SMOKE") != "1",
    reason="set MEMROOS_SDK_SMOKE=1 to run the live MemRoOS SDK smoke test",
)
@pytest.mark.asyncio
async def test_live_smoke_submits_sample_trace_to_running_app():
    api_key = os.environ.get("MEMROOS_API_KEY")
    assert api_key, "MEMROOS_API_KEY is required when MEMROOS_SDK_SMOKE=1"

    base_url = os.environ.get("MEMROOS_BASE_URL", "http://localhost:3000")
    result = await run_smoke(base_url, api_key)

    assert result["runId"]
    assert isinstance(result["w"], (int, float))
    assert {"l1", "l2", "l3"}.issubset(result["layers"].keys())
