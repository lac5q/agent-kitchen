import { describe, expect, it } from "vitest";
import { authorizeMemoryUse } from "../policy-gate";

describe("VAL-MEM-009: Graph filtering removes unauthorized neighbors", () => {
  it("denies access to sealed content", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "test", role: "operator" },
      purpose: "memory_search",
      label: { policy: "sealed" }
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toBe("sealed_content");
  });

  it("denies access to private content", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "test", role: "operator" },
      purpose: "memory_search",
      label: { visibility: "private", policy: "indexable" }
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toBe("private_content");
  });

  it("requires human review for appropriately labeled content", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "test", role: "operator" },
      purpose: "memory_search",
      label: { visibility: "internal", policy: "requires_human_review" }
    });
    expect(decision.decision).toBe("review-required");
    expect(decision.reason).toBe("human_review_required");
  });

  it("allows access to public safe content", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "test", role: "operator" },
      purpose: "memory_search",
      label: { visibility: "public_safe", policy: "indexable" }
    });
    expect(decision.decision).toBe("allow");
    expect(decision.reason).toBe("label_allows_use");
  });

  it("denies access to anonymous actors trying to read internal content", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "anonymous", role: "anonymous" },
      purpose: "memory_search",
      label: { visibility: "internal", policy: "indexable" }
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toBe("anonymous_actor");
  });
});
