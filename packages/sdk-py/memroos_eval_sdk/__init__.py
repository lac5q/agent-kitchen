"""memroos-eval-sdk — Python SDK for the MemroOS Public Eval API."""

from .client import MemroosClient, MemroosApiError
from .contract import (
    MemroosContractError,
    PUBLIC_EVAL_API_V1_CONTRACT_ID,
    PUBLIC_EVAL_CONTRACT_HEADER,
    assert_eval_submit_result,
)
from .types import AgentEvalTrace, EvalRunResult, EvalSubmitResult, SealProposal

__all__ = [
    "MemroosClient",
    "MemroosApiError",
    "MemroosContractError",
    "PUBLIC_EVAL_API_V1_CONTRACT_ID",
    "PUBLIC_EVAL_CONTRACT_HEADER",
    "assert_eval_submit_result",
    "AgentEvalTrace",
    "EvalRunResult",
    "EvalSubmitResult",
    "SealProposal",
]
