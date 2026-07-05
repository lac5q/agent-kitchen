"use client";

import { useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CreateAgentOnboardingInviteInput, RegisterA2aAgentCardInput } from "@/lib/api-client";
import type { AgentPlatform, RegisterAgentInput } from "@/types";

const ONBOARDING_PLATFORMS: AgentPlatform[] = [
  "cursor",
  "opencode",
  "openclaw",
  "hermes",
  "claude",
  "gemini",
  "qwen",
  "pi",
  "chatgpt",
  "codex",
];

interface AgentRegistrationFormProps {
  onSubmit: (input: RegisterAgentInput) => void;
  onA2aSubmit?: (input: RegisterA2aAgentCardInput) => void;
  onCreateInvite?: (input: CreateAgentOnboardingInviteInput) => void;
  isSubmitting?: boolean;
  isCreatingInvite?: boolean;
}

export function AgentRegistrationForm({
  onSubmit,
  onA2aSubmit,
  onCreateInvite,
  isSubmitting = false,
  isCreatingInvite = false,
}: AgentRegistrationFormProps) {
  const [mode, setMode] = useState<"manual" | "a2a">("manual");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [cardUrl, setCardUrl] = useState("");
  const [source, setSource] = useState<"adk" | "a2a" | "manual">("adk");
  const [platform, setPlatform] = useState<AgentPlatform>("cursor");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "a2a") {
      if (!cardUrl.trim() || !onA2aSubmit) return;
      onA2aSubmit({ cardUrl: cardUrl.trim(), source });
      setCardUrl("");
      return;
    }

    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || !role.trim()) return;
    onSubmit({
      id,
      name: name.trim(),
      role: role.trim(),
      platform,
      protocol: "rest",
      capabilities: capabilities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => ({ id: item.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: item, description: "", tags: [] })),
      issueApiKey: true,
    });
    setName("");
    setRole("");
    setCapabilities("");
  }

  function handleCreateInvite() {
    onCreateInvite?.({
      platform,
      protocol: "rest",
      ttlMinutes: 60,
      mcpTarget: "auto",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border border-stone-200 bg-white/90 p-4">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            aria-label="Agent platform"
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-stone-700"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as AgentPlatform)}
          >
            {ONBOARDING_PLATFORMS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={isCreatingInvite || !onCreateInvite}
            onClick={handleCreateInvite}
          >
            Copy Invite
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          >
            Advanced
          </Button>
        </div>
        <p className="text-xs text-stone-500">
          The invite lets the agent choose its own name and writes its MemroOS credentials during bootstrap.
        </p>
      </div>

      {showAdvanced && (
        <div className="mt-4 border-t border-stone-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={mode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("manual")}
            >
              Manual REST
            </Button>
            <Button
              type="button"
              variant={mode === "a2a" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("a2a")}
            >
              A2A card URL
            </Button>
            <span className="text-xs text-stone-500">
              Stored bearer tokens and API keys are never displayed after creation.
            </span>
          </div>

          {mode === "a2a" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-stone-500">
                Paste the agent-card URL exposed by the remote agent. The registry will validate the card,
                security scheme, endpoint, and declared skills before adding it to the registry.
              </p>
              <p className="text-xs text-stone-500">
                For Google ADK, use the agent-card URL from an A2A-enabled ADK server, for example an
                agent served with adk api_server --a2a. Private network or Tailscale URLs are recommended
                for startup multi-machine deployments.
              </p>
              <div className="grid gap-3 md:grid-cols-[1fr_11rem_auto]">
                <Input
                  aria-label="A2A agent-card URL"
                  placeholder="http://localhost:8001/a2a/check_prime_agent/.well-known/agent-card.json"
                  value={cardUrl}
                  onChange={(event) => setCardUrl(event.target.value)}
                />
                <select
                  aria-label="A2A source"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-stone-700"
                  value={source}
                  onChange={(event) => setSource(event.target.value as "adk" | "a2a" | "manual")}
                >
                  <option value="adk">Google ADK</option>
                  <option value="a2a">A2A</option>
                  <option value="manual">Manual</option>
                </select>
                <Button type="submit" disabled={isSubmitting}>
                  Register A2A Agent
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                aria-label="Agent name"
                placeholder="Agent name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                aria-label="Agent role"
                placeholder="Role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
              <Input
                aria-label="Agent capabilities"
                placeholder="Capabilities, comma separated"
                value={capabilities}
                onChange={(event) => setCapabilities(event.target.value)}
              />
              <Button type="submit" disabled={isSubmitting}>
                Register
              </Button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
