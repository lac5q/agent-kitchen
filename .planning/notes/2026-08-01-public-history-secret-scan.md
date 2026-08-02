# Public-history secret scan — v8.33 Phase 208 criterion 3

*Run: 2026-08-01 · Tool: gitleaks 8.30.1 · Scope: `public/main` (1,454 commits scanned)*

This was the outstanding item from the repo split: `lac5q/memroos` was public from
2026-04-08, so anything committed in that window is public permanently. Making the product
repo private stopped the exposure growing; it did not retract what was already there.

## Result: 25 findings, none of them a live production credential

| Class | Count | Verdict |
|---|---|---|
| Test fixtures (`MEMROOS_JWT_SECRET` in tests, SDK `API_KEY`, skill-trust key) | ~13 | Fixtures. No action. |
| `golden-sets/*.jsonl` "API key: …" | 6 | **Synthetic eval content** — the string sits inside a test prompt whose expected answer is *"escalate without exposing credentials"*. Fake by construction. |
| `github-pat` | 2 findings, **1 unique token** | **Verified revoked** — `GET /user` returns 401. No action. |
| `services/memory/healthcheck.sh` (`LUCIA_PC_TOKEN`, a JWT, an api-key) | 3 | **History only.** Absent from the current file, which now reads `LUCIA_PC_TOKEN="${LUCIA_PC_TOKEN:-…}"` from env. |
| Docs/plan examples, `db-schema.ts`, content-scanner test JWT | ~3 | Illustrative. No action. |

**Cross-check against production:** every leaked value was hashed and compared against the
current `MEMROOS_JWT_SECRET` and `MEMROOS_OPERATOR_API_KEY` on oracle-1. **No match.**

## What this does and does not tell you

It says no *currently valid* secret is sitting in public history. It does **not** say nothing
was ever exposed — the three `healthcheck.sh` values were real-shaped and are public forever.
They appear dead (removed from the file, replaced by an env read), but if `LUCIA_PC_TOKEN` or
that JWT still authorise anything anywhere, **rotate them** — deletion from a file does not
un-publish a credential, and a fork retains its own copy regardless.

## Guardrail status

`.github/workflows/secret-guard.yml` already runs TruffleHog with `--only-verified` plus
internal-IP pattern checks on every push and PR. That covers most of v8.33 Phase 213.

Still missing from Phase 213: **a CI assertion on repository visibility**, so an accidental
flip of the private repo to public fails loudly rather than silently.

## Reproducing

```bash
gitleaks detect --source . --log-opts="public/main" --redact --report-format json \
  --report-path /tmp/scan.json
```

Triage rule used: classify by shape, verify liveness where an API allows it (GitHub), and
hash-compare against live production secrets. Never print a candidate value while triaging.
