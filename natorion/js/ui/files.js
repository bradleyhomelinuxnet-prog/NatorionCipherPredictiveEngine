/* NATORION · ui/files.js — events in the document, opening and saving .oph,
   exports, copying settings between events, and settings. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, D = NC.dom, S = NC.store, T = NC.time, $ = D.$, el = D.el;

  function scopeName(s) { return s === C.SCOPE.HH_MM ? "HH:MM · sunset" : s === C.SCOPE.MONTHS ? "Months" : s === C.SCOPE.YEARS ? "Years" : "Days"; }
  function baseName() { return D.safeName($("fileName").value || S.state.settings.fileName); }

  /* -------------------------------------------------------------- events -- */
  function renderEvents() {
    var st = S.state;
    D.fill($("eventsBody"), st.events.map(function (e, i) {
      var name = el("input", { type: "text", value: e.name || "", "aria-label": "Event " + (i + 1) + " name", maxlength: "120" });
      name.addEventListener("change", function () { var v = name.value; st.events[i].name = v; S.persist(); NC.app.renderEventPicker(); if (i === st.current) NC.cipher.renderEvent(); });
      return el("tr", { "aria-current": String(i === st.current) }, [
        el("td", {}, [name]),
        el("td", { text: scopeName(e.scope) }),
        el("td.num", { text: String((e.x_dates || []).length) }),
        el("td.num", { text: String((e.operations || []).filter(function (o) { return o.enabled === true; }).length) }),
        el("td.acts", {}, [
          i === st.current ? el("span.hint", { text: "open " }) : el("button.ghost", { type: "button", text: "Open", onclick: function () { S.select(i); NC.app.go("cipher"); } }),
          el("button.ghost", { type: "button", text: "Duplicate", onclick: function () {
            var copy = JSON.parse(JSON.stringify(e)); copy.name = (e.name || "Event") + " copy";
            st.events.splice(i + 1, 0, copy); S.persist(); S.emit("switch"); renderEvents();
          } }),
          el("button.ghost.danger", { type: "button", text: "Delete", disabled: st.events.length < 2, onclick: function () {
            if (!confirm("Delete “" + (e.name || "this event") + "”? This cannot be undone.")) return;
            st.events.splice(i, 1);
            S.replaceEvents(st.events, Math.min(st.current, st.events.length - 1)); renderEvents();
          } })
        ])
      ]);
    }));
    renderSwap();
  }

  function nextName() {
    var last = S.state.events[S.state.events.length - 1], m = last && /^(.*?)(\d+)$/.exec(last.name || "");
    return m ? m[1] + (parseInt(m[2], 10) + 1) : "Event " + (S.state.events.length + 1);
  }
  function newEvent() {
    var cur = S.event(), e = NC.oph.newEvent(nextName(), cur ? cur.scope : C.SCOPE.DAYS);
    if (cur && cur.scope === C.SCOPE.HH_MM) { e.lat = cur.lat; e.long = cur.long; e.location_enabled = true; }
    S.state.events.push(e);
    S.select(S.state.events.length - 1);
    renderEvents();
    NC.app.go("cipher");
  }

  /* ---------------------------------------------------------------- open -- */
  function report(ok, head, lines) {
    D.fill($("importReport"), [el("div", { class: ok ? "ok" : "bad", text: head }), lines && lines.length ? el("ul", {}, lines.slice(0, 12).map(function (l) { return el("li", { text: l }); })) : null]);
  }
  function load(text, sourceName) {
    var mode = S.state.settings.validation, p = NC.oph.parse(text, mode);
    if (!p.events) { report(false, "Could not open " + (sourceName || "the text") + ":", p.errors); D.toast("That document could not be opened.", true); return false; }
    var append = S.state.settings.openHow === "append";
    if (append) S.replaceEvents(S.state.events.concat(p.events), S.state.events.length);
    else S.replaceEvents(p.events, 0);
    if (sourceName && !append) { var n = sourceName.replace(/\.(oph|json)$/i, ""); $("fileName").value = n; S.setSetting("fileName", n); }
    report(true, "Opened " + p.events.length + " event" + (p.events.length === 1 ? "" : "s") + (sourceName ? " from " + sourceName : "") + (append ? ", added after the others." : "."), p.warnings);
    renderEvents();
    D.toast("Opened " + (sourceName || "document") + ".");
    return true;
  }
  function readFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { D.toast("That file is over 20 MB — not an .oph document.", true); return; }
    var r = new FileReader();
    r.onload = function () { load(String(r.result), file.name); };
    r.onerror = function () { D.toast("The file could not be read.", true); };
    r.readAsText(file);
  }

  /* ---------------------------------------------------------------- save -- */
  function docText() { return NC.oph.serialize(S.state.events, { minify: S.state.settings.minify }); }
  function saveOph() { D.download(baseName() + ".oph", docText(), "application/json;charset=utf-8"); D.toast("Saved " + baseName() + ".oph"); }
  function currentResults() {
    var res = S.state.results;
    if (!res || res.errors.length) { D.toast(res && res.errors.length ? res.errors[0] : "Nothing to export yet.", true); return null; }
    return res;
  }
  function saveCsv() {
    var res = currentResults(); if (!res) return;
    D.download(baseName() + "_" + D.safeName(S.event().name) + "_zdates.csv", "﻿" + NC.oph.toCsv(S.event(), res), "text/csv;charset=utf-8");
  }
  // SpreadsheetML 2003 — plain XML that Excel, LibreOffice and Numbers open.
  function saveSheet() {
    var res = currentResults(); if (!res) return;
    var t = NC.oph.resultsTable(S.event(), res);
    function x(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }
    function cell(v) { return typeof v === "number" ? '<Cell><Data ss:Type="Number">' + v + "</Data></Cell>" : '<Cell><Data ss:Type="String">' + x(v) + "</Data></Cell>"; }
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles><Worksheet ss:Name="Z-Dates"><Table>' +
      "<Row>" + t.header.map(function (h) { return '<Cell ss:StyleID="h"><Data ss:Type="String">' + x(h) + "</Data></Cell>"; }).join("") + "</Row>" +
      t.rows.map(function (r) { return "<Row>" + r.map(cell).join("") + "</Row>"; }).join("") +
      "</Table></Worksheet></Workbook>";
    D.download(baseName() + "_" + D.safeName(S.event().name) + "_zdates.xls", xml, "application/vnd.ms-excel");
  }

  /* ---------------------------------------------------------------- swap -- */
  var SWAP = [
    { key: "ops", label: "Operations", apply: function (from, to) { to.operations = JSON.parse(JSON.stringify(from.operations)); to.scoring_system = from.scoring_system; } },
    { key: "filters", label: "Filters", apply: function (from, to) { C.FILTERS.forEach(function (f) { to[f.key] = from[f.key]; if (f.valueKey) to[f.valueKey] = from[f.valueKey]; }); } },
    { key: "layers", label: "Timeline layers", apply: function (from, to) { C.CHART_LAYERS.forEach(function (f) { to[f.key] = from[f.key]; }); } },
    { key: "scope", label: "Scope, place and day start", apply: function (from, to) { to.scope = from.scope; to.lat = from.lat; to.long = from.long; to.location_enabled = from.location_enabled; to.day_scope_start_time_in_millis = from.day_scope_start_time_in_millis; } },
    { key: "sort", label: "Sort order", apply: function (from, to) { to.z_date_sort_type = from.z_date_sort_type; } }
  ];
  var swapWhat = { ops: true, filters: true };
  function renderSwap() {
    D.fill($("swapWhat"), SWAP.map(function (s) {
      return el("label.check", {}, [el("input", { type: "checkbox", checked: !!swapWhat[s.key], onchange: function (e) { swapWhat[s.key] = e.target.checked; } }), el("span", { text: s.label })]);
    }));
    var others = S.state.events.map(function (e, i) { return { e: e, i: i }; }).filter(function (x) { return x.i !== S.state.current; });
    D.fill($("swapTargets"), others.length ? [el("p.hint", { text: "Onto:" })].concat(others.map(function (x) {
      return el("label.check", {}, [el("input", { type: "checkbox", value: String(x.i) }), el("span", { text: x.e.name || "Event " + (x.i + 1) })]);
    })) : [el("p.hint", { text: "There is only one event. Add another to copy settings onto it." })]);
    $("swapGo").disabled = !others.length;
  }
  function doSwap() {
    var from = S.event(), targets = Array.prototype.map.call($("swapTargets").querySelectorAll("input:checked"), function (i) { return +i.value; });
    var what = SWAP.filter(function (s) { return swapWhat[s.key]; });
    if (!targets.length || !what.length) { D.toast("Tick what to copy and at least one event.", true); return; }
    targets.forEach(function (i) { what.forEach(function (s) { s.apply(from, S.state.events[i]); }); });
    S.persist(); renderEvents();
    D.toast("Copied " + what.map(function (s) { return s.label.toLowerCase(); }).join(", ") + " onto " + targets.length + " event" + (targets.length === 1 ? "" : "s") + ".");
  }

  /* ---------------------------------------------------------------- init -- */
  function render() {
    renderEvents();
    $("docText").value = docText();
    D.seg($("openHowSeg"), S.state.settings.openHow, function (v) { S.setSetting("openHow", v); render(); });
    D.seg($("minifySeg"), S.state.settings.minify ? "min" : "pretty", function (v) { S.setSetting("minify", v === "min"); render(); });
    $("modeSel").value = S.state.settings.validation;
    $("todayOverride").value = S.state.settings.todayOverride || "";
    $("autoRun").checked = S.state.settings.autoRun !== false;
    $("fileName").value = S.state.settings.fileName || "natorion";
  }

  function init() {
    $("evNew").addEventListener("click", newEvent);
    $("fileInput").addEventListener("change", function () { readFile(this.files && this.files[0]); this.value = ""; });
    $("pasteLoad").addEventListener("click", function () { if ($("pasteArea").value.trim()) load($("pasteArea").value, null); });
    $("modeSel").addEventListener("change", function () { S.setSetting("validation", this.value); });
    $("fileName").addEventListener("change", function () { S.setSetting("fileName", baseName()); });
    $("saveOph").addEventListener("click", saveOph);
    $("saveCsv").addEventListener("click", saveCsv);
    $("saveSheet").addEventListener("click", saveSheet);
    $("printBtn").addEventListener("click", function () { NC.app.go("cipher"); setTimeout(function () { root.print(); }, 150); });
    $("copyDoc").addEventListener("click", function () {
      var t = $("docText"); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { D.toast("Copied."); }, function () { try { document.execCommand("copy"); D.toast("Copied."); } catch (e) { D.toast("Select the text and copy it.", true); } });
    });
    $("swapGo").addEventListener("click", doSwap);
    $("todayOverride").addEventListener("change", function () { S.setSetting("todayOverride", this.value); S.scheduleRun(true); });
    $("autoRun").addEventListener("change", function () { S.setSetting("autoRun", this.checked); });
    $("resetAll").addEventListener("click", function () {
      if (!confirm("Clear everything this browser remembers and start over with the demo event? Save a .oph first if you want to keep your work.")) return;
      try { root.localStorage.removeItem("natorion.v1"); } catch (e) { /* ignore */ }
      S.replaceEvents([S.demoEvent()], 0); render(); NC.app.go("cipher");
    });
    // Drag and drop anywhere on the page opens a file.
    var dz = $("dropZone"), depth = 0;
    document.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { depth++; dz.classList.add("dragging"); } });
    document.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) dz.classList.remove("dragging"); });
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      e.preventDefault(); depth = 0; dz.classList.remove("dragging");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { readFile(f); NC.app.go("files"); }
    });
    S.on("switch", function () { if ($("eventsBody").offsetParent) render(); });
  }

  NC.files = { init: init, render: render, saveCsv: saveCsv, saveOph: saveOph, load: load };
})(typeof window !== "undefined" ? window : globalThis);
