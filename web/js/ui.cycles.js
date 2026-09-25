/* ==========================================================================
   ui.cycles.js — the Cycles panel and the Backtest window
   --------------------------------------------------------------------------
   Presentation only; the arithmetic is in ophis.cycles.js. Settings are kept
   in this browser under their own key, not in the .oph document, so a saved
   file is exactly what the desktop program would write.
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = root.Ophis.UI;
  var Store = root.Ophis.Store;
  var Cycles = root.Ophis.Cycles;
  var T = root.Ophis.Time;
  var C = root.Ophis.C;

  var KEY = "ophis.web.cycles.v1";
  var V = { settings: loadSettings(), analysis: null };

  function loadSettings() {
    var saved = null;
    try { saved = JSON.parse(root.localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    var out = {};
    Object.keys(Cycles.DEFAULTS).forEach(function (k) {
      out[k] = (saved && saved[k] !== undefined) ? saved[k] : Cycles.DEFAULTS[k];
    });
    return out;
  }
  V.saveSettings = function () {
    try { root.localStorage.setItem(KEY, JSON.stringify(V.settings)); } catch (e) { /* private mode */ }
  };

  /** Recompute the echoes for whatever the engine last produced. Cheap. */
  V.refresh = function () {
    var event = Store.currentEvent();
    V.analysis = (event && Store.results && !(Store.results.errors || []).length)
      ? Cycles.analyze(event, Store.results, V.settings)
      : null;
    return V.analysis;
  };

  /* ------------------------------------------------------------- helpers */

  function num(value, places) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    return Number(value).toFixed(places);
  }
  function pText(p) {
    if (p === null || p === undefined || isNaN(p)) return "—";
    return p < 0.001 ? "p < 0.001" : "p = " + p.toFixed(3);
  }
  function signed(days) { return (days >= 0 ? "+" : "−") + Math.abs(days).toFixed(1) + "d"; }
  function signedDays(days) { return (days >= 0 ? "+" : "−") + Math.abs(Math.round(days)) + "d"; }
  function xLabel(index) { return UI.label("X", index); }

  function echoText(echo) {
    var def = Cycles.definition(echo.cycle);
    var times = Math.abs(echo.k);
    return xLabel(echo.xIndex) + (echo.k > 0 ? " + " : " − ") + (times === 1 ? "" : times + "×") + def.short +
      ' <span class="muted">off ' + signed(echo.r) + '</span>' +
      (echo.cycle === "metonic" && echo.sameMoon ? ' <span class="cyc-moon" data-tip="Same phase of the Moon as that X-Date">same Moon</span>' : "");
  }

  /** The short tag the output table shows on an echoing Z-Date. */
  V.tagFor = function (key) {
    var echoes = V.analysis && V.analysis.byKey[key];
    if (!echoes || !echoes.length) return "";
    var first = echoes[0];
    var def = Cycles.definition(first.cycle);
    var tip = echoes.map(function (e) {
      var d = Cycles.definition(e.cycle);
      return "X" + (e.xIndex + 1) + (e.k > 0 ? " + " : " − ") + Math.abs(e.k) + " × " + d.label + " (off " + signed(e.r) + ")" +
        (e.cycle === "metonic" && e.sameMoon ? ", same Moon" : "");
    }).join("; ");
    return ' <span class="cyc-tag cyc-' + first.cycle + '" data-tip="' + UI.esc("Cycle echo: " + tip) + '">' +
      def.glyph + " " + def.short + (echoes.length > 1 ? " +" + (echoes.length - 1) : "") + "</span>";
  };

  function verdictHtml(summary, what) {
    if (!summary) return "";
    return '<div class="cyc-verdict v-' + summary.verdict.level + '">' +
      '<div class="cyc-numbers"><b>' + summary.observed + '</b> ' + what +
      ' <span class="muted">· chance alone ≈ ' + num(summary.expected, 2) + " · " + pText(summary.pValue) + '</span></div>' +
      '<div class="cyc-verdict-text">' + UI.esc(summary.verdict.text) + '</div>' +
      '</div>';
  }

  /* --------------------------------------------------------------- panel */

  V.renderPanel = function (host) {
    var s = V.settings;
    var a = V.analysis;
    var count = a && a.summary ? a.summary.observed : 0;

    var html =
      '<header class="panel-head">' +
        '<h2>Cycles</h2>' +
        '<span class="count">' + count + " echo" + (count === 1 ? "" : "es") + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-action="backtest" data-tip="Would the cast have projected your later events from your earlier ones?">Backtest…</button>' +
      '</header>' +
      '<p class="panel-hint">Z-Dates a whole number of cycles from one of your X-Dates, measured against what random dates would give. Reading only — never changes a hit or a score.</p>' +
      '<div class="cyc-controls">';

    Cycles.DEFINITIONS.forEach(function (def) {
      html += '<label class="cyc-toggle" data-tip="' + UI.esc(def.note) + '">' +
        '<span class="tick"><input type="checkbox" data-cycle="' + def.id + '"' + (s[def.id] ? " checked" : "") + '><span></span></span>' +
        '<span class="cyc-glyph cyc-' + def.id + '">' + def.glyph + '</span> ' + UI.esc(def.label) +
        ' <span class="muted">' + def.short + '</span></label>';
    });
    html += '<label class="cyc-tol">within <select data-cycle-tolerance aria-label="Tolerance in days">' +
      [1, 2, 3].map(function (d) { return '<option value="' + d + '"' + (s.tolerance === d ? " selected" : "") + '>±' + d + ' day' + (d > 1 ? "s" : "") + '</option>'; }).join("") +
      '</select></label></div>';

    if (!a) {
      host.innerHTML = html + '<p class="empty">Cast the event to look for echoes.</p>';
      return;
    }
    if (!a.defs.length) {
      host.innerHTML = html + '<p class="empty">Turn on a cycle to look for echoes.</p>';
      return;
    }

    a.reach.forEach(function (r) {
      if (r.possible) return;
      var def = Cycles.definition(r.cycle);
      html += '<p class="cyc-note">A ' + UI.esc(def.label) + ' echo needs dates at least ' + (def.id === "metonic" ? "19" : "138") +
        ' years apart; what is on screen spans ' + num(r.spanYears, 1) + ' years. Add X-Dates from ' +
        (def.id === "metonic" ? "19, 38 or 57" : "138") + ' years before your recent ones to look for it.</p>';
    });

    html += verdictHtml(a.summary, "of " + (a.summary ? a.summary.trials : 0) + " Z-Dates echo an X-Date");

    if (a.list.length) {
      html += '<ul class="cyc-list">';
      a.list.slice(0, 14).forEach(function (item) {
        html += '<li data-cyc-z="' + UI.esc(item.key) + '" role="button" tabindex="0" class="' + (Store.selection.zKey === item.key ? "selected" : "") + '">' +
          '<span class="cyc-date">' + UI.esc(item.zStruct.z_readable_start) + '</span>' +
          '<span class="cyc-what">' + item.echoes.map(echoText).join("<br>") + '</span></li>';
      });
      if (a.list.length > 14) html += '<li class="muted cyc-more">and ' + (a.list.length - 14) + ' more — tagged in the table</li>';
      html += '</ul>';
    }

    if (a.pairSummary) {
      html += '<h3 class="cyc-sub">Your X-Dates</h3>';
      if (a.pairs.length) {
        html += '<ul class="cyc-list pairs">' + a.pairs.map(function (p) {
          var def = Cycles.definition(p.cycle);
          return '<li><span class="cyc-what">' + xLabel(p.older) + " → " + xLabel(p.newer) + " are " + (p.k === 1 ? "one" : p.k) + " " +
            UI.esc(def.label) + " cycle" + (p.k === 1 ? "" : "s") + ' apart <span class="muted">off ' + signed(p.r) + '</span>' +
            (p.cycle === "metonic" && p.sameMoon ? ' <span class="cyc-moon">same Moon</span>' : "") + '</span></li>';
        }).join("") + '</ul>';
      }
      html += verdictHtml(a.pairSummary, "of " + a.pairSummary.trials + " long-enough pairs are cycle-linked");
    }

    host.innerHTML = html;
  };

  /* ------------------------------------------------------------ backtest */

  function stepRow(step, tolerance, topN, allEvents) {
    var known = step.knownIndices.map(xLabel).join(" ");
    var date = step.targetInstant.toISOString().slice(0, 10);
    var cls = (step.future || step.inWindow === false) ? "bt-future" : (step.hit ? (step.topHit ? "bt-top" : "bt-hit") : "bt-miss");
    var result;
    if (step.error) result = '<span class="warn-text">' + UI.esc(step.error) + '</span>';
    else if (step.hit) result = '<b>Hit</b> · rank ' + step.best.rank + " of " + step.projected + (step.best.off ? ' <span class="muted">(off ' + signedDays(step.best.off) + ')</span>' : "");
    else if (step.inWindow === false) result = '<span class="muted">Beyond the projection horizon (' + step.windowDays + ' days) — not scored</span>';
    else result = 'Miss' + (step.nearest ? ' <span class="muted">· nearest off ' + signedDays(step.nearest.off) + '</span>' : ' <span class="muted">· nothing projected</span>');
    // A date still in the future has no outcome yet: its result is shown, not scored.
    if (step.future && !step.error) result += '<div class="muted bt-unscored">hasn\u2019t happened yet \u2014 shown, not scored</div>';
    return '<tr class="' + cls + '">' +
      (allEvents ? '<td class="muted">' + UI.esc(step.eventName || "") + '</td>' : "") +
      '<td class="lbl">' + known + '</td>' +
      '<td class="lbl">' + xLabel(step.targetIndex) + ' <span class="mono">' + date + '</span></td>' +
      '<td>' + result + '</td>' +
      '<td class="num">' + (step.error || step.inWindow === false ? "—" : (100 * step.chanceHit).toFixed(1) + "%") + '</td>' +
      '</tr>';
  }

  function backtestBody(tolerance, allEvents) {
    var topN = V.settings.topN;
    var events = allEvents ? Store.events : [Store.currentEvent()];
    var now = T.currentInstant(0);
    var steps = [];
    events.forEach(function (event) {
      Cycles.backtestEvent(event, { tolerance: tolerance, topN: topN }).forEach(function (step) {
        step.future = step.targetInstant.getTime() > now.getTime();
        steps.push(step);
      });
    });
    var notFuture = steps.filter(function (s) { return !s.future; });
    var summary = Cycles.summarize(notFuture, topN);
    var futureCount = steps.length - notFuture.length;
    var beyondCount = notFuture.filter(function (s) { return !s.error && s.inWindow === false; }).length;

    var html =
      '<p>For each of your events from the third on, this stands on the day of the one before, gives the engine only the events up to then, ' +
      'and checks whether it projected the next. The control is a random date in the same window: the share of that window the projections ' +
      'happen to cover is the chance of a hit by luck alone. Nothing about your document changes.</p>' +
      '<div class="bt-controls">' +
        '<label>Match within <select data-bt-tolerance>' + [0, 1, 3, 7].map(function (d) {
          return '<option value="' + d + '"' + (tolerance === d ? " selected" : "") + '>' + (d === 0 ? "the exact day" : "±" + d + " day" + (d > 1 ? "s" : "")) + '</option>';
        }).join("") + '</select></label>' +
        '<label>Events <select data-bt-scope>' +
          '<option value="one"' + (allEvents ? "" : " selected") + '>this event</option>' +
          '<option value="all"' + (allEvents ? " selected" : "") + '>all ' + Store.events.length + ' events</option>' +
        '</select></label>' +
      '</div>';

    if (!steps.length) {
      return html + '<p class="empty">Needs at least ' + (C.MINIMUM_NUMBER_OF_X_DATES + 1) + ' enabled X-Dates: two to cast from and a later one to test against.</p>';
    }

    // With nothing scoreable, "0 of 0" boxes would only be noise; the notes below say why.
    if (summary.any.trials) html += '<div class="bt-summary">' +
      verdictHtml(summary.any, "of " + summary.any.trials + " events were projected within " + (tolerance ? "±" + tolerance + " day" + (tolerance > 1 ? "s" : "") : "the exact day")) +
      verdictHtml(summary.top, "of " + summary.top.trials + " were in the top " + topN + " by score") +
      '</div>';

    if (futureCount) {
      html += '<p class="cyc-note">' + futureCount + ' of these X-Dates ' + (futureCount === 1 ? "is" : "are") + ' still in the future, so ' +
        (futureCount === 1 ? "it is" : "they are") + ' shown but not scored: a backtest can only measure prediction against events that have already happened.</p>';
    }
    if (beyondCount) {
      html += '<p class="cyc-note">' + beyondCount + ' event' + (beyondCount === 1 ? " falls" : "s fall") + ' beyond the projection horizon set by the ' +
        '\u201cHide beyond N days\u201d filter, so ' + (beyondCount === 1 ? "it" : "they") + ' could not have been projected and ' +
        (beyondCount === 1 ? "is" : "are") + ' not scored. Widen that filter to test ' + (beyondCount === 1 ? "it" : "them") + '.</p>';
    }
    if (summary.any.trials && summary.any.trials < 8) {
      html += '<p class="cyc-note">Only ' + summary.any.trials + ' scored step' + (summary.any.trials === 1 ? "" : "s") +
        ' — too few to tell skill from luck either way. Every past event you add makes the answer firmer.</p>';
    }

    html += '<div class="detail-scroll"><table class="detail-table bt-table"><thead><tr>' +
      (allEvents ? '<th>Event</th>' : "") + '<th>Known</th><th>Next event</th><th>Result</th><th class="num">Chance</th>' +
      '</tr></thead><tbody>' + steps.map(function (s) { return stepRow(s, tolerance, topN, allEvents); }).join("") + '</tbody></table></div>';
    return html;
  }

  V.openBacktest = function () {
    var tolerance = V.settings.backtestTolerance;
    var allEvents = V.settings.allEvents === true;
    var modal = UI.modal("Backtest", '<div class="bt-host"></div>');
    var body = modal.host.querySelector(".bt-host");
    // Tooltips inside the dialog come from the page-wide binding (app.js);
    // binding again on every redraw would stack duplicate listeners.
    function draw() {
      body.innerHTML = backtestBody(tolerance, allEvents);
    }
    body.addEventListener("change", function (event) {
      if (event.target.matches("[data-bt-tolerance]")) tolerance = parseInt(event.target.value, 10);
      if (event.target.matches("[data-bt-scope]")) allEvents = event.target.value === "all";
      V.settings.backtestTolerance = tolerance;
      V.settings.allEvents = allEvents;
      V.saveSettings();
      draw();
    });
    draw();
  };

  /* --------------------------------------------------------------- wiring */

  V.bind = function (host) {
    UI.on(host, "change", "[data-cycle]", function (e, target) {
      V.settings[target.getAttribute("data-cycle")] = target.checked;
      V.saveSettings();
      Store.notify("cycles");
    });
    UI.on(host, "change", "[data-cycle-tolerance]", function (e, target) {
      V.settings.tolerance = parseInt(target.value, 10);
      V.saveSettings();
      Store.notify("cycles");
    });
    UI.on(host, "click", "[data-cyc-z]", function (e, target) {
      Store.selection.zKey = target.getAttribute("data-cyc-z");
      Store.selection.operationHash = null;
      Store.notify("selection");
    });
    UI.on(host, "keydown", "[data-cyc-z]", function (e, target) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); target.click(); }
    });
    UI.on(host, "click", '[data-action="backtest"]', function () { V.openBacktest(); });
  };

  root.Ophis.CyclesView = V;
})(typeof window !== "undefined" ? window : globalThis);
