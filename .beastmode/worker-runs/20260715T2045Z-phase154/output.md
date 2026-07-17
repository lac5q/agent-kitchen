I'll implement GATE-RESILE-01 with a helper mirroring `memorySearchTimeoutMs()` style, wire it into `_checkVectorHealthDirect`, and add tests covering the env contract.

## 1. Brief Summary

- Added exported `mem0HealthTimeoutMs()` helper reading `MEM0_HEALTH_TIMEOUT_MS` with default 15_000, validating positive finite integers via `Number.isFinite` + `> 0` + `Math.trunc` (matches existing `memorySearchTimeoutMs()` style).
- Replaced the hardcoded `timeoutSignal(3000)` in `_checkVectorHealthDirect` with `timeoutSignal(mem0HealthTimeoutMs())`.
- Created `backends-health-timeout.test.ts` with 7 cases: default 15_000, valid positive override, string-numeric override, fractional truncation, `NaN` → default, `0`/negative → default, and a live override integration.

## 2. Unified Diffs

### `apps/memroos/src/lib/memory/backends.ts`

```diff
@@ -13,6 +13,17 @@
 function memorySearchTimeoutMs(): number {
   const parsed = Number(process.env.MEMROOS_MEMORY_SEARCH_TIMEOUT_MS ?? 15_000);
   return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 15_000;
 }
+
+export function mem0HealthTimeoutMs(): number {
+  const parsed = Number(process.env.MEM0_HEALTH_TIMEOUT_MS ?? 15_000);
+  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 15_000;
+}
@@ -91,7 +102,7 @@ async function _checkVectorHealthDirect(): Promise<MemoryTierHealth> {
   try {
-    const response = await fetch(`${MEM0_URL}/health`, { signal: timeoutSignal(3000) });
+    const response = await fetch(`${MEM0_URL}/health`, { signal: timeoutSignal(mem0HealthTimeoutMs()) });
```

### `apps/memroos/src/lib/memory/__tests__/backends-health-timeout.test.ts` (new)

```diff
+import { afterEach, describe, expect, it } from "vitest";
+import { mem0HealthTimeoutMs } from "../backends";
+
+const ORIGINAL_ENV = { ...process.env };
+
+afterEach(() => {
+  for (const key of Object.keys(process.env)) {
+    if (!(key in ORIGINAL_ENV)) delete process.env[key];
+  }
+  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
+    process.env[key] = value;
+  }
+});
+
+describe("mem0HealthTimeoutMs", () => {
+  it("defaults to 15_000ms when env var is unset", () => {
+    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+
+  it("defaults to 15_000ms when env var is empty string", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "";
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+
+  it("accepts a positive integer override", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "7500";
+    expect(mem0HealthTimeoutMs()).toBe(7_500);
+  });
+
+  it("accepts a numeric string and truncates fractional values", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "12345.9";
+    expect(mem0HealthTimeoutMs()).toBe(12_345);
+  });
+
+  it("falls back to 15_000ms when override is zero", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "0";
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+
+  it("falls back to 15_000ms when override is negative", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "-100";
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+
+  it("falls back to 15_000ms when override is NaN", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "not-a-number";
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+
+  it("integrates a live override via direct read", () => {
+    process.env.MEM0_HEALTH_TIMEOUT_MS = "20000";
+    expect(mem0HealthTimeoutMs()).toBe(20_000);
+    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
+    expect(mem0HealthTimeoutMs()).toBe(15_000);
+  });
+});
```

## 3. Exact Test Cases Included

1. **`defaults to 15_000ms when env var is unset`** — unset → 15_000
2. **`defaults to 15_000ms when env var is empty string`** — `""` → 15_000
3. **`accepts a positive integer override`** — `"7500"` → 7_500
4. **`accepts a numeric string and truncates fractional values`** — `"12345.9"` → 12_345
5. **`falls back to 15_000ms when override is zero`** — `"0"` → 15_000
6. **`falls back to 15_000ms when override is negative`** — `"-100"` → 15_000
7. **`falls back to 15_000ms when override is NaN`** — `"not-a-number"` → 15_000
8. **`integrates a live override via direct read`** — set → unset transition confirms dynamic re-read

## Verification Command

```bash
cd apps/memroos && npx vitest run src/lib/memory/__tests__/backends-health-timeout.test.ts
```

**Scope compliance:** Only `backends.ts` and the new test file were touched. Search timeout, `_queryGraphMemoryDirect` (5s), tier contract, `memroos-mcp.sh`, `mem0-server.py`, and policy gates are untouched. No secrets introduced.