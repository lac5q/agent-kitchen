# Phase 21: Paperclip Fleet Node — Validation Map

**Created:** 2026-04-17
**Phase:** 21-paperclip-fleet-node
**Framework:** Vitest

---

## Requirements → Test Coverage Map

| Req ID | Behavior | Test File | Test Description | Automated Command |
|--------|----------|-----------|------------------|-------------------|
| PAPER-01 | Flow includes a dedicated Paperclip fleet group using the parentId pattern | `src/components/flow/__tests__/paperclip-flow-structure.test.ts` | `group-paperclip` exists; fleet children use `parentId: "group-paperclip"` | `npx vitest run src/components/flow/__tests__/paperclip-flow-structure.test.ts` |
| PAPER-01 | Collapsed Paperclip cluster uses live fleet summary | `src/components/flow/__tests__/paperclip-flow-structure.test.ts` | collapsed summary references live fleet data | same |
| PAPER-02 | Dashboard dispatch request validates required input | `src/app/api/paperclip/__tests__/route.test.ts` | POST rejects missing `taskSummary` | `npx vitest run src/app/api/paperclip/__tests__/route.test.ts` |
| PAPER-02 | Successful dispatch writes local task state and returns task/session ids | `src/app/api/paperclip/__tests__/route.test.ts` | POST proxies upstream and returns `{ok:true, taskId, sessionId}` | same |
| PAPER-02 | Detail panel dispatch form POSTs to `/api/paperclip` and shows result | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | submit success and error states are visible | `npx vitest run src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` |
| PAPER-03 | Per-agent autonomy mode is visible in the fleet panel | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | autonomy badges render `Interactive / Autonomous / Continuous / Hybrid` | same |
| PAPER-04 | Recovery operations include session ids and checkpoint steps | `src/app/api/paperclip/__tests__/route.test.ts` | GET returns `operations` with `sessionId`, `completedSteps`, and `resumeFrom` | `npx vitest run src/app/api/paperclip/__tests__/route.test.ts` |
| PAPER-04 | Successful dispatch stores checkpoint JSON containing session id | `src/app/api/paperclip/__tests__/route.test.ts` | delegation checkpoint persists `sessionId` | same |
| DASH-03 | Paperclip Flow detail panel shows per-agent status, task, heartbeat, and recovery info | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | renders agent rows and recovery/session rows | `npx vitest run src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` |

---

## Structural Verification

| Check | Command |
|-------|---------|
| `usePaperclipFleet()` exported | `grep -q "usePaperclipFleet" src/lib/api-client.ts` |
| Paperclip poll interval defined | `grep -q "paperclip" src/lib/constants.ts` |
| Paperclip route exists | `test -f src/app/api/paperclip/route.ts` |
| Paperclip group exists in Flow | `grep -q "group-paperclip" src/components/flow/react-flow-canvas.tsx` |
| Detail panel wired | `grep -q "PaperclipFleetPanel" src/components/flow/node-detail-panel.tsx` |

---

## Phase Gate Commands

```bash
# Wave 1 gate
npx vitest run src/app/api/paperclip/__tests__/route.test.ts

# Wave 2 gate
npx vitest run src/components/flow/__tests__/paperclip-fleet-panel.test.tsx
npx vitest run src/components/flow/__tests__/paperclip-flow-structure.test.ts

# Full phase gate
npm run build
```

---

## Open Questions

All planning-stage questions are resolved in `21-RESEARCH.md`.

- RESOLVED: use existing hive tables for session recovery instead of adding a new schema object
- RESOLVED: keep `manager` as the orchestration hub and add `group-paperclip` as the collapsible fleet cluster
- RESOLVED: place dispatch/recovery UI in the Flow node detail panel via a dedicated `PaperclipFleetPanel`
