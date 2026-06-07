import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { UserRole, JwtPayload } from './types';
import { ACCESS_TOKEN_TTL } from './session-limits';

export function getSecret(): Uint8Array {
  const secret = process.env.MEMROOS_JWT_SECRET;
  if (!secret) {
    throw new Error('[Memroos] MEMROOS_JWT_SECRET env var is required');
  }
  if (secret.length < 32) {
    throw new Error('[Memroos] MEMROOS_JWT_SECRET must be at least 32 characters (use: openssl rand -hex 32)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs an HS256 access token for the operator session window.
 */
export async function signAccessToken(userId: string, role: UserRole): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ role } as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret);
}

/**
 * Verifies an access token. Returns JwtPayload or null on any failure.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as JWTPayload & { role?: UserRole };
    if (!p.sub || !p.role) return null;
    return {
      sub: p.sub,
      role: p.role,
      iat: p.iat,
      exp: p.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Generates an opaque random refresh token (32 bytes, hex-encoded).
 * The caller is responsible for hashing and storing the hash.
 */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
