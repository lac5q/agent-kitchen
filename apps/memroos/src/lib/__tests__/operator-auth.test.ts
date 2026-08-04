// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { authorizeRegistryWrite, authorizeRegistryWriteStrict } from "@/lib/operator-auth";

describe("authorizeRegistryWrite", () => {
  afterEach(() => {
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it("allows loopback registry writes without an operator key", () => {
    expect(authorizeRegistryWrite(new Request("http://localhost/api/agents/register"))).toBe(true);
    expect(authorizeRegistryWrite(new Request("http://127.0.0.1/api/agents/register"))).toBe(true);
  });

  it("allows loopback dashboard calls even when an operator key is configured", () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";

    expect(authorizeRegistryWrite(new Request("http://localhost/api/memory/health"))).toBe(true);
    expect(authorizeRegistryWrite(new Request("http://127.0.0.1/api/orchestration/hil"))).toBe(true);
  });

  it("does not treat loopback reachability as a credential for strict registry writes", () => {
    expect(authorizeRegistryWriteStrict(new Request("http://localhost/api/agents/register"))).toBe(false);
    expect(authorizeRegistryWriteStrict(new Request("http://127.0.0.1/api/agents/register"))).toBe(false);
  });

  it("does not treat a public forwarded host as local loopback", () => {
    // CR-08: x-forwarded-host is ignored; a spoofed "localhost" header cannot
    // elevate a public-origin request to loopback trust.
    expect(
      authorizeRegistryWrite(
        new Request("https://memroos.example.com/api/agents/register", {
          headers: { "x-forwarded-host": "localhost" },
        })
      )
    ).toBe(false);
  });

  it("blocks non-local registry writes unless the operator key matches", () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";

    expect(authorizeRegistryWrite(new Request("https://memroos.example.com/api/agents/register"))).toBe(false);
    expect(
      authorizeRegistryWrite(
        new Request("https://memroos.example.com/api/agents/register", {
          headers: { "x-memroos-operator-key": "operator-secret" },
        })
      )
    ).toBe(true);
    expect(
      authorizeRegistryWrite(
        new Request("https://memroos.example.com/api/agents/register", {
          headers: { authorization: "Bearer operator-secret" },
        })
      )
    ).toBe(true);
  });
});
