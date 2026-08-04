# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: voice-chat.spec.ts >> Audit log panel — Memroos Floor >> Audit Log panel renders on Memroos Floor page
- Location: e2e/voice-chat.spec.ts:126:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Audit Log')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Audit Log')

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
      - generic [ref=e111]: Mon 18:49
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
    - navigation "Section navigation" [ref=e127]:
      - link "NOC" [ref=e128] [cursor=pointer]:
        - /url: /
      - link "Ledger" [ref=e129] [cursor=pointer]:
        - /url: /ledger
      - link "Business Ops" [ref=e130] [cursor=pointer]:
        - /url: /business-ops
    - generic [ref=e131]:
      - generic [ref=e133]:
        - generic [ref=e134]:
          - generic [ref=e135]:
            - generic [ref=e137]: Operations · live telemetry
            - generic [ref=e138]: explicit gaps shown
          - heading "Agent NOC" [level=1] [ref=e139]
          - generic [ref=e140]: Run the agent fleet like infrastructure. Panels use live local sources where available; missing streams render explicit gaps instead of fabricated numbers.
        - generic [ref=e141]:
          - link "Ledger · 24h/all" [ref=e142] [cursor=pointer]:
            - /url: /ledger?from_window=24h&from_workspace=all&from_scope_note=Ledger+has+its+own+date-range+selector+%E2%80%94+current+NOC+window+is+shown+on+the+destination+for+reference+only.
          - link "Memory · 24h/all" [ref=e143] [cursor=pointer]:
            - /url: /notebooks?from_window=24h&from_workspace=all&from_scope_note=Memory+page+has+its+own+filters+%E2%80%94+current+NOC+window%2Fworkspace+is+shown+on+the+destination+for+reference+only.
          - link "Dispatch · 24h/all" [ref=e144] [cursor=pointer]:
            - /url: /dispatch?from_window=24h&from_workspace=all&from_scope_note=Dispatch+page+has+its+own+filters+%E2%80%94+current+NOC+window%2Fworkspace+is+shown+on+the+destination+for+reference+only.
          - link "Governance · 24h/all" [ref=e145] [cursor=pointer]:
            - /url: /audit?from_window=24h&from_workspace=all&from_scope_note=Audit+page+has+its+own+filters+%E2%80%94+current+NOC+window%2Fworkspace+is+shown+on+the+destination+for+reference+only.
          - generic [ref=e146]:
            - generic [ref=e147]: Date
            - combobox "NOC date range" [ref=e148]:
              - option "Last 24h" [selected]
              - option "Last 7d"
              - option "Last 30d"
          - generic [ref=e149]:
            - generic [ref=e150]: Workspace
            - combobox "NOC workspace" [ref=e151]:
              - option "All" [selected]
              - option "Local"
              - option "Remote"
          - generic [ref=e152]:
            - checkbox "Show advanced" [ref=e153]
            - generic [ref=e154]: Show advanced
          - button "Export report" [ref=e155]
      - region "System pulse" [ref=e157]:
        - generic [ref=e158]:
          - generic [ref=e159]:
            - generic [ref=e160]:
              - generic [ref=e161]: Messages · 24h
              - generic [ref=e162]: live
            - generic [ref=e163]: "33"
            - generic [ref=e164]: Message traffic in the selected window and workspace.
            - generic [ref=e165]: "source: sqlite://messages · observed 2026-08-04 01:49:16Z"
          - generic [ref=e166]:
            - generic [ref=e167]:
              - generic [ref=e168]: Memory writes · 24h
              - generic [ref=e169]: unavailable
            - generic [ref=e170]: —
            - generic [ref=e171]: No memory writes in last 24 hours. Successful consolidation populates this signal; widen the window if you expect older writes.
            - generic [ref=e172]: "source: /api/time-series?metric=memory_writes&window=day · observed 2026-08-04 01:49:59Z"
          - generic [ref=e173]:
            - generic [ref=e174]:
              - generic [ref=e175]: Cron health
              - generic [ref=e176]: live
            - generic [ref=e177]: clear
            - generic [ref=e178]: No active cron warnings in the current health snapshot.
            - generic [ref=e179]: "source: sqlite://cron_health_jobs"
          - generic [ref=e180]:
            - generic [ref=e181]:
              - generic [ref=e182]: Skills enabled
              - generic [ref=e183]: unavailable
            - generic [ref=e184]: —
            - generic [ref=e185]: No enabled skills yet. Enable a registry skill to populate this current snapshot.
            - generic [ref=e186]: "source: sqlite://skill_registry"
          - generic [ref=e187]:
            - generic [ref=e188]:
              - generic [ref=e189]: Active models · 24h
              - generic [ref=e190]: live
            - generic [ref=e191]: "3"
            - generic [ref=e192]: Models with measured requests or tokens in last 24 hours.
            - generic [ref=e193]: "source: /api/model-usage · observed 2026-08-04 01:50:00Z"
          - generic [ref=e194]:
            - generic [ref=e195]:
              - generic [ref=e196]: Last activity
              - generic [ref=e197]: live
            - generic [ref=e198]: 2026-08-04 01:49:16Z
            - generic [ref=e199]: Message traffic in the selected window and workspace.
            - generic [ref=e200]: "source: sqlite://messages · observed 2026-08-04 01:49:16Z"
      - region "Attention" [ref=e202]:
        - generic [ref=e203]:
          - generic [ref=e204]:
            - generic [ref=e205]: Attention
            - generic [ref=e206]: 10 items
            - button "Expand" [ref=e207]
          - generic [ref=e208]:
            - generic [ref=e209]:
              - generic [ref=e211]:
                - generic [ref=e212]: "Security finding: memory_policy_decision"
                - generic [ref=e213]: graph:neighbor:blocked-neighbor
              - generic [ref=e214]: 2026-08-04 01:49:15Z
              - link "Open" [ref=e215] [cursor=pointer]:
                - /url: /audit
            - generic [ref=e216]:
              - generic [ref=e218]:
                - generic [ref=e219]: "Security finding: memory_policy_decision"
                - generic [ref=e220]: vector:m1
              - generic [ref=e221]: 2026-08-04 01:49:14Z
              - link "Open" [ref=e222] [cursor=pointer]:
                - /url: /audit
            - generic [ref=e223]:
              - generic [ref=e225]:
                - generic [ref=e226]: "Security finding: memory_policy_decision"
                - generic [ref=e227]: vector:private
              - generic [ref=e228]: 2026-08-04 01:49:14Z
              - link "Open" [ref=e229] [cursor=pointer]:
                - /url: /audit
            - generic [ref=e230]: 7 more attention items hidden — expand to inspect.
      - generic [ref=e232]:
        - generic [ref=e233]:
          - generic [ref=e234]:
            - generic [ref=e235]: Memory activity · last 24 hours
            - generic [ref=e236]: window=24h, workspace=all. Inventory and consolidation counts come from the filtered /api/memory-stats response. Activity timing is shown only for workspace=all because /api/time-series cannot partition by workspace. Tier backend health is a current global operational snapshot.
          - generic [ref=e238]:
            - generic [ref=e241]: Writes
            - generic [ref=e244]: Recall
            - generic [ref=e245]: series live
            - generic [ref=e246]: window=24h/workspace=all
        - generic [ref=e247]: Memory is live for window=24h, workspace=all; filtered inventory exists, but no activity timing buckets were returned.
        - generic [ref=e248]:
          - generic [ref=e249]:
            - generic [ref=e250]:
              - generic [ref=e251]: Tier rows
              - generic [ref=e252]: live
            - generic [ref=e254]: "0"
            - generic [ref=e255]: selected window/workspace count (not cumulative) · 24h/all
          - generic [ref=e256]:
            - generic [ref=e257]:
              - generic [ref=e258]: High/pinned
              - generic [ref=e259]: live
            - generic [ref=e261]: "0"
            - generic [ref=e262]: filtered tier snapshot · 24h/all
          - generic [ref=e263]:
            - generic [ref=e264]:
              - generic [ref=e265]: Low tier
              - generic [ref=e266]: live
            - generic [ref=e268]: "0"
            - generic [ref=e269]: filtered tier snapshot · 24h/all
          - generic [ref=e270]:
            - generic [ref=e271]:
              - generic [ref=e272]: Pending consolidation
              - generic [ref=e273]: unavailable
            - generic [ref=e275]: —
            - generic [ref=e276]: current snapshot, window=24h, workspace=all
        - generic [ref=e277]:
          - generic [ref=e278]:
            - generic [ref=e279]: Tier health
            - generic [ref=e280]: error
          - generic [ref=e281]:
            - generic [ref=e282]:
              - generic [ref=e283]:
                - generic [ref=e284]: vector
                - generic [ref=e285]: down
              - generic [ref=e286]: mem0-qdrant
            - generic [ref=e287]:
              - generic [ref=e288]:
                - generic [ref=e289]: graph
                - generic [ref=e290]: not configured
              - generic [ref=e291]: neo4j
            - generic [ref=e292]:
              - generic [ref=e293]:
                - generic [ref=e294]: episodic
                - generic [ref=e295]: up
              - generic [ref=e296]: sqlite · 0 rows
          - generic [ref=e297]: "source: /api/memory/health · global backend liveness; window and workspace filters do not alter this operational check."
      - generic [ref=e298]:
        - generic [ref=e300]:
          - generic [ref=e301]:
            - generic [ref=e302]:
              - generic [ref=e303]: Agent activity · last 24 hours
              - generic [ref=e304]: Per-agent message traffic from sqlite://messages.
            - generic [ref=e306]:
              - generic [ref=e307]: 1 agent
              - generic [ref=e308]: live
          - generic [ref=e310]:
            - generic [ref=e311]: test-agent
            - generic [ref=e312]: 33 msg · 16 ses · 2026-08-04 01:49:16Z
          - generic [ref=e313]: "source: sqlite://messages · state: live · observed 2026-08-04 01:49:16Z"
        - generic [ref=e314]:
          - generic [ref=e315]:
            - generic [ref=e316]:
              - generic [ref=e317]: Model utility · last 24 hours
              - generic [ref=e318]: Measured model-routing ledger rows filtered by window=24h, workspace=all.
            - generic [ref=e320]:
              - generic [ref=e321]: no_history
              - link "Re-route" [ref=e322] [cursor=pointer]:
                - /url: /ledger
          - generic [ref=e323]: No model utility history yet for workspace=all. The first routed model request populates this panel.
          - generic [ref=e324]: "source: sqlite://model_routing_events · filters: 24h/all"
        - generic [ref=e325]:
          - generic [ref=e326]:
            - generic [ref=e327]:
              - generic [ref=e328]: Activity timing · last 24 hours
              - generic [ref=e329]: Message and memory-write activity honors window=24h, workspace=all. Cells show weekday/hour concentration, not fabricated session capture.
            - generic [ref=e331]: live
          - generic [ref=e333]:
            - img [ref=e334]
            - generic [ref=e503]:
              - generic [ref=e504]: "00"
              - generic [ref=e505]: "06"
              - generic [ref=e506]: "12"
              - generic [ref=e507]: "18"
              - generic [ref=e508]: "24"
          - generic [ref=e509]: 33 messages · 0 memory writes in the selected window
      - generic [ref=e511]:
        - generic [ref=e512]:
          - generic [ref=e513]:
            - generic [ref=e514]: Cost · last 24 hours
            - generic [ref=e515]: Spend, requests, and token usage come from model-routing ledger rows and are filtered together by window=24h, workspace=all. Spend remains withheld when any selected row lacks estimatedCostUsd.
          - generic [ref=e517]:
            - generic [ref=e518]: blocked
            - generic [ref=e519]: no_history
            - generic [ref=e520]: window=24h/workspace=all
        - generic [ref=e521]:
          - generic [ref=e522]: Measured spend
          - generic [ref=e523]: —
        - generic [ref=e524]: "No spend history yet for workspace=all. Model-routing ledger rows with estimated cost populate this panel. Try: run an agent task."
        - generic [ref=e525]:
          - generic [ref=e526]: Per-model usage
          - generic [ref=e527]: No per-model usage history in last 24 hours for workspace=all. The first model request populates this list.
        - generic [ref=e528]: "source: sqlite://model_routing_events · filters: 24h/all"
      - generic [ref=e529]:
        - generic [ref=e530]:
          - generic [ref=e531]:
            - generic [ref=e532]:
              - generic [ref=e533]: Governance & trust
              - generic [ref=e534]: Global governance snapshot across all workspaces. Window=24h is context only because audit feeds are not time-windowed.
            - generic [ref=e536]: live
          - generic [ref=e537]:
            - generic [ref=e538]:
              - generic [ref=e539]: Blocked attempts
              - generic [ref=e540]: live
              - generic [ref=e541]: "1"
              - generic [ref=e542]: security report · measured · /api/security/report
            - generic [ref=e543]:
              - generic [ref=e544]: HIL approvals
              - generic [ref=e545]: measured zero
              - generic [ref=e546]: "0"
              - generic [ref=e547]: pending source · measured zero · /api/orchestration/hil
            - generic [ref=e548]:
              - generic [ref=e549]: Security events
              - generic [ref=e550]: live
              - generic [ref=e551]: "8"
              - generic [ref=e552]: loaded window · measured · /api/security/report
            - generic [ref=e553]:
              - generic [ref=e554]: Audit lines
              - generic [ref=e555]: live
              - generic [ref=e556]: "8"
              - generic [ref=e557]: recent · measured · /api/audit-log
          - generic [ref=e558]:
            - generic [ref=e559]: Recent governance events
            - generic [ref=e560]:
              - generic [ref=e561]:
                - generic [ref=e562]: 06:49 PM
                - generic [ref=e563]: memory_policy_decision
                - generic [ref=e564]: api:memory-graph · graph:parent
              - generic [ref=e565]:
                - generic [ref=e566]: 06:49 PM
                - generic [ref=e567]: memory_policy_decision
                - generic [ref=e568]: api:memory-graph · graph:neighbor:allowed-neighbor
              - generic [ref=e569]:
                - generic [ref=e570]: 06:49 PM
                - generic [ref=e571]: memory_policy_decision
                - generic [ref=e572]: api:memory-graph · graph:neighbor:blocked-neighbor
              - generic [ref=e573]:
                - generic [ref=e574]: 06:49 PM
                - generic [ref=e575]: memory_policy_decision
                - generic [ref=e576]: api:memory-search · vector:42
        - generic [ref=e578]:
          - generic [ref=e579]:
            - generic [ref=e580]: Skills lifecycle
            - generic [ref=e581]: 0 total · 0 approved · 0 coverage gaps · 0 drifting
            - generic [ref=e582]:
              - generic [ref=e583]: measured zero
              - generic [ref=e584]: window_empty
              - link "SEAL proposals · 0" [ref=e585] [cursor=pointer]:
                - /url: /seal
              - link "Promote candidate" [ref=e586] [cursor=pointer]:
                - /url: /skills
          - generic [ref=e587]: "Scope: skill rows and pending SEAL proposals filtered by window=24h, workspace=all. 366 skill records exist in the widest same-workspace probe; registry last touched 2026-04-13T01:00:19.451900."
          - generic [ref=e588]:
            - generic [ref=e589]:
              - generic [ref=e590]:
                - generic [ref=e592]: Emerging
                - generic [ref=e593]: "0"
              - generic [ref=e594]:
                - generic [ref=e595]: No emerging skill records in the loaded registry snapshot, but the registry has prior activity outside the selected window. Widen the window or check /skills for older entries.
                - generic [ref=e596]: agent-limited skills and coverage gaps
            - generic [ref=e597]:
              - generic [ref=e598]:
                - generic [ref=e600]: Live
                - generic [ref=e601]: "0"
              - generic [ref=e602]:
                - generic [ref=e603]: No live skill records in the loaded registry snapshot, but the registry has prior activity outside the selected window. Widen the window or check /skills for older entries.
                - generic [ref=e604]: general skills approved for reuse
            - generic [ref=e605]:
              - generic [ref=e606]:
                - generic [ref=e608]: Drifting
                - generic [ref=e609]: "0"
              - generic [ref=e610]:
                - generic [ref=e611]: No drifting skill records in the loaded registry snapshot, but the registry has prior activity outside the selected window. Widen the window or check /skills for older entries.
                - generic [ref=e612]: coverage gaps or needs-source health
            - generic [ref=e613]:
              - generic [ref=e614]:
                - generic [ref=e616]: Enterprise
                - generic [ref=e617]: "0"
              - generic [ref=e618]:
                - generic [ref=e619]: No enterprise skill records in the loaded registry snapshot, but the registry has prior activity outside the selected window. Widen the window or check /skills for older entries.
                - generic [ref=e620]: enterprise-ready or approved candidates
  - button "Open Next.js Dev Tools" [ref=e626] [cursor=pointer]:
    - img [ref=e627]
  - alert [ref=e630]
```

# Test source

```ts
  29  | 
  30  |   test("Can switch between agents", async ({ page }) => {
  31  |     const select = page.locator("select");
  32  |     await select.selectOption("flow");
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
> 129 |     await expect(page.getByText("Audit Log")).toBeVisible();
      |                                               ^ Error: expect(locator).toBeVisible() failed
  130 |   });
  131 | });
  132 | 
```