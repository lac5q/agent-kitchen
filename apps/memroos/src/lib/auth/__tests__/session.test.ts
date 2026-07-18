// @vitest-environment node
import { createHash } from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signAccessToken } from '../jwt';

// Mock the DB module to avoid needing a real database.
// This is hoisted to module level by Vitest's vi.mock mechanism.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(() => ({
    get: () => undefined,
    run: () => undefined,
    all: () => [],
  })),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    prepare: mocks.prepare,
  }),
}));

// Set required env var for JWT tests
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockImplementation(() => ({
    get: () => undefined,
    run: () => undefined,
    all: () => [],
  }));
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
});

describe('authenticateUser — JWT path', () => {
  it('resolves SessionUser from valid Authorization Bearer JWT', async () => {
    const { authenticateUser } = await import('../session');
    const token = await signAccessToken('user-123', 'operator');
    const req = new Request('http://localhost/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await authenticateUser(req);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-123');
    expect(session!.role).toBe('operator');
  });

  it('returns null for invalid JWT', async () => {
    const { authenticateUser } = await import('../session');
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer not.a.valid.token' },
    });
    const session = await authenticateUser(req);
    expect(session).toBeNull();
  });

  it('returns null when no token present', async () => {
    const { authenticateUser } = await import('../session');
    const req = new Request('http://localhost/');
    const session = await authenticateUser(req);
    expect(session).toBeNull();
  });

  it('reads access_token from cookie as fallback', async () => {
    const { authenticateUser } = await import('../session');
    const token = await signAccessToken('user-cookie', 'reviewer');
    const req = new Request('http://localhost/', {
      headers: { Cookie: `access_token=${token}` },
    });
    const session = await authenticateUser(req);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-cookie');
    expect(session!.role).toBe('reviewer');
  });
});

describe('authenticateUser — API key path', () => {
  it('returns null for unknown API key (no DB match)', async () => {
    const { authenticateUser } = await import('../session');
    // A 64-char hex string looks like a user API key (no dots, not JWT-shaped)
    const fakeKey = 'a'.repeat(64);
    const req = new Request('http://localhost/', {
      headers: { Authorization: `Bearer ${fakeKey}` },
    });
    const session = await authenticateUser(req);
    // DB mock returns undefined for key lookup, so should return null
    expect(session).toBeNull();
  });

  it('returns null for revoked keys, missing users, and DB failures', async () => {
    const { authenticateUser } = await import('../session');
    const fakeKey = 'b'.repeat(64);
    const keyHash = createHash('sha256').update(fakeKey).digest('hex');

    mocks.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM user_api_keys WHERE key_hash = ?')) {
        return { get: (hash: string) => (hash === keyHash ? { user_id: 'user-1', revoked_at: '2026-01-01T00:00:00.000Z' } : undefined) };
      }
      return { get: () => undefined, run: () => undefined, all: () => [] };
    });
    expect(await authenticateUser(new Request('http://localhost/', { headers: { Authorization: `Bearer ${fakeKey}` } }))).toBeNull();

    mocks.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM user_api_keys WHERE key_hash = ?')) {
        return { get: () => ({ user_id: 'missing-user', revoked_at: null }) };
      }
      if (sql.includes('FROM users WHERE id = ?')) {
        return { get: () => undefined };
      }
      return { get: () => undefined, run: () => undefined, all: () => [] };
    });
    expect(await authenticateUser(new Request('http://localhost/', { headers: { Authorization: `Bearer ${fakeKey}` } }))).toBeNull();

    mocks.prepare.mockImplementation(() => {
      throw new Error('db offline');
    });
    expect(await authenticateUser(new Request('http://localhost/', { headers: { Authorization: `Bearer ${fakeKey}` } }))).toBeNull();
  });

  it('authenticates API keys and defaults users without roles to reviewer', async () => {
    const { authenticateUser } = await import('../session');
    const rawKey = 'user-api-key';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const update = vi.fn();

    mocks.prepare.mockImplementation((sql: string) => {
      if (sql.includes('FROM user_api_keys WHERE key_hash = ?')) {
        return { get: (hash: string) => (hash === keyHash ? { user_id: 'user-1', revoked_at: null } : undefined) };
      }
      if (sql.includes('FROM users WHERE id = ?')) {
        return { get: () => ({ id: 'user-1', email: 'user@example.com', display_name: 'User One', tenant_id: 'tenant-1' }) };
      }
      if (sql.includes('FROM user_roles WHERE user_id = ?')) {
        return { get: () => undefined };
      }
      if (sql.includes('UPDATE user_api_keys SET last_used_at')) {
        return { run: update };
      }
      return { get: () => undefined, run: () => undefined, all: () => [] };
    });

    const session = await authenticateUser(
      new Request('http://localhost/', { headers: { Authorization: `Bearer ${rawKey}` } })
    );

    expect(session).toMatchObject({
      userId: 'user-1',
      role: 'reviewer',
      email: 'user@example.com',
      displayName: 'User One',
      tenantId: 'tenant-1',
    });
    expect(update).toHaveBeenCalledWith(expect.any(String), keyHash);
  });
});
