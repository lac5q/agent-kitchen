"""
memroos-eval-sdk — MemroosClient

Async HTTP client for the MemroOS Public Eval API.
Requires httpx >= 0.27 and Python >= 3.9.
"""

from __future__ import annotations

from typing import Any, Optional, Union
from urllib.parse import urlencode

import httpx

from .contract import assert_eval_submit_result
from .types import (
    AgentEvalTrace,
    EvalRunResult,
    EvalSubmitResult,
    ProposalFilter,
    SealProposal,
)


class MemroosApiError(Exception):
    """Raised when the API returns a non-2xx response."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"MemroosApiError {status}: {message}")
        self.status = status
        self.message = message


class MemroosClient:
    """
    Typed async client for the MemroOS Public Eval API.

    Example::

        import asyncio
        from memroos_eval_sdk import MemroosClient

        client = MemroosClient(
            base_url="http://localhost:3000",
            api_key="your-api-key",
            tenant_id="default-tenant",
        )

        async def main():
            result = await client.submit_trace({
                "traceId": "trace-001",
                "agentId": "my-agent",
                "input": "Summarize quarterly report",
                "output": "Q3 revenue grew 12% YoY...",
            })
            print("W score:", result["w"])

        asyncio.run(main())
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        tenant_id: str = "default-tenant",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._tenant_id = tenant_id
        self._headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    async def _request(
        self,
        method: str,
        path: str,
        json: Optional[Any] = None,
        params: Optional[dict[str, str]] = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                url,
                headers=self._headers,
                json=json,
                params=params,
                timeout=30.0,
            )
        if not response.is_success:
            try:
                body = response.json()
                message: str = body.get("error", response.reason_phrase)
            except Exception:
                message = response.reason_phrase
            raise MemroosApiError(response.status_code, message)
        return response.json()

    async def submit_trace(
        self, trace: Union[AgentEvalTrace, dict[str, Any]]
    ) -> EvalSubmitResult:
        """
        Submit an agent trace for scoring.

        Accepts a MemroOS AgentEvalTrace dict or an OpenInference span dict.
        Returns an EvalSubmitResult with the run ID and composite W score.
        """
        result = await self._request("POST", "/api/public/v1/traces", json=trace)
        return assert_eval_submit_result(result)

    async def get_run_result(self, run_id: str) -> EvalRunResult:
        """
        Retrieve a previously scored eval run by ID.

        Raises MemroosApiError(403) if the run belongs to a different tenant.
        Raises MemroosApiError(404) if the run is not found.
        """
        result = await self._request("GET", f"/api/public/v1/runs/{run_id}")
        return result["run"]  # type: ignore[return-value]

    async def list_proposals(
        self, filter: Optional[ProposalFilter] = None
    ) -> list[SealProposal]:
        """
        List SEAL proposals for the authenticated tenant.

        Optional filter: {'traceId': '<trace-id>'} to scope to a single trace.
        """
        params: dict[str, str] = {}
        if filter and filter.get("traceId"):
            params["traceId"] = filter["traceId"]  # type: ignore[assignment]
        result = await self._request(
            "GET", "/api/public/v1/proposals", params=params or None
        )
        return result["proposals"]  # type: ignore[return-value]
