import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { isHttpsRequest } from '@/lib/auth/secure-cookie';
import { signAccessToken } from '@/lib/auth/jwt';
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from '@/lib/auth/session-limits';
import type { UserRole } from '@/lib/auth/types';

interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
  inviteToken?: string;
}

type InviteRow = { role: UserRole; email_hint: string | null; used_at: string | null; expires_at: string };

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 });
  }

  const { email, password, displayName = '', inviteToken } = body;
  if (!email || !password) {
    return Response.json({ error: 'email and password are required' }, { status: 400 });
  }

  const db = getDb();

  const passwordHash = await hashPassword(password);
  const userId = randomBytes(10).toString('hex');
  const now = new Date().toISOString();

  // CR-07 fix: wrap the count-check + insert in a transaction to eliminate
  // the TOCTOU race where two concurrent requests both see userCount=0 and
  // both create admin accounts.
  let role: UserRole = 'reviewer';
  let registered = false;

  const txn = db.transaction(() => {
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;

    if (userCount === 0) {
      role = 'admin';
    } else {
      if (!inviteToken) return 'invite_required';
      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
      const invite = db
        .prepare('SELECT role, email_hint, used_at, expires_at FROM team_invitations WHERE token_hash = ?')
        .get(tokenHash) as InviteRow | undefined;

      if (!invite) return 'invalid_token';
      if (invite.used_at) return 'token_used';
      if (new Date(invite.expires_at) < new Date()) return 'token_expired';
      role = invite.role;

      db.prepare('UPDATE team_invitations SET used_at = ? WHERE token_hash = ?').run(now, tokenHash);
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return 'email_taken';

    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, email, displayName || email.split('@')[0], passwordHash, now);
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, role);
    registered = true;
    return 'ok';
  });

  const result = txn();

  if (result === 'invite_required') return Response.json({ error: 'invite token required' }, { status: 403 });
  if (result === 'invalid_token') return Response.json({ error: 'invalid or expired invitation' }, { status: 404 });
  if (result === 'token_used') return Response.json({ error: 'invitation already used' }, { status: 409 });
  if (result === 'token_expired') return Response.json({ error: 'invitation expired' }, { status: 410 });
  if (result === 'email_taken') return Response.json({ error: 'email already registered' }, { status: 409 });
  if (!registered) return Response.json({ error: 'registration failed' }, { status: 500 });

  const accessToken = await signAccessToken(userId, role);

  // Login parity: issue refresh + HttpOnly cookies while keeping JSON accessToken
  // for same-page Bearer bootstrap (INVBOOT Connect step).
  const rawRefresh = randomBytes(32).toString('hex');
  const refreshHash = createHash('sha256').update(rawRefresh).digest('hex');
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000).toISOString();
  const refreshId = randomBytes(8).toString('hex');
  db.prepare(
    'INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(refreshId, userId, refreshHash, refreshExpiresAt);

  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  const refreshCookie = `${REFRESH_TOKEN_COOKIE_NAME}=${rawRefresh}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS}`;
  const accessCookie = `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS}`;

  const response = Response.json({ accessToken, userId }, { status: 201 });
  response.headers.append('Set-Cookie', refreshCookie);
  response.headers.append('Set-Cookie', accessCookie);
  return response;
}
