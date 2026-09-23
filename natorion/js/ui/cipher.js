/* NATORION · ui/cipher.js — the working screen: inputs on the left, the
   timeline and the ranked Z-Dates on the right, the derivation in a drawer. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time, D = NC.dom, S = NC.store, $ = D.$, el = D.el;
  var DAY = C.MS_DAY;
  var ROW_LIMIT = 600;
  var showAll = false, search = "";

  function ev() { return S.event(); }
  function hh() { return ev().scope === C.SCOPE.HH_MM; }

  /* ================================================================ EVENT */
  function renderEvent() {
    var e = ev();
    $("evName").value = e.name || "";
    D.seg($("scopeSeg"), e.scope === C.SCOPE.HH_MM ? C.SCOPE.HH_MM : C.SCOPE.DAYS, pickScope);
    $("locBox").hidden = !hh();
    $("dayStartBox").hidden = hh();
    $("evLat").value = e.lat; $("evLong").value = e.long;
    $("evZone").textContent = hh() ? T.eventZone(e) : "UTC";
    var ms = Number(e.day_scope_start_time_in_millis) || 0;
    $("evDayStart").value = T.pad(Math.floor(ms / 3600000)) + ":" + T.pad(Math.floor(ms % 3600000 / 60000));
    $("evNotes").value = e.notes || "";
    $("sortSel").value = e.z_date_sort_type || C.SORT.DATE;
    renderDates("x"); renderDates("t"); renderFields();
  }

  function pickScope(v) {
    var e = ev();
    if (v === e.scope) return;
    S.change(function (e2) {
      e2.scope = v;
      if (v === C.SCOPE.HH_MM) {
        if (!T.validLatLong(Number(e2.lat), Number(e2.long)) || (Number(e2.lat) === 0 && Number(e2.long) === 0)) { e2.lat = C.DEFAULT_LAT; e2.long = C.DEFAULT_LONG; }
        e2.location_enabled = true;
        (e2.x_dates || []).concat(e2.t_dates || []).forEach(function (d) { if (!d.time) d.time = "00:00"; });
      } else e2.location_enabled = false;
    }, { immediate: true });
    renderEvent();
  }

  /* ================================================================ DATES */
  function listOf(kind) { var e = ev(); var k = kind === "x" ? "x_dates" : "t_dates"; if (!Array.isArray(e[k])) e[k] = []; return e[k]; }

  function renderDates(kind) {
    var list = listOf(kind), host = $(kind === "x" ? "xList" : "tList"), prevMs = null, items = [];
    list.forEach(function (d, i) {
      var errs = [], ms = T.inputDateToMs(ev(), d, errs);
      var li = el("li" + (hh() ? ".has-time" : ""), { data: { off: String(d.enabled !== true) } });
      var dateIn = el("input", { type: "date", value: T.toIsoDate(d.date), "aria-label": (kind === "x" ? "X" : "T") + (i + 1) + " date", "aria-invalid": errs.length ? "true" : null, title: errs[0] || "" });
      dateIn.addEventListener("change", function () {
        var v = T.fromIsoDate(dateIn.value);
        if (!v) { dateIn.setAttribute("aria-invalid", "true"); return; }
        S.change(function () { d.date = v; });
        renderDates(kind);
      });
      var kids = [
        el("span.tag", { text: (kind === "x" ? "X" : "T") + (i + 1) }),
        el("input", { type: "checkbox", checked: d.enabled === true, "aria-label": "Use " + (kind === "x" ? "X" : "T") + (i + 1), onchange: function (e) { S.change(function () { d.enabled = e.target.checked; }); renderDates(kind); } }),
        dateIn
      ];
      if (hh()) {
        var timeIn = el("input", { type: "time", step: "60", value: d.time || "00:00", "aria-label": (kind === "x" ? "X" : "T") + (i + 1) + " time" });
        timeIn.addEventListener("change", function () { S.change(function () { d.time = timeIn.value || "00:00"; }); renderDates(kind); });
        kids.push(timeIn);
      }
      kids.push(el("span.row-act", {}, [
        kind === "x" && i > 0 ? el("button", { type: "button", title: "Move up", "aria-label": "Move X" + (i + 1) + " up", text: "↑", onclick: function () { S.change(function () { var t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; }); renderDates(kind); } }) : null,
        el("button", { type: "button", title: "Remove", "aria-label": "Remove " + (kind === "x" ? "X" : "T") + (i + 1), text: "✕", onclick: function () { S.change(function () { list.splice(i, 1); }); renderDates(kind); } })
      ]));
      D.append(li, kids);
      items.push(li);
      if (kind === "x" && d.enabled === true && ms !== null) {
        if (prevMs !== null) {
          var y = NC.engine.rotationsBetween(ev().scope, prevMs, ms, Number(ev().lat), Number(ev().long));
          var gapTxt = (y > 0 ? "+" : "") + y + (hh() ? " sunsets" : " days") + " from the previous date" + (y <= 0 ? " — must be later" : "");
          items.push(el("li", { class: "gap-row", "aria-hidden": "true" }, [el("span"), el("span"), el("span.gap", { text: gapTxt })]));
        }
        prevMs = ms;
      }
      if (errs.length) items.push(el("li", {}, [el("span"), el("span"), el("span.gap", { text: errs[0], style: { color: "var(--red)" } })]));
    });
    D.fill(host, items);
    if (kind === "x") $("xHint").hidden = list.length > 3;
  }

  function addDate(kind) {
    var list = listOf(kind), e = ev(), zone = T.eventZone(e), next;
    var lastMs = null;
    for (var i = list.length - 1; i >= 0; i--) { var m = T.inputDateToMs(e, list[i]); if (m !== null) { lastMs = m; break; } }
    if (lastMs === null) {
      var now = new Date();
      next = kind === "x" && !list.length ? T.utcMs(now.getFullYear(), now.getMonth() + 1, now.getDate()) - DAY : T.utcMs(now.getFullYear(), now.getMonth() + 1, now.getDate());
      next = { date: T.msToDateString(next, "UTC"), time: "00:00", enabled: true };
    } else next = T.msToInputDate(lastMs + DAY, zone);
    S.change(function () { list.push(next); });
    renderDates(kind);
    var inputs = $(kind === "x" ? "xList" : "tList").querySelectorAll('input[type="date"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  /* Many dates at once. Understands 07/04/2026, 2026-07-04, "07/04/2026 18:30",
     and the file-name form 7-4-26-8-20-26 (month-day-2-digit-year triples). */
  function parseDateList(text) {
    var out = [], s = String(text || "").trim();
    if (!s) return out;
    if (/^\d{1,2}-\d{1,2}-\d{2}(-\d{1,2}-\d{1,2}-\d{2})+$/.test(s.replace(/\s+/g, ""))) {
      var n = s.replace(/\s+/g, "").split("-").map(Number);
      for (var i = 0; i + 2 < n.length; i += 3) out.push({ date: T.pad(n[i]) + "/" + T.pad(n[i + 1]) + "/" + (n[i + 2] < 50 ? 2000 + n[i + 2] : 1900 + n[i + 2]), time: "00:00" });
      return out;
    }
    s.split(/[\n,;]+/).forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m, time = "00:00";
      var tm = /(\d{1,2}):(\d{2})\s*$/.exec(part);
      if (tm) { time = T.pad(+tm[1]) + ":" + tm[2]; part = part.slice(0, tm.index).trim(); }
      if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(part))) out.push({ date: T.pad(+m[2]) + "/" + T.pad(+m[3]) + "/" + m[1], time: time });
      else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(part))) {
        var y = +m[3]; if (m[3].length === 2) y = y < 50 ? 2000 + y : 1900 + y;
        out.push({ date: T.pad(+m[1]) + "/" + T.pad(+m[2]) + "/" + y, time: time });
      } else out.push({ date: part, time: time, bad: true });
    });
    return out;
  }
  function openPaste() {
    var dlg = $("pasteDialog");
    $("pasteDates").value = "";
    dlg.returnValue = "";
    dlg.showModal();
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      if (dlg.returnValue !== "ok") return;
      var parsed = parseDateList($("pasteDates").value), good = [], bad = [];
      parsed.forEach(function (p) { var errs = []; if (!p.bad && T.parseDate(p.date, errs)) good.push({ date: p.date, time: p.time, enabled: true }); else bad.push(p.date); });
      if (!good.length) { D.toast("No dates recognised" + (bad.length ? ": " + bad.slice(0, 3).join(", ") : "."), true); return; }
      S.change(function (e) { if ($("pasteReplace").checked) e.x_dates = good; else e.x_dates = (e.x_dates || []).concat(good); });
      renderDates("x");
      D.toast(good.length + " date" + (good.length === 1 ? "" : "s") + " added" + (bad.length ? "; skipped " + bad.length : "") + ".", !!bad.length);
    });
  }

  /* =============================================================== FIELDS */
  function renderFields() {
    var e = ev();
    function row(f) {
      var box = el("input", { type: "checkbox", checked: e[f.key] === true, onchange: function (x) { S.change(function (e2) { e2[f.key] = x.target.checked; }); } });
      var label = [f.label];
      if (f.valueKey) {
        var num = el("input.num-in", { type: "number", min: "0", step: "1", value: e[f.valueKey], "aria-label": f.label + " value" });
        num.addEventListener("input", function () { var v = parseFloat(num.value); if (Number.isFinite(v) && v >= 0) S.change(function (e2) { e2[f.valueKey] = v; }); });
        label = f.label.split("N").reduce(function (acc, part, i, arr) { acc.push(part); if (i < arr.length - 1) acc.push(num); return acc; }, []);
      }
      return el("label.check", { title: f.help }, [box, el("span", {}, label)]);
    }
    D.fill($("filterList"), C.FILTERS.map(row));
    D.fill($("layerList"), C.CHART_LAYERS.map(row));
  }

  /* ============================================================== RESULTS */
  function msrfBest(t) { return t.msrf.length ? t.msrf[0].cls.key : null; }
  function zLabel(t, zone) { return T.msToDateString(t.start, zone) + (hh() ? " " + T.msToTimeString(t.start, zone) : ""); }

  var astroCache = { key: "", list: [] };
  function astroFor(res) {
    var e = ev();
    var dates = res.byDate.map(function (t) { return t.start; });
    (e.x_dates || []).forEach(function (x) { if (x.enabled === true) { var m = T.inputDateToMs(e, x); if (m !== null) dates.push(m); } });
    if (!dates.length) return [];
    dates.sort(function (a, b) { return a - b; });
    var key = dates[0] + ":" + dates[dates.length - 1] + ":" + dates.length;
    if (astroCache.key !== key) {
      var t0 = dates[0] - 3 * DAY, t1 = dates[dates.length - 1] + 3 * DAY, list = [];
      if (t1 - t0 < 400 * 365.25 * DAY) list = NC.sky.moonPhasesBetween(t0, t1);
      var E = NC.sky.eclipses();
      E.solar.concat(E.lunar).forEach(function (x) { if (x.ms >= t0 && x.ms <= t1) list.push(x); });
      astroCache = { key: key, list: list, dates: dates };
    }
    return astroCache.list.map(function (a) {
      var tol = a.kind === "eclipse" ? C.ECLIPSE_TOLERANCE_DAYS * DAY : 1.5 * DAY, lo = 0, hi = dates.length - 1, near = false;
      var probe = a.kind === "eclipse" ? a.ms : a.ms - DAY / 2;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (Math.abs(dates[mid] - probe) <= tol) { near = true; break; } if (dates[mid] < probe) lo = mid + 1; else hi = mid - 1; }
      return near ? a : null;
    }).filter(Boolean);
  }
  function astroGlyph(a) {
    if (a.kind === "moon") return { glyph: a.phase.glyph, name: a.phase.name, field: a.phase.field };
    var name = (a.total ? "Total " : "Partial ") + a.body + " eclipse";
    var field = a.body === "solar" ? (a.total ? "chart_option__full_solar_eclipses" : "chart_option__partial_solar_eclipses") : (a.total ? "chart_option__full_lunar_eclipses" : "chart_option__partial_lunar_eclipses");
    return { glyph: a.body === "solar" ? (a.total ? "◉" : "◐") : (a.total ? "⬤" : "◑"), name: name, field: field };
  }

  function todayUtcDay(res) {
    if (!hh()) return res.cutoff != null ? res.cutoff : NC.engine.cutoffFor({ scope: C.SCOPE.DAYS }, S.nowMs());
    var w = T.wall(S.nowMs(), res.zone); return T.utcMs(w.y, w.m, w.d);
  }

  function renderResults(res) {
    var e = ev(), zone = res.zone, body = $("resultsBody"), status = $("status"), empty = $("emptyState");
    $("results").closest(".results-panel").classList.remove("stale");
    $("chartPanel").classList.remove("stale");
    var enabledX = (e.x_dates || []).filter(function (x) { return x.enabled === true; }).length;
    var ops = res.ops.filter(function (o) { return o.enabled; });
    var badOps = ops.filter(function (o) { return o.errors.length; }).length;

    // status line
    var bits = [];
    if (res.errors.length) bits.push(el("span.err", { text: res.errors.join(" ") }));
    else {
      bits.push(el("span", {}, [el("b", { text: String(res.ys.length) }), " Y-pair" + (res.ys.length === 1 ? "" : "s")]));
      bits.push(el("span", {}, [el("b", { text: String(ops.length - badOps) }), " operation" + (ops.length - badOps === 1 ? "" : "s")]));
      bits.push(el("span", {}, [el("b", { text: String(res.zs.length) }), " Z-Dates projected, ", el("b", { text: String(res.byDate.length) }), " shown"]));
      bits.push(el("span", { text: (hh() ? zone + " · sunset days" : "UTC days") + " · " + res.elapsedMs + " ms" }));
    }
    if (badOps) bits.push(el("span.err", { text: badOps + " operation" + (badOps === 1 ? " has" : "s have") + " an error — see Operations" }));
    D.fill(status, bits);

    // results
    var rows = res.sorted;
    if (search) {
      var q = search.toLowerCase();
      rows = rows.filter(function (t) {
        return zLabel(t, zone).indexOf(q) >= 0 || t.msrf.some(function (m) { return String(m.number).indexOf(q) >= 0; }) || String(t.score) === q;
      });
    }
    $("resultCount").textContent = res.errors.length ? "" : rows.length + (search ? " of " + res.sorted.length : "");
    var today = todayUtcDay(res), marksByDay = new Map();
    // The Marks column carries only the strong signals: new and full moons, eclipses.
    astroFor(res).filter(function (a) { return a.kind === "eclipse" || a.phase.key === "new" || a.phase.key === "full"; }).forEach(function (a) {
      var g = astroGlyph(a), day = Math.floor(a.ms / DAY) * DAY;
      [day - DAY, day, day + DAY].forEach(function (d) { if (!marksByDay.has(d)) marksByDay.set(d, []); marksByDay.get(d).push(g); });
    });

    var frag = document.createDocumentFragment();
    rows.slice(0, showAll ? rows.length : ROW_LIMIT).forEach(function (t, i) {
      var dayMs = hh() ? (function () { var w = T.wall(t.start, zone); return T.utcMs(w.y, w.m, w.d); })() : t.start;
      var rz = NC.chron.resonance(dayMs, today);
      var sky = (marksByDay.get(dayMs) || []).filter(function (g, k, arr) { return arr.findIndex(function (h) { return h.name === g.name; }) === k; });
      var dateCell = el("td.date", {}, [zLabel(t, zone), el("small", { text: hh() ? "→ " + T.msToDateString(t.end, zone) + " " + T.msToTimeString(t.end, zone) : T.weekday(t.start, "UTC") })]);
      var hitClass = t.hits >= 4 ? "h4" : "h" + t.hits;
      var msrf = el("div.pills", {}, t.msrf.map(function (m) { return el("span.pill." + m.cls.key, { text: m.number, title: m.cls.name + " MSRF, from Z = " + m.r.z }); }));
      var opsCell = el("div.pills", {}, t.ops.map(function (h) {
        return el("span.pill." + (h.r.op.weight >= C.POINTS_ALPHA ? "alpha" : "beta"), { text: "#" + (h.r.opIndex + 1), title: "Operation " + (h.r.opIndex + 1) + ": " + h.r.op.equation + " · X" + (h.y.x1 + 1) + "→X" + (h.y.x2 + 1) + " · Y " + h.y.Y + " · Z " + h.r.zValue });
      }));
      var marks = el("td.marks", {}, [
        rz.palindrome ? el("span", { title: "Palindromic date", text: "⮌ " }) : null,
        rz.by138 ? el("span.m138", { title: rz.distance + " days from today, a multiple of 138", text: "138" }) : null,
        rz.by19 ? el("span.m19", { title: rz.distance + " days from today, a multiple of 19", text: "19" }) : null,
        sky.map(function (g) { return el("span", { title: g.name + " within a day", text: g.glyph }); })
      ]);
      var tr = el("tr", { data: { key: t.key }, "aria-selected": String(t.key === S.state.selectedKey), tabindex: "0" }, [
        el("td.num", { text: String(i + 1) }),
        dateCell,
        el("td.num", { text: res.last != null ? "+" + Math.round((t.start - res.last) / DAY) : "" }),
        el("td.num.score", { text: String(t.score) }),
        el("td.num.hits", {}, [el("span.glyph." + hitClass), String(t.hits)]),
        el("td", {}, msrf),
        el("td", {}, opsCell),
        marks
      ]);
      frag.appendChild(tr);
    });
    if (!showAll && rows.length > ROW_LIMIT) {
      frag.appendChild(el("tr", {}, [el("td", { colspan: "8", style: { "text-align": "center" } }, [el("button.ghost", { type: "button", text: "Show all " + rows.length, onclick: function () { showAll = true; renderResults(res); } })])]));
    }
    body.replaceChildren(frag);

    // empty state
    if (res.errors.length || !rows.length) {
      var head, text;
      if (enabledX < 2) { head = "Seed the anchors"; text = "Add two or more X-Dates — the days you want to project from."; }
      else if (res.errors.length) { head = "Not yet"; text = res.errors[0]; }
      else if (search) { head = "Nothing matches"; text = "No Z-Date matches “" + search + "”."; }
      else { head = "Every projection was filtered out"; text = "Loosen a filter on the left — “Before today” and “Beyond N days” hide the most."; }
      D.fill(empty, [el("b", { text: head }), text]);
      empty.hidden = false;
    } else empty.hidden = true;

    // chart
    var showChart = C.fieldOn(e, "chart_option__show_chart");
    $("chartPanel").hidden = !showChart;
    if (showChart) {
      NC.chart.set(Object.assign(chartData(res), { selected: S.state.selectedKey }), lastChartEventKey === chartKey());
      lastChartEventKey = chartKey();
    }
  }
  var lastChartEventKey = null;
  function chartKey() { var e = ev(); return S.state.current + "|" + JSON.stringify(e.x_dates) + "|" + e.scope; }

  function select(key, open) {
    S.state.selectedKey = key;
    Array.prototype.forEach.call($("resultsBody").querySelectorAll("tr[data-key]"), function (tr) { tr.setAttribute("aria-selected", String(tr.dataset.key === key)); });
    var res = S.state.results;
    if (res) {
      var t = res.byDate.find(function (x) { return x.key === key; });
      if (t) {
        NC.chart.focusOn(t.start);
        var row = $("resultsBody").querySelector('tr[data-key="' + key + '"]');
        if (row && !open) row.scrollIntoView({ block: "nearest" });
      }
      renderChartSelection();
    }
    if (open) openDetail(key);
  }
  function renderChartSelection() {
    var res = S.state.results; if (!res) return;
    NC.chart.set(Object.assign(chartData(res), { selected: S.state.selectedKey }), true);
  }
  function chartData(res) {
    var e = ev(), zone = res.zone;
    var xs = (e.x_dates || []).map(function (x, i) { return { ms: T.inputDateToMs(e, x), enabled: x.enabled === true, label: "X" + (i + 1) }; }).filter(function (x) { return x.ms !== null; });
    var ts = (e.t_dates || []).filter(function (x) { return x.enabled === true; }).map(function (x) { return T.inputDateToMs(e, x); }).filter(function (m) { return m !== null; });
    var zs = res.byDate.map(function (t) {
      return { key: t.key, start: t.start, score: t.score, hits: t.hits, ordinal: t.ordinal, best: msrfBest(t), label: zLabel(t, zone),
        msrfText: t.msrf.map(function (m) { return m.number + " " + m.cls.name.toLowerCase(); }).join(", "),
        arcs: t.ops.map(function (h) { return { from: h.r.xFrom, alpha: h.r.op.weight >= C.POINTS_ALPHA }; }) };
    });
    var layerAstro = astroFor(res).map(function (a) {
      var g = astroGlyph(a);
      return C.fieldOn(e, g.field) ? { ms: a.ms, name: g.name, phase: a.kind === "moon" ? a.phase.lon : null, body: a.body || null, total: !!a.total } : null;
    }).filter(Boolean);
    return { xs: xs, ts: ts, zs: zs, today: S.nowMs(), astro: layerAstro, showDates: C.fieldOn(e, "chart_option__show_dates") };
  }

  /* =============================================================== DETAIL */
  function openDetail(key) {
    var res = S.state.results, t = res && res.byDate.find(function (x) { return x.key === key; });
    if (!t) return;
    var e = ev(), zone = res.zone, body = $("detailBody");
    $("detailTitle").textContent = "Z" + (t.ordinal + 1) + " · " + zLabel(t, zone);
    var dayMs = hh() ? (function () { var w = T.wall(t.start, zone); return T.utcMs(w.y, w.m, w.d); })() : t.start;
    var rz = NC.chron.resonance(dayMs, todayUtcDay(res));
    var multTxt = res.system === C.SCORING.GTE_V8 && t.multiplier > 1 ? " × " + t.multiplier + " (best MSRF: " + t.msrf[0].cls.name + ")" : "";
    var msrfPoints = NC.engine.msrfSubscore(t.msrf, res.system);
    var kids = [
      el("p", {}, hh() ? ["The window from the sunset of ", el("b", { text: T.msToDateString(t.start, zone) + " " + T.msToTimeString(t.start, zone) }), " to the sunset of ", el("b", { text: T.msToDateString(t.end, zone) + " " + T.msToTimeString(t.end, zone) }), " (" + zone + ")."]
        : [el("b", { text: T.weekday(t.start, "UTC") + " " + T.msToDateString(t.start, "UTC") }), ", " + (res.last != null ? Math.round((t.start - res.last) / DAY) + " days after the last X-Date, " : "") + Math.abs(rz.distance) + " days " + (rz.distance >= 0 ? "from" : "before") + " today."]),
      el("p.score-line", {}, ["score ", el("b", { text: String(t.score) }), " = (" + t.opScore + " operation point" + (t.opScore === 1 ? "" : "s") + " + " + msrfPoints + " MSRF point" + (msrfPoints === 1 ? "" : "s") + ")" + multTxt + " · " + t.hits + " hit" + (t.hits === 1 ? "" : "s")]),
      el("h3", { text: "Derivation — " + t.ops.length + (t.ops.length === 1 ? " projection lands here" : " projections land here") }),
      el("ol.derive", {}, t.ops.map(function (h) {
        var from = h.r.op.startingX === 1 ? h.y.x1 : h.y.x2;
        var m = t.msrf.find(function (x) { return x.r === h.r; });
        return el("li" + (m ? ".msrf" : ""), {}, [
          el("div.eq", { text: "#" + (h.r.opIndex + 1) + "  " + h.r.op.equation + (h.r.op.weight >= C.POINTS_ALPHA ? "  · alpha +1" : "  · beta +½") }),
          el("div.path", { text: "X" + (h.y.x1 + 1) + " " + T.msToDateString(h.y.x1Ms, zone) + " → X" + (h.y.x2 + 1) + " " + T.msToDateString(h.y.x2Ms, zone) + " · Y = " + h.y.Y + " · Z = " + h.r.zValue + " days from X" + (from + 1) + (m ? " · MSRF " + m.cls.name + " " + m.number : "") })
        ]);
      })),
      rz.palindrome || rz.by19 || rz.by138 ? el("p.mono.small", { text: "Resonance: " + [rz.palindrome ? "⮌ palindromic date" : "", rz.by19 ? rz.distance + " days = 19 × " + rz.distance / 19 : "", rz.by138 ? rz.distance + " days = 138 × " + rz.distance / 138 : ""].filter(Boolean).join(" · ") }) : null,
      el("div.drawer-actions", {}, [
        el("button", { type: "button", text: "Open in Chronicon", onclick: function () { $("detailDialog").close(); NC.chronView.show(dayMs); } }),
        el("button.ghost", { type: "button", text: "Add as X-Date", onclick: function () { addFromZ(t, "x"); } }),
        el("button.ghost", { type: "button", text: "Add as T-Date", onclick: function () { addFromZ(t, "t"); } })
      ])
    ];
    D.fill(body, kids);
    if (!$("detailDialog").open) $("detailDialog").showModal();
  }
  function addFromZ(t, kind) {
    var zone = S.state.results.zone, d = T.msToInputDate(t.start, zone);
    if (hh()) d = T.msToInputDate(t.end - 60000, zone);   // inside the window, before its closing sunset
    S.change(function (e) { var k = kind === "x" ? "x_dates" : "t_dates"; e[k] = (e[k] || []).concat([d]); });
    renderDates(kind);
    D.toast("Added " + d.date + " as a" + (kind === "x" ? "n X" : " T") + "-Date.");
  }

  /* ================================================================= WIRE */
  function init() {
    $("evName").addEventListener("input", function () { var v = this.value; S.change(function (e) { e.name = v; }, { run: false }); NC.app.renderEventPicker(); });
    ["evLat", "evLong"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        var lat = parseFloat($("evLat").value), lon = parseFloat($("evLong").value);
        var ok = T.validLatLong(lat, lon);
        $("evLat").setAttribute("aria-invalid", String(!(Number.isFinite(lat) && Math.abs(lat) <= C.LAT_LIMIT)));
        $("evLong").setAttribute("aria-invalid", String(!(Number.isFinite(lon) && Math.abs(lon) <= C.LONG_LIMIT)));
        if (!ok) { D.toast("Latitude must be within ±" + C.LAT_LIMIT + "° and longitude within ±180°.", true); return; }
        S.change(function (e) { e.lat = NC.roundTo(lat, 2); e.long = NC.roundTo(lon, 2); });
        $("evZone").textContent = T.eventZone(ev());
        renderDates("x"); renderDates("t");
      });
    });
    var sel = $("placeSel");
    (NC.PLACES || []).forEach(function (p, i) { sel.appendChild(el("option", { value: String(i), text: p[0] + "  (" + p[1] + ", " + p[2] + ")" })); });
    sel.addEventListener("change", function () {
      var p = NC.PLACES[+sel.value]; if (!p) return;
      S.change(function (e) { e.lat = p[1]; e.long = p[2]; });
      $("evLat").value = p[1]; $("evLong").value = p[2]; $("evZone").textContent = T.eventZone(ev());
      sel.value = ""; renderDates("x"); renderDates("t");
    });
    $("evDayStart").addEventListener("change", function () {
      var m = /^(\d{2}):(\d{2})/.exec(this.value || "00:00"), ms = m ? (+m[1] * 3600000 + +m[2] * 60000) : 0;
      S.change(function (e) { e.day_scope_start_time_in_millis = ms; });
    });
    $("evNotes").addEventListener("input", function () { var v = this.value; S.change(function (e) { e.notes = v; }, { run: false }); });
    $("xAddBtn").addEventListener("click", function () { addDate("x"); });
    $("tAddBtn").addEventListener("click", function () { addDate("t"); });
    $("xPasteBtn").addEventListener("click", openPaste);
    $("sortSel").addEventListener("change", function () { var v = this.value; S.change(function (e) { e.z_date_sort_type = v; }, { immediate: true }); });
    $("zSearch").addEventListener("input", D.debounce(function () { search = $("zSearch").value.trim(); if (S.state.results) renderResults(S.state.results); }, 150));
    $("csvBtn").addEventListener("click", function () { NC.files.saveCsv(); });
    $("chartFit").addEventListener("click", function () { NC.chart.fit(); });
    $("chartPng").addEventListener("click", function () { NC.chart.toPng(D.safeName(ev().name) + "_timeline.png"); });
    $("resultsBody").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-key]"); if (tr) select(tr.dataset.key, true); });
    $("resultsBody").addEventListener("keydown", function (e) {
      var tr = e.target.closest("tr[data-key]"); if (!tr) return;
      if (e.key === "Enter" || e.key === " ") { select(tr.dataset.key, true); e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var n = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
        if (n && n.dataset.key) { n.focus(); select(n.dataset.key, false); e.preventDefault(); }
      }
    });
    NC.chart.init($("chart"), $("chartTip"), { select: function (k) { select(k, false); }, open: function (k) { select(k, true); } });
    S.on("running", function () { $("status").classList.add("busy"); });
    S.on("results", function (res) { $("status").classList.remove("busy"); showAll = false; renderResults(res); });
    S.on("event", function (opts) {
      if (opts && opts.run === false) return;
      $("results").closest(".results-panel").classList.add("stale");
    });
  }

  NC.cipher = { init: init, renderEvent: renderEvent, renderDates: renderDates, select: select, parseDateList: parseDateList, zLabel: zLabel };
})(typeof window !== "undefined" ? window : globalThis);
