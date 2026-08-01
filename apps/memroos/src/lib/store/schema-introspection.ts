/**
 * STORE-01 — read-only schema introspection.
 *
 * Both helpers answer "is there anything here?" for callers that render a view
 * of the database rather than reading a domain's rows — today, the workflow
 * map. They live here because the STORE-01 boundary is about where SQL is
 * written, not only about writes: a `SELECT` embedded in a rendering module is
 * still an ungoverned dependency on the schema, and it is exactly the kind of
 * query that silently breaks when a table is renamed.
 *
 * No `GovernanceContext` is required. STORE-01 scopes that requirement to
 * write paths, and neither function mutates anything.
 */

import type Database from "better-sqlite3";

/**
 * Whether a table exists.
 *
 * Returns false rather than throwing on any error: callers use this to degrade
 * a view gracefully on an older schema, so a failure here must not take the
 * whole page down.
 */
export function tableExists(db: Database.Database, table: string): boolean {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = ? AND name = ?`)
      .get("table", table);
    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * Row count for a table, or 0 when the table is absent.
 *
 * `table` is interpolated into the SQL because SQLite cannot parameterise an
 * identifier. Every caller passes a literal from its own source, never user
 * input; if that ever stops being true this needs an allowlist check first.
 */
export function countRows(db: Database.Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  } catch {
    // Table absent on an older schema — report zero rather than failing the map.
    return 0;
  }
}
