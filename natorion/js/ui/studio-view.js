/* NATORION · ui/studio-view.js — the Studio screen: the production plan, the
   numbered script, the look cards, the image and animation prompts in
   batches of five, the thumbnail and the upload text, all written from the
   open event's results by studio/studio.js. Everything is built as DOM
   nodes; the prompts are text, never markup. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var D = NC.dom, S = NC.store, $ = D.$, el = D.el;
  var STEPS = { script: "Script", cast: "Look cards", images: "Images", clips: "Clips", thumbnail: "Thumbnail", upload: "Upload" };
  var step = "script", batch = { images: 0, clips: 0 }, plan = null;

  function opts() { var s = S.state.settings; return { length: s.studioLength, title: s.studioTitle, anchor: s.studioAnchor, era: s.studioEra, variation: s.studioVariation }; }
  function rebuild() {
    var res = S.state.results;
    plan = res && !res.errors.length && res.zs.length ? NC.studio.build(S.event(), res, opts()) : null;
    if (plan) { batch.images = Math.min(batch.images, plan.batches - 1); batch.clips = Math.min(batch.clips, plan.batches - 1); }
  }
  function fileBase() { return D.safeName(S.state.settings.fileName || "natorion") + "_" + D.safeName(S.event().name); }

  function copy(text, what) {
    var done = function () { D.toast("Copied " + what + "."); };
    var fallback = function () {
      var t = el("textarea", { style: { position: "fixed", left: "-9999px", top: "0" }, "aria-hidden": "true" });
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (e) { D.toast("Select the text and copy it.", true); }
      t.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function copyBtn(text, what, label) { return el("button.ghost", { type: "button", text: label || "Copy", onclick: function () { copy(text, what); } }); }

  /* ------------------------------------------------------------ the plan -- */
  function stat(name, big, meta) { return el("div.stat", {}, [el("div.name", { text: name }), el("div.big", { text: big }), el("div.meta", { text: meta })]); }
  function renderControls() {
    var s = S.state.settings;
    D.seg($("stLength"), String(NC.studio.LENGTHS[s.studioLength] ? s.studioLength : 10), function (v) { S.setSetting("studioLength", parseInt(v, 10)); refresh(true); });
    $("stTitle").value = s.studioTitle || "";
    $("stTitle").placeholder = S.event().name || "the event's name";
    $("stAnchor").value = s.studioAnchor || "";
    $("stEra").value = NC.studio.ERAS[s.studioEra] ? s.studioEra : "";
    $("stVariation").value = String(s.studioVariation || 1);
  }
  function renderPlan() {
    var empty = $("stEmpty");
    $("stSave").disabled = $("stCopyAll").disabled = $("stCopyStep").disabled = !plan;
    if (!plan) {
      var res = S.state.results, why = res && res.errors.length ? res.errors[0] : "The Studio writes from the Cipher's results, and there are none yet.";
      D.fill(empty, [el("b", { text: "Seed the anchors first" }), why + " Add two or more X-Dates on the Cipher screen."]);
      empty.hidden = false;
      D.fill($("stPlan"), []); $("stSections").textContent = ""; D.fill($("stChecks"), []); D.fill($("stBody"), []);
      $("stBatchNav").hidden = true;
      return;
    }
    empty.hidden = true;
    var k = plan.checks;
    D.fill($("stPlan"), [
      stat("Video length", plan.length + " min", plan.seconds + " seconds · " + plan.eraName),
      stat("Script", D.fmtNum(plan.words) + " words", "§1–§" + plan.paragraphs + " · the brief asks " + D.fmtNum(plan.wordRange[0]) + "–" + D.fmtNum(plan.wordRange[1])),
      stat("Images", String(plan.images), plan.batches + " batches of 5 · one per paragraph"),
      stat("Video clips", String(plan.clips), "5–10 seconds each · Seedance 2.5"),
      stat("Strongest day", plan.star.date, "score " + plan.star.score + " · " + plan.star.hits + " hits · the climax"),
      stat("Thumbnail + SEO", "1 + 1", "bold text “" + plan.thumbnail.text + "” · " + plan.seo.tags.length + " tags")
    ]);
    $("stSections").textContent = plan.sections.map(function (s) { return s.at + " " + s.name + " (" + s.words + " words)"; }).join(" · ");
    D.fill($("stChecks"), NC.studio.checkLines(plan).map(function (line, i) {
      var bad = (i === 0 && (!k.wordsInRange || !k.paragraphsInRange || k.shortOrLong.length)) || (i === 1 && (k.etymology < 3 || k.today < 3 || !k.endsWithCta)) || (i === 2 && k.banned.length) || (i === 3 && (k.tagMissing.length || k.repeatedShots.length));
      return el("li" + (bad ? ".bad" : ""), { text: (bad ? "✕ " : "✓ ") + line });
    }));
    if (plan.usedHidden) $("stChecks").appendChild(el("li.bad", { text: "✕ Every projection is hidden by the event's filters, so the film reads the full cast, past days included." }));
  }

  /* ----------------------------------------------------------- the steps -- */
  function promptCard(head, line, prompt, foot, what) {
    return el("div.prompt-card", {}, [
      el("h3", { text: head }),
      line ? el("p.line", { text: "“" + line + "”" }) : null,
      el("p.prompt", { text: prompt }),
      el("div.foot", {}, [foot, copyBtn(prompt, what)])
    ]);
  }
  function batchNav(kind) {
    var nav = $("stBatchNav"), k = batch[kind], K = plan.batches;
    nav.hidden = false;
    $("stBatchLabel").textContent = "Batch " + (k + 1) + " of " + K;
    $("stPrev").disabled = k <= 0;
    $("stNext").disabled = k >= K - 1;
    $("stNext").textContent = k >= K - 1 ? "All " + K + " done" : "Next 5 ›";
  }
  function stepText() {
    if (!plan) return "";
    if (step === "script") return NC.studio.scriptText(plan);
    if (step === "cast") return plan.cast.map(function (c) { return c.name + " — Look Card: “" + c.card + "”"; }).join("\n\n") + "\n";
    if (step === "images") return NC.studio.batchesOf(plan.imagePrompts)[batch.images].map(function (im) { return NC.studio.imageBlock(plan, im); }).join("\n\n---\n\n") + "\n";
    if (step === "clips") return NC.studio.batchesOf(plan.clipPrompts)[batch.clips].map(function (c) { return NC.studio.clipBlock(plan, c); }).join("\n\n---\n\n") + "\n";
    if (step === "thumbnail") return "Thumbnail Prompt: “" + plan.thumbnail.prompt + "”\n";
    return "FINAL TITLE: " + plan.seo.title + "\n\nDESCRIPTION:\n\n" + plan.seo.description + "\n\nTAGS: " + plan.seo.tags.join(", ") + "\n";
  }
  function renderStep() {
    D.seg($("stSteps"), step, function (v) { step = v; renderStep(); });
    var body = $("stBody");
    if (!plan) return;
    $("stBatchNav").hidden = true;
    $("stCopyStep").textContent = step === "images" || step === "clips" ? "Copy this batch" : "Copy this step";
    if (step === "script") {
      D.fill(body, [
        el("p.hint", { text: "Only the spoken narration, one paragraph per scene, 15–40 words each. Read it straight into a microphone." }),
        el("ol.script-list", {}, plan.script.map(function (p) {
          // The space between the spans is for copied or spoken text; the grid ignores it.
          return el("li", {}, [el("span.sn", { text: "§" + p.n }), " ", el("span", {}, [p.text, el("small.meta", { text: plan.sections.find(function (s) { return s.key === p.section; }).name + " · " + p.words + " words · " + plan.imagePrompts[p.n - 1].shot })])]);
        }))
      ]);
    } else if (step === "cast") {
      D.fill(body, [
        el("p.hint", { text: "Pasted word for word into every image where the character appears, so the model draws them the same way each time." }),
        plan.cast.map(function (c) { return promptCard(c.name + (c.group ? " (group)" : ""), null, c.card, el("span", { text: "Look Card" }), c.name + "'s look card"); })
      ]);
    } else if (step === "images") {
      batchNav("images");
      var ims = NC.studio.batchesOf(plan.imagePrompts)[batch.images];
      D.fill(body, ims.map(function (im) {
        return promptCard("IMAGE " + im.n + " — for Script §" + im.paragraph, plan.script[im.paragraph - 1].text, im.prompt, el("span", { text: "Aspect Ratio: 16:9 Horizontal · " + im.shot }), "image " + im.n);
      }));
    } else if (step === "clips") {
      batchNav("clips");
      var cls = NC.studio.batchesOf(plan.clipPrompts)[batch.clips];
      D.fill(body, cls.map(function (c) {
        return promptCard("VIDEO CLIP " + c.n + " — from Image " + c.image, plan.script[c.n - 1].text, c.prompt, el("span", { text: "Duration: " + c.seconds + " seconds · Model: Seedance 2.5 · Aspect Ratio: 16:9" }), "clip " + c.n);
      }));
    } else if (step === "thumbnail") {
      D.fill(body, [promptCard("Thumbnail — bold text “" + plan.thumbnail.text + "”", null, plan.thumbnail.prompt, el("span", { text: "16:9 horizontal · 1–3 words over 40–60% of the frame" }), "the thumbnail prompt")]);
    } else {
      D.fill(body, [
        el("div.prompt-card", {}, [el("h3", { text: "Final title" }), el("p.prompt", { text: plan.seo.title }), el("div.foot", {}, [el("span", { text: plan.seo.title.length + " characters" }), copyBtn(plan.seo.title, "the title")])]),
        el("div.prompt-card", {}, [el("h3", { text: "Description" }), el("p.upload-desc", { text: plan.seo.description }), el("div.foot", {}, [el("span", { text: "hook · summary · timestamps · CTA · disclaimer · hashtags" }), copyBtn(plan.seo.description, "the description")])]),
        el("div.prompt-card", {}, [el("h3", { text: "Tags (" + plan.seo.tags.length + ")" }), el("ul.tag-list", {}, plan.seo.tags.map(function (t) { return el("li", { text: t }); })), el("div.foot", {}, [el("span", { text: "comma-separated for the upload form" }), copyBtn(plan.seo.tags.join(", "), "the tags")])])
      ]);
    }
  }

  function refresh(resetBatches) {
    if (resetBatches) batch = { images: 0, clips: 0 };
    rebuild(); renderPlan(); renderStep();
  }
  function render() { renderControls(); refresh(false); }
  function visible() { return !!$("stBody").offsetParent; }

  function init() {
    var textSetting = function (id, key) { $(id).addEventListener("change", function () { S.setSetting(key, this.value.trim()); refresh(true); }); };
    textSetting("stTitle", "studioTitle");
    textSetting("stAnchor", "studioAnchor");
    $("stEra").addEventListener("change", function () { S.setSetting("studioEra", this.value); refresh(true); });
    $("stVariation").addEventListener("change", function () {
      var v = Math.max(1, Math.min(19, parseInt(this.value, 10) || 1)); this.value = String(v);
      S.setSetting("studioVariation", v); refresh(true);
    });
    $("stPrev").addEventListener("click", function () { batch[step] = Math.max(0, batch[step] - 1); renderStep(); $("stBody").scrollIntoView({ block: "start" }); });
    $("stNext").addEventListener("click", function () { if (plan) batch[step] = Math.min(plan.batches - 1, batch[step] + 1); renderStep(); $("stBody").scrollIntoView({ block: "start" }); });
    $("stCopyStep").addEventListener("click", function () { copy(stepText(), step === "images" || step === "clips" ? "batch " + (batch[step] + 1) : "the " + STEPS[step].toLowerCase()); });
    $("stCopyAll").addEventListener("click", function () { if (plan) copy(NC.studio.toMarkdown(plan), "the whole package"); });
    $("stSave").addEventListener("click", function () {
      if (!plan) return;
      var name = fileBase() + "_documentary.md";
      D.download(name, NC.studio.toMarkdown(plan), "text/markdown;charset=utf-8");
      D.toast("Saved " + name);
    });
    S.on("results", function () { if (visible()) refresh(false); });
    S.on("switch", function () { if (visible()) render(); });
  }

  NC.studioView = { init: init, render: render, plan: function () { return plan; } };
})(typeof window !== "undefined" ? window : globalThis);
