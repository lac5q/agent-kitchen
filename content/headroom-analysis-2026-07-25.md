# Headroom analysis conversation — 2026-07-25

## Context
Following the headroom-permanent-disable work on 2026-07-24, user asked for a thorough
analysis of headroom vs VibeProxy-direct: pros, cons, counterarguments, probabilities,
and a recommended choice. This is the analysis delivered in that turn.

## The two options analyzed

### Option A: Headroom in chain (LLMLingua enabled)
- Headroom at 127.0.0.1:8787, with LLMLingua compression, routing through VibeProxy
  at 127.0.0.1:8318, then Cloudflare tunnel, then upstream Claude API.

### Option B: VibeProxy direct (current state)
- Direct from Hermes/Pi/Codex shell to VibeProxy at 127.0.0.1:8318, then Cloudflare
  tunnel, then upstream. No headroom. (What we set up on 2026-07-24.)

## Option A — pros
1. Caching — repeated tool calls (gh, git status) get near-zero latency
2. Telemetry — built-in dashboard at :8787/dashboard shows volume, cache hit rate,
   compression ratio, model breakdown
3. LLMLingua at low rate (0.1–0.2) saves 10–20% tokens with negligible quality loss
   on simple prompts (factual lookups, code grep, status checks)
4. Cost reduction at higher compression rates

## Option A — cons
1. LLMLingua at 0.67 corrupts subtle prompts — 2/3 of tokens dropped/rewritten
   before the model sees them. Complex reasoning, code generation with long context,
   multi-step planning all degrade
2. Latency adds 200–800ms per request for compression pass. 15s timeout on Hermes
   hook. For batched operations noticeable
3. Single point of failure — Headroom dies, all Claude calls die
4. Stale upstream config — headroom was pointed at dead port 8317. Twice now the
   config has drifted from upstream
5. Auth mismatch risk — headroom may strip or rewrite auth headers; VibeProxy may
   then 401
6. Memory leak / process growth — Python daemon, long-running, accumulates stale
   connections (we saw lingering MCP servers on maeve-u1 after disable)

## Option A — counterarguments (to the cons)
- "Quality is fine at 0.2" — true, but rate is hidden in env blocks; easy to forget
  and crank to 0.5+
- "Caching helps a lot" — true for repetitive tool calls, but Hermes/Pi are getting
  smarter about caching; marginal value is shrinking
- "Latency is small" — true per-call; 200ms × 50 calls = 10s added per agent run
- "Direct is simpler" — yes, but headroom is one more place to misconfigure; we
  misconfigured it 2x this session

## Option A — probability of recurring problem: 70% within 2 months
- Auto-installer wrote the shell env blocks; they came back automatically
- Upstream port changed; the fix didn't
- 2/2 times we've dealt with headroom, the issue was "something out of sync with
  upstream"

## Option B — pros
1. No compression — prompts go to model intact, responses come back intact
2. Lowest latency — one hop (Cloudflare tunnel) ~100–200ms
3. Simple config — shell env exports only, no daemon
4. No extra single point of failure beyond VibeProxy
5. Auth is open on the VPN — no headroom to strip/rewrite headers
6. Reversible — env is just export statements

## Option B — cons
1. No caching — every repeated tool call costs upstream tokens
2. No telemetry dashboard — have to look at Cloudflare tunnel logs or VibeProxy logs
3. No cost-control mechanism at proxy level
4. No mild compression option for token savings

## Option B — counterarguments (to the cons)
- "No caching" — VibeProxy itself may have built-in caching; worth checking
- "No telemetry" — Claude's own dashboard in the Claude app shows usage; headroom
  is duplicative
- "No cost control" — Claude Pro subscription has rate limits; VibeProxy auth
  tokens have quotas; runaway loop concern is hypothetical
- "No mild compression" — Anthropic's prompt caching (now GA) handles the actual
  problem better

## Option B — probability of becoming a problem: 15% within 6 months
- Main risk: VibeProxy itself goes down. Mitigation: Cloudflare tunnel routes
  around VibeProxy availability issues via upstream fallback
- Second risk: Claude Pro auth token expires. Mitigation: re-auth through
  VibeProxy menu bar app
- Both are already-known concerns, not new failure modes

## Recommendation: stay direct (Option B)

### Reasoning
1. Original problem ("maximum API compression") was a symptom; the disease was
   "extra hop in the chain that we forgot was there and let drift." Direct removes
   the disease
2. Headroom's features (caching, telemetry, mild compression) are progressively
   being absorbed into the underlying services — Claude prompt caching, Claude's
   own usage dashboard, VibeProxy's own logging
3. Pain we've felt with headroom (3 misconfigurations this session) outweighs
   the marginal value of its features
4. Reversibility is preserved. 5-step re-enable if you ever want it back

### Counter-arguments I expect
> "But the dashboard is useful, I want to see what I'm spending."

Fair. Two responses:
- VibeProxy itself may have request logs to tail
- If you want a dashboard, install one *after* confirming the rest of the stack is
  solid. Don't bring back the whole stack for one feature

> "What about caching? gh issues list gets called a lot."

Fair concern. Two responses:
- Marginal cost of `gh issues list` is tiny — few hundred tokens
- If caching becomes a real cost driver, evaluate Redis or Cloudflare Worker cache,
  not re-introduce headroom

## If you want a 4th option

Option E (hybrid): keep VibeProxy direct, but install a **read-only** request
logger at the shell level (a small wrapper script that logs every Claude call to
a JSONL file). Headroom-style observability without compression or routing risk.
~30 lines of bash.

## Bottom line
Stay direct. Right choice for this stack given the failure mode we've experienced.
- Probability of regretting direct within 6 months: < 20%
- Probability of regretting re-enabling headroom: > 60%

## User follow-up
User asked to save the conversation. No built-in tool for that in this environment,
so this note is the durable record at:
  /tmp/headroom-analysis-2026-07-25.md

(Also potentially to be moved to ~/github/memroos/content/ for permanent record.)
