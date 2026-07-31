import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { loadMemroosEnv } from './env';
import { initSchema } from './db-schema';
import { resolveFromRepoRoot } from './paths';
import { seedDefaultAdmin } from './auth/seed';
import { seedRegisteredAgents } from './agent-registry-seed';
import { backfillConnectorSpaceReaders } from './connectors/store';

let _db: Database.Database | null = null;

/**
 * Returns the shared SQLite Database singleton.
 * Opens and initializes the DB on first call, returns cached handle on subsequent calls.
 */
export function getDb(): Database.Database {
  if (!_db) {
    const { SQLITE_DB_PATH } = loadMemroosEnv();
    const resolved = path.isAbsolute(SQLITE_DB_PATH)
      ? SQLITE_DB_PATH
      : resolveFromRepoRoot(SQLITE_DB_PATH);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const db = new Database(resolved);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    // Phase 199: cascades and REFERENCES are decorative until this is ON.
    // SQLite defaults foreign_keys OFF per connection.
    db.pragma('foreign_keys = ON');
    initSchema(db);
    seedDefaultAdmin(db);
    seedRegisteredAgents(db);
    // Must run after both seeds: it enrols exactly the users and agents they
    // create. Connector rows are space-scoped and the space gate denies
    // non-members, so without this the first recall after startup returns
    // nothing until the next sync cycle happens to re-enrol.
    backfillConnectorSpaceReaders(db);
    _db = db;
  }
  return _db;
}

/**
 * Closes the DB and resets the singleton.
 * Intended for test teardown only — do not call in production code.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
