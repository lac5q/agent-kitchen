# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: voice-chat.spec.ts >> Voice & Chat panel — Flow page >> Can switch between agents
- Location: e2e/voice-chat.spec.ts:30:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('select')
    - locator resolved to <select class="ml-1 rounded-md border border-stone-300 bg-stone-100 px-2 py-0.5 text-xs text-stone-500 focus:outline-none focus:border-amber-500/50">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    49 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - complementary [ref=e2]:
    - generic [ref=e4]:
      - img "MemroOS stylized kangaroo logo" [ref=e5]:
        - img [ref=e6]
      - generic [ref=e14]:
        - paragraph [ref=e15]: MemroOS
        - heading "MemroOS" [level=1] [ref=e16]
        - paragraph [ref=e17]: Memory OS for agent workflows
    - navigation [ref=e18]:
      - link "Operations 8 NOC · efficiency · anomalies" [ref=e19] [cursor=pointer]:
        - /url: /
        - img [ref=e20]
        - generic [ref=e22]:
          - generic [ref=e23]:
            - generic [ref=e24]: Operations
            - generic [ref=e25]: "8"
          - generic [ref=e26]: NOC · efficiency · anomalies
      - link "Workflow Map How work actually flows" [ref=e27] [cursor=pointer]:
        - /url: /flow
        - img [ref=e28]
        - generic [ref=e32]:
          - generic [ref=e34]: Workflow Map
          - generic [ref=e35]: How work actually flows
      - link "Memory Memory · Knowledge · Notebooks" [ref=e36] [cursor=pointer]:
        - /url: /notebooks
        - img [ref=e37]
        - generic [ref=e45]:
          - generic [ref=e47]: Memory
          - generic [ref=e48]: Memory · Knowledge · Notebooks
      - link "Skills Cookbooks · registry · lifecycle" [ref=e49] [cursor=pointer]:
        - /url: /cookbooks
        - img [ref=e50]
        - generic [ref=e53]:
          - generic [ref=e55]: Skills
          - generic [ref=e56]: Cookbooks · registry · lifecycle
      - link "Agents Registry · runtimes" [ref=e57] [cursor=pointer]:
        - /url: /agents
        - img [ref=e58]
        - generic [ref=e61]:
          - generic [ref=e63]: Agents
          - generic [ref=e64]: Registry · runtimes
      - link "Engage 2 Dispatch · chat · standups" [ref=e65] [cursor=pointer]:
        - /url: /dispatch
        - img [ref=e66]
        - generic [ref=e69]:
          - generic [ref=e70]:
            - generic [ref=e71]: Engage
            - generic [ref=e72]: "2"
          - generic [ref=e73]: Dispatch · chat · standups
      - link "Improve 4 APO · SEAL · Evals · Autogen" [ref=e74] [cursor=pointer]:
        - /url: /apo
        - img [ref=e75]
        - generic [ref=e77]:
          - generic [ref=e78]:
            - generic [ref=e79]: Improve
            - generic [ref=e80]: "4"
          - generic [ref=e81]: APO · SEAL · Evals · Autogen
      - link "Governance Audit · team · integrations · keys" [ref=e82] [cursor=pointer]:
        - /url: /audit
        - img [ref=e83]
        - generic [ref=e86]:
          - generic [ref=e88]: Governance
          - generic [ref=e89]: Audit · team · integrations · keys
    - generic [ref=e90]:
      - paragraph [ref=e91]: Operating model
      - paragraph [ref=e92]: Retain, retrieve, dispatch, improve
    - generic [ref=e94]:
      - generic [ref=e95]:
        - paragraph [ref=e96]: admin
        - paragraph [ref=e97]: admin
      - button "Sign out" [ref=e98]
  - banner [ref=e99]:
    - generic [ref=e100]:
      - img [ref=e101]
      - textbox "Search memory, knowledge, agents" [ref=e104]:
        - /placeholder: Search memory, knowledge, agents...
      - button "Submit global search" [disabled] [ref=e105]: ⌘ K
    - generic [ref=e106]:
      - 'generic "mem0: fetch failed Graph Memory: Neo4j is not configured; graph memory is NOT storing" [ref=e107]':
        - generic [ref=e109]: STORAGE PANIC · mem0, Graph Memory
      - generic [ref=e111]: Mon 18:48
      - generic [ref=e112]: LC
  - main [ref=e113]:
    - alert [ref=e114]:
      - generic [ref=e115]:
        - generic [ref=e116]:
          - generic [ref=e117]: Storage panic — memory may not be storing
          - paragraph [ref=e118]: One or more storage backends are down or offline. Fix these before trusting recalls, graph facts, or knowledge indexing.
        - link "Open Notebooks / inventory" [ref=e119] [cursor=pointer]:
          - /url: /notebooks
      - list [ref=e120]:
        - listitem [ref=e121]:
          - generic [ref=e122]: mem0down
          - generic [ref=e123]: fetch failed
        - listitem [ref=e124]:
          - generic [ref=e125]: Graph Memorydown
          - generic [ref=e126]: Neo4j is not configured; graph memory is NOT storing
    - generic [ref=e127]:
      - generic [ref=e128]:
        - generic [ref=e129]:
          - generic [ref=e130]: Workflow Map
          - heading "How work actually flows" [level=1] [ref=e131]
          - paragraph [ref=e132]: Sources arrive, MemroOS assembles memory + skills into a context pack, agents act, outcomes loop back as new memory. Edge thickness = live throughput.
        - button "Open in Flow" [ref=e133] [cursor=pointer]
      - generic [ref=e134]:
        - generic [ref=e135]:
          - generic [ref=e136]:
            - generic [ref=e137]: Source feeds
            - generic [ref=e139]: Context assembly
            - generic [ref=e141]: Pack delivered to agent
            - generic [ref=e143]: Outcome captured
            - generic [ref=e145]: Memory loop (outcomes → memory)
            - generic [ref=e147]: click any node for live detail · 9 nodes · 11 edges
          - img "Workflow topology with 9 nodes and 11 edges" [ref=e149]:
            - generic [ref=e150]: SOURCES
            - generic [ref=e151]: GATEWAY
            - generic [ref=e152]: MEMROOS
            - generic [ref=e153]: STORES
            - generic [ref=e154]: AGENTS
            - generic [ref=e165] [cursor=pointer]:
              - generic [ref=e167]: Gateway
              - generic [ref=e168]: Iris preflight
            - generic [ref=e169] [cursor=pointer]:
              - generic [ref=e171]: MemroOS
              - generic [ref=e172]: memory · skills · context packs
              - generic [ref=e173]: capture → consolidate
              - generic [ref=e174]: retrieve → act → improve
            - generic [ref=e175] [cursor=pointer]:
              - generic [ref=e177]: Outcomes → Memory loop
              - generic [ref=e178]: feedback
            - generic [ref=e179] [cursor=pointer]:
              - generic [ref=e181]: Memory
              - generic [ref=e182]: 0 records
            - generic [ref=e183] [cursor=pointer]:
              - generic [ref=e185]: Skills
              - generic [ref=e186]: 0 proposed
            - generic [ref=e187] [cursor=pointer]:
              - generic [ref=e189]: Knowledge
              - generic [ref=e190]: unavailable
            - generic [ref=e191] [cursor=pointer]:
              - generic [ref=e193]: E2E Caps Agent
              - generic [ref=e194]: Capability overflow fixture
            - generic [ref=e196] [cursor=pointer]:
              - generic [ref=e198]: E2E Fixture Agent
              - generic [ref=e199]: Viewport fixture
            - generic [ref=e201] [cursor=pointer]:
              - generic [ref=e203]: E2E Fixture Agent With A Deliberately Long Display Name
              - generic [ref=e204]: Write Episodic Memory And Other Unbounded Capability Text
          - generic [ref=e207]: No connected sources — connect a provider in Settings → Integrations.
        - generic [ref=e210]:
          - generic [ref=e211]: Selected
          - generic [ref=e212]: MemroOS core
          - generic [ref=e213]: Routing + memory + skills assembly + trust preflight
          - link "Open page" [ref=e215] [cursor=pointer]:
            - /url: /
      - generic [ref=e216]:
        - generic [ref=e217]:
          - generic [ref=e218]:
            - img [ref=e219]
            - generic [ref=e222]: Voice & Chat
            - combobox [ref=e223]:
              - option "MemroOS system - E2E Caps Agent" [selected]
              - option "MemroOS system - E2E Fixture Agent"
              - option "MemroOS system - E2E Fixture Agent With A Deliberately Long Display Name"
            - generic [ref=e224]: Capability overflow fixture
          - button "Collapse" [ref=e225]:
            - img [ref=e226]
        - generic [ref=e228]:
          - button "chat" [ref=e229]
          - button "voice" [ref=e230]
        - paragraph [ref=e232]: Ask MemroOS system - E2E Caps Agent what they're working on
        - generic [ref=e233]:
          - textbox "Message MemroOS system - E2E Caps Agent… (Enter to send)" [ref=e234]
          - button "Send" [disabled] [ref=e235]:
            - img [ref=e236]
      - generic [ref=e239]:
        - generic [ref=e240]:
          - generic [ref=e241]: Live Activity
          - generic [ref=e244]: polling every 15s
        - generic [ref=e245]:
          - generic [ref=e246] [cursor=pointer]:
            - generic [ref=e247]: 📚
            - generic [ref=e248]: just now
            - generic [ref=e249]: librarian
            - generic [ref=e250]: === Scanning QMD vector store ===
          - generic [ref=e251] [cursor=pointer]:
            - generic [ref=e252]: 📚
            - generic [ref=e253]: just now
            - generic [ref=e254]: librarian
            - generic [ref=e255]: "QMD search skipped (1): node:internal/modules/cjs/loader:2101"
          - generic [ref=e256] [cursor=pointer]:
            - generic [ref=e257]: 📚
            - generic [ref=e258]: just now
            - generic [ref=e259]: librarian
            - generic [ref=e260]: "QMD search skipped (1): node:internal/modules/cjs/loader:2101"
          - generic [ref=e261] [cursor=pointer]:
            - generic [ref=e262]: 📚
            - generic [ref=e263]: just now
            - generic [ref=e264]: librarian
            - generic [ref=e265]: "QMD search skipped (1): node:internal/modules/cjs/loader:2101"
          - generic [ref=e266] [cursor=pointer]:
            - generic [ref=e267]: 📚
            - generic [ref=e268]: just now
            - generic [ref=e269]: librarian
            - generic [ref=e270]: "QMD: 0 results"
          - generic [ref=e271] [cursor=pointer]:
            - generic [ref=e272]: 🔧
            - generic [ref=e273]: just now
            - generic [ref=e274]: cookbooks
            - generic [ref=e275]: "Proposal written: APO_PROPOSAL_hermes-agent_Hermes-Alba-harness_20260803_180024."
          - generic [ref=e276] [cursor=pointer]:
            - generic [ref=e277]: 🔧
            - generic [ref=e278]: just now
            - generic [ref=e279]: cookbooks
            - generic [ref=e280]: "Proposal written: APO_PROPOSAL_hermes-agent_Hermes-Alba-harness_20260803_180024."
          - generic [ref=e281] [cursor=pointer]:
            - generic [ref=e282]: 🔧
            - generic [ref=e283]: just now
            - generic [ref=e284]: cookbooks
            - generic [ref=e285]: "Proposal written: APO_PROPOSAL_hermes-agent_Hermes-Alba-harness_20260803_180024."
          - generic [ref=e286] [cursor=pointer]:
            - generic [ref=e287]: ⚠️
            - generic [ref=e288]: just now
            - generic [ref=e289]: agents
            - generic [ref=e290]: "→ Hermes/Alba harness failure matching `\\b(ERROR|FATAL|CRITICAL)\\b`"
          - generic [ref=e291] [cursor=pointer]:
            - generic [ref=e292]: ⚠️
            - generic [ref=e293]: just now
            - generic [ref=e294]: agents
            - generic [ref=e295]: "`2026-08-02 23:49:06,816 WARNING gateway.run: Shutdown context: signal=SIGTERM u"
      - generic [ref=e296]:
        - generic [ref=e297]: Source feeds
        - generic [ref=e299]: Context assembly
        - generic [ref=e301]: Pack delivery
        - generic [ref=e303]: Outcomes
        - generic [ref=e305]: Memory loop
  - button "Open Next.js Dev Tools" [ref=e312] [cursor=pointer]:
    - img [ref=e313]
  - alert [ref=e316]
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3002";
  4   | 
  5   | test.describe("Voice & Chat panel — Flow page", () => {
  6   |   test.beforeEach(async ({ page }) => {
  7   |     await page.goto(`${BASE}/flow`);
  8   |     // Wait for the page to finish loading
  9   |     await page.waitForLoadState("networkidle");
  10  |   });
  11  | 
  12  |   test("Voice & Chat panel is visible with agent selector", async ({ page }) => {
  13  |     // Header should say "Voice & Chat"
  14  |     await expect(page.getByText("Voice & Chat")).toBeVisible();
  15  |     // Agent dropdown exists with default "Memroos Floor"
  16  |     const select = page.locator("select").filter({ hasText: "Memroos Floor" });
  17  |     await expect(select).toBeVisible();
  18  |   });
  19  | 
  20  |   test("Chat tab is active by default and shows placeholder", async ({ page }) => {
  21  |     // Chat tab should be active
  22  |     const chatTab = page.getByRole("button", { name: "chat" });
  23  |     await expect(chatTab).toBeVisible();
  24  |     // Textarea placeholder visible
  25  |     await expect(
  26  |       page.getByPlaceholder(/Message Memroos Floor/)
  27  |     ).toBeVisible();
  28  |   });
  29  | 
  30  |   test("Can switch between agents", async ({ page }) => {
  31  |     const select = page.locator("select");
> 32  |     await select.selectOption("flow");
      |                  ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  33  |     await expect(
  34  |       page.getByPlaceholder(/Message Flow/)
  35  |     ).toBeVisible();
  36  |     await select.selectOption("general");
  37  |     await expect(
  38  |       page.getByPlaceholder(/Message General/)
  39  |     ).toBeVisible();
  40  |   });
  41  | 
  42  |   test("Chat tab: send a message and receive a streaming response", async ({ page }) => {
  43  |     // Ensure ANTHROPIC_API_KEY is set — skip gracefully if not
  44  |     const input = page.getByPlaceholder(/Message Memroos Floor/);
  45  |     await input.fill("What is MemroOS in one sentence?");
  46  |     await page.getByRole("button", { name: "Send" }).click();
  47  | 
  48  |     // User bubble appears immediately
  49  |     await expect(page.getByText("What is MemroOS in one sentence?")).toBeVisible();
  50  | 
  51  |     // Assistant bubble appears (streaming — wait up to 15s)
  52  |     await expect(
  53  |       page.locator(".text-xs.rounded-lg").filter({ hasText: "Memroos Floor" }).last()
  54  |     ).toBeVisible({ timeout: 15000 });
  55  |   });
  56  | 
  57  |   test("Voice tab is accessible and shows Pipecat server status", async ({ page }) => {
  58  |     await page.getByRole("button", { name: "voice" }).click();
  59  |     // Should show "Pipecat:" label
  60  |     await expect(page.getByText(/Pipecat:/)).toBeVisible();
  61  |     // Should show connect button (since Pipecat server is running)
  62  |     await expect(
  63  |       page.getByRole("button", { name: /Connect to/ })
  64  |     ).toBeVisible({ timeout: 3000 });
  65  |   });
  66  | 
  67  |   test("Panel can be collapsed and expanded", async ({ page }) => {
  68  |     // Collapse
  69  |     await page.getByLabel("Collapse").click();
  70  |     // Chat tab should be hidden
  71  |     await expect(page.getByRole("button", { name: "chat" })).not.toBeVisible();
  72  |     // Expand
  73  |     await page.getByLabel("Expand").click();
  74  |     await expect(page.getByRole("button", { name: "chat" })).toBeVisible();
  75  |   });
  76  | });
  77  | 
  78  | test.describe("Chat API — /api/chat", () => {
  79  |   test("returns 400 when message is missing", async ({ request }) => {
  80  |     const res = await request.post(`${BASE}/api/chat`, {
  81  |       data: { agentId: "memroos" },
  82  |     });
  83  |     expect(res.status()).toBe(400);
  84  |   });
  85  | 
  86  |   test("streams SSE for a valid message", async ({ request }) => {
  87  |     const res = await request.post(`${BASE}/api/chat`, {
  88  |       data: { message: "Say hi", agentId: "general" },
  89  |     });
  90  |     expect(res.status()).toBe(200);
  91  |     expect(res.headers()["content-type"]).toContain("text/event-stream");
  92  |     const body = await res.text();
  93  |     // Should contain at least one data: line
  94  |     expect(body).toContain("data:");
  95  |   });
  96  | });
  97  | 
  98  | test.describe("Ledger analytics panels", () => {
  99  |   test("Ledger page shows Analytics section with time toggle", async ({ page }) => {
  100 |     await page.goto(`${BASE}/ledger`);
  101 |     await page.waitForLoadState("networkidle");
  102 |     // Window toggle buttons
  103 |     await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
  104 |     await expect(page.getByRole("button", { name: "week" }).first()).toBeVisible();
  105 |     await expect(page.getByRole("button", { name: "month" }).first()).toBeVisible();
  106 |   });
  107 | });
  108 | 
  109 | test.describe("Library analytics panels", () => {
  110 |   test("Library page shows analytics toggle", async ({ page }) => {
  111 |     await page.goto(`${BASE}/library`);
  112 |     await page.waitForLoadState("networkidle");
  113 |     await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
  114 |   });
  115 | });
  116 | 
  117 | test.describe("Cookbooks analytics panels", () => {
  118 |   test("Cookbooks page shows analytics toggle", async ({ page }) => {
  119 |     await page.goto(`${BASE}/cookbooks`);
  120 |     await page.waitForLoadState("networkidle");
  121 |     await expect(page.getByRole("button", { name: "day" }).first()).toBeVisible();
  122 |   });
  123 | });
  124 | 
  125 | test.describe("Audit log panel — Memroos Floor", () => {
  126 |   test("Audit Log panel renders on Memroos Floor page", async ({ page }) => {
  127 |     await page.goto(`${BASE}/`);
  128 |     await page.waitForLoadState("networkidle");
  129 |     await expect(page.getByText("Audit Log")).toBeVisible();
  130 |   });
  131 | });
  132 | 
```