"""Runtime contract checks for the MemRoOS Public Eval API v1."""

from __future__ import annotations

import math
from typing import Any, cast

from .types import EvalSubmitResult

PUBLIC_EVAL_API_V1_CONTRACT_ID = "public-eval-api.v1"
PUBLIC_EVAL_CONTRACT_HEADER = "X-Memroos-Contract"


class MemroosContractError(ValueError):
    """Raised when a successful API response does not match the SDK contract."""


def _is_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _is_layer_breakdown(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and _is_number(value.get("score"))
        and _is_number(value.get("weight"))
        and isinstance(value.get("scorers"), list)
    )


def assert_eval_submit_result(value: Any) -> EvalSubmitResult:
    """Validate and return a POST /api/public/v1/traces response."""

    if not isinstance(value, dict):
        raise MemroosContractError(
            "Invalid EvalSubmitResult: response body must be an object"
        )

    layers = value.get("layers")
    if (
        not isinstance(value.get("runId"), str)
        or not _is_number(value.get("w"))
        or not isinstance(layers, dict)
        or not isinstance(value.get("proposalIds"), list)
        or not isinstance(value.get("tenantId"), str)
    ):
        raise MemroosContractError(
            "Invalid EvalSubmitResult: missing required public eval contract fields"
        )

    if not layers or not all(_is_layer_breakdown(layer) for layer in layers.values()):
        raise MemroosContractError(
            "Invalid EvalSubmitResult: layers must contain EvalLayerBreakdown values"
        )

    return cast(EvalSubmitResult, value)
