// @vitest-environment node
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

// Initialize in-memory DB at module level (before vi.mock)
const testDb = new Database(':memory:');
const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

// Import the modules under test
const { scanContent, PATTERNS } = await import('@/lib/content-scanner');
const { writeAuditLog } = await import('@/lib/audit');

// ────────────────────────────────────────────────────────────────
// scanContent — empty string
// ────────────────────────────────────────────────────────────────
describe('scanContent — empty string', () => {
  it('returns safe result for empty string', () => {
    const result = scanContent('');
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(0);
    expect(result.cleanContent).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────
// scanContent — HIGH severity patterns (blocked = true)
// ────────────────────────────────────────────────────────────────
describe('scanContent — HIGH severity patterns', () => {
  it('blocks AWS access key (AKIAIOSFODNN7EXAMPLE)', () => {
    const result = scanContent('key AKIAIOSFODNN7EXAMPLE found');
    expect(result.blocked).toBe(true);
    const match = result.matches.find(m => m.patternName === 'aws_access_key');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('HIGH');
  });

  it('blocks GitHub PAT (ghp_ + 36 chars)', () => {
    const result = scanContent('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ab here');
    expect(result.blocked).toBe(true);
    const match = result.matches.find(m => m.patternName === 'github_token_pat');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('HIGH');
  });

  it('blocks PEM private key header', () => {
    const result = scanContent('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.blocked).toBe(true);
    const match = result.matches.find(m => m.patternName === 'pem_private_key');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('HIGH');
  });

  it('blocks JWT token (3-segment base64url)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scanContent(jwt);
    expect(result.blocked).toBe(true);
    const match = result.matches.find(m => m.patternName === 'jwt_token');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('HIGH');
  });

  it('blocks US SSN (DDD-DD-DDDD)', () => {
    const result = scanContent('ssn 555-12-3456');
    expect(result.blocked).toBe(true);
    const match = result.matches.find(m => m.patternName === 'ssn_us');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('HIGH');
  });
});

// ────────────────────────────────────────────────────────────────
// scanContent — MEDIUM severity patterns (blocked = false)
// ────────────────────────────────────────────────────────────────
describe('scanContent — MEDIUM severity patterns', () => {
  it('flags email address as MEDIUM, does not block', () => {
    const result = scanContent('user@example.com');
    expect(result.blocked).toBe(false);
    const match = result.matches.find(m => m.patternName === 'email_address');
    expect(match).toBeDefined();
    expect(match!.severity).toBe('MEDIUM');
  });
});

// ────────────────────────────────────────────────────────────────
// scanContent — length guard
// ────────────────────────────────────────────────────────────────
describe('scanContent — length guard', () => {
  it('skips scanning text longer than 4096 chars', () => {
    const longText = 'A'.repeat(4097);
    const result = scanContent(longText);
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(0);
    expect(result.cleanContent).toBe(longText);
  });
});

// ────────────────────────────────────────────────────────────────
// scanContent — safety properties
// ────────────────────────────────────────────────────────────────
describe('scanContent — safety properties', () => {
  it('never throws on malformed / null-like input', () => {
    expect(() => scanContent(null as unknown as string)).not.toThrow();
    expect(() => scanContent(undefined as unknown as string)).not.toThrow();
    expect(() => scanContent(123 as unknown as string)).not.toThrow();
  });

  it('produces identical results on repeated calls (no global flag statefulness)', () => {
    const text = 'key AKIAIOSFODNN7EXAMPLE found';
    const r1 = scanContent(text);
    const r2 = scanContent(text);
    expect(r1.blocked).toBe(r2.blocked);
    expect(r1.matches.length).toBe(r2.matches.length);
    expect(r1.matches[0]?.patternName).toBe(r2.matches[0]?.patternName);
  });
});

// ────────────────────────────────────────────────────────────────
// scanContent — cleanContent redaction
// ────────────────────────────────────────────────────────────────
describe('scanContent — cleanContent', () => {
  it('replaces HIGH matches in cleanContent', () => {
    const result = scanContent('key AKIAIOSFODNN7EXAMPLE found');
    expect(result.cleanContent).toContain('[REDACTED]');
    expect(result.cleanContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('leaves MEDIUM matches intact in cleanContent', () => {
    const result = scanContent('contact user@example.com please');
    expect(result.cleanContent).toContain('user@example.com');
  });
});

// ────────────────────────────────────────────────────────────────
// PATTERNS count
// ────────────────────────────────────────────────────────────────
describe('PATTERNS array', () => {
  it('has exactly 18 entries', () => {
    expect(PATTERNS).toHaveLength(18);
  });
});

// ────────────────────────────────────────────────────────────────
// writeAuditLog
// ────────────────────────────────────────────────────────────────
describe('writeAuditLog', () => {
  it('does not throw when audit_log table exists', () => {
    expect(() => {
      writeAuditLog(testDb, {
        actor: 'test',
        action: 'test_action',
        target: 'test_target',
        severity: 'info',
      });
    }).not.toThrow();
  });

  it('silently catches and console.errors when table is missing', () => {
    const brokenDb = new Database(':memory:');
    // Do NOT run initSchema — no audit_log table
    expect(() => {
      writeAuditLog(brokenDb, {
        actor: 'test',
        action: 'test_action',
        target: 'test_target',
      });
    }).not.toThrow();
    brokenDb.close();
  });

  it('inserts a row with the correct fields', () => {
    writeAuditLog(testDb, {
      actor: 'claude',
      action: 'hive_action_write',
      target: 'hive_actions',
      detail: '{"patterns":[]}',
      severity: 'info',
    });
    const row = testDb
      .prepare(
        `SELECT * FROM audit_log WHERE actor='claude' AND action='hive_action_write' LIMIT 1`
      )
      .get() as any;
    expect(row).toBeDefined();
    expect(row.actor).toBe('claude');
    expect(row.action).toBe('hive_action_write');
    expect(row.target).toBe('hive_actions');
    expect(row.severity).toBe('info');
  });
});
