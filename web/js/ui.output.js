/* ==========================================================================
   ui.output.js — the Z-Dates table
   --------------------------------------------------------------------------
   Same information architecture as the desktop app's output panel: one row per
   projected day, sortable by Date / Hits / Score / MSRF / Operations, with the
   contributing operations and MSRF matches shown as pills that explain their
   own arithmetic on hover.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Expr = root.Ophis.Expr;
  var Engine = root.Ophis.Engine;
  var Store = root.Ophis.Store;
  var UI = root.Ophis.UI;
  var O = {};

  var SORT_COLUMNS = [
    { type: C.Z_DATE_SORT_TYPE__DATE, label: "Z-Dates", tip: "Sort by date, soonest first." },
    { type: C.Z_DATE_SORT_TYPE__HIT_COUNT, label: "Hits", tip: "Sort by hit count — operations plus MSRF matches." },
    { type: C.Z_DATE_SORT_TYPE__SCORE, label: "Score", tip: "Sort by score, highest first." },
    { type: C.Z_DATE_SORT_TYPE__MSRF, label: "MSRF", tip: "Sort by MSRF strength, then by the size of the numbers matched." },
    { type: C.Z_DATE_SORT_TYPE__OPERATIONS, label: "Operations", tip: "Sort by how many operations landed on the date." }
  ];

  /* ------------------------------------------------------- pill tooltips */

  function operationTip(event, zStruct, match) {
    var result = match.operation_result;
    var yStruct = match.y_struct;
    var operation = result.operation;
    var alpha = Engine.isAlpha(operation);

    var anchorLabel = UI.label("X", result.operation.anchor === C.STARTING_X1 ? yStruct.x_1_ordinal : yStruct.x_2_ordinal);
    var display = Expr.display(operation.equation)
      .replace("X1", anchorLabel).replace("X2", anchorLabel);

    // The same formula with Y and the constants filled in, so the arithmetic
    // can be checked by eye — this is what the desktop tooltip shows too.
    var withY = display.split("+").slice(1).join("+").replace(/Y/g, UI.decimal(yStruct.rotation_count_y));
    Object.keys(C.CONSTANT_VALUES).forEach(function (name) {
      withY = withY.split(name).join("" + C.CONSTANT_VALUES[name]);
    });

    var msrf = Engine.msrfMatch(result.rotation_count_z);

    return UI.tipTable([
      ["Type", '<span class="' + (alpha ? "alpha" : "beta") + '">' + (alpha ? "Alpha" : "Beta") + " operation</span>"],
      ["Label", UI.label("O", result.operation_ordinal)],
      ["Pair", UI.label("X", yStruct.x_1_ordinal) + " → " + UI.label("X", yStruct.x_2_ordinal)],
      ["Formula", "Z-Date = " + UI.esc(display)],
      ["Y", UI.label("X", yStruct.x_1_ordinal) + " → " + UI.label("X", yStruct.x_2_ordinal) + " = " + UI.days(yStruct.rotation_count_y)],
      ["Z-Value", UI.esc(withY) + " = " + UI.days(result.z_value)],
      ["Z", anchorLabel + " → Z-Date = " + UI.days(result.rotation_count_z)],
      ["Score", "contributes " + operation.weight + " to a base of " + zStruct.base_score_pre_multiply],
      ["MSRF", msrf
        ? '<span class="' + msrf.css_class + '">' + result.rotation_count_z +
          (result.rotation_count_z === msrf.msrf_number
            ? " = " + msrf.readable_name
            : " \u2248 " + msrf.msrf_number + " (" + msrf.readable_name + ")") + "</span>"
        : result.rotation_count_z + " = no match"]
    ]);
  }

  function msrfTip(zStruct, match) {
    var result = match.operation_result;
    var yStruct = match.y_struct;
    var exact = result.rotation_count_z === match.msrf_number;
    return UI.tipTable([
      ["Type", '<span class="' + match.css_class + '">' + match.readable_name + " MSRF</span>"],
      ["Number", exact ? "" + match.msrf_number : result.rotation_count_z + " ≈ " + match.msrf_number],
      ["From", UI.label("O", result.operation_ordinal) + " on " +
        UI.label("X", yStruct.x_1_ordinal) + " → " + UI.label("X", yStruct.x_2_ordinal)],
      ["Distance", UI.days(result.rotation_count_z) + " from the anchor X-Date"],
      ["Worth", match.points + " point" + (match.points === 1 ? "" : "s") +
        ", multiplier ×" + Engine.msrfMultiplierForKind(match.kind)]
    ]);
  }

  /* -------------------------------------------------------------- render */

  /**
   * When every Z-Date is filtered out, say which filter is doing it. Each
   * enabled filter (and the T-Date restriction) is switched off on a copy of
   * the event in turn, and the one that brings back the most is named, with a
   * button that turns it off. Reading only: the event itself is not touched
   * until the button is pressed.
   */
  function whatIsHiding(event, results) {
    if (!results || !results.total_z_dates) return "";
    var now = Store.nowInstant();
    var best = null;
    function trial(mutate, label, action) {
      var copy = JSON.parse(JSON.stringify(event));
      mutate(copy);
      var shown = Engine.run(copy, { nowInstant: now }).z_keys_sorted.length;
      if (shown > 0 && (!best || shown > best.shown)) best = { shown: shown, label: label, action: action };
    }
    C.FILTERS.forEach(function (f) {
      if (!Engine.filterEnabled(event, f.key)) return;
      trial(function (copy) { copy[f.key] = false; }, f.id + " \u00b7 Hide " + f.label.replace("{n}", "N"), 'data-unfilter="' + f.key + '"');
    });
    if ((event.t_dates || []).some(function (t) { return t.enabled === true; })) {
      trial(function (copy) { copy.t_dates = []; }, "the T-Dates (only Z-Dates on a T-Date are shown)", "");
    }
    if (!best) return '<p class="empty-why muted">No single filter explains it; several are hiding Z-Dates together.</p>';
    return '<p class="empty-why">Turning off <b>' + UI.esc(best.label) + '</b> would show <b>' + best.shown + '</b>.' +
      (best.action ? ' <button class="btn small" ' + best.action + '>Turn it off</button>' : "") + '</p>';
  }

  O.render = function (host) {
    var event = Store.currentEvent();
    var results = Store.results;

    if (!results) { host.innerHTML = ""; return; }

    var sortType = event.z_date_sort_type || C.DEFAULT_Z_DATE_SORT_TYPE;
    var keys = results.z_keys_sorted;

    var head =
      '<header class="panel-head">' +
        '<h2>Output</h2>' +
        '<span class="count">' + keys.length + " Z-Date" + (keys.length === 1 ? "" : "s") + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-action="export-csv" data-tip="Download this event\'s Z-Dates as CSV">Export CSV</button>' +
      '</header>';

    if (results.errors.length) {
      host.innerHTML = head + '<div class="errors"><h3>Cannot project yet</h3><ul>' +
        results.errors.map(function (error) { return "<li>" + UI.esc(error) + "</li>"; }).join("") +
        '</ul></div>';
      return;
    }

    if (!keys.length) {
      host.innerHTML = head + '<p class="empty">' + UI.esc(C.NO_RESULTS_MESSAGE) +
        ' <span class="muted">' + results.total_z_dates + ' were generated before filtering.</span></p>' +
        whatIsHiding(event, results);
      return;
    }

    var html = head + '<div class="table-scroll"><table class="output-table"><thead><tr><th class="ord"></th>';
    SORT_COLUMNS.forEach(function (column) {
      var active = sortType === column.type;
      html += '<th class="sortable col-' + column.type + (active ? " active" : "") + '" data-sort="' + column.type + '"' +
        ' data-tip="' + UI.esc(column.tip) + '" tabindex="0" role="button">' +
        UI.esc(column.label) + '<span class="sort-caret">▾</span></th>';
    });
    html += "</tr></thead><tbody>";

    keys.forEach(function (key) {
      var zStruct = results.z_structs[key];
      var selected = Store.selection.zKey === key;
      var weekday = T.weekdayShort(zStruct.z_start, event.scope === C.EVENT_SCOPE__HH_MM ? T.timezoneAt(event.lat, event.long) : "UTC");
      var daysOut = Math.round((zStruct.z_start.getTime() - Store.nowInstant().getTime()) / C.MILLIS_PER_DAY);

      var operationPills = zStruct.operation_match_structs.map(function (match) {
        var result = match.operation_result;
        return '<span class="pill op ' + (Engine.isAlpha(result.operation) ? "alpha" : "beta") +
          (Store.selection.operationHash === result.hash ? " selected" : "") + '"' +
          ' data-op-hash="' + UI.esc(result.hash) + '" data-tip=\'' + operationTip(event, zStruct, match) + '\'>' +
          UI.label("O", result.operation_ordinal) +
          '<span class="pill-sub">' + UI.label("X", match.y_struct.x_1_ordinal) + "→" + UI.label("X", match.y_struct.x_2_ordinal) + '</span>' +
          '</span>';
      }).join("");

      var msrfPills = zStruct.msrf_match_structs.length
        ? zStruct.msrf_match_structs.map(function (match) {
            return '<span class="pill msrf ' + match.css_class + '" data-tip=\'' + msrfTip(zStruct, match) + '\'>' +
              match.msrf_number + '</span>';
          }).join("")
        : '<span class="muted">none</span>';

      html += '<tr class="z-row' + (selected ? " selected" : "") + '" data-z-key="' + UI.esc(key) + '">' +
        '<td class="ord">' + UI.label("Z", zStruct.z_ordinal) + '</td>' +
        '<td class="col-date"><span class="z-date">' + UI.esc(zStruct.z_readable_start) + '</span>' +
          (event.scope === C.EVENT_SCOPE__HH_MM
            ? '<span class="z-date-end">→ ' + UI.esc(zStruct.z_readable_end) + '</span>'
            : '<span class="z-meta">' + UI.esc(weekday) + " · " + (daysOut === 0 ? "today" : (daysOut > 0 ? "in " + daysOut + "d" : Math.abs(daysOut) + "d ago")) + '</span>') +
          (root.Ophis.CyclesView ? root.Ophis.CyclesView.tagFor(key) : "") +
        '</td>' +
        '<td class="num col-hits">' + zStruct.hit_count + '</td>' +
        '<td class="num col-score"><span class="score heat-' + heatStep(zStruct.score, results) + '">' + zStruct.score + '</span></td>' +
        '<td class="col-msrf">' + msrfPills + '</td>' +
        '<td class="col-ops"><div class="pill-wrap">' + operationPills + '</div></td>' +
        '</tr>';
    });

    host.innerHTML = html + "</tbody></table></div>";
  };

  /* Score heat as one of five steps, used for the intensity of the score chip.
     A class rather than an inline style, so the page needs no 'unsafe-inline'. */
  function heatStep(score, results) {
    var max = 0;
    results.z_keys_sorted.forEach(function (key) {
      var value = results.z_structs[key].score;
      if (value > max) max = value;
    });
    if (max <= 0) return 0;
    return Math.max(0, Math.min(4, Math.round((score / max) * 4)));
  }
  O.heatStep = heatStep;

  /* --------------------------------------------------------------- detail */

  O.renderDetail = function (host) {
    var results = Store.results;
    var key = Store.selection.zKey;

    if (!results || !key || !results.z_structs[key]) {
      host.innerHTML = "";
      host.classList.remove("open");
      return;
    }

    var event = Store.currentEvent();
    var zStruct = results.z_structs[key];

    var html =
      '<header class="panel-head">' +
        '<h2>' + UI.label("Z", zStruct.z_ordinal) + " · " + UI.esc(zStruct.z_readable_start) + '</h2>' +
        '<span class="spacer"></span>' +
        '<button class="icon-btn" data-action="close-detail" data-tip="Close">✕</button>' +
      '</header>' +
      '<div class="detail-summary">' +
        '<div><span class="k">Score</span><span class="v">' + zStruct.score + '</span></div>' +
        '<div><span class="k">Base</span><span class="v">' + zStruct.base_score_pre_multiply + '</span></div>' +
        '<div><span class="k">Multiplier</span><span class="v">×' + zStruct.score_multiplier + '</span></div>' +
        '<div><span class="k">Operations</span><span class="v">' + zStruct.operation_hit_count + '</span></div>' +
        '<div><span class="k">MSRF</span><span class="v">' + zStruct.msrf_hit_count + '</span></div>' +
      '</div>' +
      '<div class="detail-scroll"><table class="detail-table"><thead><tr>' +
        '<th>Op</th><th>Pair</th><th class="num">Y</th><th>Formula</th><th class="num">Z-Value</th><th class="num">Days out</th><th>MSRF</th><th class="num">Points</th>' +
      '</tr></thead><tbody>';

    zStruct.operation_match_structs.forEach(function (match) {
      var result = match.operation_result;
      var yStruct = match.y_struct;
      var anchorOrdinal = result.operation.anchor === C.STARTING_X1 ? yStruct.x_1_ordinal : yStruct.x_2_ordinal;
      var msrf = Engine.msrfMatch(result.rotation_count_z);

      html += '<tr data-op-hash="' + UI.esc(result.hash) + '" class="' +
          (Store.selection.operationHash === result.hash ? "selected" : "") + '">' +
        '<td class="lbl ' + (Engine.isAlpha(result.operation) ? "alpha" : "beta") + '">' + UI.label("O", result.operation_ordinal) + '</td>' +
        '<td class="lbl">' + UI.label("X", yStruct.x_1_ordinal) + " → " + UI.label("X", yStruct.x_2_ordinal) + '</td>' +
        '<td class="num">' + UI.decimal(yStruct.rotation_count_y) + '</td>' +
        '<td class="mono">' + UI.esc(Expr.display(result.operation.equation)) + '</td>' +
        '<td class="num">' + UI.decimal(result.z_value) + '</td>' +
        '<td class="num">' + UI.decimal(result.rotation_count_z) + ' <span class="muted">from ' + UI.labelPlain("X", anchorOrdinal) + '</span></td>' +
        '<td>' + (msrf
          ? '<span class="pill msrf ' + msrf.css_class + '">' + msrf.msrf_number + '</span>'
          : '<span class="muted">·</span>') + '</td>' +
        '<td class="num">' + result.operation.weight + '</td>' +
        '</tr>';
    });

    html += "</tbody></table></div>";

    if (zStruct.msrf_match_structs.length) {
      html += '<p class="detail-note">Score = (operations ' + zStruct.operation_score +
        ' + MSRF points ' + (zStruct.base_score_pre_multiply - zStruct.operation_score) + ') × ' +
        zStruct.score_multiplier + ' = <b>' + zStruct.score + '</b>' +
        (Engine.scoringSystem(event) === C.SCORING_SYSTEM__GTE_V8
          ? ' <span class="muted">— under v8+ scoring the strongest MSRF match becomes the multiplier instead of adding its points.</span>'
          : '') + '</p>';
    } else {
      html += '<p class="detail-note">Score = operations ' + zStruct.operation_score + ' = <b>' + zStruct.score + '</b> · no MSRF match.</p>';
    }

    host.innerHTML = html;
    host.classList.add("open");
  };

  root.Ophis.Output = O;
})(typeof window !== "undefined" ? window : globalThis);
