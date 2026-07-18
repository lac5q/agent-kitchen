// @vitest-environment node
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    prepare: vi.fn(),
  },
  verifyPassword: vi.fn(async () => true),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => mocks.db,
}));

vi.mock('@/lib/auth/password', () => ({
  verifyPassword: mocks.verifyPassword,
}));

function setCookieHeader(response: Response): string {
  return response.headers.get('set-cookie') ?? '';
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
  process.env.NODE_ENV = 'test';
});

describe('auth session cookies', () => {
  it('login rejects malformed and incomplete request bodies', async () => {
    const { POST } = await import('../login/route');

    const malformed = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }) as never
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'invalid request body' });

    const missingPassword = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'luis@example.com' }),
      }) as never
    );
    expect(missingPassword.status).toBe(400);
    expect(await missingPassword.json()).toEqual({ error: 'email and password are required' });
    expect(mocks.db.prepare).not.toHaveBeenCalled();
  });

  it('login rejects unknown users after running dummy password verification', async () => {
    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM users WHERE email = ?')) {
        return { get: () => undefined };
      }
      return { run: vi.fn() };
    });

    const { POST } = await import('../login/route');
    const response = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'missing@example.com', password: 'secret' }),
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid email or password' });
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      'secret',
      '$2a$12$invalidhashfortimingprotection000000000000000000000000',
    );
  });

  it('login issues longer-lived HttpOnly access and refresh cookies', async () => {
    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM users WHERE email = ?')) {
        return {
          get: () => ({
            id: 'user-1',
            email: 'luis@example.com',
            display_name: 'Luis',
            password_hash: 'hash',
          }),
        };
      }
      if (sql.includes('FROM user_roles WHERE user_id = ?')) {
        return { get: () => ({ role: 'operator' }) };
      }
      return { run: vi.fn() };
    });

    const { POST } = await import('../login/route');
    const response = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'luis@example.com', password: 'secret' }),
      }) as never
    );

    const cookies = setCookieHeader(response);
    expect(response.status).toBe(200);
    expect(cookies).toContain('memroos_refresh=');
    expect(cookies).toContain('Max-Age=2592000');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('Max-Age=43200');
  });

  it('login defaults users without an explicit role to reviewer', async () => {
    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM users WHERE email = ?')) {
        return {
          get: () => ({
            id: 'user-no-role',
            email: 'norole@example.com',
            display_name: 'No Role',
            password_hash: 'hash',
          }),
        };
      }
      if (sql.includes('FROM user_roles WHERE user_id = ?')) {
        return { get: () => undefined };
      }
      return { run: vi.fn() };
    });

    const { POST } = await import('../login/route');
    const response = await POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'norole@example.com', password: 'secret' }),
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: 'user-no-role', role: 'reviewer' });
  });

  it('refresh rotates the refresh token and also refreshes the HttpOnly access cookie', async () => {
    const rawRefreshToken = 'refresh-token';
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM user_refresh_tokens WHERE token_hash = ?')) {
        return {
          get: (hash: string) =>
            hash === tokenHash
              ? {
                  id: 'refresh-1',
                  user_id: 'user-1',
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  revoked_at: null,
                }
              : undefined,
        };
      }
      if (sql.includes('FROM user_roles WHERE user_id = ?')) {
        return { get: () => ({ role: 'operator' }) };
      }
      return { run: vi.fn() };
    });

    const { POST } = await import('../refresh/route');
    const response = await POST(
      new Request('http://localhost/api/auth/refresh', {
        method: 'POST',
        headers: { cookie: `memroos_refresh=${encodeURIComponent(rawRefreshToken)}` },
      })
    );

    const cookies = setCookieHeader(response);
    expect(response.status).toBe(200);
    expect(cookies).toContain('memroos_refresh=');
    expect(cookies).toContain('Max-Age=2592000');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('Max-Age=43200');
  });

  it('refresh rejects missing, unknown, revoked, and expired tokens while clearing cookies', async () => {
    const { POST } = await import('../refresh/route');

    const missing = await POST(new Request('http://localhost/api/auth/refresh', { method: 'POST' }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'refresh token required' });

    const invalidCases = [
      undefined,
      { id: 'refresh-revoked', user_id: 'user-1', expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: new Date().toISOString() },
      { id: 'refresh-expired', user_id: 'user-1', expires_at: new Date(Date.now() - 60_000).toISOString(), revoked_at: null },
    ];

    for (const tokenRow of invalidCases) {
      mocks.db.prepare.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_refresh_tokens WHERE token_hash = ?')) {
          return { get: () => tokenRow };
        }
        return { run: vi.fn() };
      });

      const response = await POST(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: 'memroos_refresh=bad-token' },
        })
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'invalid or expired refresh token' });
      const cookies = setCookieHeader(response);
      expect(cookies).toContain('memroos_refresh=');
      expect(cookies).toContain('access_token=');
      expect(cookies).toContain('Max-Age=0');
      mocks.db.prepare.mockReset();
    }
  });

  it('refresh defaults missing roles to reviewer and emits Secure cookies in production', async () => {
    const rawRefreshToken = 'prod-refresh-token';
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    process.env.NODE_ENV = 'production';

    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM user_refresh_tokens WHERE token_hash = ?')) {
        return {
          get: (hash: string) =>
            hash === tokenHash
              ? {
                  id: 'refresh-prod',
                  user_id: 'user-no-role',
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  revoked_at: null,
                }
              : undefined,
        };
      }
      if (sql.includes('FROM user_roles WHERE user_id = ?')) {
        return { get: () => undefined };
      }
      return { run: vi.fn() };
    });

    const { POST } = await import('../refresh/route');
    const response = await POST(
      new Request('https://memroos.example.com/api/auth/refresh', {
        method: 'POST',
        headers: { cookie: `memroos_refresh=${encodeURIComponent(rawRefreshToken)}` },
      })
    );

    expect(response.status).toBe(200);
    expect(setCookieHeader(response)).toContain('Secure');
  });

  it('logout clears both refresh and access cookies', async () => {
    mocks.db.prepare.mockReturnValue({ run: vi.fn() });

    const { POST } = await import('../logout/route');
    const response = await POST(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'memroos_refresh=refresh-token; access_token=jwt' },
      })
    );

    const cookies = setCookieHeader(response);
    expect(response.status).toBe(200);
    expect(cookies).toContain('memroos_refresh=');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('Max-Age=0');
  });
});
