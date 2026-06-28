"""
Unit tests for memroos_eval_sdk.MemroosClient.
Uses respx to mock HTTP calls without a live server.
"""

import pytest
import httpx
import respx

from memroos_eval_sdk import MemroosClient, MemroosApiError, MemroosContractError

BASE_URL = "http://localhost:3000"
API_KEY = "test-api-key-abc123"

SAMPLE_TRACE = {
    "traceId": "trace-py-001",
    "agentId": "test-agent",
    "input": "What is the refund policy?",
    "output": "Refunds are accepted within 30 days.",
}

SAMPLE_SUBMIT_RESULT = {
    "runId": "run-py-001",
    "w": 0.76,
    "layers": {
        "l1": {"score": 0.9, "weight": 0.25, "scorers": []},
        "l2": {"score": 0.8, "weight": 0.5, "scorers": []},
        "l3": {"score": 0.5, "weight": 0.25, "scorers": []},
    },
    "proposalIds": [],
    "tenantId": "default-tenant",
}

SAMPLE_RUN_RESULT = {
    "id": "run-py-001",
    "traceId": "trace-py-001",
    "agentId": "test-agent",
    "role": "support",
    "compositeW": 0.76,
    "trusted": True,
    "layers": {},
    "scorerResults": [],
    "judge": {
        "score": 0.8,
        "rubricScores": {"faithful": 0.8, "useful": 0.9, "policy": 1.0},
        "model": "claude-haiku-4-5-20251001",
        "provider": "anthropic",
        "modelFamily": "anthropic",
        "promptTemplateVersion": "v1",
        "promptHash": "abc123",
        "positionBiasMitigation": {"swapAugmentation": True, "orderAgreement": True},
    },
    "driftGuard": {
        "status": "passed",
        "agreement": 0.9,
        "floor": 0.85,
        "goldenSetVersion": "v1",
        "examples": [],
    },
    "configHash": "deadbeef",
    "goldenSetPath": "./golden-sets/business-ops-50.jsonl",
    "startedAt": "2026-05-15T00:00:00Z",
    "completedAt": "2026-05-15T00:00:01Z",
}


# ── submit_trace ──────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_calls_correct_endpoint():
    route = respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(200, json=SAMPLE_SUBMIT_RESULT)
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    result = await client.submit_trace(SAMPLE_TRACE)

    assert route.called
    assert result["runId"] == "run-py-001"
    assert result["w"] == 0.76


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_sends_correct_auth_header():
    route = respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(200, json=SAMPLE_SUBMIT_RESULT)
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    await client.submit_trace(SAMPLE_TRACE)

    request = route.calls[0].request
    assert request.headers["authorization"] == f"Bearer {API_KEY}"


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_raises_on_401():
    respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(401, json={"error": "Unauthorized"})
    )
    client = MemroosClient(base_url=BASE_URL, api_key="bad-key")
    with pytest.raises(MemroosApiError) as exc_info:
        await client.submit_trace(SAMPLE_TRACE)
    assert exc_info.value.status == 401


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_raises_on_429():
    respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(429, json={"error": "Too Many Requests"})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    with pytest.raises(MemroosApiError) as exc_info:
        await client.submit_trace(SAMPLE_TRACE)
    assert exc_info.value.status == 429


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_rejects_malformed_success_response():
    respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(200, json={"runId": "run-py-001", "w": "0.76"})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    with pytest.raises(MemroosContractError):
        await client.submit_trace(SAMPLE_TRACE)


@respx.mock
@pytest.mark.asyncio
async def test_submit_trace_rejects_boolean_numeric_fields():
    malformed_result = {
        **SAMPLE_SUBMIT_RESULT,
        "w": True,
    }
    respx.post(f"{BASE_URL}/api/public/v1/traces").mock(
        return_value=httpx.Response(200, json=malformed_result)
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    with pytest.raises(MemroosContractError):
        await client.submit_trace(SAMPLE_TRACE)


# ── get_run_result ────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_get_run_result_returns_typed_result():
    respx.get(f"{BASE_URL}/api/public/v1/runs/run-py-001").mock(
        return_value=httpx.Response(200, json={"run": SAMPLE_RUN_RESULT})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    run = await client.get_run_result("run-py-001")

    assert run["id"] == "run-py-001"
    assert run["compositeW"] == 0.76


@respx.mock
@pytest.mark.asyncio
async def test_get_run_result_raises_on_404():
    respx.get(f"{BASE_URL}/api/public/v1/runs/unknown").mock(
        return_value=httpx.Response(404, json={"error": "Run not found"})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    with pytest.raises(MemroosApiError) as exc_info:
        await client.get_run_result("unknown")
    assert exc_info.value.status == 404


# ── list_proposals ────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_list_proposals_returns_list():
    proposals = [
        {
            "id": "p-001",
            "proposalType": "noop_test",
            "status": "pending",
            "forecastWDelta": 0.05,
            "createdAt": "2026-05-15T00:00:00Z",
        }
    ]
    respx.get(f"{BASE_URL}/api/public/v1/proposals").mock(
        return_value=httpx.Response(200, json={"proposals": proposals})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    result = await client.list_proposals()

    assert len(result) == 1
    assert result[0]["id"] == "p-001"


@respx.mock
@pytest.mark.asyncio
async def test_list_proposals_sends_trace_id_filter():
    respx.get(f"{BASE_URL}/api/public/v1/proposals").mock(
        return_value=httpx.Response(200, json={"proposals": []})
    )
    client = MemroosClient(base_url=BASE_URL, api_key=API_KEY)
    await client.list_proposals(filter={"traceId": "trace-abc"})

    # Verify the query param was included.
    # respx captures the full request URL including params.
    request_url = str(respx.calls[0].request.url)
    assert "traceId=trace-abc" in request_url
