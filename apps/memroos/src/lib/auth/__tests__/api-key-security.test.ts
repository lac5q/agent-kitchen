// @vitest-environment node
// Regression test for finding A01-002 (SEC-05). This test must fail if the known default
// credential is removed from the rejection list.
import { describe, it, expect } from 'vitest';
import {
  assertNotDefaultInternalApiKey,
  KNOWN_DEFAULT_INTERNAL_API_KEY,
} from '../../internal-api-key';

describe('internal API key security', () => {
  it('throws when called with the known default value', () => {
    expect(() =>
      assertNotDefaultInternalApiKey('memroos-internal-default-key')
    ).toThrow(/MEMROOS_INTERNAL_API_KEY/);
  });

  it('error message contains "known default"', () => {
    expect(() =>
      assertNotDefaultInternalApiKey('memroos-internal-default-key')
    ).toThrow(/known default/);
  });

  it('does not throw when called with undefined', () => {
    expect(() => assertNotDefaultInternalApiKey(undefined)).not.toThrow();
  });

  it('does not throw when called with empty string', () => {
    expect(() => assertNotDefaultInternalApiKey('')).not.toThrow();
  });

  it('does not throw when called with a valid custom key', () => {
    expect(() =>
      assertNotDefaultInternalApiKey('any-valid-custom-key-abc123')
    ).not.toThrow();
  });

  it('pins KNOWN_DEFAULT_INTERNAL_API_KEY to the exact rejection string', () => {
    expect(KNOWN_DEFAULT_INTERNAL_API_KEY).toBe('memroos-internal-default-key');
  });
});
