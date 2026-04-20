import type { AgentCardSkill } from "@/types";

const ROLE_RULES: Array<{ pattern: RegExp; skill: AgentCardSkill }> = [
  {
    pattern: /memory|recall|consolidat/i,
    skill: {
      id: "memory-write",
      name: "Memory Write",
      description: "Store and retrieve agent memory entries",
      tags: ["memory", "persistence"],
      inputModes: ["text"],
      outputModes: ["text"],
    },
  },
  {
    pattern: /dev|engineer|code|program|software/i,
    skill: {
      id: "code-execute",
      name: "Code Execution",
      description: "Write and execute code in sandboxed environments",
      tags: ["code", "execution"],
      inputModes: ["text"],
      outputModes: ["text"],
    },
  },
  {
    pattern: /research|search|analys|investigat/i,
    skill: {
      id: "web-search",
      name: "Web Search",
      description: "Search the web and retrieve information",
      tags: ["search", "research"],
      inputModes: ["text"],
      outputModes: ["text"],
    },
  },
  {
    pattern: /manager|product|pm|plan|orchestrat/i,
    skill: {
      id: "task-planning",
      name: "Task Planning",
      description: "Break down goals into structured task plans",
      tags: ["planning", "coordination"],
      inputModes: ["text"],
      outputModes: ["text"],
    },
  },
];

const DEFAULT_SKILL: AgentCardSkill = {
  id: "task-execute",
  name: "Task Execution",
  description: "Execute general-purpose tasks and return results",
  tags: ["general"],
  inputModes: ["text"],
  outputModes: ["text"],
};

export function deriveSkills(role: string): AgentCardSkill[] {
  const matched = ROLE_RULES.filter((r) => r.pattern.test(role)).map(
    (r) => r.skill
  );
  return matched.length > 0 ? matched : [DEFAULT_SKILL];
}
