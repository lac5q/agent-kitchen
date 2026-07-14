import crypto from "crypto";

export interface CanonicalDerivative {
  storeId: string;
  sourceHash: string;
  provenance: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalMemoryIdentity {
  id: string;
  canonicalHash: string;
  derivatives: CanonicalDerivative[];
}

export function computeCanonicalHash(content: string, type: string, scope: Record<string, unknown> = {}): string {
  const normalizedContent = content.trim();
  const normalizedType = type.toLowerCase();
  
  const sortedScope = Object.keys(scope)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      if (scope[key] !== undefined && scope[key] !== null) {
        acc[key] = scope[key];
      }
      return acc;
    }, {});
    
  const payload = JSON.stringify({
    content: normalizedContent,
    type: normalizedType,
    scope: sortedScope
  });
  
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildCanonicalIdentity(
  content: string, 
  type: string, 
  ingressPath: string, 
  storeId: string,
  scope: Record<string, unknown> = {}
): CanonicalMemoryIdentity {
  const hash = computeCanonicalHash(content, type, scope);
  
  return {
    id: `canon-${hash.substring(0, 16)}`,
    canonicalHash: hash,
    derivatives: [
      {
        storeId,
        sourceHash: hash,
        provenance: ingressPath,
      }
    ]
  };
}
