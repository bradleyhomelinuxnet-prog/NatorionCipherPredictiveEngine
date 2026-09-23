/* NATORION · ui/chart.js — the timeline, drawn on a canvas.

   X-Dates stand as gold verticals; each Z-Date rises from the axis to a height
   set by its score, capped by a glyph whose shape counts its hits (circle 1,
   triangle 2, diamond 3, star 4+). The selected Z-Date shows its derivation:
   an arc from every X-Date that projects onto it. Moon phases and eclipses sit
   in a lane under the axis. Wheel or pinch zooms, drag pans, double-click fits. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var DAY = 86400000;

  var cv, ctx, tip, data = null, view = null, dpr = 1, W = 0, H = 0;
  var handlers = { select: function () {}, open: function () {} };
  var hoverKey = null;
  var M = { l: 14, r: 14, t: 18, axis: 54, lane: 26 };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#d8a943"; }

  function init(canvas, tipEl, on) {
    cv = canvas; ctx = cv.getContext("2d"); tip = tipEl;
    handlers.select = on.select || handlers.select; handlers.open = on.open || handlers.open;
    var ro = new ResizeObserver(function () { resize(); draw(); });
    ro.observe(cv.parentNode);
    wire();
    resize();
  }

  function resize() {
    var r = cv.parentNode.getBoundingClientRect();
    dpr = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
  }

  function extent() {
    var pts = [];
    if (!data) return null;
    data.xs.forEach(function (x) { if (x.enabled) pts.push(x.ms); });
    data.zs.forEach(function (z) { pts.push(z.start); });
    if (!pts.length) return null;
    var a = Math.min.apply(null, pts), b = Math.max.apply(null, pts);
    if (b - a < 20 * DAY) { a -= 10 * DAY; b += 10 * DAY; }
    var pad = (b - a) * 0.05;
    return { t0: a - pad, t1: b + pad };
  }

  function set(d, keepView) {
    var hadData = !!data;
    data = d;
    if (!keepView || !view || !hadData) view = extent();
    draw();
  }
  function fit() { view = extent(); draw(); }

  function xOf(ms) { return M.l + (ms - view.t0) / (view.t1 - view.t0) * (W - M.l - M.r); }
  function msOf(x) { return view.t0 + (x - M.l) / (W - M.l - M.r) * (view.t1 - view.t0); }
  function baseY() { return H - M.axis; }

  /* ------------------------------------------------------------- ticks -- */
  function ticks() {
    var span = view.t1 - view.t0, px = W - M.l - M.r, out = [], d0 = new Date(view.t0);
    var years = span / (365.25 * DAY);
    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (years > 4) {
      var step = [1, 2, 5, 10, 19, 25, 50, 100, 138, 250, 500, 1000].find(function (s) { return px / (years / s) > 70; }) || 1000;
      for (var y = Math.ceil(d0.getUTCFullYear() / step) * step; ; y += step) {
        var t = Date.UTC(2000, 0, 1); var dt = new Date(t); dt.setUTCFullYear(y); t = dt.getTime();
        if (t > view.t1) break;
        out.push({ ms: t, label: String(y), major: true });
      }
    } else if (span > 45 * DAY) {
      var months = span / (30.44 * DAY), mstep = [1, 2, 3, 6, 12].find(function (s) { return px / (months / s) > 64; }) || 12;
      var y2 = d0.getUTCFullYear(), m2 = d0.getUTCMonth();
      m2 = Math.ceil(m2 / mstep) * mstep;
      for (var i = 0; i < 400; i++) {
        var tt = Date.UTC(y2, m2, 1);
        if (tt > view.t1) break;
        var dd = new Date(tt);
        if (tt >= view.t0) out.push({ ms: tt, label: dd.getUTCMonth() === 0 ? String(dd.getUTCFullYear()) : MN[dd.getUTCMonth()], major: dd.getUTCMonth() === 0 });
        m2 += mstep;
      }
    } else {
      var days = span / DAY, dstep = [1, 2, 7, 14].find(function (s) { return px / (days / s) > 56; }) || 14;
      var start = Math.ceil(view.t0 / DAY) * DAY;
      for (var k = start; k <= view.t1; k += dstep * DAY) {
        var d3 = new Date(k);
        out.push({ ms: k, label: d3.getUTCDate() === 1 || k === start ? MN[d3.getUTCMonth()] + " " + d3.getUTCDate() : String(d3.getUTCDate()), major: d3.getUTCDate() === 1 });
      }
    }
    return out;
  }

  /* -------------------------------------------------------------- glyphs -- */
  function glyph(x, y, hits, r) {
    ctx.beginPath();
    if (hits <= 1) ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    else if (hits === 2) { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.75); ctx.lineTo(x - r * 0.95, y + r * 0.75); ctx.closePath(); }
    else if (hits === 3) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else {
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r * 1.15;
        ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
    }
  }

  // A moon at elongation `lon` degrees: 0 new, 90 first quarter, 180 full.
  function moonGlyph(x, y, r, lon) {
    var lit = "#efe3bd", dark = "#23222c", frac = lon / 360;
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    var rx = Math.abs(Math.cos(2 * Math.PI * frac)) * r, waxing = frac < 0.5, gibbous = frac > 0.25 && frac < 0.75;
    if (frac === 0) { ctx.strokeStyle = lit; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); return; }
    ctx.fillStyle = lit; ctx.beginPath();
    // The lit limb: the right half while waxing, the left while waning.
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
    // The terminator, an ellipse of half-width rx, bulging toward the dark side when gibbous.
    ctx.ellipse(x, y, Math.max(rx, 0.01), r, 0, Math.PI / 2, -Math.PI / 2, waxing ? !gibbous : gibbous);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  function eclipseGlyph(x, y, r, body, total, red) {
    if (body === "solar") {
      ctx.fillStyle = "#f3d27a"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#08080d"; ctx.beginPath(); ctx.arc(total ? x : x + r * 0.45, y, r * (total ? 0.78 : 0.85), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = total ? red : "#efe3bd"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (!total) { ctx.fillStyle = red; ctx.beginPath(); ctx.arc(x - r * 0.5, y, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function zColor(z) {
    if (!z.best) return css("--gold");
    return z.best === "vortex" ? css("--msrf-vortex") : z.best === "important" ? css("--msrf-important") : css("--msrf-normal");
  }

  /* ---------------------------------------------------------------- draw -- */
  var layout = [];
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    layout = [];
    var ink = css("--ink"), dim = css("--dim"), line = css("--line"), gold = css("--gold"), gold2 = css("--gold-2"), red = css("--red"), cyan = css("--cyan");
    var mono = "11px " + (css("--f-mono") || "monospace");
    if (!data || !view) {
      ctx.fillStyle = dim; ctx.font = mono; ctx.textAlign = "center";
      ctx.fillText("Add two X-Dates to draw the timeline.", W / 2, H / 2);
      return;
    }
    var by = baseY(), top = M.t, hMax = by - top - 44;

    // grid + axis
    ctx.font = mono; ctx.textBaseline = "top";
    ticks().forEach(function (t) {
      var x = xOf(t.ms);
      if (x < M.l - 1 || x > W - M.r + 1) return;
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.globalAlpha = t.major ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, by); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = t.major ? ink : dim; ctx.textAlign = "center";
      ctx.fillText(t.label, x, by + 6);
    });
    ctx.strokeStyle = gold; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(M.l, by + 0.5); ctx.lineTo(W - M.r, by + 0.5); ctx.stroke(); ctx.globalAlpha = 1;

    // today
    if (data.today && data.today > view.t0 && data.today < view.t1) {
      var tx = xOf(data.today);
      ctx.strokeStyle = red; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(tx, top + 16); ctx.lineTo(tx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = red; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText("today", tx + 3, by - 3);
    }
    // T-dates
    (data.ts || []).forEach(function (t) {
      if (t < view.t0 || t > view.t1) return;
      var x = xOf(t);
      ctx.strokeStyle = cyan; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cyan; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("T", x, top);
    });
    // X-dates; a label that would overprint its neighbour steps down a row.
    ctx.textBaseline = "bottom";
    var rowEnds = [-1e9, -1e9, -1e9];
    data.xs.forEach(function (x) {
      if (!x.enabled || x.ms < view.t0 || x.ms > view.t1) return;
      var px = xOf(x.ms), w = ctx.measureText(x.label).width + 6, row = 0;
      while (row < rowEnds.length - 1 && px - w / 2 < rowEnds[row]) row++;
      rowEnds[row] = px + w / 2;
      var ly = top + 2 + row * 13;
      ctx.strokeStyle = gold2; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(px, ly + 2); ctx.lineTo(px, by); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      ctx.fillStyle = gold2; ctx.textAlign = "center"; ctx.font = "600 " + mono; ctx.fillText(x.label, px, ly); ctx.font = mono;
    });

    // arcs of the selected Z-Date
    var sel = data.selected && data.zs.find(function (z) { return z.key === data.selected; });
    if (sel && sel.arcs) {
      sel.arcs.forEach(function (a) {
        var x0 = xOf(a.from), x1 = xOf(sel.start), mid = (x0 + x1) / 2, rise = Math.min(hMax * 0.9, Math.abs(x1 - x0) * 0.45 + 12);
        ctx.strokeStyle = a.alpha ? gold2 : css("--beta"); ctx.globalAlpha = 0.75; ctx.lineWidth = a.alpha ? 1.6 : 1.1;
        if (!a.alpha) ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x0, by); ctx.quadraticCurveTo(mid, by - rise * 1.6, x1, by); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      });
    }

    // Z stems
    var maxScore = Math.max.apply(null, data.zs.map(function (z) { return z.score; }).concat([1]));
    var lastLabelX = -1e9;
    data.zs.forEach(function (z) {
      if (z.start < view.t0 - DAY || z.start > view.t1 + DAY) return;
      var x = xOf(z.start), h = 10 + Math.sqrt(Math.max(z.score, 0) / maxScore) * (hMax - 10), y = by - h;
      var isSel = z.key === data.selected, isHover = z.key === hoverKey, col = zColor(z);
      ctx.strokeStyle = col; ctx.globalAlpha = isSel || isHover ? 1 : 0.55; ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = col;
      glyph(x, y, z.hits, isSel ? 7 : isHover ? 6.5 : 5); ctx.fill();
      if (isSel) { ctx.strokeStyle = red; ctx.lineWidth = 2; glyph(x, y, z.hits, 10); ctx.stroke(); ctx.lineWidth = 1; }
      var zl = "Z" + (z.ordinal + 1), zw = ctx.measureText(zl).width + 8;
      if (data.showDates && (isSel || x - zw / 2 > lastLabelX)) {
        ctx.fillStyle = isSel ? gold2 : dim; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(zl, x, y - 9); lastLabelX = x + zw / 2;
      }
      layout.push({ key: z.key, x: x, y: y, z: z });
    });

    // astro lane: moons drawn by phase, eclipses as a ringed or reddened disc
    var ly = H - M.lane / 2 - 2;
    (data.astro || []).forEach(function (a) {
      if (a.ms < view.t0 || a.ms > view.t1) return;
      var x = xOf(a.ms);
      if (a.phase !== null && a.phase !== undefined) moonGlyph(x, ly, 6.5, a.phase);
      else eclipseGlyph(x, ly, 7, a.body, a.total, red);
      layout.push({ astro: a, x: x, y: ly });
    });
    ctx.font = mono;
  }

  /* -------------------------------------------------------- interaction -- */
  function nearest(px, py) {
    var best = null, bd = 14;
    layout.forEach(function (p) {
      var d = Math.hypot(p.x - px, (p.y - py) * (p.astro ? 1 : 0.35));
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }
  function showTip(p, px, py) {
    if (!p) { tip.hidden = true; return; }
    var lines;
    if (p.astro) lines = [p.astro.name, NC.time.msToDateString(p.astro.ms, "UTC") + " " + NC.time.msToTimeString(p.astro.ms, "UTC") + " UTC"];
    else lines = [p.z.label, "score " + p.z.score + " · " + p.z.hits + " hit" + (p.z.hits === 1 ? "" : "s"), p.z.msrfText || "no MSRF match"];
    NC.dom.fill(tip, lines.map(function (l, i) { return i === 0 ? NC.dom.el("b", { text: l }) : NC.dom.el("div", { text: l }); }));
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, px + 12)) + "px";
    tip.style.top = Math.max(4, py - th - 10) + "px";
  }

  function zoomAt(px, factor) {
    var t = msOf(px), span = (view.t1 - view.t0) * factor;
    span = Math.max(3 * DAY, Math.min(400 * 365.25 * DAY, span));
    var f = (px - M.l) / (W - M.l - M.r);
    view = { t0: t - f * span, t1: t - f * span + span };
    draw();
  }

  function wire() {
    var pointers = new Map(), drag = null, pinch = null, moved = false;
    cv.addEventListener("wheel", function (e) {
      if (!view) return;
      e.preventDefault();
      zoomAt(e.offsetX, Math.exp((e.deltaY || e.deltaX) * 0.0015));
    }, { passive: false });
    cv.addEventListener("pointerdown", function (e) {
      if (!view) return;
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = false;
      if (pointers.size === 1) drag = { x: e.offsetX, t0: view.t0, t1: view.t1 };
      else if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        pinch = { d: Math.abs(p[0].x - p[1].x) || 1, mid: (p[0].x + p[1].x) / 2, t0: view.t0, t1: view.t1 };
        drag = null;
      }
    });
    cv.addEventListener("pointermove", function (e) {
      if (!view) return;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pointers.size === 2) {
        var p = Array.from(pointers.values()), d = Math.abs(p[0].x - p[1].x) || 1;
        var span = (pinch.t1 - pinch.t0) * pinch.d / d;
        span = Math.max(3 * DAY, Math.min(400 * 365.25 * DAY, span));
        var f = (pinch.mid - M.l) / (W - M.l - M.r), anchor = pinch.t0 + f * (pinch.t1 - pinch.t0);
        view = { t0: anchor - f * span, t1: anchor - f * span + span };
        moved = true; draw(); return;
      }
      if (drag) {
        var dx = e.offsetX - drag.x;
        if (Math.abs(dx) > 3) moved = true;
        var shift = dx / (W - M.l - M.r) * (drag.t1 - drag.t0);
        view = { t0: drag.t0 - shift, t1: drag.t1 - shift };
        tip.hidden = true;
        draw(); return;
      }
      var p2 = nearest(e.offsetX, e.offsetY), k = p2 && !p2.astro ? p2.key : null;
      if (k !== hoverKey) { hoverKey = k; draw(); }
      showTip(p2, e.offsetX, e.offsetY);
    });
    function end(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !moved && e.type === "pointerup") {
        var p = nearest(e.offsetX, e.offsetY);
        if (p && !p.astro) handlers.select(p.key);
      }
      if (!pointers.size) drag = null;
    }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", function () { tip.hidden = true; if (hoverKey) { hoverKey = null; draw(); } });
    cv.addEventListener("dblclick", function (e) {
      var p = nearest(e.offsetX, e.offsetY);
      if (p && !p.astro) handlers.open(p.key); else fit();
    });
    cv.tabIndex = 0;
    cv.addEventListener("keydown", function (e) {
      if (!view) return;
      var span = view.t1 - view.t0;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { var s = span * 0.1 * (e.key === "ArrowLeft" ? -1 : 1); view = { t0: view.t0 + s, t1: view.t1 + s }; draw(); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") { zoomAt(W / 2, 0.8); e.preventDefault(); }
      else if (e.key === "-") { zoomAt(W / 2, 1.25); e.preventDefault(); }
      else if (e.key === "0") { fit(); e.preventDefault(); }
    });
  }

  function focusOn(ms) {
    if (!view) return;
    if (ms < view.t0 || ms > view.t1) { var span = view.t1 - view.t0; view = { t0: ms - span / 2, t1: ms + span / 2 }; }
    draw();
  }

  function toPng(name) {
    var bg = css("--bg");
    var out = document.createElement("canvas"); out.width = cv.width; out.height = cv.height;
    var o = out.getContext("2d"); o.fillStyle = bg; o.fillRect(0, 0, out.width, out.height); o.drawImage(cv, 0, 0);
    out.toBlob(function (b) { if (b) NC.dom.download(name, b, "image/png"); });
  }

  NC.chart = { init: init, set: set, fit: fit, draw: draw, focusOn: focusOn, toPng: toPng };
})(typeof window !== "undefined" ? window : globalThis);
