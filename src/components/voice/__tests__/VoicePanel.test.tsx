import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock useVoiceStatus from api-client at module level
vi.mock("@/lib/api-client", () => ({
  useVoiceStatus: vi.fn(),
}));

// Mock useVoiceTranscript at module level
vi.mock("@/components/voice/useVoiceTranscript", () => ({
  useVoiceTranscript: vi.fn(),
}));

import { VoicePanel } from "@/components/voice/VoicePanel";
import { useVoiceStatus } from "@/lib/api-client";
import { useVoiceTranscript } from "@/components/voice/useVoiceTranscript";

const mockUseVoiceStatus = vi.mocked(useVoiceStatus);
const mockUseVoiceTranscript = vi.mocked(useVoiceTranscript);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseVoiceTranscript.mockReturnValue([]);
});

describe("VoicePanel", () => {
  it("renders Inactive status when voice is not active", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: { active: false, session_id: null, started_at: null, duration_secs: null },
    } as ReturnType<typeof useVoiceStatus>);

    render(<VoicePanel />);

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("renders Active status with green indicator when voice is active", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: {
        active: true,
        session_id: "sess-1",
        started_at: "2026-04-18T10:00:00Z",
        duration_secs: 120,
      },
    } as ReturnType<typeof useVoiceStatus>);

    render(<VoicePanel />);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Session: 02:00/)).toBeInTheDocument();
  });

  it("renders Unavailable status with error indicator when error is set", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: {
        active: false,
        session_id: null,
        started_at: null,
        duration_secs: null,
        error: "voice server unavailable",
      },
    } as ReturnType<typeof useVoiceStatus>);

    render(<VoicePanel />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("renders empty transcript message when no entries", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: { active: false, session_id: null, started_at: null, duration_secs: null },
    } as ReturnType<typeof useVoiceStatus>);
    mockUseVoiceTranscript.mockReturnValue([]);

    render(<VoicePanel />);

    expect(screen.getByText("No voice transcripts yet")).toBeInTheDocument();
  });

  it("renders transcript entries with correct role labels", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: {
        active: true,
        session_id: "sess-2",
        started_at: "2026-04-18T10:00:00Z",
        duration_secs: 30,
      },
    } as ReturnType<typeof useVoiceStatus>);
    mockUseVoiceTranscript.mockReturnValue([
      { role: "user", content: "Hello there", timestamp: "2026-04-18T10:00:05Z" },
      { role: "assistant", content: "Hi, how can I help?", timestamp: "2026-04-18T10:00:06Z" },
    ]);

    render(<VoicePanel />);

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi, how can I help?")).toBeInTheDocument();
    expect(screen.getByText("You:")).toBeInTheDocument();
    expect(screen.getByText("Assistant:")).toBeInTheDocument();
    expect(screen.queryByText("No voice transcripts yet")).not.toBeInTheDocument();
  });

  it("shows Last session duration when inactive with a previous duration", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: {
        active: false,
        session_id: null,
        started_at: null,
        duration_secs: 65,
      },
    } as ReturnType<typeof useVoiceStatus>);

    render(<VoicePanel />);

    expect(screen.getByText(/Last session: 01:05/)).toBeInTheDocument();
  });

  it("collapses and hides content when chevron is clicked", () => {
    mockUseVoiceStatus.mockReturnValue({
      data: { active: false, session_id: null, started_at: null, duration_secs: null },
    } as ReturnType<typeof useVoiceStatus>);

    render(<VoicePanel />);

    // Initially expanded — empty state message visible
    expect(screen.getByText("No voice transcripts yet")).toBeInTheDocument();

    // Click collapse button
    const btn = screen.getByLabelText("Collapse voice panel");
    fireEvent.click(btn);

    // Content should be hidden
    expect(screen.queryByText("No voice transcripts yet")).not.toBeInTheDocument();
  });
});
