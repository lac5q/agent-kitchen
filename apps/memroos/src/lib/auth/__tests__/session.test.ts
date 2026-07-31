// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signAccessToken } from '../jwt';

type MockRow = Record<string, unknown> | undefined;
let mockGetResult: MockRow = undefined;

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    prepare: () => ({
      get: () => mockGetResult,
      run: () => undefined,
      all: () => [],
    }),
  }),
}));

beforeEach(() => {
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
  mockGetResult = { disabled_at: null };
  vi.resetModules();
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
      headers: { Authorization: 'Bearer not.a.jwt' },
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

  it('returns null when user is soft-disabled', async () => {
    mockGetResult = { disabled_at: '2026-07-31T00:00:00.000Z' };
    const { authenticateUser } = await import('../session');
    const token = await signAccessToken('user-disabled', 'operator');
    const req = new Request('http://localhost/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await authenticateUser(req)).toBeNull();
  });
});

describe('authenticateUser — API key path', () => {
  it('returns null for unknown API key (no DB match)', async () => {
    mockGetResult = undefined;
    const { authenticateUser } = await import('../session');
    const fakeKey = 'a'.repeat(64);
    const req = new Request('http://localhost/', {
      headers: { Authorization: `Bearer ${fakeKey}` },
    });
    const session = await authenticateUser(req);
    expect(session).toBeNull();
  });
});
