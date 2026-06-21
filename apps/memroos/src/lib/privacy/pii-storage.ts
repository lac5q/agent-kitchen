import crypto from "crypto";

type MemoryPayload = Record<string, unknown>;

interface PiiDetector {
  entityType: string;
  pattern: RegExp;
}

interface PiiFinding {
  entityType: string;
  start: number;
  end: number;
  match: string;
}

const PII_PROVIDER = "presidio-compatible-local";

const DETECTORS: PiiDetector[] = [
  {
    entityType: "EMAIL_ADDRESS",
    pattern: /[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    entityType: "SSN_US",
    pattern: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,
  },
  {
    entityType: "CREDIT_CARD",
    pattern: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/g,
  },
  {
    entityType: "PHONE_NUMBER_US",
    pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    entityType: "MEDICAL_RECORD",
    pattern: /\b(?:mrn|medical record|patient id)[:#\s-]*[A-Z0-9-]{4,}\b/gi,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function overlapsExisting(finding: PiiFinding, findings: PiiFinding[]): boolean {
  return findings.some((existing) => finding.start < existing.end && finding.end > existing.start);
}

export function detectPiiForStorage(text: string): PiiFinding[] {
  const findings: PiiFinding[] = [];

  for (const detector of DETECTORS) {
    detector.pattern.lastIndex = 0;
    for (const match of text.matchAll(detector.pattern)) {
      const value = match[0];
      const start = match.index ?? -1;
      const end = start + value.length;
      if (start < 0 || start === end) continue;

      const finding = { entityType: detector.entityType, start, end, match: value };
      if (!overlapsExisting(finding, findings)) findings.push(finding);
    }
  }

  return findings.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function anonymizePiiForStorage(text: string): { text: string; findings: PiiFinding[] } {
  const findings = detectPiiForStorage(text);
  if (findings.length === 0) return { text, findings };

  let redacted = text;
  for (const finding of [...findings].sort((a, b) => b.start - a.start)) {
    redacted = `${redacted.slice(0, finding.start)}[REDACTED:${finding.entityType}]${redacted.slice(finding.end)}`;
  }

  return { text: redacted, findings };
}

export function protectMemoryPayloadForStorage(payload: MemoryPayload): MemoryPayload {
  const rawText = typeof payload.text === "string" ? payload.text : typeof payload.content === "string" ? payload.content : "";
  if (!rawText) return payload;

  const result = anonymizePiiForStorage(rawText);
  if (result.findings.length === 0) return payload;

  const metadata = isRecord(payload.metadata) ? { ...payload.metadata } : {};
  const entityTypes = Array.from(new Set(result.findings.map((finding) => finding.entityType)));

  return {
    ...payload,
    text: result.text,
    ...(typeof payload.content === "string" ? { content: result.text } : {}),
    metadata: {
      ...metadata,
      pii: {
        protected: true,
        provider: PII_PROVIDER,
        entityTypes,
        findingCount: result.findings.length,
        originalSha256: sha256(rawText),
        redaction: "replace",
      },
    },
  };
}
