/* ==========================================================================
   ui.dom.js — small DOM helpers shared by every panel
   --------------------------------------------------------------------------
   Everything user-supplied (event names, notes, formulas, file contents) goes
   through esc() before it reaches innerHTML. The desktop app interpolates
   several of these straight into markup; this build does not.
   ========================================================================== */
(function (root) {
  "use strict";

  var UI = {};

  UI.esc = function (value) {
    return ("" + (value === null || value === undefined ? "" : value))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  UI.$ = function (selector, scope) { return (scope || document).querySelector(selector); };
  UI.$$ = function (selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  };

  UI.on = function (element, type, selector, handler) {
    if (typeof selector === "function") { element.addEventListener(type, selector); return; }
    element.addEventListener(type, function (event) {
      var target = event.target.closest(selector);
      if (target && element.contains(target)) handler(event, target);
    });
  };

  /** Subscript label: X1 -> X₁ (used everywhere the app says X1/Y3/O12/Z7). */
  UI.label = function (letter, zeroBasedOrdinal) {
    return letter + "<sub>" + (zeroBasedOrdinal + 1) + "</sub>";
  };
  UI.labelPlain = function (letter, zeroBasedOrdinal) {
    return letter + (zeroBasedOrdinal + 1);
  };

  /** 46 -> "46.0 days"; matches readableAxialRotations()/intToDecimalString(). */
  UI.days = function (value) {
    return UI.decimal(value) + (Math.abs(value) === 1 ? " day" : " days");
  };
  UI.decimal = function (value) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    return Number.isInteger(value) ? value + ".0" : "" + value;
  };
  UI.number = function (value) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    return "" + (Math.round(value * 1000) / 1000);
  };

  /* --------------------------------------------------------------- toast */
  var toastTimer = null;
  UI.toast = function (text, kind) {
    var host = document.getElementById("toast");
    if (!host) return;
    host.className = "toast show " + (kind || "info");
    host.innerHTML = UI.esc(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { host.className = "toast"; }, 4200);
  };

  /* ------------------------------------------------------------- tooltip */
  /* One shared tooltip element; panels mark elements with data-tip="…" (HTML
     already escaped by the caller). Keyboard focus shows it too. */
  var tipEl = null;
  function ensureTip() {
    if (!tipEl) tipEl = document.getElementById("tooltip");
    return tipEl;
  }

  UI.showTip = function (anchor, html) {
    var tip = ensureTip();
    if (!tip || !html) return;
    tip.innerHTML = html;
    tip.classList.add("show");

    var box = anchor.getBoundingClientRect();
    var tipBox = tip.getBoundingClientRect();
    var left = box.left + box.width / 2 - tipBox.width / 2;
    var top = box.top - tipBox.height - 10;

    if (top < 8) top = box.bottom + 10;
    if (left < 8) left = 8;
    if (left + tipBox.width > window.innerWidth - 8) left = window.innerWidth - tipBox.width - 8;

    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  };

  UI.hideTip = function () {
    var tip = ensureTip();
    if (tip) tip.classList.remove("show");
  };

  var scrollListenerAttached = false;
  UI.bindTooltips = function (scope) {
    var host = scope || document;
    UI.on(host, "mouseover", "[data-tip]", function (event, target) { UI.showTip(target, target.getAttribute("data-tip")); });
    UI.on(host, "mouseout", "[data-tip]", function () { UI.hideTip(); });
    UI.on(host, "focusin", "[data-tip]", function (event, target) { UI.showTip(target, target.getAttribute("data-tip")); });
    UI.on(host, "focusout", "[data-tip]", function () { UI.hideTip(); });
    if (!scrollListenerAttached) {
      window.addEventListener("scroll", UI.hideTip, true);
      scrollListenerAttached = true;
    }
  };

  /** Build the little key/value table the desktop app shows inside pills. */
  UI.tipTable = function (rows) {
    var html = '<table class="tip-table">';
    rows.forEach(function (row) {
      if (!row) return;
      html += '<tr><th>' + row[0] + '</th><td>' + row[1] + '</td></tr>';
    });
    return html + "</table>";
  };

  /* --------------------------------------------------------------- modal */
  /* One dialog at a time. Its click handler is assigned rather than added and
     is dropped on close, so a dialog that was cancelled can never act later.
     Focus moves into the dialog, Tab stays inside it, and focus goes back to
     where it was when the dialog closes. */
  var openModal = null;
  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  UI.modal = function (title, bodyHtml, options) {
    options = options || {};
    if (openModal) openModal.close();
    var returnFocus = document.activeElement;
    var host = document.getElementById("modal");
    host.innerHTML =
      '<div class="modal-backdrop" data-close="1"></div>' +
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + UI.esc(title) + '">' +
        '<header><h2>' + UI.esc(title) + '</h2>' +
        '<button class="icon-btn" data-close="1" aria-label="Close">✕</button></header>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        '<footer>' +
          (options.confirmLabel ? '<button class="btn primary" data-confirm="1">' + UI.esc(options.confirmLabel) + '</button>' : '') +
          '<button class="btn" data-close="1">' + UI.esc(options.closeLabel || (options.confirmLabel ? "Cancel" : "Close")) + '</button>' +
        '</footer>' +
      '</div>';
    host.classList.add("open");

    var handle = { close: close, host: host };

    function close() {
      if (openModal !== handle) return;   // already closed, or replaced by onConfirm
      openModal = null;
      host.classList.remove("open");
      host.innerHTML = "";
      host.onclick = null;
      document.removeEventListener("keydown", onKey);
      if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
    }

    function onKey(event) {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      var focusable = UI.$$(FOCUSABLE, host).filter(function (element) { return !element.disabled; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      var inside = host.contains(document.activeElement);
      if (!inside || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    host.onclick = function (event) {
      if (event.target.closest("[data-confirm]")) {
        if (options.onConfirm) options.onConfirm(host);
        close();
      } else if (event.target.closest("[data-close]")) {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    openModal = handle;

    // Focus starts on Cancel / Close, never on the confirming button: these
    // dialogs clear dates, delete events and replace sessions, and an Enter
    // pressed twice must not do that.
    var initial = host.querySelector("footer [data-close]");
    if (initial) initial.focus();
    return handle;
  };

  UI.confirm = function (title, message, onConfirm) {
    UI.modal(title, '<p>' + UI.esc(message) + '</p>', { confirmLabel: "Confirm", onConfirm: onConfirm });
  };

  root.Ophis.UI = UI;
})(typeof window !== "undefined" ? window : globalThis);
