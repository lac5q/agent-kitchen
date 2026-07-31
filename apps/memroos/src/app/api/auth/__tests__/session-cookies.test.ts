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

  it('register issues HttpOnly access and refresh cookies like login', async () => {
    const run = vi.fn();
    mocks.db.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT COUNT(*) as cnt FROM users')) {
        return { get: () => ({ cnt: 0 }) };
      }
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { get: () => undefined };
      }
      return { run, get: () => undefined };
    });
    (mocks.db as { transaction?: (fn: () => unknown) => () => unknown }).transaction = (fn) => () =>
      fn();

    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      getDb: () => ({
        prepare: mocks.db.prepare,
        transaction: (fn: () => unknown) => () => fn(),
      }),
    }));
    vi.doMock('@/lib/auth/password', () => ({
      hashPassword: async () => 'hashed',
      verifyPassword: mocks.verifyPassword,
    }));

    const { POST } = await import('../register/route');
    const response = await POST(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'eric@example.com',
          password: 'secret-password',
          displayName: 'Eric',
        }),
      }) as never
    );

    const cookies = setCookieHeader(response);
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.accessToken).toBeTruthy();
    expect(body.userId).toBeTruthy();
    expect(cookies).toContain('memroos_refresh=');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('HttpOnly');
  });
});
