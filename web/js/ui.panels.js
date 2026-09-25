/* ==========================================================================
   ui.panels.js — input side of the app
   --------------------------------------------------------------------------
   Event bar, X-Dates, T-Dates, event settings, operations, output filters and
   chart overlays. Every panel renders from Store state and writes back through
   Store.commit(), so there is exactly one path from an edit to a recalculation.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Expr = root.Ophis.Expr;
  var Engine = root.Ophis.Engine;
  var Store = root.Ophis.Store;
  var UI = root.Ophis.UI;
  var P = {};

  /* -------------------------------------------------- date field helpers */
  /* .oph stores mm/dd/yyyy; <input type="date"> speaks yyyy-mm-dd. */

  function toInputDate(text) {
    var parts = ("" + (text || "")).split("/");
    if (parts.length !== 3) return "";
    var month = parseInt(parts[0], 10), day = parseInt(parts[1], 10), year = parseInt(parts[2], 10);
    if (isNaN(month) || isNaN(day) || isNaN(year)) return "";
    // <input type="date"> needs at least four year digits: 999 must be
    // written 0999. A longer year (a .oph can hold 12026) stays whole.
    var yyyy = year < 1000 ? ("000" + year).slice(-4) : "" + year;
    return yyyy + "-" + T.pad2(month) + "-" + T.pad2(day);
  }

  /* Written as the app writes every date: 0033, not 33 (the desktop app
     reads the two alike). */
  function fromInputDate(value) {
    var parts = ("" + (value || "")).split("-");
    if (parts.length !== 3) return "";
    return T.formatDateParts({ year: parseInt(parts[0], 10), month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) });
  }

  P.toInputDate = toInputDate;
  P.fromInputDate = fromInputDate;

  /* ====================================================================== */
  /* Event bar                                                              */
  /* ====================================================================== */

  P.renderEventBar = function (host) {
    var html = '<div class="event-tabs" role="tablist">';
    Store.events.forEach(function (event, index) {
      var active = index === Store.currentEventIndex;
      // data-tip holds HTML, and the browser decodes the attribute once before
      // showTip() parses it, so the escaped name and notes are escaped again.
      var tip = UI.esc(event.name) + (event.notes ? "<br><i>" + UI.esc(event.notes) + "</i>" : "");
      html += '<button role="tab" class="event-tab' + (active ? " active" : "") + '" data-event="' + index + '"' +
        ' aria-selected="' + active + '" data-tip="' + UI.esc(tip) + '">' +
        '<span class="event-tab-ord">E' + (index + 1) + '</span>' + UI.esc(event.name) + '</button>';
    });
    html += '<button class="event-tab add" data-action="add-event" data-tip="Add a new Iso-Event" aria-label="Add a new event">+</button>';
    html += '</div>';
    host.innerHTML = html;
  };

  /* ====================================================================== */
  /* X-Dates / T-Dates                                                      */
  /* ====================================================================== */

  function renderDateRows(event, kind) {
    var list = (kind === "t") ? event.t_dates : event.x_dates;
    var letter = (kind === "t") ? "T" : "X";
    var isHHMM = event.scope === C.EVENT_SCOPE__HH_MM;
    if (!list.length) {
      return '<p class="empty">' + (kind === "t"
        ? "No T-Dates. Add one to show only Z-Dates that land on dates you care about."
        : "No X-Dates yet. Add at least two known occurrences of the event.") + '</p>';
    }

    var html = '<ol class="date-rows' + (isHHMM ? " with-time" : "") + '">';
    list.forEach(function (entry, index) {
      var instant = T.xDateToInstant(event.scope, entry, event.lat, event.long, []);
      var weekday = instant ? T.weekdayShort(instant, isHHMM ? T.timezoneAt(event.lat, event.long) : "UTC") : "";
      var sunsetNote = "";
      if (isHHMM && instant && T.sunsetAvailable()) {
        var sunset = T.sunsetBefore(instant, event.lat, event.long);
        if (sunset) sunsetNote = '<span class="sunset" data-tip="Sunset before this date — the day it belongs to starts here.">☾ ' +
          UI.esc(T.formatDateAndTime(sunset, event.lat, event.long)) + '</span>';
      }

      html += '<li class="date-row' + (entry.enabled === false ? " off" : "") + '" data-kind="' + kind + '" data-index="' + index + '">' +
        '<span class="row-label">' + UI.label(letter, index) + '</span>' +
        '<input type="date" class="date-input" value="' + UI.esc(toInputDate(entry.date)) + '"' +
          ' min="0001-01-01" max="9999-12-31" data-field="date" data-focus-key="' + kind + '-' + index + '-date"' +
          ' aria-label="' + UI.labelPlain(letter, index) + ' date">' +
        (isHHMM ? '<input type="time" class="time-input" value="' + UI.esc(entry.time || "00:00") + '" data-field="time"' +
          ' data-focus-key="' + kind + '-' + index + '-time" aria-label="time">' : "") +
        '<span class="weekday">' + UI.esc(weekday) + '</span>' +
        '<label class="tick" data-tip="Include this date in the calculation"><input type="checkbox" data-field="enabled"' +
          (entry.enabled === false ? "" : " checked") + ' aria-label="Include ' + UI.labelPlain(letter, index) + '"><span></span></label>' +
        '<button class="icon-btn" data-action="insert-date" data-tip="Insert a copy above" aria-label="Insert a copy of ' + UI.labelPlain(letter, index) + ' above">⤒</button>' +
        '<button class="icon-btn danger" data-action="remove-date" data-tip="Delete this date" aria-label="Delete ' + UI.labelPlain(letter, index) + '">✕</button>' +
        sunsetNote +
        '</li>';
    });
    return html + "</ol>";
  }

  P.renderXDates = function (host) {
    var event = Store.currentEvent();
    var enabled = Engine.enabledXDateCount(event);
    host.innerHTML =
      '<header class="panel-head">' +
        '<h2>X-Dates</h2>' +
        '<span class="count' + (enabled < C.MINIMUM_NUMBER_OF_X_DATES ? " warn" : "") + '">' + enabled + " of " + event.x_dates.length + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-action="add-x" data-tip="Add an X-Date">+ Add</button>' +
        '<button class="btn small" data-action="sort-x" data-tip="Sort X-Dates oldest first">Sort</button>' +
        '<button class="btn small ghost" data-action="clear-x" data-tip="Remove every X-Date">Clear</button>' +
      '</header>' +
      '<p class="panel-hint">Known past occurrences of the event. Two or more, oldest first — every pair becomes an interval&nbsp;Y.</p>' +
      renderDateRows(event, "x");
  };

  P.renderTDates = function (host) {
    var event = Store.currentEvent();
    var enabled = (event.t_dates || []).filter(function (t) { return t.enabled !== false; }).length;
    host.innerHTML =
      '<header class="panel-head">' +
        '<h2>T-Dates</h2>' +
        '<span class="count">' + enabled + " of " + event.t_dates.length + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-action="add-t" data-tip="Add a target date">+ Add</button>' +
        '<button class="btn small ghost" data-action="clear-t" data-tip="Remove every T-Date">Clear</button>' +
      '</header>' +
      '<p class="panel-hint">Target dates. With any T-Date enabled, only Z-Dates landing on one of them are shown.</p>' +
      renderDateRows(event, "t");
  };

  /* ====================================================================== */
  /* Intervals (Y)                                                          */
  /* ====================================================================== */

  P.renderIntervals = function (host) {
    var results = Store.results;
    var yStructs = (results && results.y_structs) || [];

    if (!yStructs.length) {
      host.innerHTML = '<header class="panel-head"><h2>Intervals</h2></header>' +
        '<p class="empty">Two enabled X-Dates produce the first interval.</p>';
      return;
    }

    var html = '<header class="panel-head"><h2>Intervals</h2><span class="count">' + yStructs.length + '</span>' +
      '<span class="spacer"></span><span class="panel-note">Y = whole days between a pair</span></header>' +
      '<table class="mini-table"><thead><tr><th>Y</th><th>Pair</th><th class="num">Days</th><th class="num">MSRF</th></tr></thead><tbody>';

    yStructs.forEach(function (yStruct) {
      var match = Engine.msrfMatch(yStruct.rotation_count_y);
      var selected = Store.selection.yOrdinal === yStruct.y_ordinal;
      html += '<tr class="' + (selected ? "selected" : "") + '" data-action="select-y" data-y="' + yStruct.y_ordinal + '">' +
        '<td class="lbl">' + UI.label("Y", yStruct.y_ordinal) + '</td>' +
        '<td class="lbl">' + UI.label("X", yStruct.x_1_ordinal) + ' <span class="arrow">→</span> ' + UI.label("X", yStruct.x_2_ordinal) + '</td>' +
        '<td class="num">' + UI.decimal(yStruct.rotation_count_y) + '</td>' +
        '<td class="num">' + (match
          ? '<span class="pill msrf ' + match.css_class + '" data-tip="' + match.msrf_number + " is a " + match.readable_name + ' MSRF number">' + match.msrf_number + '</span>'
          : '<span class="muted">·</span>') + '</td>' +
        '</tr>';
    });

    host.innerHTML = html + "</tbody></table>";
  };

  /* ====================================================================== */
  /* Operations                                                             */
  /* ====================================================================== */

  P.renderOperations = function (host) {
    var event = Store.currentEvent();
    // Prefer the list the last run produced; fall back to compiling once here
    // (which happens when auto-recalculate is off, or before the first run).
    var effective = (Store.results && Store.results.effective_operations &&
                     Store.results.effective_operations.length === event.operations.length)
      ? Store.results.effective_operations
      : Engine.effectiveOperations(event);
    var live = effective.filter(function (op) { return op.enabled && op.fn; }).length;

    var html =
      '<header class="panel-head">' +
        '<h2>Operations</h2>' +
        '<span class="count' + (live < 1 ? " warn" : "") + '">' + live + " of " + event.operations.length + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" data-action="add-operation" data-tip="Add an operation">+ Add</button>' +
        '<button class="btn small ghost" data-action="ops-all-on" data-tip="Enable every operation">All</button>' +
        '<button class="btn small ghost" data-action="ops-all-off" data-tip="Disable every operation">None</button>' +
        '<button class="btn small ghost" data-action="reset-operations" data-tip="Restore the 16 shipped operations">Reset</button>' +
        '<button class="icon-btn" data-action="operation-help" data-tip="Formula reference" aria-label="Formula reference">?</button>' +
      '</header>' +
      '<p class="panel-hint">Each formula turns an interval Y into a day-offset from X<sub>1</sub> or X<sub>2</sub>. ' +
      'Weight 1 = alpha, 0.5 = beta; the weight is what the hit contributes to a score.</p>' +
      '<ol class="operation-rows">';

    event.operations.forEach(function (operation, index) {
      var compiled = effective[index];
      var broken = compiled && compiled.errors && compiled.errors.length > 0;
      var alpha = operation.weight >= C.POINTS__ALPHA_OPERATION_MATCH;
      var preview = "";

      if (compiled && compiled.fn) {
        var sample = T.roundTime(compiled.fn(C.SAMPLE_Y_VALUE_FOR_VALIDATION));
        preview = 'Y=10 → ' + UI.number(sample) + ' days';
      }

      html += '<li class="operation-row' + (operation.enabled === false ? " off" : "") + (broken ? " broken" : "") + '" data-index="' + index + '">' +
        '<span class="row-label ' + (alpha ? "alpha" : "beta") + '" data-tip="' +
          (alpha ? "Alpha operation — a hit is worth " + C.POINTS__ALPHA_OPERATION_MATCH : "Beta operation — a hit is worth " + C.POINTS__BETA_OPERATION_MATCH) +
          ' point">' + UI.label("O", index) + '</span>' +
        '<input type="text" class="operation-input" spellcheck="false" autocapitalize="off" autocorrect="off"' +
          ' value="' + UI.esc(operation.equation) + '" data-field="equation" data-focus-key="op-' + index + '-equation"' +
          ' aria-label="' + UI.labelPlain("O", index) + ' formula">' +
        '<input type="number" class="weight-input" step="0.5" min="0" value="' + UI.esc(operation.weight) + '"' +
          ' data-field="weight" data-focus-key="op-' + index + '-weight" data-tip="Weight — 1 is alpha, 0.5 is beta" aria-label="weight">' +
        '<label class="tick" data-tip="Enable this operation"><input type="checkbox" data-field="enabled"' +
          (operation.enabled === false ? "" : " checked") + ' aria-label="Enable ' + UI.labelPlain("O", index) + '"><span></span></label>' +
        '<button class="icon-btn danger" data-action="remove-operation" data-tip="Delete this operation" aria-label="Delete ' + UI.labelPlain("O", index) + '">✕</button>' +
        (broken
          ? '<span class="operation-error">' + UI.esc(compiled.errors.join(" ")) + '</span>'
          : '<span class="operation-preview">' + UI.esc(preview) + '</span>') +
        '</li>';
    });

    host.innerHTML = html + "</ol>";
  };

  P.operationHelp = function () {
    var rows = "";
    C.DEFAULT_OPERATIONS.forEach(function (op, index) {
      rows += '<tr><td class="lbl">' + UI.label("O", index) + '</td><td class="mono">' + UI.esc(op.equation) +
        '</td><td>' + UI.esc(op.note) + '</td></tr>';
    });

    UI.modal("Formula reference", '' +
      '<p>An operation is arithmetic over <b>Y</b>, the interval in days, anchored on one of the two X-Dates in the pair. ' +
      'It must start with <code>X1+</code> or <code>X2+</code> and must resolve to a number greater than zero.</p>' +
      '<h3>Vocabulary</h3>' +
      '<table class="doc-table"><tbody>' +
        '<tr><td class="mono">Y</td><td>whole days between the two X-Dates of the pair</td></tr>' +
        '<tr><td class="mono">x</td><td>multiply (written as the letter x, as in the desktop app; <code>*</code> also works)</td></tr>' +
        '<tr><td class="mono">OPH_PI</td><td>' + C.OPH_PI + '</td></tr>' +
        '<tr><td class="mono">OPH_PHI</td><td>' + C.OPH_PHI + '</td></tr>' +
        '<tr><td class="mono">OPH_CRV</td><td>' + C.OPH_CRV + ' — curvature, pi × phi</td></tr>' +
        '<tr><td class="mono">OPH_HEP</td><td>' + C.OPH_HEP + ' — hepta-cycle</td></tr>' +
        '<tr><td class="mono">oph_round(n)</td><td>nearest whole number</td></tr>' +
        '<tr><td class="mono">oph_flip(n)</td><td>digits reversed, decimal point kept in place: 1319 → 9131</td></tr>' +
        '<tr><td class="mono">oph_floor oph_ceil oph_abs oph_sqrt</td><td>as named</td></tr>' +
        '<tr><td class="mono">oph_sin oph_cos oph_tan oph_log oph_exp</td><td>as named (radians)</td></tr>' +
      '</tbody></table>' +
      '<h3>The shipped set</h3>' +
      '<table class="doc-table"><tbody>' + rows + '</tbody></table>' +
      '<p class="fineprint">Formulas are parsed into an expression tree and walked — never compiled or evaluated as code. ' +
      'Anything outside this vocabulary is a syntax error.</p>', {});
  };

  /* ====================================================================== */
  /* Filters                                                                */
  /* ====================================================================== */

  P.renderFilters = function (host) {
    var event = Store.currentEvent();
    var results = Store.results;
    var shown = (results && results.z_keys_sorted) ? results.z_keys_sorted.length : 0;
    var total = (results && results.total_z_dates) || 0;

    var html =
      '<header class="panel-head">' +
        '<h2>Filters</h2>' +
        '<span class="count">' + shown + " of " + total + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn small ghost" data-action="filters-off" data-tip="Turn every filter off">None</button>' +
        '<button class="btn small ghost" data-action="filters-default" data-tip="Back to the default filter set">Default</button>' +
      '</header>' +
      '<p class="panel-hint">Hide Z-Dates that are not actionable. Counts above are shown of generated.</p>' +
      '<ul class="filter-rows">';

    C.FILTERS.forEach(function (filter) {
      var enabled = Engine.filterEnabled(event, filter.key);
      var labelHtml = UI.esc(filter.label);
      if (filter.valueKey) {
        var value = Engine.filterValue(event, filter);
        labelHtml = labelHtml.replace("{n}", '<input type="number" class="filter-value" min="0" step="1" value="' +
          UI.esc(value) + '" data-filter-value="' + filter.key + '" data-focus-key="filter-' + filter.key + '"' +
          ' aria-label="' + UI.esc(filter.id) + ' value">');
      }
      html += '<li class="filter-row' + (enabled ? " on" : "") + '">' +
        '<span class="row-label small">' + filter.id + '</span>' +
        '<label class="tick"><input type="checkbox" data-filter="' + filter.key + '"' + (enabled ? " checked" : "") +
          ' aria-label="Filter ' + UI.esc(filter.id) + '"><span></span></label>' +
        '<span class="filter-label" data-tip="' + UI.esc(filter.help) + '">Hide ' + labelHtml + '</span>' +
        '</li>';
    });

    host.innerHTML = html + "</ul>";
  };

  /* ====================================================================== */
  /* Event settings                                                         */
  /* ====================================================================== */

  P.renderEventSettings = function (host) {
    var event = Store.currentEvent();
    var isHHMM = event.scope === C.EVENT_SCOPE__HH_MM;
    var timezone = isHHMM ? (T.timezoneAt(event.lat, event.long) || "unknown") : "UTC";
    var dayStart = event.day_scope_start_time_in_millis || 0;
    var dayStartText = T.pad2(Math.floor(dayStart / C.MILLIS_PER_HOUR)) + ":" +
      T.pad2(Math.floor((dayStart % C.MILLIS_PER_HOUR) / C.MILLIS_PER_MINUTE));

    var html =
      '<header class="panel-head"><h2>Event</h2><span class="spacer"></span>' +
        '<button class="btn small ghost" data-action="duplicate-event" data-tip="Duplicate this event">Duplicate</button>' +
        '<button class="btn small ghost danger" data-action="delete-event" data-tip="Delete this event">Delete</button>' +
      '</header>' +
      '<div class="field"><label for="event-name">Name</label>' +
        '<input id="event-name" type="text" value="' + UI.esc(event.name) + '" data-event-field="name" data-focus-key="event-name"></div>' +
      '<div class="field"><label for="event-notes">Notes</label>' +
        '<textarea id="event-notes" rows="2" data-event-field="notes" data-focus-key="event-notes">' + UI.esc(event.notes || "") + '</textarea></div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="event-scope" data-tip="Days: a day is a UTC calendar day.<br>HH:MM: a day runs sunset to sunset at the location below.">Scope</label>' +
          '<select id="event-scope" data-event-field="scope">' +
            '<option value="' + C.EVENT_SCOPE__DAYS + '"' + (isHHMM ? "" : " selected") + '>Days</option>' +
            '<option value="' + C.EVENT_SCOPE__HH_MM + '"' + (isHHMM ? " selected" : "") + '>HH:MM (sunset)</option>' +
          '</select></div>' +
        '<div class="field"><label for="event-scoring" data-tip="v8+: the strongest MSRF match multiplies the score instead of adding its points.<br>v7: everything is additive.">Scoring</label>' +
          '<select id="event-scoring" data-event-field="scoring_system">' +
            '<option value="' + C.SCORING_SYSTEM__GTE_V8 + '"' + (event.scoring_system === C.SCORING_SYSTEM__LTE_V7 ? "" : " selected") + '>v8 and later</option>' +
            '<option value="' + C.SCORING_SYSTEM__LTE_V7 + '"' + (event.scoring_system === C.SCORING_SYSTEM__LTE_V7 ? " selected" : "") + '>v7 and earlier</option>' +
          '</select></div>' +
      '</div>';

    if (isHHMM) {
      html +=
        '<div class="field-row">' +
          '<div class="field"><label for="event-lat">Latitude</label>' +
            '<input id="event-lat" type="number" step="0.1" min="' + (-C.LAT_LIMIT) + '" max="' + C.LAT_LIMIT + '" value="' + UI.esc(event.lat) + '" data-event-field="lat" data-focus-key="event-lat"></div>' +
          '<div class="field"><label for="event-long">Longitude</label>' +
            '<input id="event-long" type="number" step="0.1" min="' + (-C.LONG_LIMIT) + '" max="' + C.LONG_LIMIT + '" value="' + UI.esc(event.long) + '" data-event-field="long" data-focus-key="event-long"></div>' +
        '</div>' +
        '<p class="panel-note">Timezone <b>' + UI.esc(timezone) + '</b>' +
          (T.sunsetAvailable() ? '' : ' · <span class="warn-text">sunset library not loaded — HH:MM scope is unavailable</span>') + '</p>';
    } else {
      html +=
        '<div class="field-row">' +
          '<div class="field"><label for="event-daystart" data-tip="Shifts every Z-Date by this much before it is snapped to a day. Leave at 00:00 unless you know you need it.">Day start offset</label>' +
            '<input id="event-daystart" type="time" value="' + UI.esc(dayStartText) + '" data-event-field="day_scope_start"></div>' +
          '<div class="field"><label for="event-dayboundary">Day boundary</label><input id="event-dayboundary" type="text" value="UTC midnight" disabled></div>' +
        '</div>';
    }

    host.innerHTML = html;
  };

  /* ====================================================================== */
  /* Chart overlay toggles                                                  */
  /* ====================================================================== */

  P.renderChartOptions = function (host) {
    var event = Store.currentEvent();
    var eclipsesReady = T.eclipsesAvailable();

    var html = '<div class="overlay-toggles">';
    C.CHART_OPTIONS.forEach(function (option) {
      if (option.kind === "chart") return;
      var isEclipse = option.kind === "eclipse";
      var disabled = isEclipse && !eclipsesReady;
      var on = event[option.key] === true;
      // Moon marks go by the phase a date falls in; eclipses by distance.
      var tip = disabled
        ? "Eclipse tables (lib/*_eclipses_processed.js) did not load"
        : option.kind === "moon"
          ? "Mark X-Dates and Z-Dates that fall in the " + T.MOON_NAMES[option.phase] + " phase"
          : "Mark X-Dates and Z-Dates within " + C.ECLIPSE_DATE_MATCH_TOLERANCE_IN_DAYS + " days of a " +
            option.label.toLowerCase() + " eclipse";
      html += '<label class="chip' + (on ? " on" : "") + (disabled ? " disabled" : "") + '"' +
        ' data-tip="' + UI.esc(tip) + '">' +
        '<input type="checkbox" data-chart-option="' + option.key + '"' + (on ? " checked" : "") + (disabled ? " disabled" : "") + '>' +
        '<span class="chip-glyph">' + (option.kind === "moon" ? T.MOON_GLYPHS[option.phase] : "◐") + '</span>' +
        UI.esc(option.label) + '</label>';
    });
    host.innerHTML = html + "</div>";
  };

  root.Ophis.Panels = P;
})(typeof window !== "undefined" ? window : globalThis);
