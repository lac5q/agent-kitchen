// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const bcryptMocks = vi.hoisted(() => ({
  hash: vi.fn(async (plain: string, cost: number) => `hashed:${plain}:${cost}`),
  hashSync: vi.fn((plain: string, cost: number) => `sync:${plain}:${cost}`),
  compare: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}:12`),
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMocks,
}));

import { hashPassword, hashPasswordSync, verifyPassword } from "../password";

describe("password (mocked bcrypt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashPassword uses bcrypt cost 12", async () => {
    const result = await hashPassword("secret");
    expect(bcryptMocks.hash).toHaveBeenCalledWith("secret", 12);
    expect(result).toBe("hashed:secret:12");
  });

  it("hashPasswordSync uses bcrypt cost 12", () => {
    const result = hashPasswordSync("secret");
    expect(bcryptMocks.hashSync).toHaveBeenCalledWith("secret", 12);
    expect(result).toBe("sync:secret:12");
  });

  it("verifyPassword delegates to bcrypt.compare", async () => {
    bcryptMocks.compare.mockResolvedValueOnce(true);
    await expect(verifyPassword("plain", "stored-hash")).resolves.toBe(true);
    expect(bcryptMocks.compare).toHaveBeenCalledWith("plain", "stored-hash");
  });

  it("verifyPassword returns false when bcrypt.compare rejects", async () => {
    bcryptMocks.compare.mockResolvedValueOnce(false);
    await expect(verifyPassword("wrong", "stored-hash")).resolves.toBe(false);
  });
});
