import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { collectLocalFootprintInventory, defaultLocalStoreProfiles } from "../footprint";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "memroos-footprint-"));
}

describe("cloud offload footprint inventory", () => {
  it("classifies local stores with cloud targets and prune safety", () => {
    const repo = tmpRepo();
    const profiles = defaultLocalStoreProfiles(repo);

    expect(profiles.some((profile) => profile.id === "sqlite-operational" && profile.pruneSafety === "never_prune")).toBe(true);
    expect(profiles.some((profile) => profile.id === "qmd-cache" && profile.pruneSafety === "safe_if_rebuilt")).toBe(true);
    expect(profiles.some((profile) => profile.id === "raw-vault" && profile.cloudTarget.includes("object-storage"))).toBe(true);
    expect(profiles.every((profile) => profile.cloudTarget.length > 0)).toBe(true);
  });

  it("reports size, existence, total footprint, and pressure", () => {
    const repo = tmpRepo();
    fs.mkdirSync(path.join(repo, "data"), { recursive: true });
    fs.writeFileSync(path.join(repo, "data/conversations.db"), "0123456789");

    const inventory = collectLocalFootprintInventory(repo);
    const sqlite = inventory.stores.find((store) => store.id === "sqlite-operational");

    expect(sqlite?.exists).toBe(true);
    expect(sqlite?.sizeBytes).toBe(10);
    expect(inventory.totalBytes).toBeGreaterThanOrEqual(10);
    expect(["ok", "watch", "critical"]).toContain(inventory.pressure);
  });
});
