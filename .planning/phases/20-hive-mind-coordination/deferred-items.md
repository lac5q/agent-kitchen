# Deferred Items — Phase 20

## Pre-existing Build Error (Out of Scope)

**File:** `src/components/library/health-panel.tsx:18`
**Error:** `Type error: Type '{ children: Element; asChild: true; }' is not assignable to type 'IntrinsicAttributes & Props<unknown>'. Property 'asChild' does not exist on type 'IntrinsicAttributes & Props<unknown>'.`
**Discovered during:** 20-02 build verification
**Status:** Pre-existing — `health-panel.tsx` was not modified by plan 20-02. Zero diff between base commit (ef459af) and HEAD for this file. Not caused by this plan's changes.
**Action needed:** Future plan should update TooltipTrigger usage or upgrade @radix-ui/react-tooltip to a version that exports `asChild` prop.
