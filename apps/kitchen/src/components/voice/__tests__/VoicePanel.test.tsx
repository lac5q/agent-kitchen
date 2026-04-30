import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// JSDOM doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@/lib/api-client", () => ({
  useAgents: vi.fn(),
}));

import { VoicePanel } from "@/components/voice/VoicePanel";
import { useAgents } from "@/lib/api-client";

const mockUseAgents = vi.mocked(useAgents);

const FIXTURE_AGENTS = [
  { id: "kitchen", name: "Kitchen Floor", company: null, platform: "claude" },
  { id: "sophia",  name: "Sophia",        company: "Epilogue", platform: "claude" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAgents.mockReturnValue({
    data: { agents: FIXTURE_AGENTS },
  } as ReturnType<typeof useAgents>);
});

describe("VoicePanel", () => {
  it("renders header and agent selector", () => {
    render(<VoicePanel />);
    expect(screen.getByText("Voice & Chat")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows chat and voice tab buttons", () => {
    render(<VoicePanel />);
    expect(screen.getByRole("button", { name: "chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "voice" })).toBeInTheDocument();
  });

  it("shows empty-state prompt for selected agent on chat tab", () => {
    render(<VoicePanel />);
    // default agent is first in sorted list
    expect(screen.getByText(/Ask .* what they're working on/)).toBeInTheDocument();
  });

  it("switches to voice tab and shows mic button", () => {
    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
  });

  it("renders textarea on chat tab with agent name in placeholder", () => {
    render(<VoicePanel />);
    const textarea = screen.getByPlaceholderText(/Message .* \(Enter to send\)/);
    expect(textarea).toBeInTheDocument();
  });

  it("collapses and hides content when toggle clicked", () => {
    render(<VoicePanel />);
    expect(screen.getByRole("button", { name: "chat" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.queryByRole("button", { name: "chat" })).not.toBeInTheDocument();
  });

  it("expands again after collapse", () => {
    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "chat" })).toBeInTheDocument();
  });

  it("renders no agents gracefully when useAgents returns empty", () => {
    mockUseAgents.mockReturnValue({ data: { agents: [] } } as ReturnType<typeof useAgents>);
    render(<VoicePanel />);
    expect(screen.getByText("Voice & Chat")).toBeInTheDocument();
  });
});
