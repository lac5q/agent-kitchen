# memroos-eval-sdk

Python SDK for the MemRoOS Public Eval API.

```python
import asyncio

from memroos_eval_sdk import MemroosClient


async def main() -> None:
    client = MemroosClient(
        base_url="http://localhost:3000",
        api_key="your-api-key",
    )
    result = await client.submit_trace(
        {
            "traceId": "trace-001",
            "agentId": "my-agent",
            "input": "Summarize the account status.",
            "output": "The account is active and in good standing.",
        }
    )
    print(result["w"])


asyncio.run(main())
```

Run the gated live smoke test against a running MemRoOS app:

```bash
MEMROOS_SDK_SMOKE=1 \
MEMROOS_BASE_URL=http://localhost:3000 \
MEMROOS_API_KEY=your-api-key \
python -m pytest tests/test_smoke_live.py
```
