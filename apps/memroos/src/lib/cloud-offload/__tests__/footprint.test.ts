// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectLocalFootprintInventory,
  defaultLocalStoreProfiles,
} from "../footprint";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-footprint-"));
  tempRoots.push(root);
  return root;
}

describe("local footprint inventory", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves repo and home-backed default store profiles", () => {
    const home = makeTempRoot();
    vi.spyOn(os, "homedir").mockReturnValue(home);

    const profiles = defaultLocalStoreProfiles("/repo/root");

    expect(profiles.find((profile) => profile.id === "sqlite-operational")?.path).toBe(
      path.resolve("/repo/root/data/conversations.db")
    );
    expect(profiles.find((profile) => profile.id === "qmd-cache")?.path).toBe(path.join(home, ".cache/qmd"));
    expect(profiles.find((profile) => profile.id === "runtime-env")?.privacyLabel).toBe("secret");
  });

  it("walks directories, skips unreadable entries, and warns for large permanent local stores", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "data", "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "nested", "wal.log"), "12345");
    const dbPath = path.join(root, "data", "conversations.db");
    fs.writeFileSync(dbPath, "");
    fs.truncateSync(dbPath, 2 * 1024 * 1024 * 1024 + 1);

    const inventory = collectLocalFootprintInventory(root);

    expect(inventory.pressure).not.toBe("ok");
    expect(inventory.totalBytes).toBeGreaterThan(2 * 1024 * 1024 * 1024);
    expect(inventory.stores.find((store) => store.id === "sqlite-operational")).toMatchObject({
      exists: true,
      sizeBytes: 2 * 1024 * 1024 * 1024 + 1,
    });
    expect(inventory.warnings).toContain(
      "sqlite-operational is locally permanent and over 1GB; confirm cloud sync before any pruning."
    );
  });

  it("treats stat and directory read failures as zero-byte stores", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "conversations.db"), "db");
    const realStatSync = fs.statSync.bind(fs);
    vi.spyOn(fs, "statSync").mockImplementation((target) => {
      if (String(target).endsWith("conversations.db")) {
        throw new Error("stat denied");
      }
      return realStatSync(target);
    });

    const inventory = collectLocalFootprintInventory(root);

    expect(inventory.stores.find((store) => store.id === "sqlite-operational")?.sizeBytes).toBe(0);
  });
});

describe("cloud offload footprint inventory", () => {
  it("classifies local stores with cloud targets and prune safety", () => {
    const fakeHome = makeTempRoot();
    const repo = makeTempRoot();
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const profiles = defaultLocalStoreProfiles(repo);

    expect(profiles.some((profile) => profile.id === "sqlite-operational" && profile.pruneSafety === "never_prune")).toBe(true);
    expect(profiles.some((profile) => profile.id === "qmd-cache" && profile.pruneSafety === "safe_if_rebuilt")).toBe(true);
    expect(profiles.some((profile) => profile.id === "raw-vault" && profile.cloudTarget.includes("object-storage"))).toBe(true);
    expect(profiles.every((profile) => profile.cloudTarget.length > 0)).toBe(true);
  });

  it("reports size, existence, total footprint, and pressure", () => {
    const fakeHome = makeTempRoot();
    const repo = makeTempRoot();
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
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
