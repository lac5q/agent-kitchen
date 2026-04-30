/**
 * Content scanner — pure utility, no DB dependency.
 * Scans agent-generated text for secrets, PII, and injection payloads.
 *
 * SEC-01: HIGH-severity matches block the action and redact the content.
 *         MEDIUM-severity matches flag the content but allow it through.
 */

export interface ScanMatch {
  patternName: string;
  severity: 'HIGH' | 'MEDIUM';
  /** Truncated preview of the match — first 8 chars + '...' */
  redacted: string;
}

export interface ScanResult {
  /** true if any HIGH-severity match was found */
  blocked: boolean;
  matches: ScanMatch[];
  /** Content with HIGH matches replaced by [REDACTED] */
  cleanContent: string;
}

export const PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'HIGH' | 'MEDIUM';
}> = [
  // 1. AWS access key — AKIA + 16 uppercase alphanumeric chars
  {
    name: 'aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'HIGH',
  },

  // 2. AWS secret key — aws near secret/key near a 40-char base64 string in quotes
  {
    name: 'aws_secret_key',
    pattern: /(?:aws[_\-]?(?:secret|access)[_\-]?(?:key)?[^'"=]*['"]?)([A-Za-z0-9/+=]{40})/i,
    severity: 'HIGH',
  },

  // 3. GitHub PAT — ghp_ prefix + 36 alphanumeric chars
  {
    name: 'github_token_pat',
    pattern: /ghp_[A-Za-z0-9]{36}/,
    severity: 'HIGH',
  },

  // 4. GitHub OAuth token — gho_ prefix + 36 alphanumeric chars
  {
    name: 'github_token_oauth',
    pattern: /gho_[A-Za-z0-9]{36}/,
    severity: 'HIGH',
  },

  // 5. GitHub server-to-server token — ghs_ prefix + 36 alphanumeric chars
  {
    name: 'github_token_server',
    pattern: /ghs_[A-Za-z0-9]{36}/,
    severity: 'HIGH',
  },

  // 6. PEM private key header
  {
    name: 'pem_private_key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    severity: 'HIGH',
  },

  // 7. JWT token — three base64url segments separated by dots (eyJ prefix)
  {
    name: 'jwt_token',
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    severity: 'HIGH',
  },

  // 8. Credit card — Visa/MC/Amex/Discover BIN ranges
  {
    name: 'credit_card',
    pattern: /(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}/,
    severity: 'HIGH',
  },

  // 9. US Social Security Number — DDD-DD-DDDD
  {
    name: 'ssn_us',
    pattern: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/,
    severity: 'HIGH',
  },

  // 10. Credential-bearing URL — scheme://user:pass@host
  {
    name: 'password_in_url',
    pattern: /[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/[^:@/\s]+:[^@/\s]+@/,
    severity: 'HIGH',
  },

  // 11. Slack incoming webhook URL
  {
    name: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/,
    severity: 'HIGH',
  },

  // 12. XSS script tag (case-insensitive)
  {
    name: 'xss_script_tag',
    pattern: /<script[\s>]/i,
    severity: 'HIGH',
  },

  // 13. Shell injection — backtick command substitution or semicolon-shell-command patterns
  {
    name: 'shell_injection',
    pattern: /(?:;[ \t]*(?:bash|sh|cmd|powershell|rm |mv |chmod |curl |wget )|`[^`]+`)/i,
    severity: 'HIGH',
  },

  // 14. Email address — MEDIUM (PII but legitimate use)
  {
    name: 'email_address',
    pattern: /[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    severity: 'MEDIUM',
  },

  // 15. US phone number — MEDIUM
  {
    name: 'phone_us',
    pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    severity: 'MEDIUM',
  },

  // 16. Generic secret assignment — key=value with sensitive key name
  {
    name: 'generic_secret_assign',
    pattern: /(?:password|secret|api_key|token|apikey|passwd|api-key)[^\w]?[=:][^\w]?['"][^'"]{8,}['"]/i,
    severity: 'MEDIUM',
  },

  // 17. Generic long token — 40+ alphanumeric characters
  {
    name: 'generic_long_token',
    pattern: /[A-Za-z0-9]{40,}/,
    severity: 'MEDIUM',
  },

  // 18. SQL injection keywords — UNION SELECT, DROP TABLE, etc.
  {
    name: 'sql_injection_union',
    pattern: /(?:UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO|DELETE\s+FROM)/i,
    severity: 'MEDIUM',
  },
];

const MAX_SCAN_LEN = 4096;

/**
 * Scans the provided text for security-relevant patterns.
 *
 * @param text - Agent-generated text to scan.
 * @returns ScanResult with blocked flag, matches list, and clean content.
 */
export function scanContent(text: string): ScanResult {
  // Null-safe coerce
  const safeText: string = text == null ? '' : String(text);

  // Length guard — skip scanning extremely long text to prevent ReDoS
  if (safeText.length > MAX_SCAN_LEN) {
    return { blocked: false, matches: [], cleanContent: safeText };
  }

  const matches: ScanMatch[] = [];
  let cleanContent = safeText;

  for (const { name, pattern, severity } of PATTERNS) {
    try {
      const found = pattern.exec(safeText);
      if (found) {
        matches.push({
          patternName: name,
          severity,
          redacted: found[0].slice(0, 8) + '...',
        });
        if (severity === 'HIGH') {
          // Non-global replace — replaces first occurrence per pattern
          cleanContent = cleanContent.replace(pattern, '[REDACTED]');
        }
      }
    } catch {
      // Pattern execution error — skip this pattern silently
    }
  }

  return {
    blocked: matches.some(m => m.severity === 'HIGH'),
    matches,
    cleanContent,
  };
}
