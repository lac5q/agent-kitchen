import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { isHttpsRequest } from '@/lib/auth/secure-cookie';
import { signAccessToken } from '@/lib/auth/jwt';
import { checkAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from '@/lib/auth/session-limits';
import type { UserRole } from '@/lib/auth/types';

interface LoginBody {
  email: string;
  password: string;
}

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
};
type RoleRow = { role: UserRole };

export async function POST(req: NextRequest) {
  const rateLimited = checkAuthRateLimit(req, 'login');
  if (rateLimited) return rateLimited;

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ error: 'email and password are required' }, { status: 400 });
  }

  const db = getDb();

  const user = db
    .prepare(
      'SELECT id, email, display_name, password_hash, tenant_id, disabled_at FROM users WHERE email = ?'
    )
    .get(email) as (UserRow & { disabled_at: string | null; tenant_id: string }) | undefined;

  // Always run verifyPassword to avoid timing attacks
  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const passwordOk = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyPassword(password, dummyHash).then(() => false);

  if (!user || !passwordOk) {
    return Response.json({ error: 'invalid email or password' }, { status: 401 });
  }

  // Phase 199: soft-disabled users cannot log in.
  if (user.disabled_at) {
    return Response.json({ error: 'invalid email or password' }, { status: 401 });
  }

  const roleRow = db
    .prepare('SELECT role FROM user_roles WHERE user_id = ? LIMIT 1')
    .get(user.id) as RoleRow | undefined;
  const role: UserRole = roleRow?.role ?? 'reviewer';

  // Issue access token
  const accessToken = await signAccessToken(user.id, role);

  // Issue refresh token
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000).toISOString();
  const tokenId = randomBytes(8).toString('hex');

  db.prepare(
    'INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(tokenId, user.id, tokenHash, expiresAt);

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    user.id
  );

  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';

  const refreshCookie = `${REFRESH_TOKEN_COOKIE_NAME}=${rawToken}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS}`;
  // CR-01 fix: set access token as HttpOnly so JS cannot read it (XSS protection)
  const accessCookie = `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS}`;

  const response = Response.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role,
      },
    },
    { status: 200 }
  );
  response.headers.append('Set-Cookie', refreshCookie);
  response.headers.append('Set-Cookie', accessCookie);
  return response;
}
