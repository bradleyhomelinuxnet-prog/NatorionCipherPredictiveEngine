/* ==========================================================================
   runner.js — browser front end for web/tests/unit.js
   --------------------------------------------------------------------------
   Renders the suites as they run and exposes window.OPHIS_TEST_RESULT so a
   headless browser can read the outcome without scraping the page.
   ========================================================================== */
(function (root) {
  "use strict";

  var Expr = root.Ophis.Expr;
  var Tests = root.Ophis.Tests;

  function esc(value) {
    return ("" + value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function main() {
    var host = document.getElementById("results");
    var summary = document.getElementById("summary");
    var currentList = null;

    var report = {
      suite: function (name) {
        var section = document.createElement("div");
        section.className = "test-suite";
        section.innerHTML = '<h3>' + esc(name) + "</h3>";
        currentList = document.createElement("ul");
        section.appendChild(currentList);
        host.appendChild(section);
      },
      pass: function (title) {
        var item = document.createElement("li");
        item.className = "pass";
        item.innerHTML = '<span class="mark">✓</span>' + esc(title);
        currentList.appendChild(item);
      },
      fail: function (title, message) {
        var item = document.createElement("li");
        item.className = "fail";
        item.innerHTML = '<span class="mark">✗</span>' + esc(title) + '<div class="why">' + esc(message) + "</div>";
        currentList.appendChild(item);
      },
      done: function (passed, failed) {
        summary.innerHTML = passed + " passed, " + failed + " failed";
        summary.className = "panel-note " + (failed ? "fail-text" : "pass-text");
        document.body.setAttribute("data-tests", failed ? "failed" : "passed");
      }
    };

    var result = Tests.run(report);
    root.OPHIS_TEST_RESULT = result;

    /* ---- formula playground ---- */
    var input = document.getElementById("try-input");
    var output = document.getElementById("try-out");

    function evaluate() {
      var compiled = Expr.compile(input.value);
      if (compiled.ok) {
        var value = Math.round(compiled.run(1656) * 1e6) / 1e6;
        output.className = "try-out ok";
        output.innerHTML = "✓ valid &middot; anchored on " +
          (compiled.anchor === root.Ophis.C.STARTING_X1 ? "X1" : "X2") +
          " &middot; offset at Y=1656 is <b>" + value + "</b> days";
      } else {
        output.className = "try-out bad";
        output.innerHTML = "✗ rejected &middot; " + esc(compiled.errors.join(" "));
      }
    }

    document.getElementById("try-run").addEventListener("click", evaluate);
    input.addEventListener("keydown", function (event) { if (event.key === "Enter") evaluate(); });
    Array.prototype.forEach.call(document.querySelectorAll(".preset"), function (button) {
      button.addEventListener("click", function () {
        input.value = button.textContent;
        evaluate();
      });
    });
    evaluate();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})(typeof window !== "undefined" ? window : globalThis);
