import { describe, expect, it } from "vitest";
import { summarizeAgentCliProcesses } from "../local-agent-runtime";

describe("local agent runtime process summary", () => {
  it("counts CLI session roots without double-counting helper children", () => {
    const summary = summarizeAgentCliProcesses(
      [
        " 4068  1166 node /opt/homebrew/bin/qwen",
        " 4087  4068 /opt/homebrew/Cellar/node/25.8.2/bin/node /opt/homebrew/bin/qwen",
        " 4217  1222 node /opt/homebrew/bin/qwen",
        " 4228  4217 /opt/homebrew/Cellar/node/25.8.2/bin/node /opt/homebrew/bin/qwen",
        " 2397  2353 zsh -c while true; do /Users/yourname/.local/bin/claude; done",
        " 2432  2397 /Users/yourname/.local/bin/claude --channels plugin:discord",
        " 2003     1 /opt/homebrew/Cellar/python@3.11/3.11.14_3/Frameworks/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python -m hermes_cli.main gateway run --replace",
        " 2100     1 /opt/homebrew/opt/node/bin/node /opt/homebrew/lib/node_modules/openclaw/dist/index.js gateway --port 18789",
        " 2200  1190 /opt/homebrew/bin/opencode run",
        " 2300  1190 node /opt/homebrew/bin/codex",
        " 2350  1190 /Applications/ZCode.app/Contents/MacOS/zcode",
        " 2400  1190 /Users/yourname/.local/bin/pi --model local",
        " 1134   641 /Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled",
        "18672  1134 ./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient mcp",
        "71433  1134 /Applications/Vibe Island.app/Contents/Helpers/vibe-island-bridge --source codex",
      ].join("\n"),
      "2026-05-07T07:45:00.000Z"
    );

    expect(summary).toEqual({
      activeCliCount: 9,
      byPlatform: {
        claude: 1,
        codex: 1,
        hermes: 1,
        openclaw: 1,
        opencode: 1,
        pi: 1,
        qwen: 2,
        zcode: 1,
      },
      scannedAt: "2026-05-07T07:45:00.000Z",
    });
  });
});
