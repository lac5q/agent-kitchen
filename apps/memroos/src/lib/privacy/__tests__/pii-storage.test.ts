import { describe, expect, it } from "vitest";

import { anonymizePiiForStorage, protectMemoryPayloadForStorage } from "../pii-storage";

describe("PII storage protection", () => {
  it("passes through text with no detected PII", () => {
    const payload = { text: "No sensitive values here", metadata: { source: "test" } };

    expect(protectMemoryPayloadForStorage(payload)).toBe(payload);
  });

  it("redacts detected entities with Presidio-compatible entity labels", () => {
    const result = anonymizePiiForStorage("Email ada@example.com, SSN 123-45-6789, phone 555-123-4567.");

    expect(result.text).toBe(
      "Email [REDACTED:EMAIL_ADDRESS], SSN [REDACTED:SSN_US], phone [REDACTED:PHONE_NUMBER_US]."
    );
    expect(result.findings.map((finding) => finding.entityType)).toEqual([
      "EMAIL_ADDRESS",
      "SSN_US",
      "PHONE_NUMBER_US",
    ]);
  });

  it("updates both text and content while preserving metadata", () => {
    const payload = protectMemoryPayloadForStorage({
      text: "Card 4111-1111-1111-1111",
      content: "Card 4111-1111-1111-1111",
      metadata: { source: "chatgpt-mobile" },
    });

    expect(payload.text).toBe("Card [REDACTED:CREDIT_CARD]");
    expect(payload.content).toBe("Card [REDACTED:CREDIT_CARD]");
    expect(payload.metadata).toMatchObject({
      source: "chatgpt-mobile",
      pii: {
        protected: true,
        provider: "presidio-compatible-local",
        entityTypes: ["CREDIT_CARD"],
        findingCount: 1,
        redaction: "replace",
      },
    });
    expect((payload.metadata as Record<string, unknown>).pii).not.toMatchObject({
      match: "4111-1111-1111-1111",
    });
  });
});
