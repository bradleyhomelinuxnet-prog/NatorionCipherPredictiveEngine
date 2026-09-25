/* ==========================================================================
   ui.chart.js — the timeline
   --------------------------------------------------------------------------
   A canvas drawing of the same picture the desktop app's Chart.js view shows:
   the X-Dates on a time axis, an arc fanning out from each anchor X-Date to
   every Z-Date it produced, and the Z-Dates themselves as stems whose height
   is the score and whose colour is the hit count — the app's own scale:

       1–2 hits  ink      3 hits  cadmium yellow
       4 hits    blue     5+      cadmium red

   Optional moon-phase and eclipse glyphs sit under the axis. Wheel zooms,
   drag pans, double-click resets, hover explains, click selects the row in
   the output table.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Store = root.Ophis.Store;
  var UI = root.Ophis.UI;

  var Chart = {
    canvas: null,
    ctx: null,
    view: null,         // { min, max } in millis
    hover: null,
    points: [],         // hit-test cache
    dragging: null
  };

  var HIT_COLORS = {
    low: "rgb(150,160,175)",
    three: "rgb(253,218,13)",
    four: "rgb(0,150,255)",
    five: "rgb(210,43,43)"
  };

  /* The theme may restyle the hit colours; the exe's own values are the fallback. */
  function hitColor(hits) {
    if (hits >= 5) return cssVar("--hit-5", HIT_COLORS.five);
    if (hits === 4) return cssVar("--hit-4", HIT_COLORS.four);
    if (hits === 3) return cssVar("--hit-3", HIT_COLORS.three);
    return cssVar("--hit-low", HIT_COLORS.low);
  }

  function cssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (value && value.trim()) || fallback;
  }

  Chart.attach = function (canvas) {
    Chart.canvas = canvas;
    Chart.ctx = canvas.getContext("2d");

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", function () {
      Chart.hover = null; UI.hideTip(); Chart.draw();
    });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", function () { Chart.view = null; Chart.draw(); });
    canvas.addEventListener("click", onClick);
    window.addEventListener("resize", function () { Chart.draw(); });
  };

  /* --------------------------------------------------------------- scale */

  function collectSpan() {
    var event = Store.currentEvent();
    var results = Store.results;
    var values = [];

    (event.x_dates || []).forEach(function (xDate) {
      if (xDate.enabled === false) return;
      var instant = T.xDateToInstant(event.scope, xDate, event.lat, event.long, []);
      if (instant) values.push(instant.getTime());
    });

    if (results && results.z_keys_sorted) {
      results.z_keys_sorted.forEach(function (key) {
        values.push(results.z_structs[key].z_start.getTime());
      });
    }

    if (!values.length) return null;

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) { min -= C.MILLIS_PER_DAY * 15; max += C.MILLIS_PER_DAY * 15; }
    var pad = (max - min) * 0.04 + C.MILLIS_PER_DAY;
    return { min: min - pad, max: max + pad };
  }

  function currentView() {
    if (!Chart.view) Chart.view = collectSpan();
    return Chart.view;
  }

  /* ---------------------------------------------------------------- draw */

  Chart.draw = function () {
    var canvas = Chart.canvas;
    if (!canvas) return;

    var ratio = window.devicePixelRatio || 1;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = Chart.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var event = Store.currentEvent();
    var results = Store.results;
    var view = currentView();

    Chart.points = [];

    var ink = cssVar("--ink", "#e9e4d4");
    var line = cssVar("--chart-line", "rgba(255,255,255,.16)");
    var gold = cssVar("--gold", "#d8a943");

    if (!view) {
      ctx.fillStyle = cssVar("--dim", "#888");
      ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Add two X-Dates to draw the timeline.", width / 2, height / 2);
      return;
    }

    var padLeft = 16, padRight = 16;
    /* Leave only what sits below the axis — tick labels and one glyph row —
       and give the rest of the height to the stems. */
    var axisY = Math.round(Math.max(height * 0.62, height - 46));
    var topY = 24;
    var glyphY = axisY + 26;

    function xAt(millis) {
      return padLeft + (millis - view.min) / (view.max - view.min) * (width - padLeft - padRight);
    }

    /* ---- time grid ---- */
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.fillStyle = cssVar("--dim", "#888");
    ctx.font = "10px \"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";

    var ticks = niceTicks(view.min, view.max, Math.max(2, Math.floor(width / 110)));
    ticks.forEach(function (tick) {
      var x = xAt(tick.millis);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, topY - 10);
      ctx.lineTo(x, axisY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(tick.label, x, axisY + 14);
    });

    /* ---- axis ---- */
    ctx.strokeStyle = cssVar("--chart-axis", "rgba(255,255,255,.4)");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, axisY);
    ctx.lineTo(width - padRight, axisY);
    ctx.stroke();

    /* ---- today ---- */
    var nowMillis = Store.nowInstant().getTime();
    if (nowMillis >= view.min && nowMillis <= view.max) {
      var nowX = xAt(nowMillis);
      ctx.save();
      ctx.strokeStyle = cssVar("--cyan", "#54b8c9");
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(nowX, topY - 14);
      ctx.lineTo(nowX, axisY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar("--cyan", "#54b8c9");
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("now", nowX + 4, topY - 16);
      ctx.restore();
    }

    if (!results || results.errors.length) { drawXDates(); return; }

    /* ---- scores ---- */
    var maxScore = 0;
    results.z_keys_sorted.forEach(function (key) {
      var score = results.z_structs[key].score;
      if (score > maxScore) maxScore = score;
    });
    if (maxScore <= 0) maxScore = 1;
    var usableHeight = axisY - topY;

    /* ---- fan-out arcs (anchor X-Date -> Z-Date) ---- */
    var selectedKey = Store.selection.zKey;
    results.z_keys_sorted.forEach(function (key) {
      var zStruct = results.z_structs[key];
      var zx = xAt(zStruct.z_start.getTime());
      var isSelected = key === selectedKey;

      zStruct.operation_match_structs.forEach(function (match) {
        var result = match.operation_result;
        var anchorMillis = result.anchor_instant.getTime();
        var ax = xAt(anchorMillis);
        var lift = Math.min(usableHeight * 0.9, Math.abs(zx - ax) * 0.35 + 12);

        ctx.beginPath();
        ctx.moveTo(ax, axisY);
        ctx.quadraticCurveTo((ax + zx) / 2, axisY - lift, zx, axisY);
        ctx.strokeStyle = isSelected ? cssVar("--gold", "#d8a943") : hitColor(zStruct.hit_count);
        ctx.globalAlpha = isSelected ? 0.85 : 0.13;
        ctx.lineWidth = isSelected ? 1.6 : 1;
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;

    /* ---- Z-Date stems ---- */
    results.z_keys_sorted.forEach(function (key) {
      var zStruct = results.z_structs[key];
      var x = xAt(zStruct.z_start.getTime());
      if (x < padLeft - 20 || x > width - padRight + 20) return;

      var stem = (zStruct.score / maxScore) * usableHeight * 0.92;
      var y = axisY - stem;
      var color = hitColor(zStruct.hit_count);
      var isSelected = key === selectedKey;
      var isHover = Chart.hover === key;

      ctx.strokeStyle = color;
      ctx.globalAlpha = isSelected || isHover ? 1 : 0.8;
      ctx.lineWidth = isSelected ? 2.5 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, isSelected || isHover ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (zStruct.msrf_match_structs.length) {
        ctx.beginPath();
        ctx.arc(x, y, isSelected || isHover ? 8 : 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      Chart.points.push({ key: key, x: x, y: y, kind: "z" });

      if (event.chart_option__show_dates !== false && (isSelected || isHover)) {
        var label = zStruct.z_readable_start;
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = ink;
        ctx.fillText(label, x, y - 12);
      }
    });

    drawXDates();
    drawAstro();

    /* ---- X-Dates ---- */
    function drawXDates() {
      var lastLabelX = -Infinity;
      var tier = 0;

      (event.x_dates || []).forEach(function (xDate, index) {
        if (xDate.enabled === false) return;
        var instant = T.xDateToInstant(event.scope, xDate, event.lat, event.long, []);
        if (!instant) return;
        var x = xAt(instant.getTime());
        if (x < padLeft - 20 || x > width - padRight + 20) return;

        ctx.beginPath();
        ctx.moveTo(x, axisY - 9);
        ctx.lineTo(x - 6, axisY + 1);
        ctx.lineTo(x + 6, axisY + 1);
        ctx.closePath();
        ctx.fillStyle = gold;
        ctx.fill();

        // Close neighbours step up a tier instead of printing over each other.
        tier = (x - lastLabelX < 22) ? (tier + 1) % 3 : 0;
        lastLabelX = x;

        ctx.font = "600 10px \"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = gold;
        ctx.fillText("X" + (index + 1), x, axisY - 13 - tier * 11);

        Chart.points.push({ key: "x" + index, x: x, y: axisY - 5, kind: "x", index: index, instant: instant });
      });
    }

    /* ---- moons / eclipses ---- */
    function drawAstro() {
      var wanted = {};
      C.CHART_OPTIONS.forEach(function (option) {
        if (option.kind === "moon" && event[option.key] === true) wanted["moon:" + option.phase] = option.label;
        if (option.kind === "eclipse" && event[option.key] === true) wanted["ecl:" + option.eclipse] = option.label;
      });
      if (!Object.keys(wanted).length) return;

      var marks = [];
      function consider(instant, sourceLabel) {
        var phase = T.lunarPhase(instant);
        if (wanted["moon:" + phase]) {
          marks.push({ millis: instant.getTime(), glyph: T.MOON_GLYPHS[phase], label: T.MOON_NAMES[phase], source: sourceLabel, kind: "moon" });
        }
        var eclipse = T.eclipseAt(instant);
        if (eclipse && wanted["ecl:" + eclipse.kind]) {
          marks.push({ millis: instant.getTime(), glyph: eclipse.glyph, label: eclipse.label, source: sourceLabel, kind: "eclipse" });
        }
      }

      (event.x_dates || []).forEach(function (xDate, index) {
        if (xDate.enabled === false) return;
        var instant = T.xDateToInstant(event.scope, xDate, event.lat, event.long, []);
        if (instant) consider(instant, "X" + (index + 1));
      });
      if (results && results.z_keys_sorted) {
        results.z_keys_sorted.forEach(function (key) {
          var zStruct = results.z_structs[key];
          consider(zStruct.z_start, "Z" + (zStruct.z_ordinal + 1));
        });
      }

      ctx.textAlign = "center";
      ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
      marks.forEach(function (mark) {
        var x = xAt(mark.millis);
        if (x < padLeft - 10 || x > width - padRight + 10) return;
        ctx.fillStyle = mark.kind === "eclipse" ? cssVar("--red", "#d3402f") : cssVar("--moon", "#cbd5e1");
        ctx.fillText(mark.glyph, x, glyphY + 4);
        Chart.points.push({ key: "astro", x: x, y: glyphY, kind: "astro", label: mark.label + " · " + mark.source, millis: mark.millis });
      });
    }
  };

  /* --------------------------------------------------------- interaction */

  function pick(event) {
    var box = Chart.canvas.getBoundingClientRect();
    var mx = event.clientX - box.left;
    var my = event.clientY - box.top;
    var best = null;
    var bestDistance = 18;

    Chart.points.forEach(function (point) {
      var dx = point.x - mx;
      var dy = point.y - my;
      var distance = Math.sqrt(dx * dx + dy * dy);
      // Z stems are easy to hit anywhere along their length.
      if (point.kind === "z" && Math.abs(dx) < 6 && my > point.y - 8) distance = Math.min(distance, Math.abs(dx));
      if (distance < bestDistance) { bestDistance = distance; best = point; }
    });
    return best;
  }

  function onMove(domEvent) {
    if (Chart.dragging) {
      var view = currentView();
      var box = Chart.canvas.getBoundingClientRect();
      var span = view.max - view.min;
      var perPixel = span / Math.max(1, box.width - 32);
      var delta = (domEvent.clientX - Chart.dragging.startX) * perPixel;
      Chart.view = { min: Chart.dragging.min - delta, max: Chart.dragging.max - delta };
      Chart.draw();
      return;
    }

    var point = pick(domEvent);
    var previous = Chart.hover;
    Chart.hover = (point && point.kind === "z") ? point.key : null;
    Chart.canvas.style.cursor = point ? "pointer" : "grab";

    if (point) {
      UI.showTip(fakeAnchor(domEvent), tipFor(point));
    } else {
      UI.hideTip();
    }
    if (previous !== Chart.hover) Chart.draw();
  }

  function fakeAnchor(domEvent) {
    return {
      getBoundingClientRect: function () {
        return { left: domEvent.clientX, top: domEvent.clientY, width: 0, height: 0, right: domEvent.clientX, bottom: domEvent.clientY };
      }
    };
  }

  function tipFor(point) {
    var event = Store.currentEvent();
    if (point.kind === "z") {
      var zStruct = Store.results && Store.results.z_structs[point.key];
      if (!zStruct) return "";
      return UI.tipTable([
        ["Z-Date", UI.esc(zStruct.z_readable_start)],
        ["Score", "" + zStruct.score],
        ["Hits", zStruct.operation_hit_count + " operations, " + zStruct.msrf_hit_count + " MSRF"],
        ["MSRF", zStruct.msrf_match_structs.length
          ? zStruct.msrf_match_structs.map(function (m) { return m.msrf_number; }).join(", ")
          : "none"]
      ]);
    }
    if (point.kind === "x") {
      return UI.tipTable([
        ["X-Date", UI.label("X", point.index)],
        ["When", UI.esc(event.scope === C.EVENT_SCOPE__HH_MM
          ? T.formatDateAndTime(point.instant, event.lat, event.long)
          : T.formatUtcDateOnly(point.instant))]
      ]);
    }
    return UI.esc(point.label || "");
  }

  function onDown(domEvent) {
    var view = currentView();
    if (!view) return;
    Chart.dragging = { startX: domEvent.clientX, min: view.min, max: view.max };
    Chart.canvas.style.cursor = "grabbing";
  }

  function onUp() {
    if (!Chart.dragging) return;
    Chart.dragging = null;
    if (Chart.canvas) Chart.canvas.style.cursor = "grab";
  }

  function onClick(domEvent) {
    var point = pick(domEvent);
    if (point && point.kind === "z") {
      Store.selection.zKey = (Store.selection.zKey === point.key) ? null : point.key;
      Store.selection.operationHash = null;
      Store.notify("selection");
    }
  }

  function onWheel(domEvent) {
    domEvent.preventDefault();
    var view = currentView();
    if (!view) return;

    var box = Chart.canvas.getBoundingClientRect();
    var ratio = (domEvent.clientX - box.left - 16) / Math.max(1, box.width - 32);
    ratio = Math.max(0, Math.min(1, ratio));

    var span = view.max - view.min;
    var factor = domEvent.deltaY > 0 ? 1.2 : 1 / 1.2;
    var newSpan = Math.max(C.MILLIS_PER_DAY * 2, span * factor);
    var focus = view.min + span * ratio;

    Chart.view = { min: focus - newSpan * ratio, max: focus + newSpan * (1 - ratio) };
    Chart.draw();
  }

  Chart.reset = function () { Chart.view = null; };

  /* Readable, evenly spaced date ticks for the current span. */
  function niceTicks(minMillis, maxMillis, count) {
    var span = maxMillis - minMillis;
    var day = C.MILLIS_PER_DAY;
    var steps = [day, 2 * day, 7 * day, 14 * day, 30 * day, 61 * day, 91 * day, 182 * day, 365 * day, 730 * day, 1826 * day, 3652 * day];
    var target = span / Math.max(1, count);
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if (steps[i] >= target) { step = steps[i]; break; } }

    var ticks = [];
    var start = Math.ceil(minMillis / step) * step;
    for (var millis = start; millis <= maxMillis; millis += step) {
      var instant = new Date(millis);
      var label;
      if (step >= 365 * day) label = "" + instant.getUTCFullYear();
      else if (step >= 30 * day) label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][instant.getUTCMonth()] + " " + instant.getUTCFullYear();
      else label = T.pad2(instant.getUTCMonth() + 1) + "/" + T.pad2(instant.getUTCDate());
      ticks.push({ millis: millis, label: label });
    }
    return ticks;
  }

  root.Ophis.Chart = Chart;
})(typeof window !== "undefined" ? window : globalThis);
