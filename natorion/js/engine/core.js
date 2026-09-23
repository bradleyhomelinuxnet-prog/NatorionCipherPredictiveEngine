/* NATORION · engine/core.js
   The fixed tables of Ophis v12, restated. Every number here is copied from the
   shipped source (src/ophis_config.js, src/ophis_model__params.js,
   src/ophis_utils.js); where the source was wrong or odd, the note says so and
   the value is kept, because results depend on it. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});

  var MS_MIN = 60000, MS_HOUR = 3600000, MS_DAY = 86400000;

  var C = {
    APP_VERSION: "12",
    MS_MIN: MS_MIN, MS_HOUR: MS_HOUR, MS_DAY: MS_DAY,
    MIN_X_DATES: 2,
    MIN_OPERATIONS: 1,
    MIN_DAYS_FIRST_PAIR: 1,
    MIN_DAYS_SUBSEQUENT: 1,
    MAX_Y: 36500,               // one hundred years of days
    MAX_Z: 36500,
    MAX_YEAR: 9999,
    SAMPLE_Y: 10,               // Y used to test that an equation is sane
    LAT_LIMIT: 65,              // sunset maths degrade past the polar circles
    LONG_LIMIT: 180,
    DEFAULT_LAT: 32.8,          // Dallas, the original's default
    DEFAULT_LONG: -96.8,
    HIGHEST_MSRF: 2559,
    VORTEX_TOLERANCE: 0.1,
    LUNAR_TOLERANCE_DAYS: 1,
    ECLIPSE_TOLERANCE_DAYS: 1.25,
    SUNSET_DEDUPE_MS: MS_HOUR,
    SYNODIC_MONTH: 29.53058770576,

    SCOPE: { HH_MM: "EVENT_SCOPE__HH_MM", DAYS: "EVENT_SCOPE__DAYS", MONTHS: "EVENT_SCOPE__MONTHS", YEARS: "EVENT_SCOPE__YEARS" },
    TYPE: { PERSONAL: "EVENT_TYPE__PERSONAL", MARKETS: "EVENT_TYPE__MARKETS", ASTROLOGICAL: "EVENT_TYPE__ASTROLOGICAL" },
    SCORING: { GTE_V8: "SCORING_SYSTEM__GTE_V8", LTE_V7: "SCORING_SYSTEM__LTE_V7" },
    SORT: { DATE: "SORT_TYPE__DATE", SCORE: "SORT_TYPE__SCORE", MSRF: "SORT_TYPE__MSRF", HIT_COUNT: "SORT_TYPE__HIT_COUNT", OPERATIONS: "SORT_TYPE__OPERATIONS" },
    VALIDATION: { STRICT: "FILE_INPUT_VALIDATION_MODE__STRICT", ORIGINAL: "FILE_INPUT_VALIDATION_MODE__ORIGINAL", LOOSE: "FILE_INPUT_VALIDATION_MODE__LOOSE" },

    // Scoring. An operation's weight is its points; MSRF classes add points and,
    // under the v8+ system, the best class also multiplies.
    POINTS_ALPHA: 1,
    POINTS_BETA: 0.5,
    POINTS_NORMAL: 1,
    POINTS_IMPORTANT: 2,
    POINTS_VORTEX: 2,
    MULT_NORMAL: 1.5,
    MULT_IMPORTANT: 2.0,
    MULT_VORTEX: 2.0,

    // Constants as Jason says them aloud: pi to two places, phi to three.
    OPH_PI: 3.14,
    OPH_PHI: 1.618,
    OPH_CRV: 5.08,              // pi x phi, rounded
    OPH_HEP: 7.01
  };
  C.CONSTANT_NAMES = ["OPH_PI", "OPH_PHI", "OPH_CRV", "OPH_HEP"];

  // NOTE (kept from source): 21 and 76 sit inside the vortex tolerance of 21.7
  // and 76.2. They were removed, then restored "after discussion with Jason".
  // 1574 is out of order in the original list; order does not matter here.
  C.MSRF_NORMAL = [
    12, 21, 24, 36, 40, 42, 48, 49, 51, 52, 54, 56, 59, 60, 63, 66, 70, 71, 72, 74, 76, 77, 80, 88, 90,
    96, 98, 104, 105, 108, 110, 114, 116, 119, 120, 129, 133, 135, 138, 140, 144, 147, 154, 162, 168,
    180, 182, 196, 204, 207, 218, 222, 223, 226, 231, 234, 238, 253, 255, 259, 260, 264, 276, 279,
    280, 286, 288, 294, 297, 301, 308, 312, 315, 324, 330, 336, 343, 351, 354, 363, 364, 365, 372, 385,
    390, 394, 396, 405, 414, 433, 434, 441, 444, 447, 453, 459, 460, 463, 468, 476, 480, 490, 493, 495,
    509, 520, 525, 526, 531, 534, 539, 544, 552, 555, 558, 563, 565, 572, 573, 576, 582, 588, 591, 594,
    600, 618, 621, 640, 657, 660, 666, 670, 672, 674, 675, 679, 681, 686, 690, 691, 701, 702, 708, 720,
    726, 728, 730, 732, 735, 744, 765, 770, 774, 777, 789, 791, 792, 800, 801, 807, 810, 816, 819, 828,
    831, 846, 855, 861, 866, 868, 888, 918, 920, 930, 936, 952, 954, 960, 966, 972, 980, 990, 1000, 1019,
    1035, 1040, 1042, 1050, 1052, 1056, 1062, 1071, 1074, 1083, 1089, 1092, 1096, 1104, 1110, 1111, 1116,
    1130, 1147, 1152, 1155, 1176, 1177, 1184, 1188, 1190, 1200, 1242, 1253, 1279, 1292, 1300, 1302, 1315,
    1318, 1320, 1332, 1335, 1350, 1359, 1372, 1380, 1401, 1416, 1441, 1446, 1449, 1461, 1470, 1485, 1486,
    1488, 1513, 1518, 1530, 1534, 1554, 1557, 1559, 1560, 1577, 1585, 1620, 1641, 1574, 1680, 1683, 1701,
    1715, 1736, 1738, 1764, 1770, 1776, 1785, 1786, 1794, 1826, 1829, 1836, 1854, 1855, 1860, 1872, 1899,
    1904, 1905, 1920, 1932, 1944, 1960, 1972, 1998, 2046, 2047, 2080, 2100, 2103, 2112, 2124, 2133, 2142,
    2151, 2170, 2178, 2184, 2191, 2205, 2208, 2232, 2235, 2244, 2269, 2277, 2288, 2292, 2293, 2294, 2295,
    2304, 2310, 2322, 2333, 2346, 2352, 2376, 2380, 2388, 2400, 2401, 2415, 2418, 2430, 2447, 2478, 2483,
    2484, 2506, 2556, 2558, 2559
  ];
  C.MSRF_IMPORTANT = [
    84, 126, 132, 153, 176, 186, 189, 210, 216, 252, 270, 306, 360, 378, 420, 432, 504, 540, 567, 612, 630,
    648, 669, 693, 756, 780, 840, 864, 882, 945, 1008, 1080, 1134, 1224, 1260, 1296, 1344, 1404, 1428, 1440,
    1512, 1584, 1656, 1728, 1800, 1890, 1980, 2016, 2070, 2160, 2268, 2448, 2520
  ];
  C.MSRF_VORTEX = [21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2];

  C.MSRF_CLASS = {
    vortex:    { key: "vortex",    name: "Vortex",    points: C.POINTS_VORTEX,    mult: C.MULT_VORTEX },
    important: { key: "important", name: "Important", points: C.POINTS_IMPORTANT, mult: C.MULT_IMPORTANT },
    normal:    { key: "normal",    name: "Normal",    points: C.POINTS_NORMAL,    mult: C.MULT_NORMAL }
  };

  var NORMAL_SET = new Set(C.MSRF_NORMAL), IMPORTANT_SET = new Set(C.MSRF_IMPORTANT);

  /* ------------------------------------------------------------ numbers -- */
  function roundTo(value, precision) {
    var f = Math.pow(10, precision);
    return Math.round((value + Number.EPSILON) * f) / f;
  }
  var round1 = function (v) { return roundTo(v, 1); };   // axial rotations
  var round2 = function (v) { return roundTo(v, 2); };   // time, score

  /* The oph_* helpers an equation may call. oph_flip reverses the digits of
     the number's own string form and puts the decimal point back at the same
     index — so 123.4 flips to 432.1, and 1200 flips to 21. */
  var FUNCS = {
    oph_sqrt: Math.sqrt, oph_abs: Math.abs, oph_floor: Math.floor, oph_ceil: Math.ceil,
    oph_log: Math.log, oph_sin: Math.sin, oph_cos: Math.cos, oph_tan: Math.tan,
    oph_round: Math.round, oph_exp: Math.exp,
    oph_flip: function (value) {
      var s = String(value), dot = s.indexOf(".");
      var digits = s.replace(".", "").split("").reverse();
      if (dot > 0) digits.splice(dot, 0, ".");
      return Number(digits.join(""));
    }
  };
  C.FUNCTION_NAMES = ["oph_sqrt", "oph_abs", "oph_floor", "oph_ceil", "oph_log", "oph_sin", "oph_cos", "oph_tan", "oph_round", "oph_flip", "oph_exp"];

  /* -------------------------------------------------------------- MSRF -- */
  // A Z-value (already rounded to one decimal) matches:
  //   vortex    — within 0.1 of a vortex number (checked first);
  //   otherwise nothing if it ends in exactly .5 ("must trend to floor or ceiling");
  //   important — its rounded value is in the important set;
  //   normal    — its rounded value is in the normal set.
  function msrfMatch(z) {
    z = round1(z);
    for (var i = 0; i < C.MSRF_VORTEX.length; i++) {
      if (Math.abs(C.MSRF_VORTEX[i] - z) <= C.VORTEX_TOLERANCE) return { cls: C.MSRF_CLASS.vortex, number: C.MSRF_VORTEX[i] };
    }
    if (String(z).slice(-2) === ".5") return null;
    var r = Math.round(z);
    if (IMPORTANT_SET.has(r)) return { cls: C.MSRF_CLASS.important, number: r };
    if (NORMAL_SET.has(r)) return { cls: C.MSRF_CLASS.normal, number: r };
    return null;
  }

  /* -------------------------------------------------------- operations -- */
  function op(equation, weight, enabled) { return { equation: equation, weight: weight, enabled: enabled !== false }; }
  var A = C.POINTS_ALPHA, B = C.POINTS_BETA;

  // v12's sixteen, in order, with v8+ weights. (The v7 list had the radius
  // projection and the phi-6 beta as betas; v8 promoted both to alpha.)
  // NOTE: the source's newOperation() ignored its `enabled` argument, so the
  // X1 hepta "disabled by default" was always enabled. All sixteen are on.
  C.DEFAULT_OPERATIONS = [
    op("X2+oph_round(Y)", A),            // 2. Y + X2, the isometric date
    op("X2+oph_flip(oph_round(Y))", A),  // 3. Y reversed + X2 (holo)
    op("X2+Y/OPH_CRV", B),               // 4. Y / 5.08 + X2
    op("X1+(Y/2.0)xOPH_PI", B),          // 5. Y / 2 x 3.14 + X1
    op("X2+Y/OPH_PHI", A),               // 6. Y / 1.618 + X2
    op("X2+(Y/2.0)xOPH_PHI", A),         // 7. Y / 2 x 1.618 + X2
    op("X1+(Y/2.0)xOPH_CRV", B),         // 8. Y / 2 x 5.08 + X1
    op("X2+(Y/2.0)xOPH_PI", B),          // 9. Y / 2 x 3.14 + X2
    op("X2+YxOPH_PHI", A),               // 10. Y x 1.618 + X2
    op("X1+YxOPH_PI", A),                // 11. Y x 3.14 + X1, the radius projection
    op("X2+(Y/2.0)xOPH_CRV", B),         // 12. Y / 2 x 5.08 + X2
    op("X2+YxOPH_PI", B),                // 13. Y x 3.14 + X2
    op("X1+YxOPH_CRV", B),               // 14. Y x 5.08 + X1
    op("X2+YxOPH_CRV", B),               // 15. Y x 5.08 + X2
    op("X1+YxOPH_HEP", A),               // hepta-cycle, August 2025
    op("X2+YxOPH_HEP", A)                // hepta-cycle onto X2, December 2025
  ];

  // The "Extra Ophis Operations" list (ophis-xtras.txt), numbered 17-26.
  C.EXTRA_OPERATIONS = [
    op("X1+Yx2.718", B, false), op("X2+Yx2.718", B, false),
    op("X1+Yx1.38", B, false), op("X2+Yx1.38", B, false),
    op("X1+Yx5.52", B, false), op("X2+Yx5.52", B, false),
    op("X1+(Y/2.0)x5.52", B, false),
    op("X1+Yx2.178", B, false), op("X2+Yx2.178", B, false),
    op("X2+Yx0.360", B, false)
  ];

  C.cloneDefaultOperations = function () { return C.DEFAULT_OPERATIONS.map(function (o) { return op(o.equation, o.weight, o.enabled); }); };

  /* ----------------------------------------------- serialized fields -- */
  // The .oph keys for filters and chart layers, with their defaults. A key's
  // numeric companion, where there is one, is the key + "_value".
  function field(key, label, help, on, num) { return { key: key, valueKey: num == null ? null : key + "_value", label: label, help: help, on: on, num: num }; }
  C.FILTERS = [
    field("iso_event_filter_before_last_x_date", "Before the last X-Date", "Hide every projection that lands before the last enabled X-Date.", true),
    field("iso_event_filter_on_last_x_date", "On the last X-Date", "Hide any projection that lands on the last X-Date itself.", true),
    field("iso_event_filter_before_current_date", "Before today", "Hide projections already in the past (today is adjustable in Settings).", true),
    field("iso_event_filter_on_current_date", "On today", "Hide a projection that lands on today.", false),
    field("iso_event_filter_beyond_max_days", "Beyond N days", "Hide projections more than N days after the last X-Date.", true, C.HIGHEST_MSRF),
    field("iso_event_filter_min_hit_count", "Hits below N", "Hide projections with fewer than N hits.", false, 2),
    field("iso_event_filter_min_score", "Score below N", "Hide projections scoring under N.", false, 1),
    field("iso_event_filter_msrf_match", "No MSRF match", "Hide projections with no MSRF match.", false)
  ];
  C.CHART_LAYERS = [
    field("chart_option__show_chart", "Chart", "Show the timeline.", true),
    field("chart_option__show_dates", "Date labels", "Label X- and Z-Dates on the timeline.", true),
    field("chart_option__show_new_moons", "New moon", "New moons within a day of any X- or Z-Date.", false),
    field("chart_option__show_first_quarter_moons", "First quarter", "First quarters within a day of any X- or Z-Date.", false),
    field("chart_option__show_full_moons", "Full moon", "Full moons within a day of any X- or Z-Date.", false),
    field("chart_option__show_third_quarter_moons", "Third quarter", "Third quarters within a day of any X- or Z-Date.", false),
    field("chart_option__show_waxing_crescent_moons", "Waxing crescent", "Waxing crescents within a day of any X- or Z-Date.", false),
    field("chart_option__show_waning_crescent_moons", "Waning crescent", "Waning crescents within a day of any X- or Z-Date.", false),
    field("chart_option__show_waxing_gibbous_moons", "Waxing gibbous", "Waxing gibbous moons within a day of any X- or Z-Date.", false),
    field("chart_option__show_waning_gibbous_moons", "Waning gibbous", "Waning gibbous moons within a day of any X- or Z-Date.", false),
    field("chart_option__full_solar_eclipses", "Total solar eclipse", "Total, annular and hybrid solar eclipses within 1.25 days.", false),
    field("chart_option__partial_solar_eclipses", "Partial solar eclipse", "Partial solar eclipses within 1.25 days.", false),
    field("chart_option__full_lunar_eclipses", "Total lunar eclipse", "Total lunar eclipses within 1.25 days.", false),
    field("chart_option__partial_lunar_eclipses", "Partial lunar eclipse", "Partial lunar eclipses within 1.25 days.", false)
  ];
  C.ALL_FIELDS = C.FILTERS.concat(C.CHART_LAYERS);

  C.fieldOn = function (event, key) {
    for (var i = 0; i < C.ALL_FIELDS.length; i++) if (C.ALL_FIELDS[i].key === key) return event[key] === true;
    return false;
  };
  C.fieldValue = function (event, key) {
    for (var i = 0; i < C.ALL_FIELDS.length; i++) {
      var f = C.ALL_FIELDS[i];
      if (f.key === key) {
        var v = parseFloat(event[f.valueKey]);
        return Number.isFinite(v) && v >= 0 ? v : f.num;
      }
    }
    return -1;
  };

  NC.C = C;
  NC.roundTo = roundTo; NC.round1 = round1; NC.round2 = round2;
  NC.FUNCS = FUNCS;
  NC.msrfMatch = msrfMatch;
  NC.op = op;
})(typeof window !== "undefined" ? window : globalThis);
