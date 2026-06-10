import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import { hashPasswordSync } from './password';

/**
 * Seeds the default admin user on first startup.
 * Runs only when the users table is empty.
 * Reads MEMROOS_ADMIN_EMAIL and MEMROOS_ADMIN_PASSWORD env vars.
 */
export function seedDefaultAdmin(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (count > 0) return;

  const email = process.env.MEMROOS_ADMIN_EMAIL;
  const password = process.env.MEMROOS_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      '[Memroos] No users exist. Set MEMROOS_ADMIN_EMAIL and MEMROOS_ADMIN_PASSWORD to create the first admin.'
    );
    return;
  }

  const userId = randomBytes(10).toString('hex');
  const passwordHash = hashPasswordSync(password);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, email, email.split('@')[0], passwordHash, now);
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, 'admin');
  })();

  console.info(`[Memroos] Admin user created: ${email}`);
}
