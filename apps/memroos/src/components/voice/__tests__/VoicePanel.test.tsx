import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

// JSDOM doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@/lib/api-client", () => ({
  useAgents: vi.fn(),
}));

import { VoicePanel } from "@/components/voice/VoicePanel";
import { useAgents } from "@/lib/api-client";

const mockUseAgents = vi.mocked(useAgents);

const FIXTURE_AGENTS = [
  {
    id: "claude-sonnet-engineer",
    name: "Claude Sonnet Engineer",
    role: "SOUL.md -- Claude Sonnet Engineer",
    company: null,
    platform: "claude",
    protocol: "local",
    metadata: { source: "pmo-agents", path: "/Users/yourname/github/PMO/agents/claude-sonnet-engineer" },
  },
  {
    id: "content-creator",
    name: "Content Creator",
    role: "SOUL.md -- content-creator",
    company: null,
    platform: "codex",
    protocol: "local",
    metadata: { source: "pmo-agents", path: "/Users/yourname/github/PMO/agents/content-creator" },
  },
  {
    id: "sophia",
    name: "Sophia",
    role: "Sous Chef (Marketing)",
    company: "Epilogue",
    platform: "openclaw",
    protocol: "rest",
    metadata: { source: "agents.config.json" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

  it("labels CLIs, Paperclip project agents, and runtime subagents distinctly", () => {
    render(<VoicePanel />);
    expect(screen.getByRole("option", { name: "Claude CLI - Sonnet Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PC (PMO) - Content Creator" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OpenClaw subagent - Sophia" })).toBeInTheDocument();
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

  it("shows provider rate limits as a readable chat error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"error":"{\\"type\\":\\"error\\",\\"error\\":{\\"type\\":\\"rate_limit_error\\",\\"message\\":\\"usage limit exceeded\\"}}"}\n\n'
              )
            );
            controller.close();
          },
        }),
      })
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "test" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      key: "Enter",
      code: "Enter",
    });

    await waitFor(() => {
      expect(screen.getByText(/Provider limit hit: usage limit exceeded/)).toBeInTheDocument();
    });
  });

  it("renders no agents gracefully when useAgents returns empty", () => {
    mockUseAgents.mockReturnValue({ data: { agents: [] } } as ReturnType<typeof useAgents>);
    render(<VoicePanel />);
    expect(screen.getByText("Voice & Chat")).toBeInTheDocument();
  });

  it("sends chat via the send button and renders the streamed assistant reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"text":"All systems nominal"}\n\ndata: [DONE]\n\n'),
            );
            controller.close();
          },
        }),
      }),
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "status check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("All systems nominal")).toBeInTheDocument();
    });
  });

  it("shows OpenCode disabled guidance in chat errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "OpenCode chat runner is disabled",
      }),
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "ping" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText(/OpenCode chat runner is disabled/i),
      ).toBeInTheDocument();
    });
  });

  it("clears history when the selected agent changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"text":"First agent reply"}\n\ndata: [DONE]\n\n'),
            );
            controller.close();
          },
        }),
      }),
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First agent reply")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "sophia" },
    });

    expect(screen.queryByText("First agent reply")).not.toBeInTheDocument();
    expect(screen.getByText(/Ask OpenClaw subagent - Sophia/i)).toBeInTheDocument();
  });

  it("labels MemroOS system agents when metadata is not from PMO", () => {
    mockUseAgents.mockReturnValue({
      data: {
        agents: [
          ...FIXTURE_AGENTS,
          {
            id: "memroos-ops",
            name: "Ops Agent",
            role: "Operator helper",
            company: null,
            platform: "codex",
            protocol: "local",
            metadata: { source: "registry" },
          },
        ],
      },
    } as ReturnType<typeof useAgents>);

    render(<VoicePanel />);
    expect(screen.getByRole("option", { name: "MemroOS system - Ops Agent" })).toBeInTheDocument();
  });

  it("shows thinking state while a chat request is in flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "slow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("…")).toBeInTheDocument();

    resolveFetch(
      new Response('data: {"text":"done"}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("done")).toBeInTheDocument();
    });
  });

  it("starts voice capture and sends the final transcript", async () => {
    class MockRecognition {
      continuous = false;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const result = {
          isFinal: true,
          0: { transcript: "voice hello" },
        } as unknown as SpeechRecognitionResult;
        const event = { results: [result] } as unknown as SpeechRecognitionEvent;
        this.onresult?.(event);
      }
      stop() {}
    }

    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"text":"Voice reply"}\n\ndata: [DONE]\n\n'),
              );
              controller.close();
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
        }),
    );

    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play = play;
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:voice"),
      revokeObjectURL: vi.fn(),
    });

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    await waitFor(() => {
      expect(screen.getByText("Voice reply")).toBeInTheDocument();
    });
  });

  it("labels dedicated CLI agent ids and knowledge project paths", () => {
    mockUseAgents.mockReturnValue({
      data: {
        agents: [
          {
            id: "codex-cli-agent",
            name: "Codex Agent",
            role: "Codex CLI identity",
            company: null,
            platform: "codex",
            protocol: "local",
            metadata: { source: "registry", path: "/workspace/knowledge/notes" },
          },
        ],
      },
    } as ReturnType<typeof useAgents>);
    render(<VoicePanel />);
    expect(screen.getByRole("option", { name: "Codex CLI - Agent" })).toBeInTheDocument();
  });

  it("labels fallback CLI ids, knowledge projects, and workspace projects", () => {
    mockUseAgents.mockReturnValue({
      data: {
        agents: [
          {
            id: "qwen-engineer",
            name: "Qwen Engineer",
            role: "Qwen role",
            platform: "qwen",
            protocol: "local",
            metadata: {},
          },
          {
            id: "gemini-senior-engineer",
            name: "Gemini Senior Engineer",
            role: "Gemini role",
            platform: "gemini",
            protocol: "local",
            metadata: {},
          },
          {
            id: "workspace-agent",
            name: "Workspace Agent",
            role: "Workspace helper",
            platform: "codex",
            protocol: "local",
            metadata: { source: "pmo-agents", workspace: "Delta" },
          },
          {
            id: "knowledge-agent",
            name: "Knowledge Agent",
            role: "Knowledge helper",
            platform: "codex",
            protocol: "local",
            metadata: { source: "pmo-agents", path: "/workspace/knowledge/cards" },
          },
        ],
      },
    } as ReturnType<typeof useAgents>);

    render(<VoicePanel />);

    expect(screen.getByRole("option", { name: "Qwen CLI - Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gemini CLI - Senior Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PC (Delta) - Workspace Agent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PC (Knowledge) - Knowledge Agent" })).toBeInTheDocument();
  });

  it("labels Cursor IDE, fallback platform CLI, and company-backed Paperclip agents", () => {
    mockUseAgents.mockReturnValue({
      data: {
        agents: [
          {
            id: "cursor-ide-agent",
            name: "Cursor Agent",
            role: "IDE bridge",
            company: null,
            platform: "cursor",
            protocol: "local",
            metadata: {},
          },
          {
            id: "unknown-cli",
            name: "Unknown CLI",
            role: "native cli worker",
            company: null,
            platform: "custom-runtime",
            protocol: "local",
            metadata: {},
          },
          {
            id: "client-agent",
            name: "Client Agent",
            role: "Client helper",
            company: "ClientCo",
            platform: "codex",
            protocol: "local",
            metadata: { source: "pmo-agents" },
          },
        ],
      },
    } as ReturnType<typeof useAgents>);

    render(<VoicePanel />);

    expect(screen.getByRole("option", { name: "Cursor IDE - Agent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Custom Runtime CLI - Unknown CLI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PC (ClientCo) - Client Agent" })).toBeInTheDocument();
  });

  it("ignores malformed stream chunks and surfaces raw JSON chat errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: not-json\n\ndata: {"error":"{\\"message\\":\\"plain failure\\"}"}\n\n',
              ),
            );
            controller.close();
          },
        }),
      }),
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "malformed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/plain failure/)).toBeInTheDocument();
    });
  });

  it("falls back to the raw chat error when embedded JSON cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "upstream {not-json",
      }),
    );

    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "bad json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/upstream \{not-json/)).toBeInTheDocument();
    });
  });

  it("surfaces generic chat errors from non-streaming failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "upstream exploded",
      }),
    );
    render(<VoicePanel />);
    fireEvent.change(screen.getByPlaceholderText(/Message .* \(Enter to send\)/), {
      target: { value: "boom" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText(/upstream exploded/i)).toBeInTheDocument();
    });
  });

  it("alerts when speech recognition is unavailable", () => {
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    expect(alert).toHaveBeenCalledWith("Speech recognition not supported in this browser. Use Chrome.");
  });

  it("stops an active voice capture when the mic is clicked again", () => {
    const stop = vi.fn();
    class MockRecognition {
      continuous = false;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = stop;
    }
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));

    expect(stop).toHaveBeenCalled();
  });

  it("clears listening state when recognition reports an error or end", async () => {
    let instance: {
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    } | null = null;
    class MockRecognition {
      continuous = false;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        instance = this;
      }
    }
    vi.stubGlobal("SpeechRecognition", MockRecognition);

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    await act(async () => {
      instance?.onerror?.();
    });
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));
    await act(async () => {
      instance?.onend?.();
    });
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
  });

  it("keeps the chat reply visible when TTS playback fails", async () => {
    class MockRecognition {
      continuous = false;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const result = {
          isFinal: true,
          0: { transcript: "voice tts failure" },
        } as unknown as SpeechRecognitionResult;
        this.onresult?.({ results: [result] } as unknown as SpeechRecognitionEvent);
      }
      stop() {}
    }
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"text":"Reply without audio"}\n\ndata: [DONE]\n\n'),
              );
              controller.close();
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          blob: async () => new Blob([""]),
        }),
    );

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    await waitFor(() => {
      expect(screen.getByText("Reply without audio")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/tts", expect.objectContaining({ method: "POST" }));
    });
  });

  it("can stop active TTS playback after audio starts", async () => {
    class MockRecognition {
      continuous = false;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const result = { isFinal: true, 0: { transcript: "voice tts" } } as unknown as SpeechRecognitionResult;
        this.onresult?.({ results: [result] } as unknown as SpeechRecognitionEvent);
      }
      stop() {}
    }
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"text":"Audio reply"}\n\ndata: [DONE]\n\n'));
              controller.close();
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
        }),
    );
    const pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        pause = pause;
        play = vi.fn().mockResolvedValue(undefined);
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:voice"),
      revokeObjectURL: vi.fn(),
    });

    render(<VoicePanel />);
    fireEvent.click(screen.getByRole("button", { name: "voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    await waitFor(() => {
      expect(screen.getByText("Stop speaking")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Stop speaking"));
    expect(pause).toHaveBeenCalled();
  });
});
