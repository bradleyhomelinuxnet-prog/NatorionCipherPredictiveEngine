/* NATORION · ui/dom.js — small DOM helpers. Text always goes in as text:
   nothing from a document or an input is ever parsed as HTML. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});

  function $(id) { return document.getElementById(id); }

  // el("button.ghost#x", { title: "…", onclick: fn, data: { k: v } }, [children])
  function el(spec, attrs, kids) {
    var m = spec.split(/(?=[.#])/), node = document.createElement(m[0]);
    for (var i = 1; i < m.length; i++) {
      if (m[i][0] === ".") node.classList.add(m[i].slice(1)); else node.id = m[i].slice(1);
    }
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className += (node.className ? " " : "") + v;
      else if (k === "data") Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
      else if (k === "style" && typeof v === "object") Object.keys(v).forEach(function (sk) { node.style.setProperty(sk, v[sk]); });
      else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "value") node.value = v;
      else if (k === "checked") node.checked = !!v;
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, String(v));
    });
    append(node, kids);
    return node;
  }
  function append(node, kids) {
    if (kids === null || kids === undefined || kids === false) return node;
    [].concat(kids).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { append(node, c); return; }
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }
  function fill(node, kids) { node.replaceChildren(); return append(node, kids); }

  function toast(msg, bad) {
    var host = $("toasts");
    if (!host) return;
    var t = el("div.toast" + (bad ? ".bad" : ""), { role: bad ? "alert" : "status", text: msg });
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 6000 : 3200);
  }

  function download(name, text, mime) {
    var blob = text instanceof Blob ? text : new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = el("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function debounce(fn, ms) {
    var t;
    return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); };
  }

  // Segmented radio control: seg(node, value, onPick)
  function seg(node, value, onPick) {
    Array.prototype.forEach.call(node.querySelectorAll("button"), function (b) {
      var v = b.dataset.v || b.dataset.era || b.dataset.k;
      b.setAttribute("aria-checked", String(v === value));
      b.tabIndex = v === value ? 0 : -1;
      if (!b._wired && onPick) {
        b._wired = true;
        b.addEventListener("click", function () { onPick(b.dataset.v || b.dataset.era || b.dataset.k); });
        b.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          var all = Array.prototype.slice.call(node.querySelectorAll("button")), i = all.indexOf(b);
          var n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
          n.focus(); n.click(); e.preventDefault();
        });
      }
    });
  }

  function fmtNum(n, max) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: max == null ? 2 : max }); }
  function safeName(s) { return String(s || "natorion").replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._]+|[._]+$/g, "").slice(0, 120) || "natorion"; }

  NC.dom = { $: $, el: el, append: append, fill: fill, toast: toast, download: download, debounce: debounce, seg: seg, fmtNum: fmtNum, safeName: safeName };
})(typeof window !== "undefined" ? window : globalThis);
