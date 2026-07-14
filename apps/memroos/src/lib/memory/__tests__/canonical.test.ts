import { describe, expect, it } from "vitest";
import { computeCanonicalHash, buildCanonicalIdentity } from "../canonical";

describe("VAL-MEM-006: Canonical identity inventories every derivative with source hash", () => {
  it("inventories derivatives with source hash and provenance", () => {
    const identity = buildCanonicalIdentity("Hello Memroos", "episodic", "api/memory/add", "mem-123");
    
    expect(identity.id).toMatch(/^canon-[a-f0-9]{16}$/);
    expect(identity.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.derivatives).toHaveLength(1);
    expect(identity.derivatives[0]).toEqual({
      storeId: "mem-123",
      sourceHash: identity.canonicalHash,
      provenance: "api/memory/add"
    });
  });
});

describe("VAL-MEM-007: Equivalent writes through different ingress paths converge to one identity", () => {
  it("converges equivalent writes to the same canonical hash", () => {
    const hash1 = computeCanonicalHash("Hello Memroos", "episodic");
    const hash2 = computeCanonicalHash("  Hello Memroos  ", "EPISODIC");
    
    expect(hash1).toBe(hash2);
    
    // Different scope should result in a different hash
    const hash3 = computeCanonicalHash("Hello Memroos", "episodic", { tenant: "t1" });
    expect(hash1).not.toBe(hash3);
    
    // Equivalent scope should result in the same hash
    const hash4 = computeCanonicalHash("Hello Memroos", "episodic", { tenant: "t1" });
    expect(hash3).toBe(hash4);
  });
});
