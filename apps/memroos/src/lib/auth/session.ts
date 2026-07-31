import { createHash } from 'crypto';
import { verifyAccessToken } from './jwt';
import type { SessionUser, UserRole } from './types';

// Lazy import to avoid circular dep issues at module load
let dbModule: typeof import('../db') | null = null;
async function getDbLazy() {
  if (!dbModule) dbModule = await import('../db');
  return dbModule.getDb();
}

/**
 * Reads Bearer token from Authorization header or access_token cookie.
 * Supports both JWT access tokens and per-user API keys.
 * Returns a SessionUser or null if authentication fails.
 */
export async function authenticateUser(req: Request): Promise<SessionUser | null> {
  let token: string | null = null;

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. access_token cookie fallback
  if (!token) {
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }
  }

  if (!token) return null;

  // 3. Detect token type: JWTs contain two '.' separators
  const isJwt = token.split('.').length === 3;

  if (isJwt) {
    const payload = await verifyAccessToken(token);
    if (!payload) return null;
    try {
      const db = await getDbLazy();
      const disabled = db
        .prepare('SELECT disabled_at FROM users WHERE id = ?')
        .get(payload.sub) as { disabled_at: string | null } | undefined;
      if (!disabled || disabled.disabled_at) return null;
    } catch {
      return null;
    }
    return {
      userId: payload.sub,
      role: payload.role,
      email: '',
      displayName: '',
      tenantId: 'default-tenant',
    };
  }

  // 4. Per-user API key: SHA-256 hash lookup
  const keyHash = createHash('sha256').update(token).digest('hex');
  try {
    const db = await getDbLazy();
    type ApiKeyRow = { user_id: string; revoked_at: string | null };
    const apiKey = db
      .prepare('SELECT user_id, revoked_at FROM user_api_keys WHERE key_hash = ?')
      .get(keyHash) as ApiKeyRow | undefined;

    if (!apiKey || apiKey.revoked_at) return null;

    type UserRow = {
      id: string;
      email: string;
      display_name: string;
      tenant_id: string;
      disabled_at: string | null;
    };
    const user = db
      .prepare(
        'SELECT id, email, display_name, tenant_id, disabled_at FROM users WHERE id = ?'
      )
      .get(apiKey.user_id) as UserRow | undefined;

    if (!user || user.disabled_at) return null;

    type RoleRow = { role: UserRole };
    const roleRow = db
      .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
      .get(user.id) as RoleRow | undefined;

    // Update last_used_at
    db.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE key_hash = ?').run(
      new Date().toISOString(),
      keyHash
    );

    return {
      userId: user.id,
      role: roleRow?.role ?? 'reviewer',
      email: user.email,
      displayName: user.display_name,
      tenantId: user.tenant_id,
    };
  } catch {
    return null;
  }
}
