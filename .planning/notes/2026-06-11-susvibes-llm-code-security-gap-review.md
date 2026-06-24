# SUSVIBES LLM Code-Security Gap Review

Date: 2026-06-11
Source request: review the paper linked from https://x.com/howtoai_/status/2064952595056332808
Paper reviewed: "Is Vibe Coding Safe? Benchmarking Vulnerability of Agent-Generated Code in Real-World Tasks" (arXiv:2512.03262, v2, 2026-02-16)

## Bottom Line

The paper's useful signal for MemRoOS is not just "AI code can be insecure." It shows a repeatable failure pattern: coding agents can satisfy feature tests while missing security invariants that are implicit in the repository, spread across files, or absent from the user's feature request.

MemRoOS already has strong memory-security, policy-gate, audit, and planning discipline. The gap is narrower: our CI and eval spine does not yet prove that agent-generated code changes are secure when they are functionally correct.

## Paper Findings That Matter

- SUSVIBES builds 200 repository-level feature-request tasks from 108 real projects and historical vulnerability fixes, with average context around 162K lines and 867 files.
- Tasks are evaluated with both functionality tests and security tests. This is the key design choice: a patch can pass feature behavior and still fail security.
- The strongest reported combination, SWE-Agent with Claude 4 Sonnet, reached 61% functional correctness but only 10.5% secure-and-correct.
- Generic security prompts, CWE self-selection, and oracle CWE hints did not reliably close the gap; the paper reports a correctness/security tradeoff when agents spend more effort on security reminders but implement less of the feature.
- The qualitative failures are mundane but high-impact: redirect CRLF/header injection, unsafe `javascript:` URL handling, and session lifetime not being enforced.

## Common LLM Failure Modes Surfaced

1. Functional-pass illusion: agents optimize for visible tests and "works" behavior while missing hidden abuse paths.
2. Missing implicit invariants: agents restore a feature but omit the repository's security contract, such as URL sanitization or session age checks.
3. Cross-file/context fragility: security depends on how helpers, framework conventions, and callers interact across the repo.
4. Prompt-only mitigation weakness: "be secure" and CWE hints are not sufficient controls.
5. Model/framework blind spots differ: no single frontier model or scaffold covers all vulnerability categories consistently.
6. Test-parser/environment trust risk: agent-built execution environments and LLM-derived log parsers are themselves part of the evaluation attack surface.

## Current MemRoOS Coverage

- Strong: memory labels, retrieval authorization, safe index projections, raw vault, operator approval, evidence bundles, and security regression fixtures are already represented in v5.0/v7.0 requirements.
- Strong: Phase 109 produced a real security audit with semgrep, pip-audit, bandit, knip, madge, and coverage attestation.
- Partial: `.github/workflows/ci.yml` runs typecheck, lint, unit tests, build, Docker config smoke, Python tests, py_compile, and shell syntax.
- Partial: `.github/workflows/secret-guard.yml` runs TruffleHog and custom leak checks.
- Missing in CI: semgrep security rules, npm audit/pip-audit gates, bandit, route-auth invariant tests, SDK/API contract smoke, recall canary, and agent-patch security scoring.
- Planned but not complete: `ARCHREV-01` route-level auth wrappers and `ARCHREV-07` recall canary CI.

## Gaps To Address

### G1 - Agent-generated code has no FuncPass/SecPass gate

MemRoOS has evals for memory, recall, governance, and SkillForge behavior, but no SUSVIBES-style gate that scores a proposed patch on both functionality and security. A code agent can currently pass unit tests and build while still creating a hidden auth, injection, storage, or policy bypass.

Recommended requirement:

- `AGENTSEC-01`: Add a patch-level security eval lane for agent-generated code. For security-sensitive changes, record `FuncPass`, `SecPass`, changed trust boundaries, tool outputs, static scan results, and required human review status in the evidence bundle.

### G2 - Security tools are audit-time, not always CI-time

The repo has used semgrep, pip-audit, bandit, and dependency CVE checks in Phase 109, but default CI does not run those gates. SUSVIBES argues against relying on after-the-fact review when agents are producing patches quickly.

Recommended requirement:

- `AGENTSEC-02`: Add a security CI job with semgrep OWASP/Node/Next/Python rules, npm audit high/critical gate, pip-audit for Python service requirement files, and bandit for Python services. Allow explicit accepted-risk files for known unfixable CVEs.

### G3 - Route/auth invariants are still concentrated in the proxy

The paper's examples are all "small missing checks inside a plausible feature." MemRoOS has the same class of risk around auth and route boundaries: `ARCHREV-01` is already planned because privileged API routes currently rely too much on `proxy.ts`.

Recommended requirement:

- Promote `ARCHREV-01` before broader feature work. Require route-group wrappers plus tests for host x route x auth combinations, especially before any Next.js trust-boundary upgrade.

### G4 - Feature specs do not force security acceptance criteria

SUSVIBES hides the security requirement in a normal feature request, which is exactly how real issue tickets behave. MemRoOS planning often includes verification, but not every feature spec requires a threat model row or negative security fixture.

Recommended requirement:

- `AGENTSEC-03`: Extend GSD plan templates for code tasks with a security acceptance section: trust boundary touched, input sources, output sinks, secrets/PII exposure, auth/policy changes, negative tests, and accepted-risk owner.

### G5 - SkillForge behavioral W-lift is not code-security W-lift

SkillForge has deterministic held-out behavioral evals, receipts, and operator approval. That does not prove a generated skill or code patch avoids CWE-style implementation bugs. Security should be a separate dimension, not folded into generic W.

Recommended requirement:

- `AGENTSEC-04`: Add a security subscore to SkillForge/agent patch proposals for code-affecting edits. The subscore should fail closed on auth, policy, serialization, file-path, shell, SQL, XSS, SSRF, redirect, session, and secret-handling surfaces unless a targeted negative fixture or scanner result exists.

### G6 - Evaluation can be fooled by the environment layer

SUSVIBES uses agent-built Docker environments and log parser synthesis; Appendix E calls for static/semantic analysis, fuzzing, taint analysis, and secret scanners. MemRoOS should treat test-running infrastructure and parser output as evidence to verify, not as a ground truth oracle.

Recommended requirement:

- `AGENTSEC-05`: For agent-code evals, store raw command output, parser version/hash, test command, environment image/lockfile hash, and a deterministic pass/fail extractor. No LLM-only log interpretation may be the sole pass/fail source.

## Priority Order

1. Finish `ARCHREV-01` route-level auth wrappers.
2. Add `AGENTSEC-02` security CI gates using tools already exercised in Phase 109.
3. Add `AGENTSEC-03` security acceptance criteria to code-task planning templates.
4. Add `AGENTSEC-01` patch-level FuncPass/SecPass evidence for agent-generated code.
5. Extend SkillForge with `AGENTSEC-04` security W-lift only after the CI/evidence substrate exists.
6. Harden eval evidence with `AGENTSEC-05` when the patch-level lane is implemented.

## Paper Caveats

- The benchmark focuses on Python projects; MemRoOS is mostly TypeScript/Next.js plus Python services, so direct SUSVIBES numbers should not be copied as our risk rate.
- Unit tests are an imperfect proxy for exploitability. The paper itself notes future work around property-based/adversarial tests, static/semantic analysis, fuzzers, taint analysis, and secret scanners.
- The useful action is not "ban vibe coding"; it is to stop treating functionally correct agent patches as deployable without security-specific gates.

## Source Links

- arXiv: https://arxiv.org/abs/2512.03262
- Current HTML: https://arxiv.org/html/2512.03262
- SUSVIBES repo: https://github.com/LeiLiLab/susvibes
- X post: https://x.com/howtoai_/status/2064952595056332808
