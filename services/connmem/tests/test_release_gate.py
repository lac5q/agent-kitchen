"""CONNMEM-10 — Release gate tests.

These tests verify the gate itself: every check function returns a
`CheckResult`, the aggregator produces a `GateVerdict`, and the
default checks cover the documented list.
"""
from __future__ import annotations

import unittest
from unittest import TestCase, main

from services.connmem.release_gate import (
    DEFAULT_CHECKS,
    CheckResult,
    GateVerdict,
    check_runtime_reachable,
    run_gate,
    run_gate,
)


class CheckFunctionTests(TestCase):
    def test_default_checks_have_unique_names(self) -> None:
        names = [c.__name__ for c in DEFAULT_CHECKS]
        self.assertEqual(len(names), len(set(names)))
        self.assertGreaterEqual(len(names), 9)  # at least the documented set

    def test_default_checks_are_callables(self) -> None:
        for check in DEFAULT_CHECKS:
            self.assertTrue(callable(check))


class GateAggregatorTests(TestCase):
    def test_run_gate_returns_verdict_with_all_checks(self) -> None:
        verdict = run_gate()
        self.assertIsInstance(verdict, GateVerdict)
        self.assertEqual(len(verdict.checks), len(DEFAULT_CHECKS))

    def test_run_gate_check_results_have_names_and_status(self) -> None:
        verdict = run_gate()
        for check in verdict.checks:
            self.assertIsInstance(check, CheckResult)
            self.assertTrue(check.name)
            self.assertIsInstance(check.passed, bool)

    def test_run_gate_synthetic_all_passing(self) -> None:
        def c1() -> CheckResult:
            return CheckResult("c1", True)

        def c2() -> CheckResult:
            return CheckResult("c2", True)

        verdict = run_gate(checks=(c1, c2))
        self.assertTrue(verdict.overall_pass)
        self.assertEqual(verdict.summary, "2/2 checks passed")
        self.assertEqual(len(verdict.passing), 2)
        self.assertEqual(len(verdict.failing), 0)

    def test_run_gate_synthetic_one_failing(self) -> None:
        def c1() -> CheckResult:
            return CheckResult("c1", True)

        def c2() -> CheckResult:
            return CheckResult("c2", False, "boom")

        verdict = run_gate(checks=(c1, c2))
        self.assertFalse(verdict.overall_pass)
        self.assertEqual(verdict.summary, "1/2 checks passed")
        self.assertEqual(len(verdict.failing), 1)
        self.assertEqual(verdict.failing[0].name, "c2")
        self.assertEqual(verdict.failing[0].detail, "boom")

    def test_run_gate_handles_unhandled_exceptions(self) -> None:
        def c1() -> CheckResult:
            raise RuntimeError("oops")

        verdict = run_gate(checks=(c1,))
        self.assertFalse(verdict.overall_pass)
        self.assertEqual(verdict.checks[0].passed, False)
        self.assertIn("oops", verdict.checks[0].detail)


class GateEndToEndTests(TestCase):
    """Run the actual default checks and confirm the gate passes today.

    If any of these break, the gate goes red and the release is blocked.
    """

    def test_default_gate_passes_against_in_memory_state(self) -> None:
        verdict = run_gate()
        # We expect the gate to pass against the current connmem
        # implementation; if any check fails, the failure is listed.
        if not verdict.overall_pass:
            failures = "\n".join(
                f"  - {c.name}: {c.detail}" for c in verdict.failing
            )
            self.fail(
                f"Release gate failed:\n{failures}\n\nFull verdict: {verdict.to_dict()}"
            )

    def test_to_dict_serializes_for_operator_surfaces(self) -> None:
        verdict = run_gate()
        d = verdict.to_dict()
        self.assertIn("overall_pass", d)
        self.assertIn("summary", d)
        self.assertIn("passing", d)
        self.assertIn("failing", d)
        self.assertIn("checks", d)


class RuntimeReachableTest(TestCase):
    """CONNMEM-RT-05: the release gate must include a runtime
    reachability check. The check probes the locally-bound service
    at CONNMEM_URL (or http://127.0.0.1:3290 by default). In a unit
    test the service is not running, so the check returns passed=False
    with a detail that names the URL it tried."""

    def test_runtime_reachable_fails_when_service_down(self) -> None:
        # No service is running on 127.0.0.1:3290 in the unit-test
        # environment, so the probe must fail closed.
        result = check_runtime_reachable()
        self.assertEqual(result.name, "runtime_reachable")
        self.assertFalse(result.passed)
        # The detail must name the URL the probe tried so operators
        # can diagnose a misconfigured topology.
        self.assertIn("127.0.0.1:3290", result.detail)

    def test_run_gate_include_runtime_reachable_appends_the_check(self) -> None:
        verdict = run_gate(include_runtime_reachable=True)
        names = [c.name for c in verdict.checks]
        self.assertIn("runtime_reachable", names)
        # When the service is down, the runtime check fails and the
        # overall verdict is false.
        self.assertFalse(verdict.overall_pass)

    def test_run_gate_without_runtime_reachable_omits_the_check(self) -> None:
        verdict = run_gate(include_runtime_reachable=False)
        names = [c.name for c in verdict.checks]
        self.assertNotIn("runtime_reachable", names)


if __name__ == "__main__":
    main()