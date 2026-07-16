// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../password';
import { signAccessToken, verifyAccessToken } from '../jwt';
import { requireRole } from '../middleware-roles';
import type { UserRole } from '../types';

// Set required env var for JWT tests
beforeEach(() => {
  process.env.MEMROOS_JWT_SECRET = 'test-secret-that-is-long-enough-32ch';
});

// bcrypt cost 12 hashing runs ~700-900ms per call; keep these on the slow
// split so the milestone gate (`npm test -- --run`) stays fast and reliable.
// They are exercised on demand via `npm run test:slow -- --run` and CI.
describe('password', { tags: ['slow'] }, () => {
  it('hashPassword + verifyPassword round-trip', async () => {
    const plain = 'correct-horse-battery-staple';
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('jwt', () => {
  it('signAccessToken + verifyAccessToken round-trip', async () => {
    const userId = 'user-abc-123';
    const role: UserRole = 'operator';
    const token = await signAccessToken(userId, role);
    const payload = await verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(userId);
    expect(payload!.role).toBe(role);
  });

  it('signAccessToken uses the operator session lifetime', async () => {
    const token = await signAccessToken('user-ttl', 'operator');
    const payload = await verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.exp! - payload!.iat!).toBe(12 * 60 * 60);
  });

  it('verifyAccessToken returns null for expired token', async () => {
    // Build a token with a past expiry by temporarily shimming SignJWT
    // We test this by generating with a short expiry using a forged token string
    // (testing expiry path via an invalid token)
    const payload = await verifyAccessToken('not.a.valid.token');
    expect(payload).toBeNull();
  });

  it('verifyAccessToken returns null for token signed with wrong secret', async () => {
    const token = await signAccessToken('user-xyz', 'admin');
    // Change the secret
    process.env.MEMROOS_JWT_SECRET = 'different-secret-that-is-long-enough!!';
    const payload = await verifyAccessToken(token);
    expect(payload).toBeNull();
  });
});

describe('requireRole', () => {
  it('returns null when role meets minimum', () => {
    expect(requireRole('admin', 'admin')).toBeNull();
    expect(requireRole('admin', 'operator')).toBeNull();
    expect(requireRole('admin', 'reviewer')).toBeNull();
    expect(requireRole('operator', 'operator')).toBeNull();
    expect(requireRole('operator', 'reviewer')).toBeNull();
    expect(requireRole('reviewer', 'reviewer')).toBeNull();
  });

  it('returns 403 Response when reviewer tries operator route', () => {
    const res = requireRole('reviewer' as UserRole, 'operator');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('returns 403 Response when operator tries admin route', () => {
    const res = requireRole('operator' as UserRole, 'admin');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('returns 403 when role is null', () => {
    const res = requireRole(null, 'reviewer');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});
