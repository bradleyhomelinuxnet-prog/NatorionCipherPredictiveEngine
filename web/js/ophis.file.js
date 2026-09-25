/* ==========================================================================
   ophis.file.js — the .oph wire format, plus CSV export
   --------------------------------------------------------------------------
   Port of src/ophis_model__persistence.js, the loader half of
   src/ophis_model__validation.js, and newCsvRowForZDate() from
   src/ophis_view__export.js.

   .oph is plain JSON:

     { "app_version": "12",
       "iso_events": [ { "name": …, "x_dates": […], "operations": […], … } ] }

   Files written here load in the desktop app and vice versa. Two deliberate
   differences, both documented in web/docs/PARITY.md:

     · Operations are parsed, never compiled. A formula that is not arithmetic
       over Y is a load error, not code. (Report finding #1.)
     · Saving writes ordinary JSON. The desktop app runs a global
       replaceAll(",", ", ") over the finished string, which also rewrites
       commas *inside* event names and notes; that is a bug, not a format.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Expr = root.Ophis.Expr;
  var F = {};

  /* ------------------------------------------------------------ defaults */

  F.newEvent = function (name) {
    var event = {
      name: name || "Event 1",
      notes: "",
      x_dates: [],
      t_dates: [],
      lat: 0,
      long: 0,
      location_enabled: false,
      scope: C.DEFAULT_EVENT_SCOPE,
      type: C.DEFAULT_EVENT_TYPE,
      operations: C.defaultOperations(),
      scoring_system: C.DEFAULT_SCORING_SYSTEM,
      z_date_sort_type: C.DEFAULT_Z_DATE_SORT_TYPE,
      day_scope_start_time_in_millis: C.DEFAULT_DAY_SCOPE_START_TIME_MILLIS,
      chart_x_min: 0, chart_x_max: 0, chart_y_min: 0, chart_y_max: 0
    };
    C.FILTERS.forEach(function (filter) {
      event[filter.key] = filter.def;
      if (filter.valueKey) event[filter.valueKey] = filter.valueDef;
    });
    C.CHART_OPTIONS.forEach(function (option) { event[option.key] = option.def; });
    return event;
  };

  /* ---------------------------------------------------------------- load */

  function coerceDateEntry(entry, scope, errors, label) {
    if (!entry || typeof entry !== "object") {
      errors.push(label + " is not a date object.");
      return null;
    }
    var xDate = {
      date: entry.date,
      time: entry.time || C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE,
      enabled: entry.enabled === false ? false : true
    };
    var localErrors = [];
    if (!T.parseCalendarDate(xDate.date, localErrors)) {
      errors.push(label + ": " + localErrors.join(" "));
      return null;
    }
    if (scope === C.EVENT_SCOPE__HH_MM) {
      var timeErrors = [];
      if (!T.parseClockTime(xDate.time, timeErrors)) {
        errors.push(label + ": " + timeErrors.join(" "));
        return null;
      }
    }
    return xDate;
  }

  function coerceOperations(rawOperations, errors, mode) {
    if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
      if (mode === C.FILE_INPUT_VALIDATION_MODE__STRICT && rawOperations !== undefined) {
        errors.push("The operations field must be a non-empty array.");
      }
      return C.defaultOperations();
    }

    var operations = [];
    rawOperations.forEach(function (raw, index) {
      var equation = (raw && raw.equation !== undefined) ? "" + raw.equation : "";
      var weight = parseFloat(raw && raw.weight);
      if (isNaN(weight) || weight < 0) weight = C.POINTS__ALPHA_OPERATION_MATCH;

      // Parsed, not compiled. A formula outside the grammar is reported and
      // kept disabled so the operator can see exactly what the file asked for.
      var compiled = Expr.compile(equation);
      var enabled = raw && raw.enabled === false ? false : true;

      if (!compiled.ok) {
        var message = "Operation " + (index + 1) + " (\"" + equation + "\") was rejected: " + compiled.errors.join(" ");
        if (mode === C.FILE_INPUT_VALIDATION_MODE__STRICT) errors.push(message);
        else {
          enabled = false;
          F.lastLoadWarnings.push(message);
        }
      }
      operations.push({ equation: equation, weight: weight, enabled: enabled });
    });
    return operations;
  }

  F.lastLoadWarnings = [];

  /**
   * Parse a .oph document.
   * @returns {{events:array, errors:string[], warnings:string[], appVersion:string, globalOptions:object|null}}
   */
  F.parse = function (text, mode) {
    mode = mode || C.DEFAULT_FILE_INPUT_VALIDATION_MODE;
    F.lastLoadWarnings = [];

    var errors = [];
    var parsed;

    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { events: [], errors: ["Not valid JSON: " + e.message], warnings: [], appVersion: null, globalOptions: null };
    }

    if (!parsed || typeof parsed !== "object") {
      return { events: [], errors: ["The file does not contain an object."], warnings: [], appVersion: null, globalOptions: null };
    }

    var rawEvents = parsed[C.SERIALIZED_FIELD__ISO_EVENTS];
    if (!Array.isArray(rawEvents)) {
      return { events: [], errors: ["The file has no 'iso_events' array."], warnings: [], appVersion: null, globalOptions: null };
    }

    var appVersion = parsed[C.SERIALIZED_FIELD__APP_VERSION] || "";
    var appVersionInt = parseInt(appVersion, 10);
    if (isNaN(appVersionInt)) appVersionInt = 12;

    var events = [];

    rawEvents.forEach(function (raw, index) {
      var event = F.newEvent("Event " + (index + 1));
      var label = "Event " + (index + 1);

      if (!raw || typeof raw !== "object") {
        errors.push(label + " is not an object.");
        return;
      }

      if (typeof raw.name === "string" && raw.name.trim()) event.name = raw.name;
      if (typeof raw.notes === "string") event.notes = raw.notes;

      event.scope = (C.EVENT_SCOPES.indexOf(raw.scope) >= 0) ? raw.scope : C.DEFAULT_EVENT_SCOPE;
      event.type = (C.EVENT_TYPES.indexOf(raw.type) >= 0) ? raw.type : C.DEFAULT_EVENT_TYPE;

      var lat = parseFloat(raw.lat);
      var long = parseFloat(raw.long);
      event.lat = isNaN(lat) ? 0 : T.roundLocation(lat);
      event.long = isNaN(long) ? 0 : T.roundLocation(long);
      event.location_enabled = raw.location_enabled === true;

      if (event.scope === C.EVENT_SCOPE__HH_MM && !T.isValidLatAndLong(event.lat, event.long)) {
        errors.push(label + " uses HH:MM scope but its latitude/longitude is out of range " +
          "(lat ±" + C.LAT_LIMIT + ", long ±" + C.LONG_LIMIT + ").");
      }

      (Array.isArray(raw.x_dates) ? raw.x_dates : []).forEach(function (entry, i) {
        var xDate = coerceDateEntry(entry, event.scope, errors, label + " X" + (i + 1));
        if (xDate) event.x_dates.push(xDate);
      });
      (Array.isArray(raw.t_dates) ? raw.t_dates : []).forEach(function (entry, i) {
        var tDate = coerceDateEntry(entry, event.scope, errors, label + " T" + (i + 1));
        if (tDate) event.t_dates.push(tDate);
      });

      event.operations = coerceOperations(raw.operations, errors, mode);

      event.scoring_system = (C.SCORING_SYSTEMS.indexOf(raw.scoring_system) >= 0)
        ? raw.scoring_system
        : C.DEFAULT_SCORING_SYSTEM;

      event.z_date_sort_type = (C.Z_DATES_SORT_TYPES.indexOf(raw.z_date_sort_type) >= 0)
        ? raw.z_date_sort_type
        : C.DEFAULT_Z_DATE_SORT_TYPE;

      var dayStart = parseInt(raw.day_scope_start_time_in_millis, 10);
      event.day_scope_start_time_in_millis =
        (!isNaN(dayStart) && dayStart >= 0 && dayStart < C.MILLIS_PER_DAY) ? dayStart : C.DEFAULT_DAY_SCOPE_START_TIME_MILLIS;

      C.FILTERS.forEach(function (filter) {
        event[filter.key] = (raw[filter.key] === true || raw[filter.key] === false) ? raw[filter.key] : filter.def;
        if (filter.valueKey) {
          var value = parseFloat(raw[filter.valueKey]);
          event[filter.valueKey] = (!isNaN(value) && value >= 0) ? value : filter.valueDef;
        }
      });

      C.CHART_OPTIONS.forEach(function (option) {
        event[option.key] = (raw[option.key] === true || raw[option.key] === false) ? raw[option.key] : option.def;
      });

      ["chart_x_min", "chart_x_max", "chart_y_min", "chart_y_max"].forEach(function (key) {
        var value = parseFloat(raw[key]);
        event[key] = isNaN(value) ? 0 : value;
      });

      events.push(event);
    });

    if (events.length === 0 && errors.length === 0) errors.push("The file contains no readable events.");

    return {
      events: events,
      errors: errors,
      warnings: F.lastLoadWarnings.slice(),
      appVersion: appVersion,
      appVersionInt: appVersionInt,
      globalOptions: parsed[C.SERIALIZED_FIELD__GLOBAL_OPTIONS] || null
    };
  };

  /* ---------------------------------------------------------------- save */

  /** Strip runtime-only keys and write the .oph document. */
  F.serialize = function (events, options) {
    options = options || {};
    var payload = {};
    payload[C.SERIALIZED_FIELD__APP_VERSION] = options.appVersion || C.APP_VERSION;
    payload[C.SERIALIZED_FIELD__ISO_EVENTS] = events.map(function (event) {
      var out = {
        name: event.name,
        notes: event.notes || "",
        x_dates: (event.x_dates || []).map(function (x) {
          return event.scope === C.EVENT_SCOPE__HH_MM
            ? { date: x.date, time: x.time, enabled: x.enabled !== false }
            : { date: x.date, time: C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE, enabled: x.enabled !== false };
        }),
        t_dates: (event.t_dates || []).map(function (t) {
          return { date: t.date, time: t.time || C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE, enabled: t.enabled !== false };
        }),
        lat: event.lat,
        long: event.long,
        location_enabled: event.location_enabled === true,
        scope: event.scope,
        type: event.type || C.DEFAULT_EVENT_TYPE,
        operations: (event.operations || []).map(function (op) {
          return { equation: op.equation, weight: op.weight, enabled: op.enabled !== false };
        }),
        scoring_system: event.scoring_system
      };
      C.FILTERS.forEach(function (filter) {
        out[filter.key] = event[filter.key] === true;
        if (filter.valueKey) out[filter.valueKey] = event[filter.valueKey];
      });
      C.CHART_OPTIONS.forEach(function (option) { out[option.key] = event[option.key] === true; });
      out.chart_x_min = event.chart_x_min || 0;
      out.chart_x_max = event.chart_x_max || 0;
      out.chart_y_min = event.chart_y_min || 0;
      out.chart_y_max = event.chart_y_max || 0;
      out.z_date_sort_type = event.z_date_sort_type;
      out.day_scope_start_time_in_millis = event.day_scope_start_time_in_millis || 0;
      return out;
    });

    if (options.globalOptions) payload[C.SERIALIZED_FIELD__GLOBAL_OPTIONS] = options.globalOptions;

    return JSON.stringify(payload, null, options.prettify === false ? 0 : 2);
  };

  /* ----------------------------------------------------------------- CSV */

  F.CSV_NONE = "None";
  F.CSV_STATUS_SUCCESS = "None";
  F.CSV_STATUS_NO_RESULTS = "NO_RESULTS";
  F.CSV_STATUS_GENERAL_FAILURE = "GENERAL_FAILURE";
  F.CSV_COLUMNS = ["IsoEvent", "Date", "Hits", "Score", "MSRF", "Operations", "ErrorStatus", "ErrorMessage"];

  function csvCell(value) {
    var text = (value === null || value === undefined) ? "" : "" + value;
    return /[",\n\r]/.test(text) ? '"' + text.split('"').join('""') + '"' : text;
  }

  /** One CSV row per Z-Date, in date order — the desktop app's column set. */
  F.toCsv = function (isoEvent, results) {
    var rows = [F.CSV_COLUMNS.slice()];

    if (results.errors.length > 0) {
      results.errors.forEach(function (error) {
        rows.push([isoEvent.name, "", "", "", "", "", F.CSV_STATUS_GENERAL_FAILURE, error]);
      });
    } else if (results.z_keys_by_date.length === 0) {
      rows.push([isoEvent.name, "", "", "", "", "", F.CSV_STATUS_NO_RESULTS, C.NO_RESULTS_MESSAGE]);
    } else {
      results.z_keys_by_date.forEach(function (key) {
        var zStruct = results.z_structs[key];

        var msrfNumbers = zStruct.msrf_match_structs
          .map(function (m) { return m.msrf_number; })
          .sort(function (a, b) { return b - a; });

        var operationLabels = zStruct.operation_match_structs
          .map(function (m) { return m.operation_result.operation_ordinal + 1; })
          .sort(function (a, b) { return a - b; })
          .map(function (n) { return "OP" + (n < 10 ? "0" + n : n); });

        rows.push([
          isoEvent.name,
          zStruct.z_readable_start,
          zStruct.hit_count,
          zStruct.score,
          msrfNumbers.length ? msrfNumbers.join(", ") : F.CSV_NONE,
          operationLabels.length ? operationLabels.join(", ") : F.CSV_NONE,
          F.CSV_STATUS_SUCCESS,
          F.CSV_NONE
        ]);
      });
    }

    return rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
  };

  /* ------------------------------------------------------------ download */

  F.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  F.safeFileName = function (name) {
    return ("" + name).replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^[. ]+|[. ]+$/g, "").substring(0, 120) || "ophis";
  };

  root.Ophis.File = F;
})(typeof window !== "undefined" ? window : globalThis);
