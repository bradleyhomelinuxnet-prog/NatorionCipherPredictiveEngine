/* NATORION · ui/chronicon-view.js — the Chronicon screen: living clocks, the
   dial, the long cycles, the moon, the calendar wall and the ledger — and the
   bridge to the Cipher both ways. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var CH = NC.chron, D = NC.dom, S = NC.store, T = NC.time, $ = D.$, el = D.el;
  var era = "ce", ledgerFilter = "all", ticker = null, now0 = new Date();
  var SVGNS = "http://www.w3.org/2000/svg";

  function astro() {
    var y = Math.max(1, Math.abs(parseInt($("chYear").value, 10) || 1));
    return era === "bc" ? 1 - y : y;
  }
  function md() {
    var m = Math.min(12, Math.max(1, parseInt($("chMonth").value, 10) || 1));
    var dim = [31, NC.time.isLeap(astro()) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    var d = Math.min(dim, Math.max(1, parseInt($("chDay").value, 10) || 1));
    return { m: m, d: d };
  }
  function setAstro(a, m, d) {
    era = a <= 0 ? "bc" : "ce";
    $("chYear").value = a <= 0 ? 1 - a : a;
    if (m) $("chMonth").value = m;
    if (d) $("chDay").value = d;
    render();
  }

  /* ---------------------------------------------------------- clocks -- */
  function clockCard(name, big, meta, accent, cls) {
    return el("div.clock" + (cls ? "." + cls : ""), { style: { "--accent": accent } }, [el("div.name", { text: name }), el("div.big", { text: big }), el("div.meta", { text: meta })]);
  }
  function tick() {
    var c = CH.clocks(Date.now());
    var cards = [
      clockCard("Coordinated universal", c.utc, "Zulu · UTC", "var(--cyan)"),
      clockCard("Your clock", c.local, c.localZone, "var(--gold)"),
      clockCard("Cairo civil", c.cairo, c.cairoDate + " · 30.0°N 31.1°E", "var(--violet)"),
      clockCard("Sun over Giza", c.solar, "apparent solar time · equation of time " + (c.eot >= 0 ? "+" : "") + c.eot.toFixed(1) + " min", "var(--green)"),
      c.phoenix ? clockCard("To 15 May 2040", c.phoenix.days.toLocaleString("en-US") + "d " + c.phoenix.clock,
        "the Phoenix · Nemesis 2046 in " + c.yearsTo(2046) + " yr" + (c.phoenix.by19 ? " · ÷19 today" : "") + (c.phoenix.by138 ? " · ÷138 today" : ""), "var(--red)", "phoenix")
        : clockCard("The Phoenix", "arrived", "Collapse 2178 in " + c.yearsTo(2178) + " yr", "var(--red)", "phoenix")
    ];
    D.fill($("clocks"), cards);
  }

  /* ------------------------------------------------------------ dial -- */
  function cycleCard(name, big, small, meta, progress, accent) {
    return el("div.cycle", { style: { "--accent": accent } }, [
      el("div.name", { text: name }),
      el("div.big", {}, [big, small ? el("small", { text: small }) : null]),
      el("div.meta", {}, meta),
      progress == null ? null : el("div.bar", {}, [el("i", { style: { width: Math.max(0, Math.min(100, progress * 100)).toFixed(1) + "%" } })])
    ]);
  }
  function b(t) { return el("b", { text: String(t) }); }

  function render() {
    var a = astro(), p = md(), c = CH.cycles(a), fy = CH.fmtYear;
    D.seg($("eraSeg"), era, function (v) { era = v; render(); });
    $("chSlider").value = Math.max(-5238, Math.min(2178, a));
    $("chMonth").value = p.m; $("chDay").value = p.d;
    var ev = CH.LEDGER.find(function (x) { return x[0] === a; });
    var lcTxt = c.lc > 0 ? String(c.lc) : "pre-count";
    D.fill($("chMoment"), [
      el("div", {}, [b(fy(a)), "the moment"]),
      el("div", {}, [b(c.am), "Annus Mundi"]),
      el("div", {}, [b(c.cat), "years since the Cataclysm"]),
      el("div", {}, [b(lcTxt), "Long-Count year"]),
      ev ? el("div.ev", {}, ["⟶ ", el("b", { text: ev[2] })]) : null
    ]);

    var ph = c.phoenix, nm = c.nemesis, nr = c.ner, bk = c.baktun;
    D.fill($("chCycles"), [
      cycleCard("Annus Mundi", String(c.am), "AM", ["Flood node ", b("AM 1656"), " · ", c.am >= 6000 ? "past AM 6000" : [b(6000 - c.am), " years to AM 6000 (2106 CE)"]], Math.min(1, c.am / 6000), "var(--gold)"),
      cycleCard("Phoenix · 138", ph.to === 138 || ph.into === 0 ? "NODE" : String(ph.to), ph.into === 0 ? "visitation" : "yr to node", ["last ", b(fy(ph.prev)), " · next ", b(fy(ph.next)), " · node #" + ph.node + " of the 6348-yr record"], ph.into / 138, "var(--red)"),
      cycleCard("Nemesis X · 792", nm.inner ? String(60 - nm.offset) : String(nm.enterNext - a), nm.inner ? "yr · inside" : "yr to return",
        nm.inner ? ["in the inner system since ", b(fy(nm.enterPrev)), ", leaves ", b(fy(nm.exit))] : ["outside Sol on its 732-yr arc · returns ", b(fy(nm.enterNext))], nm.progress, "var(--violet)"),
      cycleCard("NER · 600", "Period " + nr.period, null, ["began ", b(fy(nr.start)), " · ", b(600 - nr.off), " yr to ", fy(nr.next), " · ten 60-yr decans"], nr.off / 600, "var(--green)"),
      bk ? cycleCard("Maya baktun", "Baktun " + bk.n, "/13", [fy(bk.start) + " → " + fy(bk.end) + " · ", b(bk.end - a), " yr to " + (bk.n === 13 ? "13.0.0.0.0 — time collapses" : "the next")], bk.progress, "var(--cyan)")
         : cycleCard("Maya baktun", "Pre-count", null, ["before 0.0.0.0.0 (3113 BC)"], 0, "var(--cyan)")
    ]);

    // moon
    var noon = CH.noonMs(a, p.m, p.d), ms = NC.sky.moonState(noon), phase = NC.sky.phaseForAngle(ms.angle);
    drawMoon(ms.angle / 360);
    var J = CH.jdn(a, p.m, p.d), todayJ = CH.jdn(now0.getFullYear(), now0.getMonth() + 1, now0.getDate());
    var lun = Math.round((J - 2423436.40347) / 29.530588853), back = Math.round((todayJ - J) / 29.530588853), yd = now0.getFullYear() - a;
    D.fill($("moonFacts"), [
      el("dt", { text: "Phase" }), el("dd", { text: phase.glyph + " " + phase.name }),
      el("dt", { text: "Age" }), el("dd", { text: ms.age.toFixed(1) + " days" }),
      el("dt", { text: "Lit" }), el("dd", { text: Math.round(ms.illum * 100) + "%" }),
      el("dt", { text: "Lunation" }), el("dd", { text: "#" + lun + " (Brown)" }),
      el("dt", { text: "From today" }), el("dd", { text: back < 0 ? Math.abs(back).toLocaleString("en-US") + " moons ahead" : back.toLocaleString("en-US") + " moons back" }),
      el("dt", { text: "Metonic" }), el("dd", { text: (yd >= 0 ? Math.floor(yd / 19) + " cycles of 19 back" : Math.abs(Math.floor(yd / 19)) + " cycles of 19 ahead") + (yd % 19 === 0 ? " · on the cycle" : "") })
    ]);

    // flags
    var f = CH.flags(a, now0.getFullYear());
    D.fill($("chFlags"), [
      el("span.flag" + (f.node138 ? ".on" : ""), { text: "138 · Phoenix node" }),
      el("span.flag" + (f.metonic19 ? ".on" : ""), { text: "19 · Metonic with today" }),
      el("span.flag" + (f.palindrome ? ".on" : ""), { text: "⮌ mirror year" }),
      el("span.flag" + (f.sigil ? ".on" : ""), { text: "138 in the Long Count" })
    ]);
    var np = CH.nextPal(c.am);
    $("chPal").textContent = "next Annus Mundi palindrome: AM " + np + " (" + fy(np - 3894) + ") · this year " + (f.palindrome ? "is a mirror ⮌" : "is not a mirror");

    // Z-Dates of the current event in this year
    renderZList(a);

    // calendar wall
    D.fill($("chWall"), CH.calendars(a, p.m, p.d).map(function (x) {
      return el("div.cal", { style: { "--tone": x.tone ? "var(--" + x.tone + ")" : "var(--line-2)" } }, [el("div.name", { text: x.name }), el("div.big", { text: x.big }), el("div.meta", { text: x.meta })]);
    }));

    // ledger highlight
    Array.prototype.forEach.call($("ledgerBody").children, function (tr) { tr.setAttribute("aria-current", String(+tr.dataset.y === a)); });
  }

  function renderZList(a) {
    var res = S.state.results, items = [];
    if (res && res.byDate) {
      res.byDate.forEach(function (t) {
        var w = T.wall(t.start, res.zone);
        if (w.y !== a) return;
        items.push(el("li", {}, [el("button.ghost", { type: "button", text: T.msToDateString(t.start, res.zone) + " · " + t.score, title: "Open this day", onclick: function () { setAstro(w.y, w.m, w.d); } })]));
      });
    }
    if (!items.length) items = [el("li.none", { text: "No shown Z-Date of “" + (S.event().name || "this event") + "” falls in this year." })];
    D.fill($("chZList"), items.slice(0, 60));
  }

  function drawMoon(frac) {
    var svg = $("moonSvg"), R = 62, Cc = 75;
    var x = Math.cos(2 * Math.PI * frac), rx = Math.abs(x) * R, waxing = frac < 0.5, crescent = frac < 0.25 || frac > 0.75;
    var outer = waxing ? 0 : 1, inner = waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0);
    var d = "M " + Cc + "," + (Cc - R) + " A " + R + " " + R + " 0 0 " + outer + " " + Cc + "," + (Cc + R) + " A " + rx + " " + R + " 0 0 " + inner + " " + Cc + "," + (Cc - R) + " Z";
    svg.replaceChildren();
    function s(tag, attrs) { var n = document.createElementNS(SVGNS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); svg.appendChild(n); return n; }
    var defs = s("defs", {});
    var g = document.createElementNS(SVGNS, "radialGradient"); g.setAttribute("id", "mg"); g.setAttribute("cx", "40%"); g.setAttribute("cy", "38%");
    [["0%", "#fff6da"], ["70%", "#e9d9a8"], ["100%", "#b89d5c"]].forEach(function (st) { var e = document.createElementNS(SVGNS, "stop"); e.setAttribute("offset", st[0]); e.setAttribute("stop-color", st[1]); g.appendChild(e); });
    defs.appendChild(g);
    s("circle", { cx: Cc, cy: Cc, r: R + 6, fill: "none", stroke: "var(--line-2)", "stroke-width": "1" });
    s("circle", { cx: Cc, cy: Cc, r: R, fill: "url(#mg)" });
    s("path", { d: d, fill: "#0a0a12", opacity: "0.92" });
    s("circle", { cx: Cc, cy: Cc, r: R, fill: "none", stroke: "rgba(0,0,0,.35)", "stroke-width": "1" });
  }

  function renderLedger() {
    var rows = CH.LEDGER.filter(function (x) { return ledgerFilter === "all" || x[1] === ledgerFilter; }).map(function (x) {
      var a = x[0], mk = CH.ledgerMarks(a), am = a + 3894, pal = CH.isPal(a <= 0 ? 1 - a : a);
      return el("tr", { data: { y: String(a) }, tabindex: "0", title: "Open " + CH.fmtYear(a) }, [
        el("td", {}, [el("span.dot.d-" + x[1]), CH.fmtYear(a), pal ? el("span.pal", { text: " ⮌" }) : null]),
        el("td.num", {}, [String(am), CH.isPal(am) ? el("span.pal", { text: " ⮌" }) : null]),
        el("td", { style: { color: "var(--red)" }, text: mk.phx ? "●" : "·" }),
        el("td", { style: { color: "var(--violet)" }, text: mk.nem ? "◆" : "·" }),
        el("td", { style: { color: "var(--cyan)" }, text: mk.may ? "▲" : "·" }),
        el("td.ev", { text: x[2] })
      ]);
    });
    D.fill($("ledgerBody"), rows);
    D.seg($("ledgerSeg"), ledgerFilter, function (k) { ledgerFilter = k; renderLedger(); render(); });
  }

  function show(dayMs) {
    var d = new Date(dayMs);
    setAstro(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    NC.app.go("chronicon");
  }

  function active(on) {
    clearInterval(ticker);
    if (on) { tick(); ticker = setInterval(tick, 1000); render(); }
  }

  function init() {
    $("chYear").value = now0.getFullYear(); $("chMonth").value = now0.getMonth() + 1; $("chDay").value = now0.getDate();
    ["chYear", "chMonth", "chDay"].forEach(function (id) { $(id).addEventListener("input", render); });
    $("chSlider").addEventListener("input", function () { setAstro(parseInt(this.value, 10)); });
    $("chToday").addEventListener("click", function () { now0 = new Date(); setAstro(now0.getFullYear(), now0.getMonth() + 1, now0.getDate()); });
    $("chToX").addEventListener("click", function () {
      var a = astro(), p = md();
      if (a < 1) { NC.dom.toast("X-Dates run from 1 CE to 9999 CE.", true); return; }
      var date = T.pad(p.m) + "/" + T.pad(p.d) + "/" + a;
      S.change(function (e) { e.x_dates = (e.x_dates || []).concat([{ date: date, time: "00:00", enabled: true }]); });
      NC.cipher.renderDates("x");
      NC.dom.toast(date + " added to “" + (S.event().name || "this event") + "” as X" + S.event().x_dates.length + ".");
    });
    var jumps = [["4309 BC", -4308], ["Year One · 3895 BC", -3894], ["Flood · 2239 BC", -2238], ["713 BC", -712], ["522", 522], ["864", 864], ["1254", 1254], ["1764", 1764], ["2040", 2040], ["2046", 2046], ["2178", 2178]];
    D.fill($("chJumps"), jumps.map(function (j) { return el("button.ghost", { type: "button", text: j[0], onclick: function () { setAstro(j[1], 5, 15); } }); }));
    $("ledgerBody").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-y]"); if (tr) { setAstro(+tr.dataset.y, 5, 1); $("chMoment").scrollIntoView({ block: "center", behavior: "smooth" }); } });
    $("ledgerBody").addEventListener("keydown", function (e) { if (e.key === "Enter") { var tr = e.target.closest("tr[data-y]"); if (tr) setAstro(+tr.dataset.y, 5, 1); } });
    renderLedger();
    S.on("results", function () { if ($("chYear").offsetParent) renderZList(astro()); });
  }

  NC.chronView = { init: init, render: render, active: active, show: show };
})(typeof window !== "undefined" ? window : globalThis);
