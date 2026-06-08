// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSecret } from '../jwt';

describe('getSecret entropy enforcement', () => {
  const originalSecret = process.env.MEMROOS_JWT_SECRET;

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.MEMROOS_JWT_SECRET = originalSecret;
    } else {
      delete process.env.MEMROOS_JWT_SECRET;
    }
  });

  it('throws when MEMROOS_JWT_SECRET is unset', () => {
    delete process.env.MEMROOS_JWT_SECRET;
    expect(() => getSecret()).toThrow(/required/);
  });

  it('throws when MEMROOS_JWT_SECRET is shorter than 32 characters', () => {
    process.env.MEMROOS_JWT_SECRET = 'a'.repeat(31);
    expect(() => getSecret()).toThrow(/at least 32 characters/);
  });

  it('returns a Uint8Array when secret is exactly 32 characters', () => {
    process.env.MEMROOS_JWT_SECRET = 'a'.repeat(32);
    const result = getSecret();
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('returns a Uint8Array when secret is 64 characters', () => {
    process.env.MEMROOS_JWT_SECRET = 'a'.repeat(64);
    const result = getSecret();
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
