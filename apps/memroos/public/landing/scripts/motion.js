/* ============================================================
   Growth Alchemy Lab — motion engine (vanilla)
   Scroll reveals, number counters, chart draw-in, parallax,
   hero direction switching. Respects reduced-motion + motion-off.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function motionOff() { return document.body.classList.contains('motion-off') || reduceMotion; }

  /* ---------- easing ---------- */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* ---------- number counters ---------- */
  function animateCount(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    var to = parseFloat(el.dataset.count);
    var dur = parseInt(el.dataset.dur || '1400', 10);
    var dec = parseInt(el.dataset.dec || '0', 10);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    if (motionOff()) { el.textContent = prefix + to.toFixed(dec) + suffix; return; }
    var start = performance.now();
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var v = to * easeOut(p);
      el.textContent = prefix + v.toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = prefix + to.toFixed(dec) + suffix;
    }
    requestAnimationFrame(frame);
  }

  /* ---------- chart draw-in ---------- */
  function drawChart(fig) {
    if (fig.dataset.drawn) return;
    fig.dataset.drawn = '1';
    // line: stroke-dashoffset
    fig.querySelectorAll('[data-draw-line]').forEach(function (path) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = motionOff() ? 0 : len;
      if (!motionOff()) {
        path.getBoundingClientRect();
        path.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1)';
        requestAnimationFrame(function(){ path.style.strokeDashoffset = 0; });
      }
    });
    // dots: pop in
    fig.querySelectorAll('[data-draw-dot]').forEach(function (dot, i) {
      if (motionOff()) { dot.style.opacity = 1; return; }
      dot.style.opacity = 0;
      dot.style.transition = 'opacity .4s ease ' + (400 + i * 220) + 'ms, transform .4s ease ' + (400 + i * 220) + 'ms';
      dot.style.transformOrigin = 'center';
      dot.style.transform = 'scale(0)';
      requestAnimationFrame(function(){ dot.style.opacity = 1; dot.style.transform = 'scale(1)'; });
    });
    // bars: grow from baseline
    fig.querySelectorAll('[data-grow-bar]').forEach(function (bar, i) {
      var full = parseFloat(bar.getAttribute('data-h'));
      var baseY = parseFloat(bar.getAttribute('data-basey'));
      if (motionOff()) { bar.setAttribute('height', full); bar.setAttribute('y', baseY - full); return; }
      bar.setAttribute('height', 0); bar.setAttribute('y', baseY);
      bar.style.transition = 'none';
      var delay = 120 + i * 180;
      setTimeout(function () {
        var t0 = performance.now(); var d = 900;
        function f(now){
          var p = Math.min(1, (now - t0)/d); var e = easeOut(p);
          bar.setAttribute('height', full * e);
          bar.setAttribute('y', baseY - full * e);
          if (p < 1) requestAnimationFrame(f);
        }
        requestAnimationFrame(f);
      }, delay);
    });
  }

  /* ---------- intersection observer ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      trigger(el);
      io.unobserve(el);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

  function trigger(el) {
    if (el.classList.contains('reveal') || el.classList.contains('reveal-left')) el.classList.add('in');
    if (el.hasAttribute('data-count')) animateCount(el);
    if (el.hasAttribute('data-chart')) drawChart(el);
    if (el.querySelectorAll) {
      el.querySelectorAll('[data-count]').forEach(animateCount);
    }
  }

  function observeAll() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll('.reveal, .reveal-left, [data-count], [data-chart]').forEach(function (el) {
      // Fallback: anything already in (or near) the viewport fires immediately,
      // so above-the-fold content is never stuck hidden if IO is slow to fire.
      var top = el.getBoundingClientRect().top;
      if (top < vh * 0.92) { trigger(el); io.unobserve(el); }
      else io.observe(el);
    });
  }

  /* ---------- parallax ---------- */
  var parallaxEls = [];
  function collectParallax() {
    parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (!motionOff()) {
        var vh = window.innerHeight;
        parallaxEls.forEach(function (el) {
          var speed = parseFloat(el.dataset.parallax);
          var r = el.getBoundingClientRect();
          var center = r.top + r.height / 2;
          var off = (center - vh / 2) * speed;
          el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
        });
      }
      ticking = false;
    });
  }

  /* ---------- hero direction switcher ---------- */
  function initHeroSwitch() {
    var hero = document.querySelector('[data-hero]');
    var btns = document.querySelectorAll('[data-dir]');
    if (!hero || !btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = b.getAttribute('data-dir');
        hero.setAttribute('data-active-dir', dir);
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
  }

  /* ---------- motion toggle ---------- */
  function initMotionToggle() {
    var t = document.querySelector('[data-motion-toggle]');
    if (!t) return;
    t.addEventListener('click', function () {
      document.body.classList.toggle('motion-off');
      t.classList.toggle('on', !document.body.classList.contains('motion-off'));
      t.querySelector('[data-motion-label]').textContent =
        document.body.classList.contains('motion-off') ? 'Motion off' : 'Motion on';
    });
  }

  /* ---------- live ticking clock-ish event feed (techy texture) ---------- */
  function initEventFeed() {
    var feed = document.querySelector('[data-event-feed]');
    if (!feed) return;
    var events = [
      ['RESEARCH', 'retrieved 14 sources', 'ok'],
      ['HITL', 'budget gate approved', 'gate'],
      ['DRAFT', 'composed 3 variants', 'ok'],
      ['MEMORY', 'wrote 6 curated facts', 'mem'],
      ['HITL', 'consent confirmed', 'gate'],
      ['ACT', 'dispatched to CRM', 'act'],
      ['AUDIT', 'logged 1 decision', 'aud'],
      ['EVAL', 'score 0.94 / pass', 'ok']
    ];
    var i = 0;
    function push() {
      if (motionOff()) return;
      var e = events[i % events.length]; i++;
      var row = document.createElement('div');
      row.className = 'feed-row feed-' + e[2];
      row.innerHTML = '<span class="feed-tag">' + e[0] + '</span><span class="feed-msg">' + e[1] +
        '</span><span class="feed-ts">' + new Date().toLocaleTimeString('en-US', { hour12: false }) + '</span>';
      feed.prepend(row);
      while (feed.children.length > 6) feed.removeChild(feed.lastChild);
    }
    push(); push(); push();
    setInterval(push, 2600);
  }

  /* ---------- mobile menu ---------- */
  function initMenu() {
    var toggle = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('[data-mobile-menu]');
    if (!toggle || !menu) return;
    function setOpen(on) {
      menu.classList.toggle('open', on);
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      toggle.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    }
    toggle.addEventListener('click', function () {
      setOpen(!menu.classList.contains('open'));
    });
    // close when a menu link is tapped, or an ask trigger inside it
    menu.querySelectorAll('a, [data-ask-open]').forEach(function (el) {
      el.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1080) setOpen(false);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    observeAll();
    collectParallax();
    initHeroSwitch();
    initMotionToggle();
    initEventFeed();
    initMenu();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function(){ collectParallax(); onScroll(); });
    onScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
