/* ==========================================================================
   ophis.constants.js — immutable configuration, ported 1:1 from the desktop app
   --------------------------------------------------------------------------
   Source of truth: src/ophis_config.js and src/ophis_model__params.js of the
   Ophis v12 Electron renderer (extracted from the shipped .exe, see METHOD.md).

   Every number in this file is a straight port. If a value here and a value in
   src/ disagree, src/ wins and this file is the bug.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = {};

  /* --- identity ------------------------------------------------------- */
  C.APP_VERSION = "12.0";           // ophis_config.js:1 — what we write into .oph
  C.WEB_BUILD = "web-1.0";

  /* --- hard limits ---------------------------------------------------- */
  C.MINIMUM_NUMBER_OF_X_DATES = 2;
  C.MINIMUM_OPERATIONS_REQUIRED = 1;
  C.MAXIMUM_ROTATION_COUNT_Y = 36500;   // ~100 years
  C.MAXIMUM_ROTATION_COUNT_Z = 36500;
  C.MINIMUM_DAYS_BETWEEN_FIRST_TWO_X_DATES = 1;
  C.MINIMUM_DAYS_BETWEEN_SUBSEQUENT_X_DATES = 1;
  C.MAX_CALENDAR_YEAR = 9999;
  C.LAT_LIMIT = 65;                     // sunset libraries misbehave past this
  C.LONG_LIMIT = 180;
  C.DEFAULT_HEIGHT_IN_METERS_FOR_SUN_CALC = 2;

  /* --- time ----------------------------------------------------------- */
  C.MILLIS_PER_MINUTE = 1000 * 60;
  C.MILLIS_PER_HOUR = C.MILLIS_PER_MINUTE * 60;
  C.MILLIS_PER_DAY = C.MILLIS_PER_HOUR * 24;
  C.SYNODIC_MONTH = 29.53058770576;
  C.INTRA_MOON_PHASE_DELTA = 1.0 / 8.0;
  C.LUNAR_DATE_MATCH_TOLERANCE_IN_DAYS = 1;
  C.ECLIPSE_DATE_MATCH_TOLERANCE_IN_DAYS = 1.25;
  C.LUNAR_DATE_MATCH_TOLERANCE = C.MILLIS_PER_DAY * C.LUNAR_DATE_MATCH_TOLERANCE_IN_DAYS;
  C.ECLIPSE_DATE_MATCH_TOLERANCE = C.MILLIS_PER_DAY * C.ECLIPSE_DATE_MATCH_TOLERANCE_IN_DAYS;
  C.ALREADY_CALCULATED_SUNSET_TOLERANCE_IN_MILLIS = C.MILLIS_PER_HOUR;

  /* --- precision ------------------------------------------------------ */
  C.DECIMAL_PRECISION__TIME = 2;          // Z-values
  C.DECIMAL_PRECISION__LOCATION = 1;
  C.DECIMAL_PRECISION__AXIAL_ROTATIONS = 1;  // Y and Z day counts
  C.DECIMAL_PRECISION__SCORE = 2;

  /* --- the four constants --------------------------------------------
     The app deliberately uses the *spoken* precision rather than the true
     mathematical value (ophis_config.js, FEATURE_FLAG__USE_EXPECTED_CONSTANTS_
     PRECISION): pi is quoted as 3.14, phi as 1.618, curvature as pi*phi to two
     places. Changing these changes every projection, so they are frozen here. */
  C.OPH_PI = 3.14;
  C.OPH_PHI = 1.618;
  C.OPH_CRV = 5.08;     // "curvature" = pi * phi, to 2dp
  C.OPH_HEP = 7.01;     // hepta-cycle constant added in v12
  C.ALL_OPH_CONSTANTS = ["OPH_PI", "OPH_PHI", "OPH_CRV", "OPH_HEP"];
  C.CONSTANT_VALUES = {
    OPH_PI: C.OPH_PI, OPH_PHI: C.OPH_PHI, OPH_CRV: C.OPH_CRV, OPH_HEP: C.OPH_HEP
  };

  C.SAMPLE_Y_VALUE_FOR_VALIDATION = 10;

  /* --- scopes / types / modes ----------------------------------------- */
  C.EVENT_SCOPE__HH_MM = "EVENT_SCOPE__HH_MM";
  C.EVENT_SCOPE__DAYS = "EVENT_SCOPE__DAYS";
  C.EVENT_SCOPE__MONTHS = "EVENT_SCOPE__MONTHS";
  C.EVENT_SCOPE__YEARS = "EVENT_SCOPE__YEARS";
  C.EVENT_SCOPES = [C.EVENT_SCOPE__HH_MM, C.EVENT_SCOPE__DAYS, C.EVENT_SCOPE__MONTHS, C.EVENT_SCOPE__YEARS];
  C.DEFAULT_EVENT_SCOPE = C.EVENT_SCOPE__DAYS;
  C.DEFAULT_DAY_SCOPE_START_TIME_MILLIS = 0;

  C.EVENT_TYPE__PERSONAL = "EVENT_TYPE__PERSONAL";
  C.EVENT_TYPE__MARKETS = "EVENT_TYPE__MARKETS";
  C.EVENT_TYPES = [C.EVENT_TYPE__PERSONAL, C.EVENT_TYPE__MARKETS];
  C.DEFAULT_EVENT_TYPE = C.EVENT_TYPE__PERSONAL;

  C.SCORING_SYSTEM__LTE_V7 = "SCORING_SYSTEM__LTE_V7";
  C.SCORING_SYSTEM__GTE_V8 = "SCORING_SYSTEM__GTE_V8";
  C.SCORING_SYSTEMS = [C.SCORING_SYSTEM__LTE_V7, C.SCORING_SYSTEM__GTE_V8];
  C.DEFAULT_SCORING_SYSTEM = C.SCORING_SYSTEM__GTE_V8;

  /* File-input strictness. v12's GUI default is LOOSE; this rewrite defaults to
     ORIGINAL because LOOSE is what let a hostile .oph through in the study. */
  C.FILE_INPUT_VALIDATION_MODE__STRICT = "FILE_INPUT_VALIDATION_MODE__STRICT";
  C.FILE_INPUT_VALIDATION_MODE__ORIGINAL = "FILE_INPUT_VALIDATION_MODE__ORIGINAL";
  C.FILE_INPUT_VALIDATION_MODE__LOOSE = "FILE_INPUT_VALIDATION_MODE__LOOSE";
  C.FILE_INPUT_VALIDATION_MODES = [
    C.FILE_INPUT_VALIDATION_MODE__STRICT,
    C.FILE_INPUT_VALIDATION_MODE__ORIGINAL,
    C.FILE_INPUT_VALIDATION_MODE__LOOSE
  ];
  C.DEFAULT_FILE_INPUT_VALIDATION_MODE = C.FILE_INPUT_VALIDATION_MODE__ORIGINAL;

  /* --- sorting -------------------------------------------------------- */
  C.Z_DATE_SORT_TYPE__SCORE = "SORT_TYPE__SCORE";
  C.Z_DATE_SORT_TYPE__DATE = "SORT_TYPE__DATE";
  C.Z_DATE_SORT_TYPE__MSRF = "SORT_TYPE__MSRF";
  C.Z_DATE_SORT_TYPE__HIT_COUNT = "SORT_TYPE__HIT_COUNT";
  C.Z_DATE_SORT_TYPE__OPERATIONS = "SORT_TYPE__OPERATIONS";
  C.Z_DATES_SORT_TYPES = [
    C.Z_DATE_SORT_TYPE__SCORE, C.Z_DATE_SORT_TYPE__DATE, C.Z_DATE_SORT_TYPE__MSRF,
    C.Z_DATE_SORT_TYPE__HIT_COUNT, C.Z_DATE_SORT_TYPE__OPERATIONS
  ];
  C.DEFAULT_Z_DATE_SORT_TYPE = C.Z_DATE_SORT_TYPE__DATE;
  C.SORT_ORDER__ASCENDING = "SORT_ORDER__ASCENDING";
  C.SORT_ORDER__DESCENDING = "SORT_ORDER__DESCENDING";

  /* --- anchors -------------------------------------------------------- */
  C.STARTING_X1 = "STARTING_X1";
  C.STARTING_X2 = "STARTING_X2";

  /* --- serialization field names (the .oph wire format) ---------------- */
  C.SERIALIZED_FIELD__ISO_EVENTS = "iso_events";
  C.SERIALIZED_FIELD__APP_VERSION = "app_version";
  C.SERIALIZED_FIELD__GLOBAL_OPTIONS = "global_options";

  /* Output filters, in UI order. `key` is the .oph boolean field, `valueKey`
     the companion number field. Defaults match ophis_config.js exactly. */
  C.FILTERS = [
    { id: "F1", key: "iso_event_filter_before_last_x_date", label: "before last X-Date",
      help: "Hide all output before the last X-Date.", def: true },
    { id: "F2", key: "iso_event_filter_on_last_x_date", label: "on last X-Date",
      help: "Hide any output that falls on the last X-Date.", def: true },
    { id: "F3", key: "iso_event_filter_before_current_date", label: "before current date",
      help: "Hide any output before the current date (adjustable above).", def: true },
    { id: "F4", key: "iso_event_filter_on_current_date", label: "on current date",
      help: "Hide any output on the current date (adjustable above).", def: false },
    { id: "F5", key: "iso_event_filter_beyond_max_days", label: "beyond {n} days",
      help: "Hide output more than this many days after the last X-Date.",
      def: true, valueKey: "iso_event_filter_beyond_max_days_value", valueDef: 2559 },
    { id: "F6", key: "iso_event_filter_min_hit_count", label: "Hits are below {n}",
      help: "Hide output with fewer Hits than this.",
      def: false, valueKey: "iso_event_filter_min_hit_count_value", valueDef: 2 },
    { id: "F7", key: "iso_event_filter_min_score", label: "Score is below {n}",
      help: "Hide output scoring lower than this.",
      def: false, valueKey: "iso_event_filter_min_score_value", valueDef: 1 },
    { id: "F8", key: "iso_event_filter_msrf_match", label: "no MSRF matches",
      help: "Hide output with no MSRF match at all.", def: false }
  ];

  /* Chart overlays, in UI order. Same .oph field names as the desktop app. */
  C.CHART_OPTIONS = [
    { key: "chart_option__show_chart", label: "Chart", def: true, kind: "chart" },
    { key: "chart_option__show_dates", label: "Dates", def: true, kind: "chart" },
    { key: "chart_option__show_new_moons", label: "New", def: false, kind: "moon", phase: "NEW" },
    { key: "chart_option__show_waxing_crescent_moons", label: "Wax Crscnt", def: false, kind: "moon", phase: "WAXING_CRESCENT" },
    { key: "chart_option__show_first_quarter_moons", label: "1st Qtr", def: false, kind: "moon", phase: "FIRST_QUARTER" },
    { key: "chart_option__show_waxing_gibbous_moons", label: "Wax Gibb", def: false, kind: "moon", phase: "WAXING_GIBBOUS" },
    { key: "chart_option__show_full_moons", label: "Full", def: false, kind: "moon", phase: "FULL" },
    { key: "chart_option__show_waning_gibbous_moons", label: "Wan Gibb", def: false, kind: "moon", phase: "WANING_GIBBOUS" },
    { key: "chart_option__show_third_quarter_moons", label: "3rd Qtr", def: false, kind: "moon", phase: "LAST_QUARTER" },
    { key: "chart_option__show_waning_crescent_moons", label: "Wan Crscnt", def: false, kind: "moon", phase: "WANING_CRESCENT" },
    { key: "chart_option__full_solar_eclipses", label: "Full Solar", def: false, kind: "eclipse", eclipse: "SOLAR_FULL" },
    { key: "chart_option__partial_solar_eclipses", label: "Partial Solar", def: false, kind: "eclipse", eclipse: "SOLAR_PARTIAL" },
    { key: "chart_option__full_lunar_eclipses", label: "Full Lunar", def: false, kind: "eclipse", eclipse: "LUNAR_FULL" },
    { key: "chart_option__partial_lunar_eclipses", label: "Partial Lunar", def: false, kind: "eclipse", eclipse: "LUNAR_PARTIAL" }
  ];

  /* ======================================================================
     MSRF — "Master Sequence Resonance Filter" number sets.
     Ported verbatim from src/ophis_model__params.js. A Z-Date whose day-count
     from its anchor X-Date lands on one of these numbers is a "hit".
     ====================================================================== */
  C.HIGHEST_MSRF_NUMBER = 2559;

  C.MSRF_FILTER__NORMAL = [
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

  C.MSRF_FILTER__IMPORTANT = [
    84, 126, 132, 153, 176, 186, 189, 210, 216, 252, 270, 306, 360, 378, 420, 432, 504, 540, 567, 612, 630,
    648, 669, 693, 756, 780, 840, 864, 882, 945, 1008, 1080, 1134, 1224, 1260, 1296, 1344, 1404, 1428, 1440,
    1512, 1584, 1656, 1728, 1800, 1890, 1980, 2016, 2070, 2160, 2268, 2448, 2520
  ];

  C.MSRF_FILTER__VORTEX = [
    21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2
  ];

  C.VORTEX_FILTER_MATCH_TOLERANCE = 0.1;

  /* --- points and multipliers ----------------------------------------- */
  C.POINTS__ALPHA_OPERATION_MATCH = 1;
  C.POINTS__BETA_OPERATION_MATCH = 0.5;
  C.POINTS__IMPORTANT_MSRF_MATCH = 2;
  C.POINTS__NORMAL_MSRF_MATCH = 1;
  C.POINTS__VORTEX_MSRF_MATCH = C.POINTS__IMPORTANT_MSRF_MATCH;

  C.SCORE_MULTIPLIER__NORMAL_MSRF_MATCH = 1.5;
  C.SCORE_MULTIPLIER__IMPORTANT_MSRF_MATCH = 2.0;
  C.SCORE_MULTIPLIER__VORTEX_MSRF_MATCH = 2.0;

  C.MSRF_KIND__NORMAL = "NORMAL";
  C.MSRF_KIND__IMPORTANT = "IMPORTANT";
  C.MSRF_KIND__VORTEX = "VORTEX";

  /* ======================================================================
     Default operation table (v12 = "GTE 10" set: 16 operations).
     Order matters — operation ordinals O1..O16 are what the UI labels and what
     .oph files reference by position.
     ====================================================================== */
  var A = C.POINTS__ALPHA_OPERATION_MATCH;
  var B = C.POINTS__BETA_OPERATION_MATCH;

  C.DEFAULT_OPERATIONS = [
    { equation: "X2+oph_round(Y)", weight: A, note: "Y + X2 — the isometric date itself" },
    { equation: "X2+oph_flip(oph_round(Y))", weight: A, note: "Y reversed + X2 (holo-)" },
    { equation: "X2+Y/OPH_CRV", weight: B, note: "Y / 5.08 + X2" },
    { equation: "X1+(Y/2.0)xOPH_PI", weight: B, note: "Y / 2 x 3.14 + X1" },
    { equation: "X2+Y/OPH_PHI", weight: A, note: "Y / 1.618 + X2" },
    { equation: "X2+(Y/2.0)xOPH_PHI", weight: A, note: "Y / 2 x 1.618 + X2" },
    { equation: "X1+(Y/2.0)xOPH_CRV", weight: B, note: "Y / 2 x 5.08 + X1" },
    { equation: "X2+(Y/2.0)xOPH_PI", weight: B, note: "Y / 2 x 3.14 + X2" },
    { equation: "X2+YxOPH_PHI", weight: A, note: "Y x 1.618 + X2" },
    { equation: "X1+YxOPH_PI", weight: A, note: "Y x 3.14 + X1 (radius projection)" },
    { equation: "X2+(Y/2.0)xOPH_CRV", weight: B, note: "Y / 2 x 5.08 + X2" },
    { equation: "X2+YxOPH_PI", weight: B, note: "Y x 3.14 + X2" },
    { equation: "X1+YxOPH_CRV", weight: B, note: "Y x 5.08 + X1" },
    { equation: "X2+YxOPH_CRV", weight: B, note: "Y x 5.08 + X2" },
    { equation: "X1+YxOPH_HEP", weight: A, note: "Y x 7.01 + X1 (hepta-cycle)" },
    { equation: "X2+YxOPH_HEP", weight: A, note: "Y x 7.01 + X2 (hepta-cycle)" }
  ];

  C.defaultOperations = function () {
    return C.DEFAULT_OPERATIONS.map(function (op) {
      return { equation: op.equation, weight: op.weight, enabled: true };
    });
  };

  /* --- display -------------------------------------------------------- */
  C.DATE_DELIMITER = "/";
  C.X_DATE_DISPLAY_FORMAT = "mm/dd/yyyy";
  C.X_DATE_TIME_DISPLAY_FORMAT = "HH:MM";
  C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE = "00:00";

  C.NO_RESULTS_MESSAGE = "No Z-Dates to show. The filters may be too tight.";

  root.Ophis = root.Ophis || {};
  root.Ophis.C = C;
})(typeof window !== "undefined" ? window : globalThis);
