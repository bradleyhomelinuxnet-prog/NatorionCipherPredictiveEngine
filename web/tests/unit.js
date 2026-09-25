/* ==========================================================================
   unit.js — behaviour tests for the engine, runnable in Node or the browser
   --------------------------------------------------------------------------
   Node:     node web/tests/unit.node.js
   Browser:  open web/tests/index.html

   The expected values in the "golden output" suite were produced by the
   original v12 engine (see parity.node.js), so this file keeps its promises
   even where the original is not available to run alongside.
   ========================================================================== */
(function (root) {
  "use strict";

  var Ophis = root.Ophis;
  var C = Ophis.C;
  var T = Ophis.Time;
  var Expr = Ophis.Expr;
  var Engine = Ophis.Engine;
  var FileIO = Ophis.File;

  var suites = [];
  function suite(name, body) {
    var cases = [];
    body(function (title, fn) { cases.push({ title: title, fn: fn }); });
    suites.push({ name: name, cases: cases });
  }

  /* ------------------------------------------------------------ asserts */
  function fail(message) { throw new Error(message); }

  var assert = {
    ok: function (value, message) { if (!value) fail(message || "expected truthy, got " + value); },
    no: function (value, message) { if (value) fail(message || "expected falsy, got " + value); },
    eq: function (actual, expected, message) {
      if (actual !== expected) fail((message ? message + ": " : "") + "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
    },
    close: function (actual, expected, tolerance, message) {
      if (Math.abs(actual - expected) > (tolerance === undefined ? 1e-9 : tolerance)) {
        fail((message ? message + ": " : "") + "expected ~" + expected + ", got " + actual);
      }
    },
    deep: function (actual, expected, message) {
      var a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) fail((message ? message + ": " : "") + "expected " + b + ", got " + a);
    },
    throws: function (fn, message) {
      var threw = false;
      try { fn(); } catch (e) { threw = true; }
      if (!threw) fail(message || "expected a throw");
    }
  };

  /* ------------------------------------------------------------ helpers */
  function xdates(list) {
    return list.map(function (entry) {
      if (typeof entry === "string") return { date: entry, time: "00:00", enabled: true };
      return { date: entry[0], time: entry[1] || "00:00", enabled: entry[2] !== false };
    });
  }

  var NO_FILTERS = {
    iso_event_filter_before_last_x_date: false,
    iso_event_filter_on_last_x_date: false,
    iso_event_filter_before_current_date: false,
    iso_event_filter_on_current_date: false,
    iso_event_filter_beyond_max_days: false,
    iso_event_filter_min_hit_count: false,
    iso_event_filter_min_score: false,
    iso_event_filter_msrf_match: false
  };

  function event(overrides) {
    var base = FileIO.newEvent("Test");
    Object.keys(overrides || {}).forEach(function (key) { base[key] = overrides[key]; });
    return base;
  }

  /* The reference instant every engine test runs against: 2027-01-19. */
  var NOW = new Date(Date.UTC(2027, 0, 19));

  function run(evt) {
    return Engine.run(evt, { nowInstant: NOW });
  }

  function rowsOf(results) {
    return results.z_keys_by_date.map(function (key) {
      var z = results.z_structs[key];
      return [
        z.z_readable_start, z.hit_count, z.score,
        z.msrf_match_structs.map(function (m) { return m.msrf_number; }).join("/") || "-",
        z.operation_match_structs.map(function (m) { return m.operation_result.operation_ordinal + 1; }).join("/")
      ].join(" ");
    });
  }

  /* ====================================================================== */
  suite("constants", function (test) {
    test("the four constants are the spoken values, not the exact ones", function () {
      assert.eq(C.OPH_PI, 3.14);
      assert.eq(C.OPH_PHI, 1.618);
      assert.eq(C.OPH_CRV, 5.08);
      assert.eq(C.OPH_HEP, 7.01);
    });

    test("MSRF tables are the sizes the desktop app ships", function () {
      assert.eq(C.MSRF_FILTER__NORMAL.length, 325, "normal numbers");
      assert.eq(C.MSRF_FILTER__IMPORTANT.length, 53, "important numbers");
      assert.eq(C.MSRF_FILTER__VORTEX.length, 12, "vortex numbers");
      assert.eq(C.HIGHEST_MSRF_NUMBER, 2559);
    });

    test("138 is a normal MSRF number and 153 an important one", function () {
      assert.ok(C.MSRF_FILTER__NORMAL.indexOf(138) >= 0);
      assert.ok(C.MSRF_FILTER__IMPORTANT.indexOf(153) >= 0);
    });

    test("the default operation set is the 16 of v12", function () {
      var operations = C.defaultOperations();
      assert.eq(operations.length, 16);
      assert.eq(operations[0].equation, "X2+oph_round(Y)");
      assert.eq(operations[15].equation, "X2+YxOPH_HEP");
      assert.ok(operations.every(function (op) { return op.enabled === true; }));
    });
  });

  /* ====================================================================== */
  suite("formula language", function (test) {
    test("every shipped operation compiles", function () {
      C.defaultOperations().forEach(function (op) {
        var compiled = Expr.compile(op.equation);
        assert.ok(compiled.ok, op.equation + " failed: " + compiled.errors.join(" "));
      });
    });

    test("'x' means multiply, and does not eat the x inside oph_exp", function () {
      assert.eq(Expr.normalize("X2+YxOPH_PHI", true), "X2+Y*1.618");
      assert.eq(Expr.normalize("X2+oph_exp(Y)", true), "X2+oph_exp(Y)");
      assert.eq(Expr.normalize("X1+oph_exp(Y)xOPH_PI", true), "X1+oph_exp(Y)*3.14");
    });

    test("the anchor is read from the front of the formula", function () {
      assert.eq(Expr.startingX("X1+Y"), C.STARTING_X1);
      assert.eq(Expr.startingX("X2 + Y x OPH_PI"), C.STARTING_X2);
      assert.eq(Expr.startingX("Y+X1"), null);
    });

    test("a formula must be anchored", function () {
      var compiled = Expr.compile("Y*2");
      assert.no(compiled.ok);
      assert.ok(compiled.errors[0].indexOf("X1") >= 0);
    });

    test("a formula must resolve to more than zero", function () {
      var compiled = Expr.compile("X1+oph_round(Y/138)x138");   // round(10/138) = 0
      assert.no(compiled.ok);
      assert.eq(compiled.errors[0], Expr.Z_VALUE_MUST_BE_POSITIVE);
    });

    test("duplicates are rejected against earlier operations", function () {
      var operations = [{ equation: "X2+Y" }, { equation: "X2 + Y" }];
      assert.ok(Expr.validateInList("X2+Y", 0, operations).ok);
      var second = Expr.validateInList("X2 + Y", 1, operations);
      assert.no(second.ok);
      assert.ok(second.errors.join(" ").indexOf("Operation 1") >= 0);
    });

    test("arithmetic matches the desktop engine's results", function () {
      assert.close(Expr.compile("X2+oph_round(Y)").run(1319), 1319);
      assert.close(Expr.compile("X2+YxOPH_PHI").run(1319), 1319 * 1.618);
      assert.close(Expr.compile("X1+(Y/2.0)xOPH_PI").run(1656), (1656 / 2) * 3.14);
      assert.close(Expr.compile("X2+Y/OPH_CRV").run(6940), 6940 / 5.08);
      assert.close(Expr.compile("X1+YxOPH_HEP").run(19), 19 * 7.01);
    });

    test("unary minus and nesting parse", function () {
      assert.close(Expr.compile("X2+oph_abs(-Y)").run(19), 19);
      assert.close(Expr.compile("X2+oph_round(oph_abs(Y-138)/2.0)").run(19), Math.round(119 / 2));
    });
  });

  /* ====================================================================== */
  suite("injection resistance", function (test) {
    var PAYLOADS = [
      ["X2+constructor.constructor(\"return 1\")()", "prototype chain to Function"],
      ["X2+globalThis", "global object"],
      ["X2+(function(){return 1})()", "inline function literal"],
      ["X2+Y.constructor(\"return 1\")()", "Number.constructor"],
      ["X2+window", "browser global"],
      ["X2+[].map", "array method"],
      ["X2+this", "enclosing scope"],
      ["X2+0;alert(1)", "statement injection"],
      ["X2+Y||require", "node require"],
      ["X2+0x1e.toString", "method off a literal"],
      ["X2+require('fs')", "direct require"],
      ["X2+eval('1')", "eval"],
      ["X2+process.exit(0)", "process"],
      ["X2+fetch('http://x')", "network"],
      ["X2+Y`tagged`", "tagged template"],
      ["X2+Y=>1", "arrow function"],
      ["X2+{}.constructor", "object literal"],
      ["X2+localStorage", "storage"]
    ];

    PAYLOADS.forEach(function (payload) {
      test("rejects " + payload[1], function () {
        var compiled = Expr.compile(payload[0]);
        assert.no(compiled.ok, payload[0] + " was accepted");
        assert.ok(compiled.errors.length > 0);
      });
    });

    test("a hostile .oph loads without executing anything", function () {
      var hostile = JSON.stringify({
        app_version: "12",
        iso_events: [{
          name: "hostile",
          x_dates: [{ date: "01/19/2020", time: "00:00", enabled: true }, { date: "09/06/2023", time: "00:00", enabled: true }],
          operations: [
            { equation: "X2+constructor.constructor(\"globalThis.OPHIS_PWNED=1\")()", weight: 1, enabled: true },
            { equation: "X2+oph_round(Y)", weight: 1, enabled: true }
          ]
        }]
      });
      var parsed = FileIO.parse(hostile, C.FILE_INPUT_VALIDATION_MODE__ORIGINAL);
      assert.eq(parsed.errors.length, 0, "the file should load, with the bad operation disabled");
      assert.eq(parsed.warnings.length, 1, "one warning about the rejected operation");
      assert.eq(parsed.events[0].operations[0].enabled, false, "hostile operation must be disabled");
      assert.eq(parsed.events[0].operations[1].enabled, true, "the good operation survives");
      assert.eq(root.OPHIS_PWNED, undefined, "nothing was executed");

      var results = run(parsed.events[0]);
      assert.eq(results.errors.length, 0);
      assert.eq(root.OPHIS_PWNED, undefined, "still nothing executed after a run");
    });

    test("strict mode refuses the file outright", function () {
      var hostile = JSON.stringify({
        app_version: "12",
        iso_events: [{
          name: "hostile",
          x_dates: [{ date: "01/19/2020", enabled: true }, { date: "09/06/2023", enabled: true }],
          operations: [{ equation: "X2+window.location", weight: 1, enabled: true }]
        }]
      });
      var parsed = FileIO.parse(hostile, C.FILE_INPUT_VALIDATION_MODE__STRICT);
      assert.ok(parsed.errors.length > 0);
    });
  });

  /* ====================================================================== */
  suite("oph_flip", function (test) {
    test("reverses whole numbers", function () {
      assert.eq(Expr.oph_flip(1319), 9131);
      assert.eq(Expr.oph_flip(138), 831);
      assert.eq(Expr.oph_flip(19), 91);
      assert.eq(Expr.oph_flip(1656), 6561);
    });

    test("puts the decimal point back at the same index, not the same place value", function () {
      // The desktop implementation strips the '.', reverses the digits, then
      // splices the '.' back in at the index it was found — so 1.38 becomes
      // 8.31 rather than 83.1. Ported exactly, quirk included.
      assert.eq(Expr.oph_flip(13.19), 91.31);
      assert.eq(Expr.oph_flip(1.38), 8.31);
      assert.eq(Expr.oph_flip(19.138), 83.191);
    });

    test("palindromes are their own flip", function () {
      [19891, 138831, 1661, 12321, 1319131].forEach(function (n) {
        assert.eq(Expr.oph_flip(n), n, n + " should flip to itself");
      });
    });

    test("flipping twice returns the original when no digit is lost", function () {
      [1319, 138, 19, 4321, 1656].forEach(function (n) {
        assert.eq(Expr.oph_flip(Expr.oph_flip(n)), n);
      });
    });
  });

  /* ====================================================================== */
  suite("rounding and dates", function (test) {
    test("rounding uses the epsilon nudge the engine depends on", function () {
      assert.eq(T.roundToPrecision(2.675, 2), 2.68);
      assert.eq(T.roundTime(1.005), 1.01);
      assert.eq(T.roundRotation(138.44), 138.4);
      assert.eq(T.roundRotation(138.45), 138.5);
    });

    test("dates round-trip through the display format", function () {
      var instant = T.xDateToInstant(C.EVENT_SCOPE__DAYS, T.newXDate("01/19/2027"), 0, 0, []);
      assert.eq(instant.getTime(), Date.UTC(2027, 0, 19));
      assert.eq(T.formatUtcDateOnly(instant), "01/19/2027");
    });

    test("impossible dates are refused", function () {
      assert.eq(T.parseCalendarDate("13/45/2020", []), null);
      assert.eq(T.parseCalendarDate("02/30/2021", []), null);
      assert.ok(T.parseCalendarDate("02/29/2024", []), "2024 is a leap year");
      assert.eq(T.parseCalendarDate("02/29/2023", []), null, "2023 is not");
    });

    test("a short year is read as that year, as the desktop app does", function () {
      // "1/1/20" is year 20, not 2020: the original only checks the year is at
      // most four digits. Kept, so files written by either app read the same.
      assert.deep(T.parseCalendarDate("1/1/20", []), { year: 20, month: 1, day: 1 });
    });

    test("clock times are bounded", function () {
      assert.deep(T.parseClockTime("18:30", []), { hours: 18, minutes: 30 });
      assert.eq(T.parseClockTime("24:00", []), null);
      assert.eq(T.parseClockTime("12:60", []), null);
      assert.eq(T.parseClockTime("1230", []), null);
    });

    test("day scope counts whole days between UTC midnights", function () {
      var a = T.xDateToInstant(C.EVENT_SCOPE__DAYS, T.newXDate("01/19/2020"), 0, 0, []);
      var b = T.xDateToInstant(C.EVENT_SCOPE__DAYS, T.newXDate("09/06/2023"), 0, 0, []);
      assert.eq(T.axialRotationsBetween(C.EVENT_SCOPE__DAYS, a, b, 0, 0), 1326);
      assert.eq(T.axialRotationsBetween(C.EVENT_SCOPE__DAYS, b, a, 0, 0), -1326);
    });

    test("a Z-Date snaps to the UTC day it lands in", function () {
      var instant = new Date(Date.UTC(2027, 0, 19, 23, 59, 59));
      assert.eq(T.floorToUtcMidnight(instant).getTime(), Date.UTC(2027, 0, 19));
    });

    test("years 0-99 are the years written, not 1900-1999", function () {
      var instant = T.xDateToInstant(C.EVENT_SCOPE__DAYS, T.newXDate("02/14/0033"), 0, 0, []);
      assert.eq(instant.getUTCFullYear(), 33);
      assert.eq(T.formatUtcDateOnly(instant), "02/14/0033", "early years keep four digits");
      assert.eq(T.daysInMonth(4, 2), 29, "4 AD is a leap year on the proleptic Gregorian calendar");
      assert.eq(T.formatUtcDateOnly(T.floorToUtcMidnight(new Date(T.utcMillis(99, 11, 31, 18)))), "12/31/0099");
    });
  });

  /* ====================================================================== */
  suite("MSRF matching", function (test) {
    test("exact normal and important numbers match", function () {
      assert.eq(Engine.msrfMatch(138).kind, C.MSRF_KIND__NORMAL);
      assert.eq(Engine.msrfMatch(153).kind, C.MSRF_KIND__IMPORTANT);
      assert.eq(Engine.msrfMatch(1656).kind, C.MSRF_KIND__IMPORTANT);
    });

    test("vortex numbers match within a tenth of a day", function () {
      assert.eq(Engine.msrfMatch(21.7).kind, C.MSRF_KIND__VORTEX);
      assert.eq(Engine.msrfMatch(871.2).kind, C.MSRF_KIND__VORTEX);
      assert.eq(Engine.msrfMatch(871.25).kind, C.MSRF_KIND__VORTEX, "rounds to 871.3, still inside the tolerance");
      assert.eq(Engine.msrfMatch(21.9), null, "0.2 away is too far");
      // The comparison is a plain float subtraction against 0.1, exactly as in
      // the desktop app, so a count a tenth above lands just outside it.
      assert.eq(Engine.msrfMatch(21.8), null, "0.1 above misses by a float hair");
    });

    test("a count sitting exactly on a half day is no match", function () {
      assert.eq(Engine.msrfMatch(137.5), null);
      assert.eq(Engine.msrfMatch(138.5), null);
      assert.ok(Engine.msrfMatch(138.4), "0.4 rounds down to 138");
    });

    test("nothing off the tables matches", function () {
      assert.eq(Engine.msrfMatch(137), null);
      assert.eq(Engine.msrfMatch(1), null);
      assert.eq(Engine.msrfMatch(0), null);
    });

    test("points and multipliers follow the table", function () {
      assert.eq(Engine.msrfMatch(138).points, C.POINTS__NORMAL_MSRF_MATCH);
      assert.eq(Engine.msrfMatch(153).points, C.POINTS__IMPORTANT_MSRF_MATCH);
      assert.eq(Engine.msrfMultiplierForKind(C.MSRF_KIND__NORMAL), 1.5);
      assert.eq(Engine.msrfMultiplierForKind(C.MSRF_KIND__IMPORTANT), 2);
      assert.eq(Engine.msrfMultiplierForKind(C.MSRF_KIND__VORTEX), 2);
    });
  });

  /* ====================================================================== */
  suite("golden output (values from the original v12 engine)", function (test) {
    test("two anchors, 16 operations, no filters", function () {
      var results = run(event(Object.assign({
        x_dates: xdates(["01/19/2020", "09/06/2023"])
      }, NO_FILTERS)));

      assert.eq(results.errors.length, 0, results.errors.join("; "));
      assert.deep(rowsOf(results), [
        "05/24/2024 1 0.5 - 3", "09/30/2025 1 0.5 - 4", "12/03/2025 1 1 - 5",
        "08/13/2026 1 1 - 6", "04/24/2027 1 1 - 1", "04/09/2029 1 0.5 - 7",
        "05/18/2029 1 0.5 - 8", "07/21/2029 1 1 - 9", "06/13/2031 1 1 - 10",
        "11/25/2032 1 0.5 - 11", "01/29/2035 1 0.5 - 12", "06/29/2038 1 0.5 - 13",
        "09/27/2040 1 1 - 2", "02/14/2042 1 0.5 - 14", "07/01/2045 1 1 - 15",
        "02/16/2049 1 1 - 16"
      ]);
    });

    test("three anchors: MSRF hits and the score multiplier", function () {
      var results = run(event(Object.assign({
        x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027"])
      }, NO_FILTERS)));

      assert.eq(results.errors.length, 0);
      assert.eq(results.total_z_dates, 48);

      var withMsrf = rowsOf(results).filter(function (row) { return row.indexOf(" - ") < 0; });
      assert.deep(withMsrf.slice(0, 8), [
        "09/15/2026 2 0.75 74 4", "10/31/2026 2 0.75 119 7", "11/01/2026 2 0.75 74 8",
        "11/02/2026 2 1.5 74 2", "11/04/2026 2 1.5 76 9", "12/17/2026 2 0.75 119 11",
        "04/17/2027 2 0.75 40 3", "04/26/2027 2 0.75 49 3"
      ]);
    });

    test("an important MSRF match doubles instead of adding", function () {
      var results = run(event(Object.assign({
        x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027"])
      }, NO_FILTERS)));

      var target = null;
      results.z_keys_by_date.forEach(function (key) {
        if (results.z_structs[key].z_readable_start === "08/09/2027") target = results.z_structs[key];
      });
      assert.ok(target, "expected a Z-Date on 08/09/2027");
      assert.deep(target.msrf_match_structs.map(function (m) { return m.msrf_number; }), [153]);
      assert.eq(target.operation_score, 1, "one alpha operation");
      assert.eq(target.base_score_pre_multiply, 1, "the strongest match becomes the multiplier, not points");
      assert.eq(target.score_multiplier, 2);
      assert.eq(target.score, 2);
    });

    test("v7 scoring adds the MSRF points instead of multiplying", function () {
      var v8 = run(event(Object.assign({ x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027"]) }, NO_FILTERS)));
      var v7 = run(event(Object.assign({
        x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027"]),
        scoring_system: C.SCORING_SYSTEM__LTE_V7
      }, NO_FILTERS)));

      function scoreOn(results, date) {
        var found = 0;
        results.z_keys_by_date.forEach(function (key) {
          if (results.z_structs[key].z_readable_start === date) found = results.z_structs[key].score;
        });
        return found;
      }
      assert.eq(scoreOn(v8, "08/09/2027"), 2, "v8: (1 + 0) x 2");
      assert.eq(scoreOn(v7, "08/09/2027"), 3, "v7: 1 + 2, no multiplier");
    });
  });

  /* ====================================================================== */
  suite("engine rules", function (test) {
    test("two enabled X-Dates are required", function () {
      var results = run(event({ x_dates: xdates(["01/19/2026"]) }));
      assert.eq(results.errors.length, 1);
      assert.ok(results.errors[0].indexOf("2 X-Dates") >= 0);
    });

    test("X-Dates must run forwards", function () {
      var results = run(event({ x_dates: xdates(["09/09/2024", "01/01/2020"]) }));
      assert.ok(results.errors.length > 0);
      assert.ok(results.errors[0].indexOf("later than") >= 0);
    });

    test("X-Dates must be at least a day apart", function () {
      var results = run(event({ x_dates: xdates(["01/19/2026", "01/19/2026"]) }));
      assert.ok(results.errors.length > 0);
    });

    test("at least one operation must compile", function () {
      var results = run(event({
        x_dates: xdates(["01/19/2020", "09/06/2023"]),
        operations: [{ equation: "X2+window", weight: 1, enabled: true }]
      }));
      assert.ok(results.errors.length > 0);
      assert.ok(results.errors[0].indexOf("Operation") >= 0);
    });

    test("every pair of anchors produces an interval", function () {
      var results = run(event(Object.assign({ x_dates: xdates(["01/01/2020", "05/07/2021", "11/13/2023", "02/02/2025"]) }, NO_FILTERS)));
      assert.eq(results.y_structs.length, 6, "4 anchors make 6 pairs");
    });

    test("a disabled anchor takes its pairs with it", function () {
      var all = run(event(Object.assign({ x_dates: xdates(["01/01/2020", "05/07/2021", "11/13/2023"]) }, NO_FILTERS)));
      var some = run(event(Object.assign({ x_dates: xdates([["01/01/2020"], ["05/07/2021", "00:00", false], ["11/13/2023"]]) }, NO_FILTERS)));
      assert.eq(all.y_structs.length, 3);
      assert.eq(some.y_structs.length, 1);
    });

    test("offsets landing on the same day collapse into one Z-Date", function () {
      var results = run(event(Object.assign({
        x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027", "03/16/2027", "07/17/2027"])
      }, NO_FILTERS)));
      var operationHits = 0;
      results.z_keys_by_date.forEach(function (key) {
        operationHits += results.z_structs[key].operation_hit_count;
      });
      assert.eq(results.y_structs.length, 10, "5 anchors make 10 pairs");
      assert.eq(operationHits, 10 * 16, "10 pairs x 16 operations, however they group");
      assert.eq(results.total_z_dates, 153, "160 offsets landing on 153 distinct days");
    });

    test("HH:MM scope refuses a location the .oph reader would refuse", function () {
      var results = run(event({
        scope: C.EVENT_SCOPE__HH_MM, lat: 70, long: 10, location_enabled: true,
        x_dates: xdates([["06/21/2018", "23:00"], ["12/21/2019", "13:00"]])
      }));
      assert.eq(results.errors.length, 1);
      assert.ok(/latitude|sunset library/.test(results.errors[0]), results.errors[0]);
    });
  });

  /* ====================================================================== */
  suite("filters", function (test) {
    function withFilters(extra) {
      return run(event(Object.assign({ x_dates: xdates(["07/04/2026", "08/20/2026", "03/09/2027"]) }, NO_FILTERS, extra || {})));
    }

    test("no filters shows everything generated", function () {
      var results = withFilters();
      assert.eq(results.z_keys_sorted.length, results.total_z_dates);
    });

    test("F1 hides everything before the last X-Date", function () {
      var results = withFilters({ iso_event_filter_before_last_x_date: true });
      var lastX = Date.UTC(2027, 2, 9);
      results.z_keys_sorted.forEach(function (key) {
        assert.ok(results.z_structs[key].z_start.getTime() >= lastX, "a Z-Date slipped through before the last X-Date");
      });
    });

    test("F5 bounds how far ahead output runs", function () {
      var results = withFilters({ iso_event_filter_beyond_max_days: true, iso_event_filter_beyond_max_days_value: 138 });
      var lastX = Date.UTC(2027, 2, 9);
      results.z_keys_sorted.forEach(function (key) {
        var days = Math.round((results.z_structs[key].z_start.getTime() - lastX) / C.MILLIS_PER_DAY);
        assert.ok(days <= 138, "found a Z-Date " + days + " days out");
      });
    });

    test("F6 hides low hit counts", function () {
      var results = withFilters({ iso_event_filter_min_hit_count: true, iso_event_filter_min_hit_count_value: 2 });
      results.z_keys_sorted.forEach(function (key) {
        assert.ok(results.z_structs[key].hit_count >= 2);
      });
    });

    test("F7 hides low scores", function () {
      var results = withFilters({ iso_event_filter_min_score: true, iso_event_filter_min_score_value: 1.5 });
      results.z_keys_sorted.forEach(function (key) {
        assert.ok(results.z_structs[key].score >= 1.5);
      });
    });

    test("F8 keeps only Z-Dates with an MSRF match", function () {
      var results = withFilters({ iso_event_filter_msrf_match: true });
      assert.ok(results.z_keys_sorted.length > 0);
      results.z_keys_sorted.forEach(function (key) {
        assert.ok(results.z_structs[key].msrf_match_structs.length > 0);
      });
    });

    test("T-Dates narrow the output to the dates asked for", function () {
      var open = withFilters();
      var firstThree = open.z_keys_sorted.slice(0, 3).map(function (key) {
        return open.z_structs[key].z_readable_start;
      });
      var narrowed = withFilters({ t_dates: xdates(firstThree) });
      assert.eq(narrowed.z_keys_sorted.length, 3);
      assert.deep(narrowed.z_keys_sorted.map(function (key) {
        return narrowed.z_structs[key].z_readable_start;
      }).sort(), firstThree.slice().sort());
    });
  });

  /* ====================================================================== */
  suite("sorting", function (test) {
    function sorted(sortType) {
      var results = run(event(Object.assign({
        x_dates: xdates(["01/19/2019", "08/08/2020", "03/16/2022", "11/27/2023"]),
        z_date_sort_type: sortType
      }, NO_FILTERS)));
      return results.z_keys_sorted.map(function (key) { return results.z_structs[key]; });
    }

    test("by date is ascending", function () {
      var rows = sorted(C.Z_DATE_SORT_TYPE__DATE);
      for (var i = 1; i < rows.length; i++) {
        assert.ok(rows[i].z_start.getTime() >= rows[i - 1].z_start.getTime());
      }
    });

    test("by score is descending", function () {
      var rows = sorted(C.Z_DATE_SORT_TYPE__SCORE);
      for (var i = 1; i < rows.length; i++) assert.ok(rows[i].score <= rows[i - 1].score);
    });

    test("by hits is descending", function () {
      var rows = sorted(C.Z_DATE_SORT_TYPE__HIT_COUNT);
      for (var i = 1; i < rows.length; i++) assert.ok(rows[i].hit_count <= rows[i - 1].hit_count);
    });

    test("every sort shows the same set of Z-Dates", function () {
      var keys = C.Z_DATES_SORT_TYPES.map(function (type) {
        return sorted(type).map(function (z) { return z.key; }).sort().join("|");
      });
      keys.forEach(function (set) { assert.eq(set, keys[0]); });
    });

    test("Z ordinals are assigned in date order, whatever the display sort", function () {
      var rows = sorted(C.Z_DATE_SORT_TYPE__SCORE);
      var byOrdinal = rows.slice().sort(function (a, b) { return a.z_ordinal - b.z_ordinal; });
      for (var i = 1; i < byOrdinal.length; i++) {
        assert.ok(byOrdinal[i].z_start.getTime() >= byOrdinal[i - 1].z_start.getTime());
      }
    });
  });

  /* ====================================================================== */
  suite(".oph files", function (test) {
    var SAMPLE = JSON.stringify({
      app_version: "12",
      iso_events: [{
        name: "Round trip, 19 & 138",
        notes: "commas, quotes \" and <tags> survive",
        x_dates: [
          { date: "01/19/2020", time: "00:00", enabled: true },
          { date: "06/06/2021", time: "00:00", enabled: false },
          { date: "09/06/2023", time: "00:00", enabled: true }
        ],
        t_dates: [],
        lat: 0, long: 0, location_enabled: false,
        scope: "EVENT_SCOPE__DAYS",
        operations: [
          { equation: "X2+oph_round(Y)", weight: 1, enabled: true },
          { equation: "X1+oph_flip(oph_round(Y))", weight: 0.5, enabled: true }
        ],
        scoring_system: "SCORING_SYSTEM__GTE_V8",
        iso_event_filter_beyond_max_days_value: 138,
        z_date_sort_type: "SORT_TYPE__SCORE",
        day_scope_start_time_in_millis: 0
      }]
    });

    test("a file parses into an event", function () {
      var parsed = FileIO.parse(SAMPLE);
      assert.eq(parsed.errors.length, 0, parsed.errors.join("; "));
      assert.eq(parsed.events.length, 1);
      assert.eq(parsed.events[0].name, "Round trip, 19 & 138");
      assert.eq(parsed.events[0].x_dates.length, 3);
      assert.eq(parsed.events[0].x_dates[1].enabled, false);
      assert.eq(parsed.events[0].operations.length, 2);
      assert.eq(parsed.events[0].iso_event_filter_beyond_max_days_value, 138);
      assert.eq(parsed.events[0].z_date_sort_type, "SORT_TYPE__SCORE");
    });

    test("save then load returns the same event", function () {
      var once = FileIO.parse(SAMPLE).events;
      var twice = FileIO.parse(FileIO.serialize(once)).events;
      assert.deep(twice, once);
    });

    test("notes and names survive verbatim", function () {
      var loaded = FileIO.parse(FileIO.serialize(FileIO.parse(SAMPLE).events)).events[0];
      assert.eq(loaded.notes, "commas, quotes \" and <tags> survive");
    });

    test("missing fields fall back to the documented defaults", function () {
      var minimal = JSON.stringify({
        iso_events: [{ x_dates: [{ date: "01/19/2020" }, { date: "09/06/2023" }] }]
      });
      var parsed = FileIO.parse(minimal);
      assert.eq(parsed.errors.length, 0, parsed.errors.join("; "));
      var loaded = parsed.events[0];
      assert.eq(loaded.scope, C.DEFAULT_EVENT_SCOPE);
      assert.eq(loaded.scoring_system, C.DEFAULT_SCORING_SYSTEM);
      assert.eq(loaded.operations.length, 16, "the default operation set");
      assert.eq(loaded.iso_event_filter_beyond_max_days_value, 2559);
    });

    test("rubbish is refused with a reason", function () {
      assert.ok(FileIO.parse("not json").errors.length > 0);
      assert.ok(FileIO.parse("{}").errors.length > 0);
      assert.ok(FileIO.parse('{"iso_events":"nope"}').errors.length > 0);
      assert.ok(FileIO.parse('{"iso_events":[{"x_dates":[{"date":"99/99/9999"}]}]}').errors.length > 0);
    });

    test("CSV carries the desktop app's columns", function () {
      var evt = FileIO.parse(SAMPLE).events[0];
      var csv = FileIO.toCsv(evt, run(evt)).split("\r\n");
      assert.eq(csv[0], "IsoEvent,Date,Hits,Score,MSRF,Operations,ErrorStatus,ErrorMessage");
      assert.ok(csv.length > 1);
      var cells = csv[1].split(",");
      assert.ok(cells[0].indexOf("Round trip") >= 0 || cells[0].charAt(0) === '"', "the event name is first");
    });

    test("download names are tidy", function () {
      assert.eq(FileIO.safeFileName("Sample · four anchors"), "Sample_four_anchors");
      assert.eq(FileIO.safeFileName("a/b\\c:d"), "a_b_c_d");
      assert.eq(FileIO.safeFileName("..."), "ophis");
    });

    test("CSV quotes a name containing a comma", function () {
      var evt = FileIO.parse(SAMPLE).events[0];
      var csv = FileIO.toCsv(evt, run(evt)).split("\r\n");
      assert.eq(csv[1].charAt(0), '"', "a name with a comma must be quoted");
    });
  });

  /* ====================================================================== */
  suite("session store", function (test) {
    var Store = Ophis.Store;
    var KEY = "ophis.web.session.v1";

    /* Each test starts from a fresh two-event session. What the store and
       this page's localStorage held before is put back afterwards. */
    function withSession(fn) {
      var kept = {
        events: Store.events, index: Store.currentEventIndex, dirty: Store.dirty, results: Store.results,
        selection: Store.selection, options: JSON.parse(JSON.stringify(Store.globalOptions))
      };
      var storedBefore = null;
      try { storedBefore = localStorage.getItem(KEY); } catch (e) { /* no storage here */ }
      try {
        Store.events = [
          event({ name: "A", x_dates: xdates(["01/01/2020", "07/19/2021", "02/06/2023"]) }),
          event({ name: "B", x_dates: xdates(["03/03/2021", "09/09/2022"]) })
        ];
        Store.currentEventIndex = 0;
        Store.dirty = false;
        fn();
      } finally {
        Store.events = kept.events;
        Store.currentEventIndex = kept.index;
        Store.dirty = kept.dirty;
        Store.results = kept.results;
        Store.selection = kept.selection;
        Object.keys(kept.options).forEach(function (key) { Store.globalOptions[key] = kept.options[key]; });
        try {
          if (storedBefore === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, storedBefore);
        } catch (e) { /* no storage here */ }
      }
    }

    test("an edit marks the session unsaved; switching events, Current time and New do not", function () {
      withSession(function () {
        Store.selectEvent(1);
        assert.no(Store.dirty, "switching to another event is not an edit");
        Store.setNowOffset(7 * C.MILLIS_PER_DAY);
        assert.no(Store.dirty, "shifting Current time is not an edit");
        Store.setNowOffset(0);
        Store.addDate("x");
        assert.ok(Store.dirty, "adding an X-Date is an edit");
        Store.reset();
        assert.no(Store.dirty, "a new, empty session has nothing to lose");
      });
    });

    test("unsaved edits are still unsaved after a reload; Save and Open clear that", function () {
      withSession(function () {
        Store.addDate("x");
        Store.dirty = false;                        // a reload starts again from the stored copy
        assert.ok(Store.load(), "the session is restored");
        assert.ok(Store.dirty, "and still counts as unsaved");

        Store.markSaved();                          // Save
        Store.dirty = true;
        assert.ok(Store.load());
        assert.no(Store.dirty, "saved before the reload, saved after it");

        Store.addDate("x");
        Store.importOph(Store.exportOph());         // Open
        Store.dirty = true;
        assert.ok(Store.load());
        assert.no(Store.dirty, "a file just opened holds no unsaved edits");
      });
    });

    test("a session stored before this was tracked counts as unsaved", function () {
      withSession(function () {
        localStorage.setItem(KEY, JSON.stringify({ events: Store.events, currentEventIndex: 0, globalOptions: Store.globalOptions }));
        assert.ok(Store.load());
        assert.ok(Store.dirty, "unknown is treated as unsaved, so opening a file asks first");
      });
    });
  });

  root.Ophis.Tests = {
    suites: suites,
    assert: assert,
    run: function (report) {
      var passed = 0;
      var failed = 0;
      suites.forEach(function (suiteItem) {
        report.suite(suiteItem.name);
        suiteItem.cases.forEach(function (testCase) {
          try {
            testCase.fn();
            passed++;
            report.pass(testCase.title);
          } catch (error) {
            failed++;
            report.fail(testCase.title, error && error.message ? error.message : String(error));
          }
        });
      });
      report.done(passed, failed);
      return { passed: passed, failed: failed };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
