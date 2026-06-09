/* ============================================================
   Growth Alchemy Lab — 3D knowledge graph (hero Direction B)
   Rotating spatial node field. Drag to rotate, hover to read a
   node, click to focus-in (eases node to front + zooms, lights
   its subgraph in signal red). Canvas + perspective projection.
   ============================================================ */
(function () {
  'use strict';

  var INK = '#0F0F0E', INK6 = '#4A4A45', INK4 = '#9B9B93', INK3 = '#CCCCCC';
  var SIG = '#A8392C', SIGD = '#7A2A1E';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // concept hubs (labelled) + satellites (small) ----------------------------
  var HUBS = [
    { l: 'Memory', accent: true }, { l: 'Runtime', accent: true },
    { l: 'Context', accent: false }, { l: 'Skills', accent: false },
    { l: 'Governance', accent: false }, { l: 'Agents', accent: false },
    { l: 'Research', accent: false }, { l: 'Draft', accent: false },
    { l: 'Act', accent: false }, { l: 'Audit', accent: false },
    { l: 'Session', accent: false }, { l: 'Curated', accent: false },
    { l: 'Tools', accent: false }, { l: 'Evals', accent: false },
    { l: 'Consent', accent: false }, { l: 'Budget', accent: false }
  ];
  var SAT_COUNT = 30;
  var R = 132;

  function fib(n, i) { // fibonacci sphere point
    var phi = Math.acos(1 - 2 * (i + 0.5) / n);
    var theta = Math.PI * (1 + Math.sqrt(5)) * i;
    return {
      x: Math.cos(theta) * Math.sin(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(phi)
    };
  }

  function buildGraph() {
    var nodes = [];
    var total = HUBS.length + SAT_COUNT;
    var hi = 0, si = 0;
    for (var i = 0; i < total; i++) {
      var p = fib(total, i);
      var isHub = i % 3 === 0 && hi < HUBS.length; // interleave hubs
      if (isHub) {
        var h = HUBS[hi++];
        nodes.push({ x: p.x * R, y: p.y * R, z: p.z * R, hub: true, label: h.l, accent: h.accent });
      } else {
        var rr = R * (0.78 + Math.random() * 0.34);
        nodes.push({ x: p.x * rr, y: p.y * rr, z: p.z * rr, hub: false, label: null, accent: false, sat: si++ });
      }
    }
    // any leftover hubs (if interleave didn't place all) -> convert nearest sats
    while (hi < HUBS.length) {
      var n = nodes.find(function (q) { return !q.hub; });
      n.hub = true; n.label = HUBS[hi].l; n.accent = HUBS[hi].accent; hi++;
    }
    // edges: connect each node to 2 nearest neighbours (k-NN) ---------------
    var edges = [], adj = nodes.map(function () { return []; });
    nodes.forEach(function (a, ai) {
      var d = nodes.map(function (b, bi) {
        var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return { bi: bi, dist: dx * dx + dy * dy + dz * dz };
      }).filter(function (o) { return o.bi !== ai; }).sort(function (p, q) { return p.dist - q.dist; });
      var k = a.hub ? 3 : 2;
      for (var j = 0; j < k; j++) {
        var bi = d[j].bi;
        if (!adj[ai].includes(bi)) {
          edges.push([ai, bi]); adj[ai].push(bi); adj[bi].push(ai);
        }
      }
    });
    return { nodes: nodes, edges: edges, adj: adj };
  }

  function initGraph(root) {
    var canvas = root.querySelector('[data-graph-canvas]');
    var focusEl = root.querySelector('[data-graph-focus]');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var G = buildGraph();
    var W = 0, H = 0, cx = 0, cy = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var r = root.getBoundingClientRect();
      W = r.width; H = r.height; cx = W / 2; cy = H / 2;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var ax = -0.35, ay = 0.4;           // current rotation
    var vx = 0, vy = 0;                  // drag velocity
    var auto = 0.0028;                   // auto-rotate speed
    var zoom = 1, zoomT = 1;             // zoom + target
    var focusI = -1;                     // focused node index (click)
    var hoverI = -1;                     // hovered node index
    var taxSet = false, tax = ax, tay = ay; // target rotation for focus-in
    var dragging = false, lastX = 0, lastY = 0, moved = 0;
    var idleResume = 0;

    function project(n) {
      // rotate Y then X
      var cosY = Math.cos(ay), sinY = Math.sin(ay);
      var x1 = n.x * cosY - n.z * sinY;
      var z1 = n.x * sinY + n.z * cosY;
      var y1 = n.y;
      var cosX = Math.cos(ax), sinX = Math.sin(ax);
      var y2 = y1 * cosX - z1 * sinX;
      var z2 = y1 * sinX + z1 * cosX;
      var f = 360;
      var s = (f / (f + z2)) * zoom;
      return { sx: cx + x1 * s, sy: cy + y2 * s, z: z2, s: s };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var P = G.nodes.map(project);
      var focusSet = null;
      var active = focusI >= 0 ? focusI : hoverI;
      if (active >= 0) {
        focusSet = {}; focusSet[active] = 1;
        G.adj[active].forEach(function (i) { focusSet[i] = 1; });
      }
      // edges
      G.edges.forEach(function (e) {
        var a = P[e[0]], b = P[e[1]];
        var inFocus = focusSet && focusSet[e[0]] && focusSet[e[1]];
        var depth = (a.z + b.z) / 2;
        var t = (depth + R) / (2 * R);             // 0 far .. 1 near
        var alpha = 0.10 + t * 0.32;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        if (inFocus) { ctx.strokeStyle = SIG; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.1; }
        else { ctx.strokeStyle = INK3; ctx.globalAlpha = focusSet ? alpha * 0.4 : alpha; ctx.lineWidth = 0.7; }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      // nodes (painter's order: far first)
      var order = G.nodes.map(function (_, i) { return i; }).sort(function (i, j) { return P[i].z - P[j].z; });
      order.forEach(function (i) {
        var n = G.nodes[i], p = P[i];
        var t = (p.z + R) / (2 * R);
        var base = n.hub ? 3.2 : 1.8;
        var rad = (base + t * 2.4) * p.s;
        var dim = focusSet && !focusSet[i];
        var isFocus = (i === active);
        var col = n.accent || isFocus ? SIG : (n.hub ? INK : INK4);
        ctx.globalAlpha = dim ? 0.18 : (0.45 + t * 0.55);
        if (isFocus) {
          ctx.beginPath(); ctx.arc(p.sx, p.sy, rad + 6, 0, 6.2832);
          ctx.strokeStyle = SIG; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(p.sx, p.sy, isFocus ? rad + 1.5 : rad, 0, 6.2832);
        ctx.fillStyle = col; ctx.fill();
        // labels for hubs (near side only) or focused node
        if ((n.hub && t > 0.45 && !dim) || isFocus) {
          ctx.globalAlpha = isFocus ? 1 : 0.35 + t * 0.5;
          ctx.fillStyle = isFocus ? SIGD : INK6;
          ctx.font = (isFocus ? '600 12px' : '500 10.5px') + ' "IBM Plex Sans Condensed", sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.label || '', p.sx + rad + 5, p.sy);
        }
        ctx.globalAlpha = 1;
      });
    }

    function step() {
      // rotation
      if (focusI >= 0 && taxSet) {
        ax += (tax - ax) * 0.08; ay += (tay - ay) * 0.08;
      } else if (dragging) {
        // controlled by pointer
      } else {
        ax += vx; ay += vy;
        vx *= 0.92; vy *= 0.92;
        var resumed = Date.now() > idleResume;
        if (resumed && !reduce && !document.body.classList.contains('motion-off')) ay += auto;
        ax += (-0.32 - ax) * 0.01; // gently settle tilt
      }
      zoom += (zoomT - zoom) * 0.1;
      draw();
      raf = requestAnimationFrame(step);
    }

    // ---- interaction -------------------------------------------------------
    function pick(mx, my) {
      var P = G.nodes.map(project), best = -1, bd = 16 * 16;
      for (var i = 0; i < P.length; i++) {
        var dx = P[i].sx - mx, dy = P[i].sy - my, d = dx * dx + dy * dy;
        var rad = (G.nodes[i].hub ? 6 : 4);
        if (d < Math.max(bd, rad * rad) && d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function setFocusReadout(i) {
      if (!focusEl) return;
      if (i < 0) { focusEl.classList.remove('on'); return; }
      var n = G.nodes[i];
      focusEl.textContent = '● ' + (n.label || ('node ' + (n.sat != null ? n.sat : i))).toUpperCase() + ' · ' + G.adj[i].length + ' links';
      focusEl.classList.add('on');
    }
    function focusOn(i) {
      focusI = i;
      if (i < 0) { zoomT = 1; taxSet = false; setFocusReadout(hoverI); draw(); return; }
      var n = G.nodes[i];
      tay = Math.atan2(n.x, n.z);
      tax = -Math.asin(Math.max(-1, Math.min(1, n.y / R)));
      taxSet = true; zoomT = 1.32;
      setFocusReadout(i); draw();
    }

    function ptr(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; moved = 0; var p = ptr(e); lastX = p.x; lastY = p.y;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = ptr(e);
      if (dragging) {
        var dx = p.x - lastX, dy = p.y - lastY; lastX = p.x; lastY = p.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (focusI >= 0) { focusOn(-1); } // dragging breaks focus
        ay += dx * 0.008; ax += dy * 0.008;
        ax = Math.max(-1.3, Math.min(1.3, ax));
        vy = dx * 0.008; vx = dy * 0.008;
        idleResume = Date.now() + 2600;
        draw();
      } else {
        var i = pick(p.x, p.y);
        var changed = i !== hoverI;
        hoverI = i;
        canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
        if (focusI < 0) setFocusReadout(i);
        if (changed) draw();
      }
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      if (moved < 4) { var p = ptr(e); var i = pick(p.x, p.y); focusOn(i === focusI ? -1 : i); }
      idleResume = Date.now() + 2600;
      draw();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', function () { dragging = false; });
    canvas.addEventListener('pointerleave', function () { if (!dragging) { hoverI = -1; if (focusI < 0) setFocusReadout(-1); canvas.style.cursor = 'grab'; } });

    var raf = 0, ro;
    function start() { if (!raf) raf = requestAnimationFrame(step); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(root); }
    else window.addEventListener('resize', resize);

    // only animate when Direction B is the active hero stage --------------
    var hero = document.querySelector('[data-hero]');
    function sync() {
      var on = !hero || hero.getAttribute('data-active-dir') === 'B';
      if (on) { resize(); draw(); start(); } else stop();
    }
    if (hero) new MutationObserver(sync).observe(hero, { attributes: true, attributeFilter: ['data-active-dir'] });
    sync();
    // draw at least one static frame even if not active (so it's ready)
    draw();
  }

  function boot() {
    document.querySelectorAll('[data-graph3d]').forEach(initGraph);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
