/* NATORION · chronicon/dossier.js
   The Dossier's living parts: the four Stone renders (the Great Pyramid
   commenced, capped, drowned and re-emerged, on the Chronicon's dates), and
   the sentences whose numbers depend on today. Everything is built as DOM
   nodes; no HTML strings. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var SVGNS = "http://www.w3.org/2000/svg";

  function s(parent, tag, attrs, kids) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function stop(parent, offset, color, opacity) { return s(parent, "stop", { offset: offset, "stop-color": color, "stop-opacity": opacity == null ? 1 : opacity }); }

  /* One render. build: 0–1 how much is raised; water: 0–1 how deep it stands;
     mood: construction | canopy | flood | emerge. The `uid` keeps gradient ids
     distinct across the four figures. */
  function pyramid(o, uid) {
    var W = 600, H = 400, baseY = 320, apexFull = 72, cx = 300, half = 178;
    var build = o.build, water = o.water, mood = o.mood;
    var ay = baseY - build * (baseY - apexFull), flat = build < 0.999, lx = cx - half, rx = cx + half, th = flat ? half * (1 - build) : 0;
    var svg = s(null, "svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": o.ph });
    var defs = s(svg, "defs");
    var canopy = s(defs, "radialGradient", { id: uid + "-canopy", cx: "50%", cy: "12%", r: "90%" });
    stop(canopy, "0%", "#d9cba0", 0.5); stop(canopy, "55%", "#3a3a4a", 0.2); stop(canopy, "100%", "#07070c", 0);
    var storm = s(defs, "linearGradient", { id: uid + "-storm", x1: 0, y1: 0, x2: 0, y2: 1 });
    stop(storm, "0%", "#3a0f14"); stop(storm, "60%", "#160a14"); stop(storm, "100%", "#07060a");
    var dawn = s(defs, "radialGradient", { id: uid + "-dawn", cx: "72%", cy: "18%", r: "90%" });
    stop(dawn, "0%", "#e9c97a", 0.5); stop(dawn, "50%", "#2a2333", 0.2); stop(dawn, "100%", "#07070c", 0);
    var faceL = s(defs, "linearGradient", { id: uid + "-faceL", x1: 0, y1: 0, x2: 1, y2: 0 });
    stop(faceL, "0%", "#cdb17a"); stop(faceL, "100%", "#a98f55");
    var faceR = s(defs, "linearGradient", { id: uid + "-faceR", x1: 0, y1: 0, x2: 1, y2: 0 });
    stop(faceR, "0%", "#7d663b"); stop(faceR, "100%", "#5c4a2b");
    var wat = s(defs, "linearGradient", { id: uid + "-water", x1: 0, y1: 0, x2: 0, y2: 1 });
    stop(wat, "0%", "#2f7c8c"); stop(wat, "100%", "#0c2730");

    // sky, orb, ground
    if (mood === "construction") {
      s(svg, "rect", { width: W, height: H, fill: "#0b0a10" }); s(svg, "rect", { width: W, height: H, fill: "url(#" + uid + "-canopy)", opacity: 0.5 });
      s(svg, "circle", { cx: 470, cy: 96, r: 34, fill: "#f3e0a8", opacity: 0.55 }); s(svg, "circle", { cx: 470, cy: 96, r: 60, fill: "#f3e0a8", opacity: 0.12 });
      s(svg, "rect", { x: 0, y: baseY, width: W, height: H - baseY, fill: "#15110a" });
    } else if (mood === "canopy") {
      s(svg, "rect", { width: W, height: H, fill: "#0a0a12" }); s(svg, "rect", { width: W, height: H, fill: "url(#" + uid + "-canopy)", opacity: 0.7 });
      s(svg, "circle", { cx: 300, cy: 86, r: 40, fill: "#fff7e0", opacity: 0.5 }); s(svg, "circle", { cx: 300, cy: 86, r: 78, fill: "#fff7e0", opacity: 0.13 });
      s(svg, "rect", { x: 0, y: baseY, width: W, height: H - baseY, fill: "#16120b" });
    } else if (mood === "flood") {
      s(svg, "rect", { width: W, height: H, fill: "#0a060a" }); s(svg, "rect", { width: W, height: H, fill: "url(#" + uid + "-storm)", opacity: 0.85 });
      s(svg, "circle", { cx: 300, cy: 80, r: 30, fill: "#a83426", opacity: 0.55 }); s(svg, "circle", { cx: 300, cy: 80, r: 66, fill: "#a83426", opacity: 0.14 });
      var dust = s(svg, "g", { opacity: 0.5 });
      for (var i = 0; i < 22; i++) { var dx = (i * 53 + 17) % W, dy = (i * 37) % 190; s(dust, "line", { x1: dx, y1: dy, x2: dx + 6, y2: dy + 22, stroke: "#c0533f", "stroke-width": 1 }); }
    } else {
      s(svg, "rect", { width: W, height: H, fill: "#0a0a10" }); s(svg, "rect", { width: W, height: H, fill: "url(#" + uid + "-dawn)", opacity: 0.8 });
      s(svg, "circle", { cx: 430, cy: 84, r: 36, fill: "#f3d27a", opacity: 0.6 }); s(svg, "circle", { cx: 430, cy: 84, r: 74, fill: "#f3d27a", opacity: 0.16 });
      var rays = s(svg, "g", { opacity: 0.5 });
      for (var k = 0; k < 5; k++) s(rays, "line", { x1: 430, y1: 84, x2: (430 + Math.cos(k * 1.2 - 1.2) * 120).toFixed(1), y2: (84 + Math.sin(k * 1.2 - 1.2) * 120).toFixed(1), stroke: "#f3d27a", "stroke-width": 1 });
      s(svg, "rect", { x: 0, y: baseY, width: W, height: H - baseY, fill: "#14110a" });
    }

    // the monument
    var top = flat ? ay : apexFull, a = ay.toFixed(1);
    var left = flat ? "M " + lx + " " + baseY + " L " + (cx - th) + " " + a + " L " + cx + " " + a + " L " + cx + " " + baseY + " Z" : "M " + lx + " " + baseY + " L " + cx + " " + apexFull + " L " + cx + " " + baseY + " Z";
    var right = flat ? "M " + rx + " " + baseY + " L " + (cx + th) + " " + a + " L " + cx + " " + a + " L " + cx + " " + baseY + " Z" : "M " + rx + " " + baseY + " L " + cx + " " + apexFull + " L " + cx + " " + baseY + " Z";
    var body = flat ? "M " + lx + " " + baseY + " L " + (cx - th) + " " + a + " L " + (cx + th) + " " + a + " L " + rx + " " + baseY + " Z" : "M " + lx + " " + baseY + " L " + cx + " " + apexFull + " L " + rx + " " + baseY + " Z";
    s(svg, "path", { d: left, fill: "url(#" + uid + "-faceL)" });
    s(svg, "path", { d: right, fill: "url(#" + uid + "-faceR)" });
    s(svg, "path", { d: body, fill: "none", stroke: "#1a140c", "stroke-width": 1.5 });
    for (var y = baseY - 12; y > top + 6; y -= 13) {
      var f = (baseY - y) / (baseY - apexFull), hw = half * (1 - f);
      s(svg, "line", { x1: (cx - hw).toFixed(1), y1: y, x2: (cx + hw).toFixed(1), y2: y, stroke: "#000", "stroke-opacity": 0.18 });
    }
    if (mood === "construction") s(svg, "polygon", { points: rx + " " + baseY + " " + (rx + 92) + " " + baseY + " " + (cx + th) + " " + a, fill: "#241c10", stroke: "#3a2e18" });
    if (build >= 0.999 && mood === "canopy") {
      s(svg, "polygon", { points: cx + "," + apexFull + " " + (cx - 16) + "," + (apexFull + 26) + " " + (cx + 16) + "," + (apexFull + 26), fill: "#f3d27a" });
      s(svg, "circle", { cx: cx, cy: apexFull, r: 30, fill: "#f3d27a", opacity: 0.35 }); s(svg, "circle", { cx: cx, cy: apexFull, r: 60, fill: "#f3d27a", opacity: 0.12 });
    }
    if (water > 0) {
      var wy = baseY - water * (baseY - apexFull), pts = "";
      for (var q = 0; q < 13; q++) pts += " Q " + (q * 50 + 25) + " " + (wy - 6).toFixed(1) + " " + (q * 50 + 50) + " " + wy.toFixed(1);
      s(svg, "path", { d: "M 0 " + wy.toFixed(1) + pts + " L " + W + " " + H + " L 0 " + H + " Z", fill: "url(#" + uid + "-water)", opacity: 0.82 });
      s(svg, "path", { d: "M 0 " + wy.toFixed(1) + pts, fill: "none", stroke: "#9fd6e2", "stroke-opacity": 0.4, "stroke-width": 1.5 });
    }
    return svg;
  }

  var SCENES = [
    { mood: "construction", build: 0.62, water: 0, ph: "Commenced · the raising begins", am: "AM 990", bc: "2905 BC", note: "666 years before the Flood" },
    { mood: "canopy", build: 1, water: 0, ph: "Completed · capstone set", am: "AM 1080", bc: "2815 BC", note: "after a 90-year raising · the Vapor-Canopy world" },
    { mood: "flood", build: 1, water: 0.8, ph: "Submerged · the Great Flood", am: "AM 1656", bc: "2239 BC", note: "the Canopy collapses; the world goes under" },
    { mood: "emerge", build: 1, water: 0.14, ph: "Re-emerged · the waters recede", am: "AM 1996", bc: "1899 BC", note: "after 340 years beneath — the year of Babel & Akkad" }
  ];

  function renderStone() {
    var host = document.getElementById("renderHost");
    if (!host || host.childNodes.length) return;
    var el = NC.dom.el;
    SCENES.forEach(function (sc, i) {
      host.appendChild(el("figure.render", {}, [
        pyramid(sc, "py" + i),
        el("figcaption", {}, [el("div.ph", { text: sc.ph }), el("div.am", {}, [sc.am + " ", el("small", { text: "· " + sc.bc })]), el("div.note", { text: sc.note })])
      ]));
    });
  }

  /* The sentences that depend on today. */
  function renderLive(now) {
    now = now || new Date();
    var y = now.getFullYear(), MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var live = {
      todayHuman: now.getDate() + " " + MN[now.getMonth()] + " " + y,
      amToday: String(y + 3894),
      toPhoenix: String(2040 - y),
      toNemesis: String(2046 - y)
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-live]"), function (n) { if (live[n.dataset.live] !== undefined) n.textContent = live[n.dataset.live]; });

    var lc = document.getElementById("dsLcNow");
    if (lc) {
      var lcY = y + 3112, txt = lcY.toLocaleString("en-US"), at = txt.indexOf("138");
      lc.replaceChildren();
      if (at >= 0) { lc.append(txt.slice(0, at)); lc.appendChild(NC.dom.el("span.sigil-138", { text: "138" })); lc.append(txt.slice(at + 3)); }
      else lc.append(txt);
    }
    var sw = document.getElementById("sigilWindow");
    if (sw) {
      sw.style.color = "";
      if (y === 2026) {
        var days = Math.ceil((Date.UTC(2027, 0, 1) - now.getTime()) / 86400000), nod = "";
        if (days % 138 === 0) nod = " · ÷138 today"; else if (days % 19 === 0) nod = " · ÷19 today";
        sw.textContent = "● spoken inside the window it describes — " + days + " days of the 138-faced year remain" + nod;
      } else if (y < 2026) sw.textContent = "the 138-faced year has not yet opened";
      else { sw.textContent = "spoken inside the window it described — the sigil year is closed; the count never wears it again"; sw.style.color = "var(--dim)"; }
    }
  }

  NC.dossier = { renderStone: renderStone, renderLive: renderLive, SCENES: SCENES };
})(typeof window !== "undefined" ? window : globalThis);
