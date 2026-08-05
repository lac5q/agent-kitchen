# TASK: Phase 190 — Client Barrel Split (CLIENTSPLIT-01..02)

Read the roadmap section "Phase 190 — Client Barrel Split" in .planning/ROADMAP.md.

1. CLIENTSPLIT-01 — split apps/memroos/src/lib/api-client.ts (~2,300 lines, ~181 exports,
   imported by ~83 files) into lib/api-client/<domain>.ts modules mirroring the LIBNORM
   domain boundaries established by Phase 189 (look at how lib/ is now organized — memory/,
   agent/, auth/, store/ etc. — and group the client functions the same way; aim for no
   module over ~400 lines). Keep lib/api-client.ts as a RE-EXPORT SHIM (`export * from
   "./api-client/<domain>"` lines only) so all 83 importers keep working unchanged — the
   shim is kept for one milestone per the roadmap, do NOT rewrite importers.
2. Pure mechanical move: function bodies must move byte-identical (whitespace aside); no
   signature changes, no renames, no behavior changes. Shared private helpers move to
   lib/api-client/shared.ts and are imported by siblings.
3. CLIENTSPLIT-02 — bundle measurement: record client bundle size for the three heaviest
   routes before and after. Use `npm run build` output (Next.js route size table) —
   capture the before numbers FIRST (run build before touching anything, save the table to
   .planning/phases/190-client-barrel-split/BUNDLE-BEFORE.txt), then after
   (BUNDLE-AFTER.txt), and write a short 190-01-SUMMARY.md in that directory comparing the
   NOC and operator-console routes. If the build fails for pre-existing reasons, record
   that instead of blocking the split.
4. Guard: `npx tsc --noEmit` (npm run typecheck) must stay clean; the fast suite must stay
   green; no import cycles introduced (if the repo has a cycle check, run it).

This is mechanical work — resist any temptation to refactor, rename, or "improve" while
moving. Run full fast suite + typecheck at the end.
