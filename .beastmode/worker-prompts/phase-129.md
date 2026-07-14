You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.2-team-scale-access-policy-plane (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 129 - Policy Dimensions, Shadow Mode + CI Regression (POLGOV-03/04/05)

## HARD CONSTRAINT (inherited from Phase 128)
The MEMSEC-08 regression corpus MUST still pass byte-identical. Dimension rules are ADDITIVE: they can only TIGHTEN (deny when base allows), never LOOSEN (allow when base denies). Cases that don't supply dimensions are unaffected. Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/policy/engine.ts` — Phase 128 engine. Exports: `evaluatePolicy(req, db?)`, `buildReceipt`, `evaluateKnowledgePolicy`, `POLICY_VERSION`, `PolicyRequest`, `PolicyEvaluation`, `PolicyRequestActor`. The engine routes by domain (memory-use | capability | knowledge) to wrapped functions and builds a receipt.
- `apps/memroos/src/lib/policy/receipt.ts` — `PolicyReceipt`, `PolicyDomain`, `PolicyOutcome`, `emitPolicyReceipt(db, receipt)`.
- `apps/memroos/src/lib/policy/policies/manifest.json` — version "2026.07.128", rules[] with id/domain/description/implementation.
- `apps/memroos/src/lib/policy/__tests__/engine.test.ts` — Phase 128 tests (7 tests). READ for patterns.
- `apps/memroos/src/lib/vault/types.ts` — VaultVisibility, VaultDomain, VaultSensitivity, VaultPolicy, VaultLabel.
- `apps/memroos/src/lib/recollection-policy.ts` — `BeliefStage = "bronze_raw_source" | "silver_candidate_claim" | "gold_operational_truth"`.
- `apps/memroos/src/lib/audit/event-types.ts` — has POLICY_DECISION event + entity (added Phase 128).
- `apps/memroos/src/lib/audit/write.ts` — `writeAuditEntry(entry, db)`.
- `package.json` (root) — has `check:recall-canary` and `check:belief-eval` scripts as pattern.

## FILES TO CREATE

### 1. apps/memroos/src/lib/policy/dimensions.ts
Types and matching for policy dimensions:
```ts
export interface PolicySubject {
  team?: string[];
  role?: string[];
  userId?: string;
  agentId?: string;
}
export interface PolicyObject {
  ontologyType?: string[];
  domain?: string[];      // VaultDomain values
  sensitivity?: string[]; // VaultSensitivity values
  visibility?: string[];  // VaultVisibility values
  beliefStage?: string[]; // BeliefStage values
}
export type PolicyDimensionAction = string; // e.g. "read", "recall", "export", "dispatch"
export type PolicyDimensionPurpose = string; // e.g. "meeting-prep", "recall", "export"
export interface PolicyDimensionRule {
  subject?: PolicySubject;
  object?: PolicyObject;
  action?: string[];
  purpose?: string[];
  effect: "deny"; // ONLY "deny" supported in this phase (additive tighten only)
}
export interface PolicyRequestDimensions {
  subject?: PolicySubject;
  object?: PolicyObject;
  action?: string;
  purpose?: string;
}
export function matchDimensions(rule: PolicyDimensionRule, dims: PolicyRequestDimensions | undefined): boolean;
```
- `matchDimensions`: for each field in the rule, check if the request dimensions match. Arrays are OR-matches (any element matches). Missing rule fields are wildcards (always match). If `dims` is undefined/empty, a rule with ANY specified field does NOT match (no dimensions supplied = no dimension rules apply = byte-identical). Only a rule with NO specified fields matches everything (but that would be a blanket deny, which is unusual).

### 2. apps/memroos/src/lib/policy/shadow.ts
Shadow mode for proposed policy versions:
```ts
import type { PolicyReceipt } from "./receipt";
import type { PolicyRequest, PolicyEvaluation } from "./engine";

export interface ShadowDiffEntry {
  action: string;
  domain: string;
  currentOutcome: string;
  proposedOutcome: string;
  reason: string;
}
export interface ShadowDiffResult {
  newlyDenied: ShadowDiffEntry[];
  newlyAllowed: ShadowDiffEntry[];
  unchanged: number;
  total: number;
}
export interface ShadowDecisionRecord {
  request: PolicyRequest;
  currentOutcome: string;
}
// Replay recent decisions under a proposed manifest version
export function shadowEvaluate(
  proposedManifest: { version: string; rules: Array<{ id: string; domain: string; dimensions?: PolicyDimensionRule }> },
  recentDecisions: ShadowDecisionRecord[]
): ShadowDiffResult;
// Operator-gated activation: validate proposed manifest, return the new active version string
export function activatePolicyVersion(
  proposedManifest: { version: string; rules: unknown[] },
  currentVersion: string
): { activated: boolean; newVersion: string; reason: string };
```
- `shadowEvaluate`: for each recent decision, re-evaluate using the proposed manifest's dimension rules. Compare current vs proposed outcome. Collect newly-denied (was allow/redact/review-required, now deny) and newly-allowed (was deny, now allow/redact/review-required). Note: since dimension rules can only tighten (deny), newlyAllowed should normally be empty — but still report it if it happens (would indicate a rule removal).
- `activatePolicyVersion`: validates the proposed manifest has a version string different from current, has rules[], and returns `{ activated: true, newVersion, reason: "operator-approved" }`. In a real system this would be an admin endpoint; here it's a function.

### 3. apps/memroos/src/lib/policy/policies/manifest.proposed.json
A proposed version for shadow mode testing:
```json
{
  "version": "2026.07.129-proposed",
  "rules": [
    ... same rules as manifest.json ...
    {
      "id": "gtm.meeting-prep-export-deny",
      "domain": "memory-use",
      "description": "GTM agents cannot export client/privileged claims (tighten from allow to deny for export purpose)",
      "implementation": "memsec.authorizeMemoryUse",
      "dimensions": {
        "subject": { "team": ["GTM"] },
        "object": { "domain": ["client"], "sensitivity": ["privileged"] },
        "purpose": ["export"],
        "effect": "deny"
      }
    }
  ]
}
```

### 4. apps/memroos/src/lib/policy/policies/corpus.json
CI regression decision cases:
```json
{
  "version": "2026.07.128",
  "cases": [
    {
      "id": "memsec-08-sealed-legal-privileged",
      "request": { "domain": "memory-use", "action": "recall", "actor": { "id": "agent:test", "role": "agent" }, "memoryUse": { "actor": { "id": "agent:test", "role": "agent" }, "purpose": "dispatch", "label": { "visibility": "private", "domain": "legal", "sensitivity": "privileged", "policy": "sealed" } } },
      "expectedOutcome": "deny"
    },
    ... more cases covering MEMSEC-08 scenarios + dimension cases ...
  ]
}
```
Include at least 10 cases: the 6 MEMSEC-08 restricted cases (all review-required or deny), 1 approved indexable case (allow), 1 capability dispatch deny case, 1 dimension-deny case (GTM export client/privileged), 1 dimension-no-match case (no dimensions supplied = base outcome unchanged).

### 5. apps/memroos/src/lib/policy/policies/approved-diffs.json
```json
{
  "approvedChanges": []
}
```
Empty initially — no approved diffs yet.

### 6. apps/memroos/src/lib/policy/__tests__/dimensions.test.ts
Test matchDimensions:
- Rule with subject.team=["GTM"] + request with subject.team=["GTM"] → matches
- Rule with subject.team=["GTM"] + request with subject.team=["ENG"] → no match
- Rule with object.sensitivity=["privileged"] + request with no dimensions → no match (byte-identical preservation)
- Rule with no specified fields → matches everything
- Rule with multiple fields (subject + object + purpose) → all must match

### 7. apps/memroos/src/lib/policy/__tests__/shadow.test.ts
Test shadowEvaluate:
- Recent decisions with one that would be newly-denied under proposed manifest → newlyDenied has 1 entry
- Decisions unaffected by proposed rules → unchanged count correct
- activatePolicyVersion with valid proposed manifest → activated: true

### 8. apps/memroos/src/lib/policy/__tests__/regression.test.ts
Test CI regression corpus:
- Load corpus.json
- For each case, call evaluatePolicy and assert receipt.outcome === expectedOutcome
- If a case is in approved-diffs.json, assert the approved outcome instead
- Fail on any unapproved difference

## FILES TO MODIFY

### 9. apps/memroos/src/lib/policy/engine.ts
Add dimension matching AFTER base evaluation:
- Import `matchDimensions` and `PolicyDimensionRule` from `./dimensions`
- Import the manifest (already imported)
- After the base wrapped function returns, check dimension rules for the matched domain. If any rule with `effect: "deny"` matches the request's dimensions (if supplied), and the base outcome was allow/redact/review-required, tighten to deny with reason `dimension_deny:<ruleId>`.
- If no dimensions are supplied on the request, skip dimension matching entirely (byte-identical).
- Add `dimensions?: PolicyRequestDimensions` to `PolicyRequest`.
- The receipt should include the dimension rule id in `ruleMatched` if a dimension rule fired.

### 10. apps/memroos/src/lib/policy/policies/manifest.json
Add the GTM dimension rule (same as in manifest.proposed.json) so it's active:
```json
{
  "id": "gtm.meeting-prep-export-deny",
  "domain": "memory-use",
  "description": "GTM agents cannot export client/privileged claims",
  "implementation": "memsec.authorizeMemoryUse",
  "dimensions": {
    "subject": { "team": ["GTM"] },
    "object": { "domain": ["client"], "sensitivity": ["privileged"] },
    "purpose": ["export"],
    "effect": "deny"
  }
}
```

### 11. package.json (root)
Add to scripts:
```json
"check:policy-regression": "npm run test --workspace apps/memroos -- --run src/lib/policy/__tests__/regression.test.ts"
```

### 12. .github/workflows/ci.yml
Add a new job `policy-regression` (copy the pattern from `recall-canary` job):
```yaml
  policy-regression:
    name: Policy regression corpus (POLGOV-05)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v6
      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Install linux native bindings
        run: npm install @rolldown/binding-linux-x64-gnu @tailwindcss/oxide-linux-x64-gnu @unrs/resolver-binding-linux-x64-gnu --no-save
      - name: Run policy regression corpus
        run: npm run check:policy-regression
```

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/policy src/lib/memory/__tests__/security-regression.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/policy" | head -20 ; echo "POLICY-TSC-DONE"
cd /Users/lcalderon/github/memroos && npm run check:policy-regression 2>&1 | tail -10
```
All policy tests + MEMSEC-08 suite MUST pass, zero tsc errors under src/lib/policy, and check:policy-regression must pass. Then STOP and report: files created/modified, test counts, and the exact verify output.
