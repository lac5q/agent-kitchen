# Restore Drill Log — Phase 147

**Date:** 2026-07-10T08:03:33Z  
**Script:** `scripts/restore-drill.sh`  
**Exit code:** 0 (all checks passed)

## Drill Output

```
MemroOS Restore Drill — 2026-07-10T08:03:33Z
Working directory: /var/folders/nj/ndbrhkbs293gp2gww78_kc700000gn/T//memroos-restore-drill-86419

[INFO]  MemroOS Restore Drill started
[INFO]  Repo root: /Users/lcalderon/github/memroos
[INFO]  Temp dir: /var/folders/nj/ndbrhkbs293gp2gww78_kc700000gn/T//memroos-restore-drill-86419

[OK]    Found kernel DB: /Users/lcalderon/github/memroos/data/conversations.db
[INFO]  === kernel Restore Drill ===
[INFO]  Source DB: /Users/lcalderon/github/memroos/data/conversations.db
[INFO]  Source size: 384M
[INFO]  Step 1: Creating consistent backup via sqlite3 .backup (read-only on source)
[OK]    Backup created: .../kernel-backup.db (396M)
[INFO]  Step 2: Creating restore copy from backup
[OK]    Restore copy created: .../kernel-restore.db (382M)
[INFO]  Step 3: Verifying restored DB integrity
[OK]    PRAGMA integrity_check: ok
[INFO]  Step 4: Counting registered agents
[OK]    Registered agents: 53
[INFO]  Step 5: Counting audit_log entries
[OK]    audit_log entries: 5301
[INFO]  Step 6: Counting audit_entries (POLGOV receipts)
[OK]    audit_entries: 6341
[INFO]  Step 7: Checking schema version
[OK]    Schema version (PRAGMA user_version): 10
[INFO]  Step 8: Counting total tables
[OK]    Total tables: 92
[INFO]  === kernel drill complete ===

[INFO]  === Orchestration DB ===
[WARN]  No orchestration DB found at default paths (data/orchestration.db).
[INFO]  This is expected when the LangGraph orchestration service is not running.
[INFO]  The orchestration DB is created on first startup of the Python service.
[INFO]  Litestream replication config is at: services/orchestration/litestream.yml.example
[INFO]  See docs/integrations/langgraph.md → 'Checkpoint Durability' for restore steps.
[INFO]  === Orchestration DB drill skipped ===

[INFO]  === Restore Drill Summary ===
[OK]    All checks PASSED (0 failures)
[OK]    Log file: .../restore-drill.log
[INFO]  Drill temp directory (will be cleaned up): .../memroos-restore-drill-86419
[INFO]  Temp files retained at: .../memroos-restore-drill-86419
[INFO]  To clean up: rm -rf .../memroos-restore-drill-86419
```

## Summary

| Check | Result |
|-------|--------|
| Kernel DB found | Yes (`data/conversations.db`, 384M) |
| Consistent backup created | Yes (sqlite3 .backup, read-only on source) |
| Restore copy created | Yes (cp from backup) |
| PRAGMA integrity_check | ok |
| Registered agents | 53 |
| audit_log entries | 5,301 |
| audit_entries (POLGOV receipts) | 6,341 |
| Schema version (PRAGMA user_version) | 10 |
| Total tables | 92 |
| Orchestration DB | Skipped (not running — expected) |
| Failures | 0 |
| Exit code | 0 |

## Notes

- The drill used `sqlite3 .backup` for the initial backup, which is read-only
  on the source DB. The production DB was not modified.
- The orchestration DB (`data/orchestration.db`) was not present because the
  LangGraph orchestration Python service is not running in this environment.
  The drill logged a skip note with references to the litestream config and
  LangGraph integration docs.
- Temp files were retained for inspection and can be cleaned up manually.
