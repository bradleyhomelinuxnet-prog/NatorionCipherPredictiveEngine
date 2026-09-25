/* ==========================================================================
   ophis.engine.js — the projection engine
   --------------------------------------------------------------------------
   Port of src/ophis_model__operations.js, src/ophis_model__sorting.js and the
   MSRF matcher in src/ophis_utils.js. No DOM, no globals beyond Ophis.* — the
   whole thing is a pure function of one event object, so web/tests can drive
   it directly.

   The pipeline, end to end:

     X-Dates  ──▶  every ordered pair (X_a, X_b), a<b
                     └─▶ Y = whole days between them
     Y        ──▶  each enabled Operation: Z-Value = f(Y)
     Z-Value  ──▶  anchor X-Date + Z-Value days = a Z-Date
     Z-Dates  ──▶  collapsed by day; each collapsed day collects
                     · one Operation hit per formula that landed on it
                     · one MSRF hit per Z-Value that matched a resonance number
     hits     ──▶  Score  =  (sum of Operation weights + MSRF points) × MSRF multiplier
     scored   ──▶  filters, then sort
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Expr = root.Ophis.Expr;
  var Engine = {};

  /* ====================================================================== */
  /* MSRF matching                                                          */
  /* ====================================================================== */

  function msrfMatchStruct(kind, number) {
    var points = 0;
    if (kind === C.MSRF_KIND__NORMAL) points = C.POINTS__NORMAL_MSRF_MATCH;
    else if (kind === C.MSRF_KIND__IMPORTANT) points = C.POINTS__IMPORTANT_MSRF_MATCH;
    else if (kind === C.MSRF_KIND__VORTEX) points = C.POINTS__VORTEX_MSRF_MATCH;
    return {
      kind: kind,
      msrf_number: number,
      points: points,
      css_class: "msrf-" + kind.toLowerCase(),
      readable_name: kind.charAt(0) + kind.slice(1).toLowerCase()
    };
  }

  /**
   * Does this day-count land on a resonance number?
   * Port of getMsrfMatch(). Order matters: vortex numbers match within a
   * tolerance of 0.1; a count sitting exactly on a half day ("x.5") is
   * deliberately no match at all — it has to lean towards a whole number.
   */
  Engine.msrfMatch = function (rotationCount) {
    var count = T.roundRotation(rotationCount);

    for (var v = 0; v < C.MSRF_FILTER__VORTEX.length; v++) {
      var vortexNumber = C.MSRF_FILTER__VORTEX[v];
      if (Math.abs(vortexNumber - count) <= C.VORTEX_FILTER_MATCH_TOLERANCE) {
        return msrfMatchStruct(C.MSRF_KIND__VORTEX, vortexNumber);
      }
    }

    if (("" + count).slice(-2) === ".5") return null;

    var whole = Math.round(count);
    if (C.MSRF_FILTER__IMPORTANT.indexOf(whole) >= 0) {
      return msrfMatchStruct(C.MSRF_KIND__IMPORTANT, whole);
    }
    if (C.MSRF_FILTER__NORMAL.indexOf(whole) >= 0) {
      return msrfMatchStruct(C.MSRF_KIND__NORMAL, whole);
    }
    return null;
  };

  Engine.msrfMultiplierForKind = function (kind) {
    if (kind === C.MSRF_KIND__NORMAL) return C.SCORE_MULTIPLIER__NORMAL_MSRF_MATCH;
    if (kind === C.MSRF_KIND__IMPORTANT) return C.SCORE_MULTIPLIER__IMPORTANT_MSRF_MATCH;
    if (kind === C.MSRF_KIND__VORTEX) return C.SCORE_MULTIPLIER__VORTEX_MSRF_MATCH;
    return 1.0;
  };

  Engine.msrfMultiplier = function (msrfMatches) {
    var best = 1.0;
    for (var i = 0; i < msrfMatches.length; i++) {
      var m = Engine.msrfMultiplierForKind(msrfMatches[i].kind);
      if (m > best) best = m;
    }
    return best;
  };

  /* The MSRF points that count towards the *base* score. Under the v8+ system
     the single strongest match becomes the multiplier instead of adding its
     points, so it is skipped here. Port of sumUpMsrfMatchSubscore(). */
  Engine.msrfSubscore = function (msrfMatches, scoringSystem) {
    var overall = Engine.msrfMultiplier(msrfMatches);
    var total = 0;
    var consumedMultiplier = false;
    for (var i = 0; i < msrfMatches.length; i++) {
      var match = msrfMatches[i];
      var mult = Engine.msrfMultiplierForKind(match.kind);
      if (!consumedMultiplier && mult === overall && scoringSystem === C.SCORING_SYSTEM__GTE_V8) {
        consumedMultiplier = true;
      } else {
        total += match.points;
      }
    }
    return total;
  };

  function sumMsrfNumbers(msrfMatches) {
    var total = 0;
    for (var i = 0; i < msrfMatches.length; i++) total += msrfMatches[i].msrf_number;
    return total;
  }

  Engine.isAlpha = function (operation) { return operation.weight >= C.POINTS__ALPHA_OPERATION_MATCH; };

  /* ====================================================================== */
  /* Event normalisation                                                    */
  /* ====================================================================== */

  Engine.scoringSystem = function (isoEvent) {
    return C.SCORING_SYSTEMS.indexOf(isoEvent.scoring_system) >= 0
      ? isoEvent.scoring_system
      : C.SCORING_SYSTEM__GTE_V8;
  };

  Engine.enabledXDateCount = function (isoEvent) {
    var count = 0;
    (isoEvent.x_dates || []).forEach(function (x) { if (x.enabled === true) count++; });
    return count;
  };

  /**
   * Compile every operation once per run. An operation that fails to compile
   * stays in the list (so its ordinal never shifts and the UI can show why),
   * it simply contributes nothing.
   */
  Engine.effectiveOperations = function (isoEvent) {
    var source = isoEvent.operations || [];
    return source.map(function (op, index) {
      var effective = { equation: op.equation, weight: op.weight, enabled: op.enabled === true, ordinal: index, errors: [], fn: null };
      if (!effective.enabled) return effective;
      var compiled = Expr.validateInList(op.equation, index, source);
      effective.errors = compiled.errors;
      effective.anchor = compiled.anchor;
      if (compiled.ok) effective.fn = compiled.run;
      return effective;
    });
  };

  /* Port of validateXDateSpread(): X-Dates must run forward in time and be at
     least a day apart. */
  Engine.validateXDateSpread = function (isoEvent, errorsOut) {
    var xDates = isoEvent.x_dates || [];
    var foundError = false;

    for (var i = 1; i < xDates.length; i++) {
      if (xDates[i].enabled !== true) continue;

      var previousIndex = -1;
      for (var k = i - 1; k >= 0; k--) {
        if (xDates[k].enabled === true) { previousIndex = k; break; }
      }
      if (previousIndex < 0) continue;

      var laterInstant = T.xDateToInstant(isoEvent.scope, xDates[i], isoEvent.lat, isoEvent.long, []);
      var earlierInstant = T.xDateToInstant(isoEvent.scope, xDates[previousIndex], isoEvent.lat, isoEvent.long, []);

      if (!laterInstant || !earlierInstant) {
        foundError = true;
        errorsOut.push("Could not read X" + (i + 1) + " or X" + (previousIndex + 1) + ".");
        continue;
      }

      var minimumDays = (i === 1)
        ? C.MINIMUM_DAYS_BETWEEN_FIRST_TWO_X_DATES
        : C.MINIMUM_DAYS_BETWEEN_SUBSEQUENT_X_DATES;

      var rotations = T.axialRotationsBetween(isoEvent.scope, earlierInstant, laterInstant, isoEvent.lat, isoEvent.long);
      var x1Name = "X" + (previousIndex + 1);
      var x2Name = "X" + (i + 1);

      if (rotations < 0) {
        foundError = true;
        errorsOut.push(x2Name + " must be later than " + x1Name + ".");
      } else if (rotations === 0) {
        foundError = true;
        errorsOut.push(x1Name + " and " + x2Name + " must be different days" +
          (isoEvent.scope === C.EVENT_SCOPE__HH_MM ? ", or either side of a sunset." : "."));
      } else if (rotations < minimumDays) {
        foundError = true;
        errorsOut.push(x2Name + " must be at least " + minimumDays + " day" + (minimumDays === 1 ? "" : "s") +
          " after " + x1Name + ", found " + rotations + ".");
      }
    }

    if (!foundError) errorsOut.length = 0;
    return !foundError;
  };

  /* ====================================================================== */
  /* Y and Z generation                                                     */
  /* ====================================================================== */

  function runOperations(operations, isoEvent, x1Instant, x2Instant, rotationCountY, alreadyCalculatedSunsets) {
    var results = [];
    var scope = isoEvent.scope;
    var lat = isoEvent.lat;
    var long = isoEvent.long;

    if (rotationCountY > C.MAXIMUM_ROTATION_COUNT_Y) rotationCountY = C.MAXIMUM_ROTATION_COUNT_Y;

    var dayScopeStartMillis = Number(isoEvent.day_scope_start_time_in_millis) || 0;

    for (var i = 0; i < operations.length; i++) {
      var operation = operations[i];
      if (!operation.enabled || !operation.fn) continue;

      var zValueRaw = operation.fn(rotationCountY);
      if (!isFinite(zValueRaw) || isNaN(zValueRaw)) continue;
      if (zValueRaw > C.MAXIMUM_ROTATION_COUNT_Z) zValueRaw = C.MAXIMUM_ROTATION_COUNT_Z;

      // Millis are taken from the *unrounded* value, then the value itself is
      // rounded for display — the desktop app is deliberate about this order.
      var zValueMillis = zValueRaw * C.MILLIS_PER_DAY;
      var zValue = T.roundTime(zValueRaw);

      var anchorIsX1 = operation.anchor === C.STARTING_X1;
      var anchorInstant = anchorIsX1 ? x1Instant : x2Instant;
      var otherInstant = anchorIsX1 ? x2Instant : x1Instant;

      var addTo = anchorInstant.getTime();
      if (scope === C.EVENT_SCOPE__DAYS && dayScopeStartMillis > 0) addTo += dayScopeStartMillis;

      var zInstant = new Date(addTo + zValueMillis);

      var zStart, zEnd;
      if (scope === C.EVENT_SCOPE__HH_MM) {
        var before = T.sunsetBefore(zInstant, lat, long);
        var after = T.sunsetAfter(zInstant, lat, long);
        zStart = before ? T.reuseNearbySunset(before, alreadyCalculatedSunsets) : T.floorToUtcMidnight(zInstant);
        zEnd = after ? T.reuseNearbySunset(after, alreadyCalculatedSunsets) : zStart;
      } else {
        // Day scope is locked to GMT: the Z-Date is the UTC calendar day it lands in.
        zStart = T.floorToUtcMidnight(zInstant);
        zEnd = zStart;
      }

      var readableStart, readableEnd;
      if (scope === C.EVENT_SCOPE__HH_MM) {
        readableStart = T.formatDateAndTime(zStart, lat, long);
        readableEnd = T.formatDateAndTime(zEnd, lat, long);
      } else {
        readableStart = T.formatUtcDateOnly(zStart);
        readableEnd = readableStart;
      }

      results.push({
        z_value: zValue,
        rotation_count_y: rotationCountY,
        rotation_count_z: T.roundRotation(zValue),
        z_instant: zInstant,
        z_start: zStart,
        z_end: zEnd,
        z_readable_start: readableStart,
        z_readable_end: readableEnd,
        anchor_instant: new Date(addTo),
        other_instant: otherInstant,
        operation_ordinal: operation.ordinal,
        operation: operation,
        z_key: "" + zStart.getTime(),
        hash: operation.ordinal + "|" + x1Instant.getTime() + "|" + x2Instant.getTime() + "|" + zStart.getTime()
      });
    }

    return results;
  }

  function tagZDates(yStruct, operationResults, zStructs) {
    for (var i = 0; i < operationResults.length; i++) {
      var result = operationResults[i];
      var key = result.z_key;

      var zStruct = zStructs[key];
      if (!zStruct) {
        zStruct = {
          key: key,
          z_start: result.z_start,
          z_end: result.z_end,
          z_readable_start: result.z_readable_start,
          z_readable_end: result.z_readable_end,
          operation_match_structs: [],
          msrf_match_structs: [],
          score: 0,
          hit_count: 0
        };
        zStructs[key] = zStruct;
      }

      zStruct.operation_match_structs.push({ y_struct: yStruct, operation_result: result, points: 0 });

      var msrf = Engine.msrfMatch(result.rotation_count_z);
      if (msrf) {
        msrf.y_struct = yStruct;
        msrf.operation_result = result;
        zStruct.msrf_match_structs.push(msrf);
      }
    }
  }

  function generateYAndZStructs(isoEvent, operations, yStructsOut, zStructsOut) {
    var xDates = isoEvent.x_dates || [];
    var alreadyCalculatedSunsets = [];

    for (var i = 1; i < xDates.length; i++) {
      var laterXDate = xDates[i];
      if (laterXDate.enabled !== true) continue;
      var laterInstant = T.xDateToInstant(isoEvent.scope, laterXDate, isoEvent.lat, isoEvent.long, []);
      if (!laterInstant) continue;

      for (var k = 0; k < i; k++) {
        var earlierXDate = xDates[k];
        if (earlierXDate.enabled !== true) continue;
        var earlierInstant = T.xDateToInstant(isoEvent.scope, earlierXDate, isoEvent.lat, isoEvent.long, []);
        if (!earlierInstant) continue;

        var rotationCountY = T.axialRotationsBetween(isoEvent.scope, earlierInstant, laterInstant, isoEvent.lat, isoEvent.long);

        var operationResults = runOperations(operations, isoEvent, earlierInstant, laterInstant, rotationCountY, alreadyCalculatedSunsets);

        var yStruct = {
          y_ordinal: yStructsOut.length,
          rotation_count_y: rotationCountY,
          x_1_ordinal: k,
          x_2_ordinal: i,
          x_1_instant: earlierInstant,
          x_2_instant: laterInstant,
          operation_results: operationResults
        };

        tagZDates(yStruct, operationResults, zStructsOut);
        yStructsOut.push(yStruct);
      }
    }
  }

  /* ====================================================================== */
  /* Scoring                                                                */
  /* ====================================================================== */

  function sortMsrfMatches(msrfMatches) {
    msrfMatches.sort(function (a, b) {
      var ma = Engine.msrfMultiplierForKind(a.kind);
      var mb = Engine.msrfMultiplierForKind(b.kind);
      if (ma > mb) return -1;
      if (ma < mb) return 1;
      return a.operation_result.rotation_count_z >= b.operation_result.rotation_count_z ? -1 : 1;
    });
  }

  function sortOperationMatches(operationMatches) {
    operationMatches.sort(function (a, b) {
      var opA = a.operation_result;
      var opB = b.operation_result;
      if (opA.operation.weight > opB.operation.weight) return -1;
      if (opA.operation.weight < opB.operation.weight) return 1;
      if (opA.operation_ordinal !== opB.operation_ordinal) {
        return opA.operation_ordinal > opB.operation_ordinal ? 1 : -1;
      }
      if (a.y_struct.x_1_ordinal !== b.y_struct.x_1_ordinal) {
        return a.y_struct.x_1_ordinal > b.y_struct.x_1_ordinal ? 1 : -1;
      }
      return a.y_struct.x_2_ordinal > b.y_struct.x_2_ordinal ? 1 : -1;
    });
  }

  function scoreZDates(operations, scoringSystem, zStructs) {
    Object.keys(zStructs).forEach(function (key) {
      var zStruct = zStructs[key];

      sortOperationMatches(zStruct.operation_match_structs);
      sortMsrfMatches(zStruct.msrf_match_structs);

      var operationScore = 0;
      zStruct.operation_match_structs.forEach(function (match) {
        var operation = operations[match.operation_result.operation_ordinal];
        var weight = operation ? operation.weight : 0;
        match.points = weight;
        operationScore += weight;
      });

      var msrfScore = Engine.msrfSubscore(zStruct.msrf_match_structs, scoringSystem);

      var baseScore = operationScore + msrfScore;
      var finalScore = baseScore;
      var multiplier = 1.0;

      if (scoringSystem === C.SCORING_SYSTEM__GTE_V8) {
        multiplier = Engine.msrfMultiplier(zStruct.msrf_match_structs);
        finalScore = baseScore * multiplier;
      }

      zStruct.operation_score = operationScore;
      zStruct.operation_hit_count = zStruct.operation_match_structs.length;
      zStruct.msrf_hit_count = zStruct.msrf_match_structs.length;
      zStruct.base_score_pre_multiply = baseScore;
      zStruct.score_multiplier = multiplier;
      zStruct.score = T.roundScore(finalScore);
      zStruct.hit_count = zStruct.operation_hit_count + zStruct.msrf_hit_count;
    });
  }

  /* ====================================================================== */
  /* Filtering                                                              */
  /* ====================================================================== */

  Engine.filterValue = function (isoEvent, filter) {
    var raw = isoEvent[filter.valueKey];
    var parsed = parseFloat(raw);
    return (isNaN(parsed) || parsed < 0) ? filter.valueDef : parsed;
  };

  function filterEnabled(isoEvent, key) {
    var filter = null;
    for (var i = 0; i < C.FILTERS.length; i++) if (C.FILTERS[i].key === key) filter = C.FILTERS[i];
    if (!filter) return false;
    var value = isoEvent[key];
    return (value === true || value === false) ? value : filter.def;
  }
  Engine.filterEnabled = filterEnabled;

  function filterZDates(isoEvent, zStructs, nowInstant) {
    var kept = [];
    var xDates = isoEvent.x_dates || [];
    var isHHMM = isoEvent.scope === C.EVENT_SCOPE__HH_MM;

    var lastXDate = null;
    for (var i = xDates.length - 1; i >= 0; i--) {
      if (xDates[i].enabled === true) { lastXDate = xDates[i]; break; }
    }
    if (!lastXDate) return kept;

    var lastXInstant = T.xDateToInstant(isoEvent.scope, lastXDate, isoEvent.lat, isoEvent.long, []);
    if (!lastXInstant) return kept;
    var lastXMillis = lastXInstant.getTime();

    // "Now" is compared on the same footing as the Z-Dates: for day scope that
    // means the UTC day it falls in.
    var nowMillis = 0;
    if (nowInstant) {
      nowMillis = isHHMM ? nowInstant.getTime() : T.floorToUtcMidnight(nowInstant).getTime();
    }

    var tDateMillis = [];
    (isoEvent.t_dates || []).forEach(function (tDate) {
      if (tDate.enabled !== true) return;
      var instant = T.xDateToInstant(isoEvent.scope, tDate, isoEvent.lat, isoEvent.long, []);
      if (instant) tDateMillis.push(instant.getTime());
    });

    var beyondMaxDays = null;
    var minHitCount = null;
    var minScore = null;
    C.FILTERS.forEach(function (f) {
      if (f.key === "iso_event_filter_beyond_max_days" && filterEnabled(isoEvent, f.key)) beyondMaxDays = Engine.filterValue(isoEvent, f);
      if (f.key === "iso_event_filter_min_hit_count" && filterEnabled(isoEvent, f.key)) minHitCount = Engine.filterValue(isoEvent, f);
      if (f.key === "iso_event_filter_min_score" && filterEnabled(isoEvent, f.key)) minScore = Engine.filterValue(isoEvent, f);
    });

    var beforeLast = filterEnabled(isoEvent, "iso_event_filter_before_last_x_date");
    var onLast = filterEnabled(isoEvent, "iso_event_filter_on_last_x_date");
    var beforeNow = filterEnabled(isoEvent, "iso_event_filter_before_current_date");
    var onNow = filterEnabled(isoEvent, "iso_event_filter_on_current_date");
    var requireMsrf = filterEnabled(isoEvent, "iso_event_filter_msrf_match");

    Object.keys(zStructs).forEach(function (key) {
      var zStruct = zStructs[key];
      var zMillis = zStruct.z_start.getTime();
      var zEndMillis = zStruct.z_end.getTime();
      var include = true;

      if (beforeLast) {
        if (isHHMM) { if (zEndMillis <= lastXMillis) include = false; }
        else if (zMillis < lastXMillis) include = false;
      }
      if (onLast) {
        if (isHHMM) { if (lastXMillis >= zMillis && lastXMillis < zEndMillis) include = false; }
        else if (zMillis === lastXMillis) include = false;
      }
      if (beforeNow) {
        if (isHHMM) { if (zEndMillis <= nowMillis) include = false; }
        else if (zMillis < nowMillis) include = false;
      }
      if (onNow) {
        if (isHHMM) { if (nowMillis >= zMillis && nowMillis < zEndMillis) include = false; }
        else if (zMillis === nowMillis) include = false;
      }

      if (tDateMillis.length > 0) {
        var overlapsATDate = false;
        for (var i = 0; i < tDateMillis.length; i++) {
          if (isHHMM) {
            if (tDateMillis[i] >= zMillis && tDateMillis[i] < zEndMillis) { overlapsATDate = true; break; }
          } else if (tDateMillis[i] === zMillis) { overlapsATDate = true; break; }
        }
        if (!overlapsATDate) include = false;
      }

      if (minScore !== null && zStruct.score < minScore) include = false;
      if (minHitCount !== null && zStruct.hit_count < minHitCount) include = false;

      if (beyondMaxDays !== null) {
        var dayDelta = Math.round((zMillis - lastXMillis) / C.MILLIS_PER_DAY);
        if (dayDelta > beyondMaxDays) include = false;
      }

      if (requireMsrf && zStruct.msrf_match_structs.length === 0) include = false;

      if (include) kept.push(key);
    });

    return kept;
  }

  /* ====================================================================== */
  /* Sorting                                                                */
  /* ====================================================================== */

  Engine.sortZDates = function (keys, zStructs, sortType, scoringSystem) {
    sortType = sortType || C.DEFAULT_Z_DATE_SORT_TYPE;
    var sorted = keys.slice();

    sorted.sort(function (a, b) {
      var za = zStructs[a];
      var zb = zStructs[b];

      var msrfScoreA = Engine.msrfSubscore(za.msrf_match_structs, scoringSystem);
      var msrfScoreB = Engine.msrfSubscore(zb.msrf_match_structs, scoringSystem);
      var msrfSumA = sumMsrfNumbers(za.msrf_match_structs);
      var msrfSumB = sumMsrfNumbers(zb.msrf_match_structs);

      var effective = sortType;
      if (sortType === C.Z_DATE_SORT_TYPE__SCORE && za.score === zb.score) {
        effective = (za.hit_count === zb.hit_count) ? C.Z_DATE_SORT_TYPE__DATE : C.Z_DATE_SORT_TYPE__HIT_COUNT;
      } else if (sortType === C.Z_DATE_SORT_TYPE__MSRF && msrfScoreA === msrfScoreB && msrfSumA === msrfSumB) {
        effective = C.Z_DATE_SORT_TYPE__DATE;
      } else if (sortType === C.Z_DATE_SORT_TYPE__OPERATIONS &&
                 za.operation_score === zb.operation_score &&
                 za.operation_hit_count === zb.operation_hit_count) {
        effective = C.Z_DATE_SORT_TYPE__DATE;
      } else if (sortType === C.Z_DATE_SORT_TYPE__HIT_COUNT && za.hit_count === zb.hit_count) {
        effective = C.Z_DATE_SORT_TYPE__DATE;
      }

      var valueA = 0, valueB = 0, descending = false;

      if (effective === C.Z_DATE_SORT_TYPE__SCORE) {
        valueA = za.score; valueB = zb.score; descending = true;
      } else if (effective === C.Z_DATE_SORT_TYPE__DATE) {
        valueA = za.z_start.getTime(); valueB = zb.z_start.getTime(); descending = false;
      } else if (effective === C.Z_DATE_SORT_TYPE__MSRF) {
        if (msrfScoreA === msrfScoreB) { valueA = msrfSumA; valueB = msrfSumB; }
        else { valueA = msrfScoreA; valueB = msrfScoreB; }
        descending = true;
      } else if (effective === C.Z_DATE_SORT_TYPE__OPERATIONS) {
        valueA = za.operation_hit_count; valueB = zb.operation_hit_count; descending = true;
      } else if (effective === C.Z_DATE_SORT_TYPE__HIT_COUNT) {
        valueA = za.hit_count; valueB = zb.hit_count; descending = true;
      }

      var direction = (valueA > valueB ? -1 : 1);
      return direction * (descending ? 1 : -1);
    });

    return sorted;
  };

  /* ====================================================================== */
  /* Entry point                                                            */
  /* ====================================================================== */

  /**
   * Run the engine over one event.
   * @param {object} isoEvent
   * @param {object} [options] — { nowInstant: Date } for the "current date" filters.
   * @returns {object} results
   */
  Engine.run = function (isoEvent, options) {
    options = options || {};
    var nowInstant = options.nowInstant || T.currentInstant(0);

    var errors = [];
    var yStructs = [];
    var zStructs = {};
    var operations = [];

    try {
      operations = Engine.effectiveOperations(isoEvent);

      var compiledEnabledCount = 0;
      operations.forEach(function (op) { if (op.enabled && op.fn) compiledEnabledCount++; });

      var xCount = Engine.enabledXDateCount(isoEvent);

      if (xCount < C.MINIMUM_NUMBER_OF_X_DATES) {
        errors.push("At least " + C.MINIMUM_NUMBER_OF_X_DATES + " X-Dates are required.");
      } else if (isoEvent.scope === C.EVENT_SCOPE__MONTHS) {
        errors.push("Month-based projections are not supported.");
      } else if (isoEvent.scope === C.EVENT_SCOPE__YEARS) {
        errors.push("Year-based projections are not supported.");
      } else if (compiledEnabledCount < C.MINIMUM_OPERATIONS_REQUIRED) {
        errors.push("At least " + C.MINIMUM_OPERATIONS_REQUIRED + " valid Operation is required.");
      } else if (isoEvent.scope === C.EVENT_SCOPE__HH_MM && !T.sunsetAvailable()) {
        errors.push("HH:MM scope needs the sunset library (lib/astronomy.browser.min.js) — it did not load.");
      } else if (isoEvent.scope === C.EVENT_SCOPE__HH_MM && !T.isValidLatAndLong(isoEvent.lat, isoEvent.long)) {
        errors.push("HH:MM scope needs a latitude within ±" + C.LAT_LIMIT + " and a longitude within ±" + C.LONG_LIMIT + ".");
      } else {
        var spreadErrors = [];
        if (!Engine.validateXDateSpread(isoEvent, spreadErrors)) {
          errors = spreadErrors;
        } else {
          generateYAndZStructs(isoEvent, operations, yStructs, zStructs);
        }
      }

      scoreZDates(operations, Engine.scoringSystem(isoEvent), zStructs);
    } catch (error) {
      errors.push("" + (error && error.message ? error.message : error));
    }

    var results = {
      errors: errors,
      effective_operations: operations,
      y_structs: yStructs,
      z_structs: zStructs,
      z_keys_by_date: [],
      z_keys_sorted: [],
      total_z_dates: Object.keys(zStructs).length
    };

    if (errors.length === 0) {
      var scoringSystem = Engine.scoringSystem(isoEvent);
      var kept = filterZDates(isoEvent, zStructs, nowInstant);

      var byDate = Engine.sortZDates(kept, zStructs, C.Z_DATE_SORT_TYPE__DATE, scoringSystem);
      byDate.forEach(function (key, index) { zStructs[key].z_ordinal = index; });

      var sortType = isoEvent.z_date_sort_type || C.DEFAULT_Z_DATE_SORT_TYPE;
      results.z_keys_by_date = byDate;
      results.z_keys_sorted = (sortType === C.Z_DATE_SORT_TYPE__DATE)
        ? byDate.slice()
        : Engine.sortZDates(kept, zStructs, sortType, scoringSystem);
    }

    return results;
  };

  root.Ophis.Engine = Engine;
})(typeof window !== "undefined" ? window : globalThis);
