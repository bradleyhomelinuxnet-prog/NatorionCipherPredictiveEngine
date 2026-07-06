# SECURITY — Ophis v12 findings

White-box review of the owner’s own software. Full narrative + citations in
[`Ophis_v12_ReverseEngineering_Report.md`](Ophis_v12_ReverseEngineering_Report.md) §6. This file is the quick reference.

## Threat model

Ophis is offline and single-user by design (the README recommends air-gapping it). The realistic attacker is therefore a
**malicious `.oph` preset file** shared in the user community (“seed this preset”) and double-clicked by a victim — the `.oph`
extension is registered to the app (`package.json:25–29`) and the `open-file` / second-instance handlers auto-load it
(`main.js:304–346, 532–548`). Under that model the two Critical findings chain to full host compromise from opening a shared file.

## Findings

| # | Severity | Summary | Anchor |
|---|---|---|---|
| 1 | **Critical** | `.oph` operation string → `new Function()` → renderer code execution. The math.js “validation” inspects a *stripped* skeleton (prefix removed, `oph_*` names deleted, `Y→10`) while `new Function` compiles the un-stripped body — validator ≠ executor. Import does no content-validation of the string, and the v12 GUI default `FILE_INPUT_VALIDATION_MODE__LOOSE` auto-repairs hostile files instead of rejecting them. | `ophis_model__validation.js:158`, `:104–121`, `:620–645`; `ophis_main.js:29` |
| 2 | **Critical** | `nodeIntegration:true` **confirmed**. `contextIsolation` unset (defaults true in Electron 39), so the page reaches Node via the `contextBridge` `electronBridge` API — and `autoSaveToFile(path, contents)` lands in a handler doing `fs.mkdirSync(recursive)` + `fs.writeFile` with **no path validation**. Any renderer code can write arbitrary content to an arbitrary path → persistent host execution. | `main.js:362–370`, `:113–120`, `:267–283`; `preload.js:4` |
| 3 | **High** | Sign-in gate is client-side theatre (author’s comment: “fake security camera”). 5 hard-coded, unsalted, single-round SHA-512 digests shipped in config — offline-crackable, bypassable by editing the flag. Latent crash: `sha512.min.js` is commented out of the bootstrap, so re-enabling the flag alone throws `ReferenceError` in init. | `ophis_config.js:291, 5–11`; `ophis_utils.js:664–666`; `ophis.html:67` |
| 4 | **Medium** | Main process pushes file data into the renderer by concatenating JS for `executeJavaScript`, with an escaper that only handles `\` and `"`. Closed on modern V8, but fragile hand-rolled escaping on a privileged sink. | `main.js:338, 299, 540`, `:26–33` |
| 5 | **Low** | Headless CLI: file-derived strings reach the log stream unsanitised via `console.* → logToCli → console.log`, enabling fake log lines / terminal-escape injection. | `ophis_logging.js`; `main.js:201–203`; `ophis_view__export.js:91,125` |
| — | Info | CSP allows `unsafe-eval`+`unsafe-inline`; `debugger;` shipped; DevTools reachable via View menu; dev-style cache-buster loader. | `ophis.html:72`; `main.js:739` |

## Remediation status

Proposed fixes (report §7/§8). A working proof-of-fix for #1 ships in this repo:
[`Ophis_v12_Hardened_Engine_Lab.html`](Ophis_v12_Hardened_Engine_Lab.html) — a sandboxed recursive-descent parser that replaces
`new Function()`, self-verifying **parity** (identical output on all 16 shipped ops) and **injection resistance** (10/10 payloads
blocked) in the browser.

- [ ] **#1** Replace `new Function` with the parser (drop-in; see the lab). Then remove `'unsafe-eval'` from the CSP.
- [ ] **#2** `nodeIntegration:false`, `contextIsolation:true` (explicit), `sandbox:true`; confine every IPC write path (reject absolute/`..`, jail to an allowed dir; prefer `dialog.showSaveDialog`).
- [ ] **#3** Remove the client-side gate or move auth server-side; don’t ship secrets in `ophis_config.js`.
- [ ] **#4** Pass structured data over IPC instead of building JS strings.
- [ ] **#5** Sanitise/escape strings before they reach the CLI log stream.
- [ ] **Rewrites** HTML-escape the anchor `label` before `innerHTML` (`PSYFR1.html:960, 981`); replace their own `new Function` with the same parser.

## Disclosure

This is a self-review of the owner’s own application; there is no third party to notify. If the app is ever distributed to
others, treat #1 and #2 as fix-before-ship blockers.
