import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspaceName } from "@/lib/instance";

const previous = {
  workspace: process.env.MEMROOS_WORKSPACE_NAME,
  public: process.env.MEMROOS_PUBLIC_BASE_URL,
  app: process.env.MEMROOS_APP_URL,
  base: process.env.MEMROOS_BASE_URL,
};

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("MEMROOS_WORKSPACE_NAME", previous.workspace);
  restoreEnv("MEMROOS_PUBLIC_BASE_URL", previous.public);
  restoreEnv("MEMROOS_APP_URL", previous.app);
  restoreEnv("MEMROOS_BASE_URL", previous.base);
});

describe("resolveWorkspaceName", () => {
  it("prefers the explicit workspace name", () => {
    process.env.MEMROOS_WORKSPACE_NAME = "Cordant Workspace";
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example.test";
    expect(resolveWorkspaceName()).toBe("Cordant Workspace");
  });

  it("uses the first public hostname label with only its first character capitalized", () => {
    delete process.env.MEMROOS_WORKSPACE_NAME;
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos-cordant.epiloguecapital.com";
    expect(resolveWorkspaceName()).toBe("Memroos-cordant");
  });

  it("falls back to MemRoOS when no usable URL is available", () => {
    delete process.env.MEMROOS_WORKSPACE_NAME;
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    delete process.env.MEMROOS_APP_URL;
    delete process.env.MEMROOS_BASE_URL;
    expect(resolveWorkspaceName()).toBe("MemRoOS");
  });
});
