---
phase: 114-midbrain-comparison-benchmark-proof
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - evals/comparative-retrieval/README.md
  - evals/comparative-retrieval/schema.json
  - evals/comparative-retrieval/fixtures/README.md
  - scripts/run-comparative-retrieval-evals.mjs
  - apps/memroos/src/app/vs/[competitor]/competitor-data.ts
  - apps/memroos/src/app/sitemap.ts
  - apps/memroos/public/llms.txt
  - README.md
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 114: Code Review Report

**Reviewed:** 2026-06-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase ships the Midbrain comparison benchmark proof: a retrieval harness schema, eval runner script, competitor data for the VS pages, sitemap updates, and public LLM-readable docs. The harness shape and schema are sound. However, the `totalScore` values in `competitor-data.ts` do not derive from the per-criterion scores in any consistent mathematical formula — every competitor except MemroOS shows a mismatch between stated `totalScore` and the simple average-of-scores × 20 formula, with Midbrain's gap being the most damaging (74.00 computed vs. 65.21 stated). The harness also has a truncation heuristic in answer-support scoring that produces false positives for short expected answers matched inside long but irrelevant passages, and a CLI argument parsing issue that silently passes `NaN` for `--limit` when invoked without a value. Four competitors in `competitor-data.ts` are absent from both the sitemap and `llms.txt`.

---

## Critical Issues

### CR-01: totalScore values are not reproducible from per-criterion scores — Midbrain gap is 8.79 points

**File:** `apps/memroos/src/app/vs/[competitor]/competitor-data.ts:34–197`

**Issue:** Every competitor's `totalScore` diverges from the only plausible derivation formula (mean of 8 criterion scores × 20). The deltas computed from the stated per-criterion scores:

| Competitor | Stated | Computed (avg×20) | Delta |
|---|---|---|---|
| MemroOS | 84.06 | 85.00 | −0.94 |
| Letta | 70.58 | 67.25 | +3.33 |
| Zep | 68.64 | 66.00 | +2.64 |
| **Midbrain** | **65.21** | **74.00** | **−8.79** |
| GBrain | 58.00 | 55.25 | +2.75 |
| EverMind | 55.00 | 51.50 | +3.50 |
| AXME | 52.00 | 53.00 | −1.00 |
| AgenticMemory | 48.00 | 43.00 | +5.00 |
| WorldFlow | 50.00 | 50.75 | −0.75 |
| Tytan | 46.00 | 47.00 | −1.00 |

Midbrain's deficit (−8.79) is the most harmful: the stated `totalScore` of 65.21 is materially lower than what the per-criterion scores support (74.00). Any page or UI that renders per-criterion scores alongside `totalScore` will show incoherent numbers. Beyond UI incoherence, this is a credibility risk — a competitor or journalist who multiplies the criterion scores will produce a different number than what the page states.

No weighting table is defined anywhere in the codebase, so there is no documented justification for the divergence.

**Fix:** Either (a) derive `totalScore` programmatically from the criterion scores at runtime to keep them consistent, or (b) document and commit a `CRITERIA_WEIGHTS` constant alongside `CRITERIA_LABELS` and verify that `totalScore = Σ(score_i × weight_i)` holds exactly for every competitor. Option (a) is strongly preferred because it makes drift impossible:

```typescript
// Replace hardcoded totalScore with a derived value:
export function computeTotalScore(scores: Record<string, { score: number; rationale: string }>): number {
  const values = Object.values(scores).map((v) => v.score);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 20 * 100) / 100;
}
```

Then in every competitor object, replace `totalScore: 65.21` with `totalScore: computeTotalScore(scores)`, or compute it at the call site.

---

### CR-02: Answer-support heuristic truncates to 40 characters — produces false positives for short expected answers

**File:** `scripts/run-comparative-retrieval-evals.mjs:183–185`

**Issue:** The `answerSupported` check matches retrieved text against only the first 40 characters of `expected_answer`:

```js
const answerSupported = retrieval.retrieved.some((r) =>
  r.text.toLowerCase().includes(answerLower.slice(0, 40))
);
```

For short expected answers (e.g., `"Qdrant Cloud"` = 12 chars, `"yes"` = 3 chars, `"2026-03-15"` = 10 chars), `slice(0, 40)` returns the full answer — that is fine. But for any answer shorter than a common word fragment, the substring match will fire on unrelated text. More concretely: if `expected_answer` is `"Q4"`, the check will match any retrieved passage that contains the string `"q4"` even if that passage is about a completely different quarter or metric.

The 40-character cap was presumably introduced to avoid exact-match failures on long paraphrased answers, but it creates a structural false-positive risk that inflates `answerSupportedRate` and `answer_support_rate` in the benchmark output. If these numbers are cited publicly as evidence of MemroOS retrieval quality, the methodology is unsound.

**Fix:** Replace the truncation heuristic with a whole-answer containment check guarded by minimum answer length, and add a comment noting that semantic equivalence requires an LLM judge:

```js
// Exact containment only for answers longer than 4 characters.
// For short answers or paraphrase equivalence, an LLM judge is required.
const answerSupported =
  answerLower.length > 4 &&
  retrieval.retrieved.some((r) => r.text.toLowerCase().includes(answerLower));
```

---

## Warnings

### WR-01: `--limit` argument parsed with no bounds or NaN guard — silent runtime error

**File:** `scripts/run-comparative-retrieval-evals.mjs:46–47`

**Issue:** `parseArgs` consumes `argv[++i]` for `--limit` without checking that `i` is still within bounds or that the parsed result is a valid number:

```js
else if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
```

If a user runs `node scripts/run-comparative-retrieval-evals.mjs --limit` (no value), `argv[++i]` is `undefined`, `parseInt(undefined, 10)` is `NaN`, and `limit` is set to `NaN`. Later, `tasks.slice(0, NaN)` returns an empty array, so the harness silently runs zero tasks and writes a valid-looking but empty results file.

**Fix:**

```js
else if (argv[i] === "--limit") {
  const val = parseInt(argv[++i], 10);
  if (isNaN(val) || val <= 0) throw new Error("--limit requires a positive integer");
  args.limit = val;
}
```

---

### WR-02: `loadFixtures` reads fixture file with no JSON parse error handling

**File:** `scripts/run-comparative-retrieval-evals.mjs:86–87`

**Issue:** The fixture file is parsed with bare `JSON.parse` and no try/catch. A malformed fixture file (truncated write, encoding issue) will throw an unhandled exception with a cryptic V8 JSON parse error rather than a message pointing to the fixture path.

```js
const tasks = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
```

There is also no runtime validation that `tasks` is actually an array or that each task conforms to the schema (the schema.json is never loaded or applied at runtime). A fixture file containing a single object `{}` instead of an array would cause `tasks.slice(...)` to throw.

**Fix:**

```js
let tasks;
try {
  tasks = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
} catch (e) {
  throw new Error(`Failed to parse fixture file ${fixturePath}: ${e.message}`);
}
if (!Array.isArray(tasks)) {
  throw new Error(`Fixture file ${fixturePath} must contain a JSON array of tasks`);
}
```

---

### WR-03: Four competitors present in competitor-data.ts are absent from sitemap and llms.txt

**File:** `apps/memroos/src/app/sitemap.ts:14–22` / `apps/memroos/public/llms.txt:51–58`

**Issue:** `competitor-data.ts` defines nine competitors. The sitemap covers all nine. But `llms.txt` lists only five VS page links and omits:

- `/vs/axme`
- `/vs/agenticmemory`
- `/vs/worldflow`
- `/vs/tytan`

LLMs and crawlers that consume `llms.txt` as the canonical index (the file's stated purpose) will not discover these four pages. Given that VS pages are SEO comparison assets, this is a meaningful coverage gap.

**Fix:** Add the missing four entries to `apps/memroos/public/llms.txt` under the Competitor Comparisons section:

```
- MemroOS vs AXME: https://memroos.com/vs/axme
- MemroOS vs AgenticMemory: https://memroos.com/vs/agenticmemory
- MemroOS vs WorldFlow: https://memroos.com/vs/worldflow
- MemroOS vs Tytan: https://memroos.com/vs/tytan
```

---

### WR-04: `recallAtK` returns 1.0 when `evidence_spans` is undefined — silently inflates recall for tasks missing the field

**File:** `scripts/run-comparative-retrieval-evals.mjs:159–161`

**Issue:** The `evidence_spans` field is optional in `schema.json`. When it is absent from a task, `evidenceSpans` is an empty Set:

```js
const evidenceSpans = new Set(task.evidence_spans ?? []);
```

Then:

```js
const recallAtK = evidenceSpans.size > 0
  ? truePositives / evidenceSpans.size
  : (retrieval.injected.length === 0 ? 1 : 0);
```

If `evidence_spans` is absent AND the adapter injects nothing (e.g., `no-memory` baseline), `recallAtK` is `1.0`. This means the no-memory baseline on a task with no evidence spans counts as a perfect recall. This silently inflates aggregate `recallAtK` when the fixture set contains tasks without `evidence_spans`.

The schema marks `evidence_spans` as optional, which means this case is expected to arise. A task without `evidence_spans` should produce `recallAtK: null` (not measurable) and be excluded from the recall aggregate.

**Fix:**

```js
const recallAtK = evidenceSpans.size > 0
  ? truePositives / evidenceSpans.size
  : null; // Not measurable — evidence_spans not provided
```

And in `aggregateScores`, compute recall only over tasks where `recallAtK !== null`.

---

### WR-05: `p95LatencyMs` uses `Math.ceil` interpolation that biases high for small N

**File:** `scripts/run-comparative-retrieval-evals.mjs:221–222`

**Issue:**

```js
const p95Index = Math.ceil(latencies.length * 0.95) - 1;
```

For `n = 20`, this gives `Math.ceil(19) - 1 = 18` (element at index 18 = 19th of 20 = 95th percentile). Correct. For `n = 25`, `Math.ceil(23.75) - 1 = 24 - 1 = 23` (element at index 23 = 24th of 25 = 96th percentile, not 95th). For `n = 10`, `Math.ceil(9.5) - 1 = 10 - 1 = 9` (100th percentile). This is the standard nearest-rank method, which is acceptable for large N, but for small smoke sets (25 items) it reports the 96th percentile while labeling it `p95LatencyMs`, and for N ≤ 20 it can reach the 100th percentile.

**Fix:** Use the floor method for consistency with the p95 label:

```js
const p95Index = Math.floor(latencies.length * 0.95);
// Clamp to valid range
const safeIndex = Math.min(Math.max(p95Index, 0), latencies.length - 1);
```

---

## Info

### IN-01: `smoke set` fixture file referenced in fixtures/README.md does not exist in the repository

**File:** `evals/comparative-retrieval/fixtures/README.md:44–48`

**Issue:** The README documents `fixtures/memroos-public-smoke.json` as the 25-question smoke set and provides a command to run it. `loadFixtures` will attempt to read this file. It does not exist in the repository (the file is not committed). Running the smoke-set command without first creating the fixture will throw a clear error (file-not-found), but new contributors will be confused by a README-documented command that fails immediately.

**Fix:** Either commit a minimal `memroos-public-smoke.json` with a handful of synthetic tasks, or add a generation script and update the README to say "generate first with `node scripts/generate-smoke-fixtures.mjs`."

---

### IN-02: `import.meta.url` entry-point guard is non-portable on Windows

**File:** `scripts/run-comparative-retrieval-evals.mjs:313`

**Issue:**

```js
if (import.meta.url === `file://${process.argv[1]}`) {
```

On Windows, `process.argv[1]` uses backslashes (`C:\path\to\file.mjs`) while `import.meta.url` uses forward-slash file URLs (`file:///C:/path/to/file.mjs`). The comparison will always be false on Windows, making the script impossible to run directly as a CLI entry point on that platform.

**Fix:** Use the canonical Node.js idiom:

```js
import { fileURLToPath } from "node:url";
// Already imported above
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
```

---

### IN-03: `schema.json` uses draft-07 `$schema` URI but lacks `additionalProperties: false` on the root object

**File:** `evals/comparative-retrieval/schema.json:1–106`

**Issue:** The root schema object does not set `additionalProperties: false`. Fixture tasks with typo'd field names (e.g., `"evicence_spans"` instead of `"evidence_spans"`) will silently validate as conforming. Given that `evidence_spans` drives recall scoring, a typo here causes WR-04 to manifest without any validation warning.

**Fix:** Add `"additionalProperties": false` to the root schema object and to the nested corpus item schema.

---

_Reviewed: 2026-06-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
