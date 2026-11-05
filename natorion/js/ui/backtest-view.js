/* NATORION · ui/backtest-view.js — the "Test it" panel on the Cipher screen:
   the backtest (would the formulas have pointed to your later dates from your
   earlier ones?) and the Metonic / 138-year cycle echoes, each against chance.
   It only reads what the engine produced; it changes nothing. */
(function (root) {
  "use strict";
  var NC = root.NC, D = NC.dom, el = D.el, $ = D.$, B = NC.backtest, S = NC.store, T = NC.time;
  var opts = { tolerance: B.DEFAULTS.tolerance, topN: B.DEFAULTS.topN };
  var lastRes = null;

  function pct(v) { return (100 * v).toFixed(v < 0.1 ? 1 : 0) + "%"; }
  function pTxt(p) { return p < 0.001 ? "p < 0.001" : "p = " + p.toFixed(3); }
  function line(label, b) {
    return el("p.bt-line." + b.verdict.level, {}, [
      el("b", { text: label + ": " }),
      b.observed + " of " + b.trials + " · chance alone ≈ " + b.expected.toFixed(1) + " · " + pTxt(b.pValue) + " · ",
      el("span.bt-verdict", { text: b.verdict.text })
    ]);
  }

  function renderBacktest() {
    var out = $("btOut"), ev = S.event();
    var anchors = (ev.x_dates || []).filter(function (x) { return x && x.enabled === true; }).length;
    if (anchors < 3) { D.fill(out, [el("p.hint", { text: "Needs at least three anchor dates: two to project from, and a later one to check against." })]); return; }
    D.fill(out, [el("p.hint", { text: "Running…" })]);
    setTimeout(function () {
      var r = B.run([ev], opts), sm = r.summary, rows = [];
      r.steps.forEach(function (st, i) {
        var res = st.error ? st.error
          : !st.inWindow ? (st.outside === "same-day" ? "same day as the last known date: not scored" : "past the projection horizon: not scored")
          : st.hit ? "hit · rank " + st.best.rank + (st.best.off ? " (" + (st.best.off > 0 ? "+" : "") + st.best.off + " d)" : "")
          : "miss" + (st.nearest ? " · nearest " + (st.nearest.off > 0 ? "+" : "") + st.nearest.off + " d" : "");
        rows.push(el("tr" + (st.hit ? ".hit" : ""), {}, [
          el("td.num", { text: String(i + 1) }),
          el("td", { text: "X" + (st.targetIndex + 1) + " · " + T.msToDateString(st.targetMs, "UTC") }),
          el("td.num", { text: String(st.known) }),
          el("td", { text: res }),
          el("td.num", { text: st.inWindow ? pct(st.chanceHit) : "—" })
        ]));
      });
      D.fill(out, [
        sm.valid ? line("Any match", sm.any) : el("p.hint", { text: "No step could be scored." }),
        sm.valid ? line("In the top " + sm.topN + " by strength", sm.top) : null,
        el("div.table-wrap", {}, [el("table.results.bt-table", {}, [
          el("thead", {}, [el("tr", {}, [el("th.num", { scope: "col", text: "Step" }), el("th", { scope: "col", text: "Date to find" }),
            el("th.num", { scope: "col", text: "Known", title: "Anchor dates given to the engine" }), el("th", { scope: "col", text: "Result" }),
            el("th.num", { scope: "col", text: "Luck", title: "Chance of a hit by luck: the share of the days within " + B.CONTROL_DAYS + " days of the real date that the projections cover" })])]),
          el("tbody", {}, rows)])]),
        el("p.hint.small", { text: "Each step stands on an earlier anchor date, gives the engine only the dates up to then, and checks whether the next one was projected. "
          + "“Luck” is how much of the " + B.CONTROL_DAYS + " days either side of the real date the projections cover anyway. A count well above the luck total is what would mean something." })
      ]);
    }, 20);
  }

  function renderEchoes(res) {
    var out = $("echoOut");
    if (!out) return;
    if (!res || res.errors.length) { D.fill(out, []); return; }
    var e = B.echoes(S.event(), res), kids = [];
    e.reach.forEach(function (r) {
      if (!r.possible) kids.push(el("p.hint.small", { text: r.label + ": the dates on screen span " + r.spanYears.toFixed(1) + " years, too short for one cycle." }));
    });
    if (e.summary) kids.push(line("Projected dates a whole cycle from an anchor", e.summary));
    if (e.pairSummary) kids.push(line("Anchor pairs a whole cycle apart", e.pairSummary));
    if (e.list.length) kids.push(el("ul.bt-echoes", {}, e.list.slice(0, 12).map(function (it) {
      return el("li", {}, [el("b", { text: T.msToDateString(it.z.start, "UTC") }), " " + it.echoes.map(function (x) {
        return x.glyph + " X" + (x.xIndex + 1) + " + " + x.k + " cycle" + (Math.abs(x.k) === 1 ? "" : "s") + " (" + (x.r >= 0 ? "+" : "") + x.r.toFixed(1) + " d)";
      }).join(" · ")]);
    })));
    if (e.list.length > 12) kids.push(el("p.hint.small", { text: "…and " + (e.list.length - 12) + " more." }));
    if (!kids.length) kids.push(el("p.hint", { text: "No echoes to report." }));
    D.fill(out, kids);
  }

  function init() {
    if (!$("btRun")) return;
    var tol = $("btTol"), top = $("btTop");
    tol.value = String(opts.tolerance); top.value = String(opts.topN);
    tol.addEventListener("change", function () { opts.tolerance = parseInt(tol.value, 10); });
    top.addEventListener("change", function () { opts.topN = parseInt(top.value, 10); });
    $("btRun").addEventListener("click", renderBacktest);
    S.on("results", function (res) { lastRes = res; renderEchoes(res); D.fill($("btOut"), [el("p.hint", { text: "Press Run to test this event's anchor dates against each other." })]); });
    if (lastRes) renderEchoes(lastRes);
  }

  NC.backtestView = { init: init, renderBacktest: renderBacktest };
})(window);
