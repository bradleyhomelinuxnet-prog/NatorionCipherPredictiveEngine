/* ==========================================================================
   theme.js — the saved theme, before the first paint
   --------------------------------------------------------------------------
   Loaded without `defer` from <head>, so the page never paints in one theme
   and then switches to the other while the deferred scripts load. The inline
   version of this would need 'unsafe-inline' in the CSP; a file does not.
   ========================================================================== */
(function () {
  "use strict";
  try {
    var saved = JSON.parse(localStorage.getItem("ophis.web.session.v1") || "null");
    var theme = saved && saved.globalOptions && saved.globalOptions.theme;
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
  } catch (e) { /* no storage, or a corrupt entry: keep the default in the markup */ }
})();
