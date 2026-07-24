import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { signAccessToken } from '@/lib/auth/jwt';
import { isHttpsRequest } from '@/lib/auth/secure-cookie';
import { checkAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from '@/lib/auth/session-limits';
import type { UserRole } from '@/lib/auth/types';

type TokenRow = {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
};
type RoleRow = { role: UserRole };

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function POST(req: Request) {
  const rateLimited = checkAuthRateLimit(req, 'refresh');
  if (rateLimited) return rateLimited;

  const rawToken = parseCookie(req.headers.get('cookie'), REFRESH_TOKEN_COOKIE_NAME);
  if (!rawToken) {
    return Response.json({ error: 'refresh token required' }, { status: 401 });
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const db = getDb();

  const tokenRow = db
    .prepare('SELECT id, user_id, expires_at, revoked_at FROM user_refresh_tokens WHERE token_hash = ?')
    .get(tokenHash) as TokenRow | undefined;

  if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) {
    const response = Response.json(
      { error: 'invalid or expired refresh token' },
      { status: 401 }
    );
    response.headers.append('Set-Cookie', `${REFRESH_TOKEN_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    response.headers.append('Set-Cookie', `${ACCESS_TOKEN_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return response;
  }

  // Rotate: revoke old token
  db.prepare('UPDATE user_refresh_tokens SET revoked_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    tokenRow.id
  );

  // Issue new refresh token
  const newRaw = randomBytes(32).toString('hex');
  const newHash = createHash('sha256').update(newRaw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000).toISOString();
  const newId = randomBytes(8).toString('hex');

  db.prepare(
    'INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(newId, tokenRow.user_id, newHash, expiresAt);

  const roleRow = db
    .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
    .get(tokenRow.user_id) as RoleRow | undefined;
  const role: UserRole = roleRow?.role ?? 'reviewer';

  const accessToken = await signAccessToken(tokenRow.user_id, role);

  const refreshCookie = [
    `${REFRESH_TOKEN_COOKIE_NAME}=${newRaw}`,
    'HttpOnly',
    'SameSite=Lax',
    isHttpsRequest(req) ? 'Secure' : '',
    'Path=/',
    `Max-Age=${REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join('; ');
  const accessCookie = [
    `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}`,
    'HttpOnly',
    'SameSite=Lax',
    isHttpsRequest(req) ? 'Secure' : '',
    'Path=/',
    `Max-Age=${ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join('; ');

  const response = Response.json({ accessToken }, { status: 200 });
  response.headers.append('Set-Cookie', refreshCookie);
  response.headers.append('Set-Cookie', accessCookie);
  return response;
}
