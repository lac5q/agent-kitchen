import { describe, it, expect } from "vitest";
import { deriveSkills } from "../derive-skills";

describe("deriveSkills", () => {
  it("returns memory skill for memory-related roles", () => {
    const skills = deriveSkills("memory-curator");
    expect(skills.some((s) => s.id === "memory-write")).toBe(true);
  });

  it("returns code skill for developer roles", () => {
    const skills = deriveSkills("senior-developer");
    expect(skills.some((s) => s.id === "code-execute")).toBe(true);
  });

  it("returns research skill for research roles", () => {
    const skills = deriveSkills("research-analyst");
    expect(skills.some((s) => s.id === "web-search")).toBe(true);
  });

  it("returns planning skill for PM roles", () => {
    const skills = deriveSkills("product-manager");
    expect(skills.some((s) => s.id === "task-planning")).toBe(true);
  });

  it("returns generic task skill for unknown roles", () => {
    const skills = deriveSkills("some-unknown-role");
    expect(skills.some((s) => s.id === "task-execute")).toBe(true);
  });

  it("returns array of valid skill shapes", () => {
    const skills = deriveSkills("memory-curator");
    for (const s of skills) {
      expect(s).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        tags: expect.any(Array),
        inputModes: ["text"],
        outputModes: ["text"],
      });
    }
  });
});
