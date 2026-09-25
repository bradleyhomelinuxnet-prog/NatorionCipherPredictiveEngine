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
    // Whatever is stored, each setting comes back as one of its allowed values.
    return Cycles.sanitizeSettings(saved);
  }
  V.saveSettings = function () {
    try { root.localStorage.setItem(KEY, JSON.stringify(V.settings)); } catch (e) { /* private mode */ }
  };

  /* The page re-renders on every selection, sort and toggle, but the echoes
     change only with a new cast, other settings or other X-Dates. */
  var memo = { results: null, key: null };

  /** Recompute the echoes for whatever the engine last produced. */
  V.refresh = function () {
    var event = Store.currentEvent();
    var results = Store.results;
    var key = JSON.stringify([V.settings, event.x_dates, event.scope, event.lat, event.long]);
    if (memo.results === results && memo.key === key) return V.analysis;
    V.analysis = (results && !(results.errors || []).length) ? Cycles.analyze(event, results, V.settings) : null;
    memo = { results: results, key: key };
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
      '<div class="cyc-numbers"><b>' + summary.observed + '</b> ' + UI.esc(what) +
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

    // Each control carries a data-focus-key, so the re-render that follows a
    // change hands keyboard focus back to it.
    Cycles.DEFINITIONS.forEach(function (def) {
      html += '<label class="cyc-toggle" data-tip="' + UI.esc(def.note) + '">' +
        '<span class="tick"><input type="checkbox" data-cycle="' + def.id + '" data-focus-key="cyc-' + def.id + '"' +
        (s[def.id] ? " checked" : "") + '><span></span></span>' +
        '<span class="cyc-glyph cyc-' + def.id + '">' + def.glyph + '</span> ' + UI.esc(def.label) +
        ' <span class="muted">' + def.short + '</span></label>';
    });
    html += '<label class="cyc-tol">within <select data-cycle-tolerance data-focus-key="cyc-tolerance" aria-label="Tolerance in days">' +
      Cycles.CHOICES.tolerance.map(function (d) { return '<option value="' + d + '"' + (s.tolerance === d ? " selected" : "") + '>±' + d + ' day' + (d > 1 ? "s" : "") + '</option>'; }).join("") +
      '</select></label></div>';

    if (!a) {
      var blocked = Store.results && (Store.results.errors || []).length;
      host.innerHTML = html + '<p class="empty">' + (blocked
        ? "Echoes appear once the engine can project; the Output panel says what it needs."
        : "Nothing has been projected yet.") + '</p>';
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

    // When no enabled cycle fits in the span on screen, the notes above say
    // so; a "0 of N" verdict beneath them would only repeat it.
    if (a.reach.some(function (r) { return r.possible; })) {
      html += verdictHtml(a.summary, "of " + (a.summary ? a.summary.trials : 0) + " Z-Dates echo an X-Date");
    }

    if (a.list.length) {
      html += '<ul class="cyc-list">';
      a.list.slice(0, 14).forEach(function (item) {
        // A real button: Enter and Space work natively, and aria-pressed
        // says which row is the selected Z-Date.
        html += '<li><button type="button" class="cyc-row" data-cyc-z="' + UI.esc(item.key) + '"' +
          ' data-focus-key="cyc-z-' + UI.esc(item.key) + '" aria-pressed="' + (Store.selection.zKey === item.key) + '">' +
          '<span class="cyc-date">' + UI.esc(item.zStruct.z_readable_start) + '</span>' +
          '<span class="cyc-what">' + item.echoes.map(echoText).join("<br>") + '</span></button></li>';
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

  var BACKTEST_INTRO =
    '<p>For each of your events from the third on, this stands on the day of the one before, gives the engine only the events up to then, ' +
    'and checks whether it projected the next. Chance is measured near the real date: the share of the ' + Cycles.LOCAL_CONTROL_DAYS +
    ' days either side of it that the projections happen to cover is the chance of a hit by luck alone. (A random date anywhere in the ' +
    'years ahead would flatter the cast, since projections crowd the weeks after the last event, and so do real events.) ' +
    'Nothing about your document changes.</p>';

  /** Why a step could not be scored, when its event lies outside what the cast could reach. */
  function outsideText(step) {
    if (step.outside === "same-day") return "Same day as the event before it \u2014 not scored";
    if (step.outside === "beyond-filter") return "Beyond the projection horizon (" + step.windowDays + " days) \u2014 not scored";
    return "After the furthest projection (" + step.windowDays + " days out) \u2014 not scored";
  }

  function stepRow(step, allEvents) {
    var known = step.knownIndices.map(xLabel).join(" ");
    var outside = !step.error && step.inWindow === false;
    var cls = step.future ? "bt-future" : (outside ? "bt-outside" : (step.hit ? (step.topHit ? "bt-top" : "bt-hit") : "bt-miss"));
    var result;
    if (step.error) result = '<span class="warn-text">' + UI.esc(step.error) + '</span>';
    else if (step.hit) result = '<b>Hit</b> · rank ' + step.best.rank + " of " + step.projected + (step.best.off ? ' <span class="muted">(off ' + signedDays(step.best.off) + ')</span>' : "");
    else if (outside) result = '<span class="muted">' + outsideText(step) + '</span>';
    else result = 'Miss' + (step.nearest ? ' <span class="muted">· nearest off ' + signedDays(step.nearest.off) + '</span>' : ' <span class="muted">· nothing projected</span>');
    // A date still in the future has no outcome yet: its result is shown, not scored.
    if (step.future && !step.error) result += '<div class="muted bt-unscored">hasn\u2019t happened yet \u2014 shown, not scored</div>';
    return '<tr class="' + cls + '">' +
      (allEvents ? '<td class="muted">' + UI.esc(step.eventName || "") + '</td>' : "") +
      '<td class="lbl">' + known + '</td>' +
      '<td class="lbl">' + xLabel(step.targetIndex) + ' <span class="mono">' + UI.esc(step.targetLabel) + '</span></td>' +
      '<td>' + result + '</td>' +
      '<td class="num">' + (step.error || outside ? "—" : (100 * step.chanceHit).toFixed(1) + "%") + '</td>' +
      '</tr>';
  }

  function backtestControls(tolerance, allEvents) {
    var count = Store.events.length;
    return '<div class="bt-controls">' +
      '<label>Match within <select data-bt-tolerance>' + Cycles.CHOICES.backtestTolerance.map(function (d) {
        return '<option value="' + d + '"' + (tolerance === d ? " selected" : "") + '>' + (d === 0 ? "the exact day" : "±" + d + " day" + (d > 1 ? "s" : "")) + '</option>';
      }).join("") + '</select></label>' +
      // With a single event there is nothing to choose between.
      (count > 1 ? '<label>Events <select data-bt-scope>' +
        '<option value="one"' + (allEvents ? "" : " selected") + '>this event</option>' +
        '<option value="all"' + (allEvents ? " selected" : "") + '>' + (count === 2 ? "both events" : "all " + count + " events") + '</option>' +
      '</select></label>' : "") +
      '</div>';
  }

  function notScoredNote(count, text) {
    if (!count) return "";
    return '<p class="cyc-note">' + count + ' event' + (count === 1 ? " " : "s ") + text(count === 1) + '</p>';
  }

  function backtestResults(tolerance, allEvents) {
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
    function outsideCount(reason) {
      return notFuture.filter(function (s) { return !s.error && s.outside === reason; }).length;
    }

    if (!steps.length) {
      return '<p class="empty">Needs at least ' + (C.MINIMUM_NUMBER_OF_X_DATES + 1) + ' enabled X-Dates: two to cast from and a later one to test against.</p>';
    }

    // With nothing scoreable, "0 of 0" boxes would only be noise; the notes below say why.
    var html = "";
    if (summary.any.trials) html += '<div class="bt-summary">' +
      verdictHtml(summary.any, "of " + summary.any.trials + " events were projected within " + (tolerance ? "±" + tolerance + " day" + (tolerance > 1 ? "s" : "") : "the exact day")) +
      verdictHtml(summary.top, "of " + summary.top.trials + " were in the top " + topN + " by score") +
      '</div>';

    if (futureCount) {
      html += '<p class="cyc-note">' + futureCount + ' of these X-Dates ' + (futureCount === 1 ? "is" : "are") + ' still in the future, so ' +
        (futureCount === 1 ? "it is" : "they are") + ' shown but not scored: a backtest can only measure prediction against events that have already happened.</p>';
    }
    html += notScoredNote(outsideCount("beyond-filter"), function (one) {
      return (one ? "falls" : "fall") + ' beyond the projection horizon set by the \u201cHide beyond N days\u201d filter, so ' + (one ? "it" : "they") +
        ' could not have been projected and ' + (one ? "is" : "are") + ' not scored. Widen that filter to test ' + (one ? "it" : "them") + '.';
    });
    html += notScoredNote(outsideCount("beyond-projections"), function (one) {
      return (one ? "falls" : "fall") + ' after the furthest date the engine projected, so ' + (one ? "it" : "they") +
        ' could not have been projected and ' + (one ? "is" : "are") + ' not scored.';
    });
    html += notScoredNote(outsideCount("same-day"), function (one) {
      return (one ? "shares" : "share") + ' a day with the event before, so there was nothing to project and ' + (one ? "it is" : "they are") + ' not scored.';
    });
    if (summary.any.trials && summary.any.trials < 8) {
      html += '<p class="cyc-note">Only ' + summary.any.trials + ' scored step' + (summary.any.trials === 1 ? "" : "s") +
        ' — too few to tell skill from luck either way. Every past event you add makes the answer firmer.</p>';
    }

    html += '<div class="detail-scroll"><table class="detail-table bt-table"><thead><tr>' +
      (allEvents ? '<th>Event</th>' : "") + '<th>Known</th><th>Next event</th><th>Result</th>' +
      '<th class="num" data-tip="How much of the ' + Cycles.LOCAL_CONTROL_DAYS + ' days either side of the real date the projections cover: the chance of a hit by luck alone">Chance</th>' +
      '</tr></thead><tbody>' + steps.map(function (s) { return stepRow(s, allEvents); }).join("") + '</tbody></table></div>';
    return html;
  }

  V.openBacktest = function () {
    var tolerance = V.settings.backtestTolerance;
    // "All events" means something only when there is more than one.
    var allEvents = V.settings.allEvents === true && Store.events.length > 1;
    var modal = UI.modal("Backtest", '<div class="bt-host">' + BACKTEST_INTRO + backtestControls(tolerance, allEvents) +
      '<div class="bt-results"></div></div>');
    var host = modal.host.querySelector(".bt-host");
    var results = host.querySelector(".bt-results");
    // Only the results are redrawn, so a select keeps keyboard focus while its
    // value is stepped with the arrow keys. Tooltips inside the dialog come
    // from the page-wide binding (app.js).
    function draw() {
      results.innerHTML = backtestResults(tolerance, allEvents);
    }
    host.addEventListener("change", function (event) {
      if (event.target.matches("[data-bt-tolerance]")) V.settings.backtestTolerance = tolerance = parseInt(event.target.value, 10);
      if (event.target.matches("[data-bt-scope]")) V.settings.allEvents = allEvents = event.target.value === "all";
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
      // Pressing the selected row again clears the selection, as in the table.
      var key = target.getAttribute("data-cyc-z");
      Store.selection.zKey = Store.selection.zKey === key ? null : key;
      Store.selection.operationHash = null;
      Store.notify("selection");
    });
    UI.on(host, "click", '[data-action="backtest"]', function () { V.openBacktest(); });
  };

  root.Ophis.CyclesView = V;
})(typeof window !== "undefined" ? window : globalThis);
