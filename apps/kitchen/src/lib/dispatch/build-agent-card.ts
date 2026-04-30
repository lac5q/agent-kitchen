import type { RemoteAgentConfig } from "@/types";
import { deriveSkills } from "./derive-skills";

export interface AgentCard {
  name: string;
  description: string;
  version: "1";
  url: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: string[];
  };
  skills: ReturnType<typeof deriveSkills>;
  extensions: {
    kitchen: {
      id: string;
      platform: string;
      location: string;
      role: string;
    };
  };
}

export function buildAgentCard(agent: RemoteAgentConfig): AgentCard {
  const baseUrl =
    agent.location === "cloudflare" && agent.tunnelUrl
      ? agent.tunnelUrl
      : `http://${agent.host}:${agent.port}`;

  const skills =
    agent.skills && agent.skills.length > 0
      ? agent.skills
      : deriveSkills(agent.role);

  return {
    name: agent.name,
    description: `${agent.name} — ${agent.role} agent (${agent.platform})`,
    version: "1",
    url: baseUrl,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["none"],
    },
    skills,
    extensions: {
      kitchen: {
        id: agent.id,
        platform: agent.platform,
        location: agent.location,
        role: agent.role,
      },
    },
  };
}
