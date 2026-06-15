/* ============================================================
   MemroOS — Ask MemroOS (LLM)
   Same engine as the Lab's "Ask" surface, regrounded on the
   MemroOS product. Powers the header command palette (⌘K) and
   the below-fold ask band. Grounded, plain, concise answers.
   ============================================================ */
(function () {
  'use strict';

  var CONTEXT = [
    "You are the assistant for MemroOS, company-owned memory and governance for agent harnesses at memroos.com.",
    "What it is: company-owned context, permissions, evals, dispatch, and proof for product, sales, engineering, and AI operations agents, with an operator console (NOC) for memory, orchestration, skills, dispatch, evals, and trust. It is local-first and self-hosted, not a chatbot wrapper, a passive knowledge base, or another agent framework.",
    "The operating loop is five verbs: RETAIN (capture decisions, files, calls, incidents, customer context, and outcomes into a governed memory layer), RETRIEVE (assemble a permission-aware context pack before an agent starts), DISPATCH (send work to local, REST, MCP, or A2A agents with source-backed context), GOVERN (pause, inspect, edit, resume, retry, and roll back long-running work with audit lineage, security, and residual-risk proof), and IMPROVE (promote repeated successful workflows into durable governed skills).",
    "Memory model is multi-tier: vector, graph, episodic, knowledge, and skill surfaces, each with provenance.",
    "Who it serves: product teams (discovery, launch, roadmap, customer context), sales teams (account history, objections, competitive context, follow-up), engineering teams (architecture decisions, incidents, repo patterns, fixes, tests, runbooks), and AI operations teams (agent registry, capability policy, auth posture, security findings, local footprint, eval history).",
    "Proof: ranked first on the public-evidence agentic-memory benchmark with a score of 84.06; the latest validation passed 1079 tests with zero failures; 4.47 GB of local footprint is mapped by permanence, cloud target, and prune safety.",
    "Interop: Claude Code (MCP), Codex, Google ADK, LangGraph, CrewAI, AutoGen, the A2A protocol, and a REST API.",
    "Stance: memory should be visible as retained and consumed context, not hidden infrastructure; dispatch should prove what an agent actually received; governance should show evidence, lineage, and residual risk in language an operator can act on.",
    "Tone: editorial, precise, senior, plain language. No hype, no emoji."
  ].join(" ");

  var STYLE = "Answer the visitor's question in their words, grounded ONLY in the context above. Be specific and concrete. 2-4 short paragraphs max, or a short intro plus a tight bullet list. Use **bold** for key terms. If asked about pricing or specifics not in context, say it's best covered on a short working session. Invite them to schedule a working session only when it fits naturally. Never invent client names, numbers, or guarantees.";

  var SUGGESTIONS = [
    "What is agent memory and why does it matter?",
    "How does the retain \u2192 retrieve \u2192 dispatch \u2192 govern \u2192 improve loop work?",
    "How do you keep long-running agent work governable?",
    "How does MemroOS work with Claude Code over MCP?",
    "What do the memory tiers actually store?",
    "How is MemroOS different from a vector database?"
  ];

  function available() { return !!(window.claude && typeof window.claude.complete === 'function'); }

  function ask(question) {
    var prompt = CONTEXT + "\n\n" + STYLE + "\n\nVisitor question: \"" + question + "\"\n\nAnswer:";
    if (!available()) { return Promise.resolve(FALLBACK(question)); }
    return window.claude.complete({ messages: [{ role: 'user', content: prompt }] })
      .then(function (t) { return (t || '').trim() || FALLBACK(question); })
      .catch(function () { return FALLBACK(question); });
  }

  function FALLBACK() {
    return "MemroOS gives teams **company-owned memory** and **governed harness control**: it retains what your team learns, retrieves the right **context pack** before an agent starts, dispatches work with source-backed context, governs the run with audit lineage, and promotes repeated work into durable **skills**.\n\nThe live answer engine isn't reachable in this view \u2014 but this is exactly the kind of question worth a short **working session**, where we map one workflow where your agents keep rediscovering the same context.";
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  }
  function render(text) {
    var lines = text.replace(/\r/g, '').split('\n');
    var html = '', list = null;
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (/^[-*\u2022]\s+/.test(t)) {
        if (!list) { list = ''; }
        list += '<li>' + inline(t.replace(/^[-*\u2022]\s+/, '')) + '</li>';
        return;
      }
      if (list) { html += '<ul>' + list + '</ul>'; list = null; }
      if (t) html += '<p>' + inline(t) + '</p>';
    });
    if (list) html += '<ul>' + list + '</ul>';
    return html || '<p>' + inline(text) + '</p>';
  }

  function typeOut(el, text, done) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off');
    if (reduce) { el.innerHTML = render(text); if (done) done(); return; }
    var i = 0, n = text.length;
    el.innerHTML = '<span class="ask-cursor"></span>';
    var step = Math.max(1, Math.round(n / 140));
    function tick() {
      i = Math.min(n, i + step + Math.floor(Math.random() * 2));
      el.innerHTML = render(text.slice(0, i)) + (i < n ? '<span class="ask-cursor"></span>' : '');
      var body = el.closest('.ap-body');
      if (body) body.scrollTop = body.scrollHeight;
      if (i < n) setTimeout(tick, 16); else if (done) done();
    }
    tick();
  }

  function thinkingHTML() { return '<span class="ask-thinking">Consulting MemroOS<i></i><i></i><i></i></span>'; }
  function bookCTA() {
    return '<div class="ask-followup"><a class="btn btn--solid" href="https://calendar.google.com/calendar/appointments/schedules/AcZssZ2JkygvmpuopbcqA_NAPJZDRp0RfmZGa2x_w_oV_dFm-cYVGEyEYG9vy80meCKZzyianVC6P2vJ" target="_blank" rel="noopener">Schedule a working session <span class="arr">\u2197</span></a><span class="note">Bring one workflow your agents keep relearning.</span></div>';
  }

  function runInto(thread, scroller, question) {
    var q = document.createElement('p'); q.className = 'ask-q'; q.textContent = question;
    var a = document.createElement('div'); a.className = 'ask-a'; a.innerHTML = thinkingHTML();
    thread.appendChild(q); thread.appendChild(a);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    return ask(question).then(function (text) {
      typeOut(a, text, function () {
        var cta = document.createElement('div'); cta.innerHTML = bookCTA();
        thread.appendChild(cta.firstChild);
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
    });
  }

  function initOverlay() {
    var triggers = document.querySelectorAll('[data-ask-open]');
    if (!triggers.length) return;
    var overlay = document.createElement('div');
    overlay.className = 'ask-overlay';
    overlay.innerHTML =
      '<div class="ask-panel" role="dialog" aria-modal="true" aria-label="Ask MemroOS">' +
        '<div class="ap-top">' +
          '<img class="ap-mark" src="/landing/assets/memroos-mark.svg" alt="" />' +
          '<input class="ap-input" type="text" placeholder="Ask MemroOS anything\u2026" aria-label="Ask MemroOS" />' +
          '<button class="ap-esc" type="button">ESC</button>' +
        '</div>' +
        '<div class="ap-body">' +
          '<p class="ask-suggest-lab">Try asking</p>' +
          '<div class="ask-suggest"></div>' +
          '<div class="ask-thread"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector('.ap-input');
    var suggest = overlay.querySelector('.ask-suggest');
    var thread = overlay.querySelector('.ask-thread');
    var body = overlay.querySelector('.ap-body');
    var busy = false;

    SUGGESTIONS.forEach(function (s) {
      var b = document.createElement('button'); b.className = 'ask-chip'; b.type = 'button'; b.textContent = s;
      b.addEventListener('click', function () { input.value = s; submit(); });
      suggest.appendChild(b);
    });

    function open() {
      overlay.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
      setTimeout(function () { input.focus(); }, 40);
    }
    function close() {
      overlay.classList.remove('open');
      document.documentElement.style.overflow = '';
    }
    function submit() {
      var q = input.value.trim();
      if (!q || busy) return;
      busy = true; input.value = '';
      var lab = overlay.querySelector('.ask-suggest-lab');
      if (lab) lab.style.display = 'none';
      suggest.style.display = 'none';
      runInto(thread, body, q).then(function () { busy = false; input.focus(); });
    }

    triggers.forEach(function (t) { t.addEventListener('click', open); });
    overlay.querySelector('.ap-esc').addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.classList.contains('open')) close();
        else open();
      }
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  function initBand() {
    var band = document.querySelector('[data-ask-band]');
    if (!band) return;
    var form = band.querySelector('.ask-form');
    var input = band.querySelector('input');
    var btn = band.querySelector('button');
    var suggest = band.querySelector('.ask-suggest');
    var thread = band.querySelector('.ask-thread');
    var busy = false;

    SUGGESTIONS.slice(0, 4).forEach(function (s) {
      var b = document.createElement('button'); b.className = 'ask-chip'; b.type = 'button'; b.textContent = s;
      b.addEventListener('click', function () { input.value = s; submit(); });
      suggest.appendChild(b);
    });

    function submit() {
      var q = input.value.trim();
      if (!q || busy) return;
      busy = true; btn.disabled = true; input.value = '';
      runInto(thread, null, q).then(function () { busy = false; btn.disabled = false; });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  }

  function boot() { initOverlay(); initBand(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
