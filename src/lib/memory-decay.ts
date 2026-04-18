import { getDb } from './db';

let _started = false;
let _hasLogFn: boolean | null = null;

const DECAY_RATES: Record<string, number> = {
  high: 0.01,
  mid: 0.02,
  low: 0.05,
};

/**
 * Probes whether SQLite has a LOG() math function available.
 * Result is cached module-level after first call.
 * Exposed for test isolation via _resetForTest().
 */
export function hasLogFunction(): boolean {
  if (_hasLogFn === null) {
    try {
      getDb().prepare('SELECT LOG(1.0)').get();
      _hasLogFn = true;
    } catch {
      _hasLogFn = false;
    }
  }
  return _hasLogFn;
}

/**
 * Resets the LOG() probe cache for test isolation.
 */
export function _resetForTest(): void {
  _hasLogFn = null;
}

/**
 * Runs a single decay cycle:
 * - Skips pinned tier entirely
 * - For high/mid/low tiers: applies daily decay WHERE last_decay_at < today
 * - Uses access-resistance formula if LOG() is available, else flat rate
 * - Clamps salience_score to MIN 0.0
 *
 * Security: T-23-01 -- rates from hardcoded map, never user input
 */
export function runDecay(): void {
  const db = getDb();
  const useLog = hasLogFunction();

  for (const [tier, rate] of Object.entries(DECAY_RATES)) {
    if (useLog) {
      db.prepare(`
        UPDATE memory_salience
        SET salience_score = MAX(0.0, salience_score * (1.0 - (? / (1.0 + LOG(1.0 + CAST(access_count AS REAL)))))),
            last_decay_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE tier = ? AND date(last_decay_at) < date('now')
      `).run(rate, tier);
    } else {
      db.prepare(`
        UPDATE memory_salience
        SET salience_score = MAX(0.0, salience_score * (1.0 - ?)),
            last_decay_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE tier = ? AND date(last_decay_at) < date('now')
      `).run(rate, tier);
    }
  }

  console.log('[decay] cycle complete');
}

/**
 * Starts the decay scheduler (runs immediately, then every 60 min).
 * Module-level _started guard prevents double-start.
 */
export function startDecayScheduler(): void {
  if (_started) return;
  _started = true;
  console.log('[decay] scheduler started (interval: 60m)');
  runDecay();
  setInterval(runDecay, 60 * 60 * 1000);
}
