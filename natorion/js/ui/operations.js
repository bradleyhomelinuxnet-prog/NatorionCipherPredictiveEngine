/* NATORION · ui/operations.js — edit the functions of Y, with live checking. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, D = NC.dom, S = NC.store, $ = D.$, el = D.el;

  function ops() { var e = S.event(); if (!Array.isArray(e.operations)) e.operations = []; return e.operations; }

  function sample(o, i, list) {
    var c = NC.expr.compileOperation(o.equation, i, list);
    if (!c.fn) return { text: "—", err: c.errors[0] };
    var z = c.fn(100);
    return { text: Number.isFinite(z) ? String(NC.round2(z)) : "not a number", err: null };
  }

  function render() {
    var list = ops(), body = $("opsBody");
    var on = list.filter(function (o) { return o.enabled === true; }).length;
    $("opsCount").textContent = on + " of " + list.length + " on";
    D.fill(body, list.map(function (o, i) {
      var chk = o.enabled === true ? sample(o, i, list) : { text: "off", err: null };
      var eq = el("input", { type: "text", value: o.equation, spellcheck: "false", autocomplete: "off", "aria-label": "Operation " + (i + 1) + " equation", "aria-invalid": chk.err ? "true" : null });
      var err = el("div.err", { text: chk.err || "", hidden: !chk.err });
      var zCell = el("td.num.mono", { text: chk.text });
      eq.addEventListener("input", D.debounce(function () {
        var v = eq.value;
        S.change(function () { o.equation = v; });
        var c = o.enabled === true ? sample(o, i, list) : { text: "off", err: null };
        eq.setAttribute("aria-invalid", String(!!c.err)); err.textContent = c.err || ""; err.hidden = !c.err; zCell.textContent = c.text;
      }, 250));
      return el("tr", { data: { off: String(o.enabled !== true) } }, [
        el("td.num.mono", { text: String(i + 1) }),
        el("td", {}, [el("input", { type: "checkbox", checked: o.enabled === true, "aria-label": "Use operation " + (i + 1), onchange: function (e) { S.change(function () { o.enabled = e.target.checked; }); render(); } })]),
        el("td", {}, [eq, err]),
        el("td", {}, [(function () {
          var s = el("select", { "aria-label": "Operation " + (i + 1) + " class" }, [
            el("option", { value: "1", text: "alpha · 1" }), el("option", { value: "0.5", text: "beta · ½" })
          ]);
          s.value = o.weight >= C.POINTS_ALPHA ? "1" : "0.5";
          if (o.weight !== 1 && o.weight !== 0.5) s.appendChild(el("option", { value: String(o.weight), text: "custom · " + o.weight })), s.value = String(o.weight);
          s.addEventListener("change", function () { var w = parseFloat(s.value); S.change(function () { o.weight = w; }); });
          return s;
        })()]),
        zCell,
        el("td.acts", {}, [
          i > 0 ? el("button", { type: "button", text: "↑", title: "Move up", "aria-label": "Move operation " + (i + 1) + " up", onclick: function () { S.change(function () { var t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; }); render(); } }) : null,
          el("button", { type: "button", text: "⎘", title: "Duplicate", "aria-label": "Duplicate operation " + (i + 1), onclick: function () { S.change(function () { list.splice(i + 1, 0, { equation: o.equation, weight: o.weight, enabled: false }); }); render(); } }),
          el("button", { type: "button", text: "✕", title: "Remove", "aria-label": "Remove operation " + (i + 1), onclick: function () { S.change(function () { list.splice(i, 1); }); render(); } })
        ])
      ]);
    }));
  }

  function tryIt() {
    var out = $("tryOut"), eq = $("tryEq").value, Y = parseFloat($("tryY").value);
    var c = NC.expr.compileOperation(eq, 0, []);
    out.classList.toggle("bad", !c.fn);
    if (!c.fn) { out.textContent = c.errors.join(" "); return; }
    if (!Number.isFinite(Y)) { out.textContent = "Give Y a number."; return; }
    var z = c.fn(Y), m = NC.msrfMatch(NC.round1(NC.round2(z)));
    out.textContent = "normalised  " + c.normalized + "\nZ = " + NC.round2(z) + " days from X" + c.startingX +
      (m ? "\nMSRF " + m.cls.name.toLowerCase() + " match: " + m.number + " (×" + m.cls.mult + ")" : "\nno MSRF match");
  }

  function init() {
    $("opsAdd").addEventListener("click", function () { S.change(function () { ops().push({ equation: "X1+Y", weight: C.POINTS_BETA, enabled: true }); }); render(); var ins = $("opsBody").querySelectorAll('input[type="text"]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } });
    $("opsDefaults").addEventListener("click", function () {
      if (!confirm("Replace this event's operations with the 16 v12 defaults?")) return;
      S.change(function (e) { e.operations = C.cloneDefaultOperations(); }); render(); D.toast("The 16 default operations are back.");
    });
    $("opsExtras").addEventListener("click", function () {
      var have = ops().map(function (o) { return NC.expr.normalize(o.equation); }), added = 0;
      S.change(function () { C.EXTRA_OPERATIONS.forEach(function (x) { if (have.indexOf(NC.expr.normalize(x.equation)) < 0) { ops().push({ equation: x.equation, weight: x.weight, enabled: true }); added++; } }); });
      render(); D.toast(added ? added + " extra operations added, switched on." : "The extras are already here.");
    });
    $("tryEq").addEventListener("input", tryIt);
    $("tryY").addEventListener("input", tryIt);
    tryIt();
  }

  NC.opsView = { init: init, render: render };
})(typeof window !== "undefined" ? window : globalThis);
