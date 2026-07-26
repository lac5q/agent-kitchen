import { describe, it, expect } from 'vitest';
import { isHttpsRequest } from '../secure-cookie';

function makeRequest(opts: {
  url?: string;
  forwardedProto?: string;
  forwardedSsl?: string;
}): Request {
  const headers = new Headers();
  if (opts.forwardedProto) headers.set('x-forwarded-proto', opts.forwardedProto);
  if (opts.forwardedSsl) headers.set('x-forwarded-ssl', opts.forwardedSsl);
  return new Request(opts.url ?? 'http://localhost:3000/login', { headers });
}

describe('isHttpsRequest', () => {
  it('returns true for a direct https:// request URL', () => {
    expect(isHttpsRequest(makeRequest({ url: 'https://example.com/x' }))).toBe(true);
  });

  it('returns false for a direct http:// request URL', () => {
    expect(isHttpsRequest(makeRequest({ url: 'http://example.com/x' }))).toBe(false);
    // Tailscale / local-loopback case: this is the bug we're fixing.
    expect(isHttpsRequest(makeRequest({ url: 'http://100.82.89.3:3000/x' }))).toBe(false);
  });

  it('honors x-forwarded-proto: https (reverse proxy)', () => {
    expect(isHttpsRequest(makeRequest({ url: 'http://10.0.0.1/x', forwardedProto: 'https' }))).toBe(true);
  });

  it('honors x-forwarded-proto: HTTPS (case-insensitive)', () => {
    expect(isHttpsRequest(makeRequest({ url: 'http://10.0.0.1/x', forwardedProto: 'HTTPS' }))).toBe(true);
  });

  it('honors x-forwarded-ssl: on (legacy reverse proxy)', () => {
    expect(isHttpsRequest(makeRequest({ url: 'http://10.0.0.1/x', forwardedSsl: 'on' }))).toBe(true);
  });

  it('returns false when no https signal is present (default)', () => {
    expect(isHttpsRequest(makeRequest({}))).toBe(false);
  });

  it('does not throw on a request with no url (defensive)', () => {
    const req = new Request('about:blank');
    // Even with no real scheme, returns false rather than throwing.
    expect(() => isHttpsRequest(req)).not.toThrow();
    expect(isHttpsRequest(req)).toBe(false);
  });
});
