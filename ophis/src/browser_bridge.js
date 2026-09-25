/*
 * browser_bridge.js — the browser build's replacement for Electron.
 *
 * The desktop build of Ophis v12 is the renderer you see in this folder wrapped in Electron.
 * Electron contributes exactly three things, all of which live in main.js / preload.js:
 *
 *   1. window.electronBridge — the IPC surface the renderer calls (open / save / quit / log).
 *   2. The native application menu (File / Edit / View) whose items call renderer functions
 *      by name through webContents.executeJavaScript().
 *   3. Calling init() once the page has loaded, plus close interception and file association.
 *
 * This file provides all three with browser APIs and nothing else. The renderer's own code is
 * untouched: because window.electronBridge exists, isRunningElectron() returns true and every
 * Electron-mode code path in the renderer (Save / Save As / Open, the "(Saved)" reminder,
 * options-only localStorage, no autosave) runs exactly as it does in the .exe.
 *
 * Mapping of the Electron bridge to the browser:
 *
 *   openFileExplorer   showOpenFilePicker()   (fallback: <input type=file accept=.oph>)
 *   saveFileAs         showSaveFilePicker()   (fallback: prompt for a name, then download)
 *   autoSaveToFile     write to the remembered file handle (fallback: download)
 *   openOphFile        read a dropped file or a remembered handle
 *   confirmCloseApp    window.close(), with a note if the browser refuses
 *   resetProgram       location.reload()
 *   onSignedIn / refreshMenuOptions   enable menu items / tick the checkbox items
 *   logToCli / closeAppWithHeadless*  console only (headless mode is a CLI feature)
 *
 * Differences a web page forces on top of that mapping:
 *
 *   - The published site shares one origin (and so one localStorage) with the other apps in this
 *     repository. Reset Program's localStorage.clear() removes only the key Ophis itself uses.
 *   - The headless_* URL parameters that drive the exe's command-line mode are removed before
 *     init(): in a browser that mode has nowhere to write and only hangs the page.
 *   - File pickers need a recent click or key press, so an Open that follows a slow answer to
 *     "not saved" asks for one more click instead of failing silently.
 *   - Off-site links in the app's help text open in a new tab instead of replacing the app.
 */
(function () {
    'use strict';

    var MENUBAR_HEIGHT_PX = 30;
    var OPH_FILE_TYPES = [{ description: 'OPH Files', accept: { 'application/json': ['.oph'] } }];

    // The only localStorage key the renderer uses: SERIALIZED_FIELD__LOCAL_STORAGE_SAVE_BLOB in
    // ophis_config.js (read in ophis_main.js, written in ophis_model__persistence.js).
    var OPHIS_STORAGE_KEY_FALLBACK = 'save_blob';

    // The renderer replaces console.log while in headless mode and routes it to logToCli
    // (ophis_logging.js), so the bridge keeps the browser's own console.log for itself.
    var nativeConsoleLog = console.log.bind(console);

    var hasFsAccess = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';

    var fileHandles = {};      // file name -> FileSystemFileHandle (so "Save" writes back to the same file)
    var droppedFiles = {};     // file name -> File (from drag-and-drop, when no handle is available)
    var pendingDrop = null;    // the last dropped .oph, until the renderer asks to open it
    var menuState = { signedIn: false, operationsColVisible: false, prettify: false, minify: false };
    var suppressUnloadWarning = false;
    var zoomLevel = 0;
    var initCalled = false;

    // ------------------------------------------------------------------ helpers

    function log(message) {
        nativeConsoleLog('browser_bridge: ' + message);
    }

    // Electron reached renderer functions by name through executeJavaScript(); we do the same
    // through window, so the renderer keeps its exact entry points.
    function callRenderer(name, args) {
        var fn = window[name];
        if (typeof fn === 'function') {
            return fn.apply(window, args || []);
        }
        log('renderer function not found: ' + name);
    }

    // showToast() and showDialog() insert their text as HTML, so anything taken from a file name is escaped.
    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function toast(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        } else {
            alert(message);
        }
    }

    // A file picker may only open during a click or key press (Chrome allows about five seconds).
    // The renderer's "not saved" confirm() can outlast that, so ask for one more click.
    function userGestureExpired() {
        return !!(navigator.userActivation && navigator.userActivation.isActive === false);
    }

    function askForClick(message, buttonLabel, retry) {
        if (typeof window.showDialog === 'function') {
            window.showDialog(message, 'Cancel', buttonLabel, retry);
        } else {
            toast(message + ' Use the File menu again.');
        }
    }

    function reportPickerError(err) {
        nativeConsoleLog(String(err));
        toast('Could not show the file dialog, see console for details.');
    }

    function baseName(path) {
        return String(path || '').split(/[\\/]/).pop();
    }

    function currentFileName() {
        try {
            return baseName(appState.globalOptions[GLOBAL_OPTION__CURRENT_FILE_PATH]);
        } catch (e) {
            return '';
        }
    }

    function ensureOphExtension(name) {
        return /\.oph$/i.test(name) ? name : name + '.oph';
    }

    function download(fileName, contents) {
        var blob = new Blob([contents], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // Without the File System Access API (Firefox, Safari) a save is a download: say where it went.
    function downloadCopy(fileName, contents) {
        download(fileName, contents);
        toast('Downloaded "' + escapeHtml(fileName) + '". This browser cannot write to files directly, so each save is a new download.');
    }

    async function ensureWritable(handle) {
        if (typeof handle.queryPermission !== 'function') {
            return;
        }
        var options = { mode: 'readwrite' };
        if ((await handle.queryPermission(options)) === 'granted') {
            return;
        }
        if ((await handle.requestPermission(options)) !== 'granted') {
            throw new Error('Write permission to "' + handle.name + '" was not granted.');
        }
    }

    async function writeToHandle(handle, contents) {
        await ensureWritable(handle);
        var writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
    }

    function reportSaveError(err) {
        nativeConsoleLog(String(err));
        callRenderer('onSaveToFileError', ['Got error saving json string, see above.']);
    }

    // Mirrors main.js openOphFile(): parse, re-stringify, hand the text to the renderer.
    function deliverOphText(fileName, text, checkForUnsavedChanges) {
        log('About to open file: ' + fileName);
        try {
            var parsed = JSON.parse(text);
            if (parsed) {
                callRenderer('onOphFileOpened', [fileName, JSON.stringify(parsed), checkForUnsavedChanges === true]);
            } else {
                callRenderer('onOphFileOpenError', [fileName, 'Got null parsing json string.']);
            }
        } catch (err) {
            nativeConsoleLog(String(err));
            callRenderer('onOphFileOpenError', [fileName, 'Got error opening file or parsing json string, see above.']);
        }
    }

    function reportReadError(fileName, err) {
        nativeConsoleLog(String(err));
        callRenderer('onOphFileOpenError', [fileName, 'Got error opening file or parsing json string, see above.']);
    }

    function isAbort(err) {
        return err && err.name === 'AbortError';
    }

    // ------------------------------------------------------------------ the bridge

    var hiddenFileInput = null;

    function getHiddenFileInput() {
        if (!hiddenFileInput) {
            hiddenFileInput = document.createElement('input');
            hiddenFileInput.type = 'file';
            hiddenFileInput.accept = '.oph,application/json';
            hiddenFileInput.style.display = 'none';
            hiddenFileInput.addEventListener('change', function () {
                var file = hiddenFileInput.files && hiddenFileInput.files[0];
                if (!file) {
                    return;
                }
                log('Chose file to open: ' + file.name);
                file.text().then(function (text) {
                    droppedFiles[file.name] = file;
                    deliverOphText(file.name, text, false);
                }).catch(function (err) {
                    reportReadError(file.name, err);
                });
            });
            document.body.appendChild(hiddenFileInput);
        }
        return hiddenFileInput;
    }

    async function openFileExplorer() {
        if (userGestureExpired()) {
            askForClick('Choose the .oph file to open.', 'Choose file…', openFileExplorer);
            return;
        }
        if (hasFsAccess) {
            var handles;
            try {
                handles = await window.showOpenFilePicker({ types: OPH_FILE_TYPES, multiple: false });
            } catch (err) {
                if (!isAbort(err)) { reportPickerError(err); }
                return;
            }
            var handle = handles[0];
            var file;
            var text;
            try {
                file = await handle.getFile();
                text = await file.text();
            } catch (err) {
                reportReadError(handle.name, err);
                return;
            }
            fileHandles[file.name] = handle;
            log('Chose file to open: ' + file.name);
            deliverOphText(file.name, text, false);
        } else {
            var input = getHiddenFileInput();
            input.value = '';
            input.click();
        }
    }

    async function saveFileAs(fileContents) {
        var suggested = currentFileName() || 'untitled.oph';

        if (hasFsAccess) {
            if (userGestureExpired()) {
                askForClick('Choose where to save the file.', 'Save As…', function () { saveFileAs(fileContents); });
                return;
            }
            var handle;
            try {
                handle = await window.showSaveFilePicker({ suggestedName: suggested, types: OPH_FILE_TYPES });
            } catch (err) {
                if (!isAbort(err)) { reportPickerError(err); }
                return;
            }
            log('About to save to file: ' + handle.name);
            try {
                await writeToHandle(handle, fileContents);
            } catch (err) {
                // The renderer only marks the session saved in onSaveAsSuccess, so its state is still right.
                reportSaveError(err);
                return;
            }
            fileHandles[handle.name] = handle;
            callRenderer('onSaveAsSuccess', [handle.name]);
        } else {
            var name = window.prompt('Save As — enter a file name:', suggested);
            name = name === null ? '' : name.trim();
            if (!name) {
                return;
            }
            name = ensureOphExtension(name);
            log('About to save to file: ' + name);
            downloadCopy(name, fileContents);
            callRenderer('onSaveAsSuccess', [name]);
        }
    }

    async function autoSaveToFile(filePath, fileContents) {
        var name = baseName(filePath);
        var handle = fileHandles[name];
        if (handle) {
            try {
                await writeToHandle(handle, fileContents);
            } catch (err) {
                reportSaveError(err);
                // Save (flushChangesToDisk(true)) marked the session saved without waiting for this
                // write. A plain flushChangesToDisk() is what every edit calls under Electron: it sets
                // hasUnsavedChanges, stores only the options in localStorage and shows "(Not Saved)".
                // It does not call autoSaveToFile again.
                callRenderer('flushChangesToDisk');
            }
        } else {
            downloadCopy(name, fileContents);
        }
    }

    async function openOphFile(filePath) {
        var name = baseName(filePath);
        try {
            if (pendingDrop && pendingDrop.name === name) {
                // The renderer is opening the file just dropped. Only now does it replace whatever an
                // earlier file of the same name left behind; a drop without a writable handle clears
                // the old handle, so Save downloads instead of writing into that other file.
                var drop = pendingDrop;
                pendingDrop = null;
                var dropHandle = await drop.handlePromise;
                droppedFiles[name] = drop.file;
                if (dropHandle && dropHandle.kind === 'file') {
                    fileHandles[name] = dropHandle;
                } else {
                    delete fileHandles[name];
                }
                deliverOphText(name, await drop.file.text(), false);
            } else if (fileHandles[name]) {
                var file = await fileHandles[name].getFile();
                deliverOphText(name, await file.text(), false);
            } else if (droppedFiles[name]) {
                deliverOphText(name, await droppedFiles[name].text(), false);
            } else {
                callRenderer('onOphFileOpenError', [name, 'The browser has no access to that path. Use File > Open... instead.']);
            }
        } catch (err) {
            reportReadError(name, err);
        }
    }

    function confirmCloseApp() {
        log('Confirmed quit.');
        suppressUnloadWarning = true;
        window.close();
        setTimeout(function () {
            suppressUnloadWarning = false;
            toast('Ophis cannot close this tab itself — close the browser tab to quit.');
        }, 400);
    }

    function resetProgram() {
        log('Resetting program');
        suppressUnloadWarning = true;
        window.location.reload();
    }

    window.electronBridge = {
        autoSaveToFile: async function (filePath, fileContents) { return autoSaveToFile(filePath, fileContents); },
        saveFileAs: async function (fileContents) { return saveFileAs(fileContents); },
        openOphFile: async function (filePath) { return openOphFile(filePath); },
        openFileExplorer: async function () { return openFileExplorer(); },
        confirmCloseApp: async function () { return confirmCloseApp(); },
        onSignedIn: async function () { menuState.signedIn = true; renderMenuState(); },
        // Must not use console.log: in headless mode that is the renderer's override, which calls
        // logToCli again (ophis_logging.js), and the page would recurse until it hangs.
        logToCli: async function (message) { nativeConsoleLog(message); },
        closeAppWithHeadlessError: async function () { log('headless error exit requested (no-op in the browser)'); },
        closeAppWithHeadlessSuccess: async function () { log('headless success exit requested (no-op in the browser)'); },
        resetProgram: async function () { return resetProgram(); },
        refreshMenuOptions: async function (operationsColVisibleChecked, prettifyOphFilesChecked, minifyOphFilesChecked) {
            menuState.signedIn = true;
            menuState.operationsColVisible = operationsColVisibleChecked === true;
            menuState.prettify = prettifyOphFilesChecked === true;
            menuState.minify = minifyOphFilesChecked === true;
            renderMenuState();
        }
    };

    // ------------------------------------------------------------------ the menu bar
    //
    // Same template as refreshMenu() in main.js, minus the items a web page cannot provide
    // (Toggle Developer Tools — use F12).

    function toggleFullScreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    }

    // Electron zooms in steps of 0.5 zoom levels; each level is a factor of 1.2.
    function setZoomLevel(level) {
        zoomLevel = Math.max(-5, Math.min(5, level));
        var factor = Math.pow(1.2, zoomLevel);
        document.documentElement.style.zoom = zoomLevel === 0 ? '' : String(factor);
        if (typeof window.onresize === 'function') {
            window.onresize();
        }
    }

    function editCommand(command) {
        return function () {
            if (command === 'paste') {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function (text) {
                        document.execCommand('insertText', false, text);
                    }).catch(function () {
                        toast('Paste with Ctrl+V.');
                    });
                } else {
                    toast('Paste with Ctrl+V.');
                }
            } else {
                document.execCommand(command);
            }
        };
    }

    var MENU_TEMPLATE = [
        {
            label: 'File',
            items: [
                { id: 'new-file', label: 'New File', accelerator: 'Ctrl+N', requiresSignIn: true,
                  click: function () { callRenderer('electronBridgeIncoming_startNewFile'); } },
                { id: 'open', label: 'Open...', accelerator: 'Ctrl+O', requiresSignIn: true,
                  click: function () { callRenderer('electronBridgeIncoming_openFileExplorer'); } },
                { id: 'save', label: 'Save', accelerator: 'Ctrl+S',
                  click: function () { callRenderer('electronBridgeIncoming_onSaveClickedFromFileMenu'); } },
                { id: 'save-as', label: 'Save As...', requiresSignIn: true,
                  click: function () { callRenderer('electronBridgeIncoming_onSaveAsClickedFromFileMenu'); } },
                { id: 'quit', label: 'Quit', accelerator: 'Ctrl+Q',
                  click: function () { callRenderer('onCloseAppRequested'); } },
                { separator: true },
                { id: 'prettify', label: 'Prettify .oph Files', checkbox: 'prettify',
                  click: function () { callRenderer('togglePrettifyOphFiles'); } },
                { id: 'minify', label: 'Minify .oph Files', checkbox: 'minify',
                  click: function () { callRenderer('toggleMinifyOphFiles'); } },
                { separator: true },
                { id: 'reset-program', label: 'Reset Program',
                  click: function () { callRenderer('factoryReset'); } }
            ]
        },
        {
            label: 'Edit',
            items: [
                { id: 'cut', label: 'Cut', accelerator: 'Ctrl+X', click: editCommand('cut') },
                { id: 'copy', label: 'Copy', accelerator: 'Ctrl+C', click: editCommand('copy') },
                { id: 'paste', label: 'Paste', accelerator: 'Ctrl+V', click: editCommand('paste') },
                { id: 'delete', label: 'Delete', click: editCommand('delete') },
                { separator: true },
                { id: 'select-all', label: 'Select All', accelerator: 'Ctrl+A', click: editCommand('selectAll') }
            ]
        },
        {
            label: 'View',
            items: [
                { id: 'operations-col', label: 'Operations Col Visible', checkbox: 'operationsColVisible',
                  click: function () { callRenderer('toggleOperationsColVisible'); } },
                { separator: true },
                { id: 'reset-zoom', label: 'Actual Size', accelerator: 'Ctrl+0', click: function () { setZoomLevel(0); } },
                { id: 'zoom-in', label: 'Zoom In', accelerator: 'Ctrl+=', click: function () { setZoomLevel(zoomLevel + 0.5); } },
                { id: 'zoom-out', label: 'Zoom Out', accelerator: 'Ctrl+-', click: function () { setZoomLevel(zoomLevel - 0.5); } },
                { id: 'fullscreen', label: 'Toggle Full Screen', accelerator: 'F11', click: toggleFullScreen }
            ]
        }
    ];

    var menubarElem = null;
    var itemElems = {};
    var openMenu = null;

    function closeMenus() {
        if (openMenu) {
            openMenu.classList.remove('ophis-menu--open');
            openMenu = null;
        }
    }

    function openMenuElem(menuElem) {
        if (openMenu === menuElem) {
            return;
        }
        closeMenus();
        openMenu = menuElem;
        menuElem.classList.add('ophis-menu--open');
    }

    function renderMenuState() {
        Object.keys(itemElems).forEach(function (id) {
            var entry = itemElems[id];
            var disabled = entry.spec.requiresSignIn === true && menuState.signedIn !== true;
            entry.elem.disabled = disabled;
            entry.elem.classList.toggle('ophis-menu-item--disabled', disabled);
            if (entry.spec.checkbox) {
                var checked = menuState[entry.spec.checkbox] === true;
                entry.elem.classList.toggle('ophis-menu-item--checked', checked);
                entry.elem.setAttribute('aria-checked', checked ? 'true' : 'false');
            }
        });
    }

    function buildMenuItem(spec) {
        if (spec.separator) {
            var sep = document.createElement('div');
            sep.className = 'ophis-menu-separator';
            sep.setAttribute('role', 'separator');
            return sep;
        }
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'ophis-menu-item';
        button.setAttribute('role', spec.checkbox ? 'menuitemcheckbox' : 'menuitem');
        button.tabIndex = -1;

        var check = document.createElement('span');
        check.className = 'ophis-menu-check';
        check.textContent = '✓';
        button.appendChild(check);

        var label = document.createElement('span');
        label.className = 'ophis-menu-label';
        label.textContent = spec.label;
        button.appendChild(label);

        if (spec.accelerator) {
            var accel = document.createElement('span');
            accel.className = 'ophis-menu-accel';
            accel.textContent = spec.accelerator;
            button.appendChild(accel);
        }

        button.addEventListener('click', function (event) {
            event.stopPropagation();
            closeMenus();
            if (!button.disabled) {
                spec.click();
            }
        });

        itemElems[spec.id] = { spec: spec, elem: button };
        return button;
    }

    function buildMenubar() {
        menubarElem = document.createElement('div');
        menubarElem.id = 'ophis-menubar';
        menubarElem.setAttribute('role', 'menubar');

        MENU_TEMPLATE.forEach(function (menuSpec) {
            var menuElem = document.createElement('div');
            menuElem.className = 'ophis-menu';

            var title = document.createElement('button');
            title.type = 'button';
            title.className = 'ophis-menu-title';
            title.textContent = menuSpec.label;
            title.setAttribute('aria-haspopup', 'true');
            title.tabIndex = -1;
            title.addEventListener('click', function (event) {
                event.stopPropagation();
                if (openMenu === menuElem) {
                    closeMenus();
                } else {
                    openMenuElem(menuElem);
                }
            });
            title.addEventListener('mouseenter', function () {
                if (openMenu && openMenu !== menuElem) {
                    openMenuElem(menuElem);
                }
            });
            menuElem.appendChild(title);

            var list = document.createElement('div');
            list.className = 'ophis-menu-items';
            list.setAttribute('role', 'menu');
            menuSpec.items.forEach(function (itemSpec) {
                list.appendChild(buildMenuItem(itemSpec));
            });
            menuElem.appendChild(list);

            menubarElem.appendChild(menuElem);
        });

        var brand = document.createElement('span');
        brand.className = 'ophis-menubar-brand';
        brand.textContent = 'Ophis';
        menubarElem.appendChild(brand);

        document.body.insertBefore(menubarElem, document.body.firstChild);
        document.documentElement.style.setProperty('--ophis-menubar-height', MENUBAR_HEIGHT_PX + 'px');
        renderMenuState();

        document.addEventListener('click', closeMenus);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeMenus();
            }
        });
    }

    // Keyboard accelerators. Ctrl+N is reserved by most browsers and cannot be intercepted;
    // the others work where the browser passes them to the page (Cmd+Q on a Mac never arrives).
    function installAccelerators() {
        document.addEventListener('keydown', function (event) {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) {
                return;
            }
            var key = event.key.toLowerCase();
            var handled = true;
            if (key === 's') {
                callRenderer('electronBridgeIncoming_onSaveClickedFromFileMenu');
            } else if (key === 'o') {
                callRenderer('electronBridgeIncoming_openFileExplorer');
            } else if (key === 'n') {
                callRenderer('electronBridgeIncoming_startNewFile');
            } else if (key === 'q') {
                callRenderer('onCloseAppRequested');
            } else {
                handled = false;
            }
            if (handled) {
                event.preventDefault();
            }
        }, true);
    }

    // Opening a .oph by dropping it on the window: the browser's equivalent of the .oph file
    // association (app.on('open-file') / second-instance argv in main.js).
    function installDragAndDrop() {
        function hasFiles(dataTransfer) {
            return !!dataTransfer && Array.prototype.indexOf.call(dataTransfer.types || [], 'Files') >= 0;
        }
        function ophFileFrom(dataTransfer) {
            // Walk the items rather than dataTransfer.files: getAsFileSystemHandle() lives on the item,
            // and the two lists need not line up when the drag also carries text or links.
            var items = dataTransfer.items || [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    var itemFile = items[i].getAsFile();
                    if (itemFile && /\.oph$/i.test(itemFile.name)) {
                        return { file: itemFile, item: items[i] };
                    }
                }
            }
            var files = dataTransfer.files || [];
            for (var j = 0; j < files.length; j++) {
                if (/\.oph$/i.test(files[j].name)) {
                    return { file: files[j], item: null };
                }
            }
            return null;
        }
        document.addEventListener('dragover', function (event) {
            if (hasFiles(event.dataTransfer)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            }
        });
        document.addEventListener('drop', function (event) {
            if (!hasFiles(event.dataTransfer)) {
                return;   // text dragged into an input: let the browser insert it
            }
            // Always cancel a file drop, or the browser leaves the app to show the file.
            event.preventDefault();
            var found = ophFileFrom(event.dataTransfer);
            if (!found) {
                toast('Only .oph files can be opened here.');
                return;
            }
            // getAsFileSystemHandle() only works during this event, so ask for the handle now. It is
            // bound to the file name only when the renderer opens this drop (openOphFile): until then
            // an earlier file with the same name keeps its own handle and contents.
            var handlePromise = (found.item && typeof found.item.getAsFileSystemHandle === 'function')
                ? found.item.getAsFileSystemHandle().catch(function () { return null; })
                : Promise.resolve(null);
            pendingDrop = { name: found.file.name, file: found.file, handlePromise: handlePromise };
            log('Received open-file: ' + found.file.name);
            callRenderer('onOphFileOpenedFromOutsideApp', [found.file.name]);
        });
    }

    // Links in the renderer's help text (e.g. the NASA eclipse page) have no target. Inside the exe
    // they never replaced the app; here they would navigate away from it, so open them in a new tab.
    function installExternalLinkGuard() {
        document.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
                return;
            }
            var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!link || link.target || link.hasAttribute('download')) {
                return;
            }
            if (!/^https?:$/.test(link.protocol) || link.origin === window.location.origin) {
                return;
            }
            event.preventDefault();
            window.open(link.href, '_blank', 'noopener');
        });
    }

    // GitHub Pages serves this app, natorion/ and web/ from one origin, so they share localStorage.
    // The renderer's Reset Program calls localStorage.clear() (ophis_controller.js); here that removes
    // only the key Ophis uses and leaves the other apps' saved sessions alone.
    function scopeLocalStorageClear() {
        var nativeClear = Storage.prototype.clear;
        Storage.prototype.clear = function () {
            var local = null;
            try { local = window.localStorage; } catch (e) { /* storage blocked */ }
            if (local !== null && this === local) {
                var key = typeof window.SERIALIZED_FIELD__LOCAL_STORAGE_SAVE_BLOB === 'string'
                    ? window.SERIALIZED_FIELD__LOCAL_STORAGE_SAVE_BLOB
                    : OPHIS_STORAGE_KEY_FALLBACK;
                this.removeItem(key);
                return undefined;
            }
            return nativeClear.apply(this, arguments);
        };
    }

    // Electron intercepts the window close and asks the renderer (onCloseAppRequested), which
    // confirms when there are unsaved changes. The browser's equivalent is beforeunload.
    function installCloseGuard() {
        window.addEventListener('beforeunload', function (event) {
            if (suppressUnloadWarning) {
                return undefined;
            }
            var unsaved = false;
            try { unsaved = appState.hasUnsavedChanges === true; } catch (e) { /* not initialised yet */ }
            if (unsaved) {
                event.preventDefault();
                event.returnValue = 'The current session is not saved to file.';
                return event.returnValue;
            }
            return undefined;
        });
    }

    // ------------------------------------------------------------------ start-up

    // The exe's command-line mode (--headless, --output-path …) reaches the renderer as headless*
    // query parameters. A browser has nowhere to write its output, and the mode replaces the
    // console and skips the UI, so a link carrying them would leave a blank or frozen page.
    function dropHeadlessParameters() {
        var params;
        try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
        var names = [];
        params.forEach(function (value, name) {
            if (name === 'headless' || name.indexOf('headless_') === 0) {
                names.push(name);
            }
        });
        if (names.length === 0) {
            return;
        }
        names.forEach(function (name) { params.delete(name); });
        var query = params.toString();
        try {
            window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
            log('headless mode belongs to the desktop exe; ignoring ' + names.join(', '));
        } catch (err) {
            log('could not remove ' + names.join(', ') + ' from the address: ' + err);
        }
    }

    function callInitOnce() {
        if (initCalled) {
            return;
        }
        initCalled = true;
        dropHeadlessParameters();
        if (typeof window.init === 'function') {
            log('did-finish-load; calling init()');
            window.init();
        } else {
            console.error('browser_bridge: init() is not defined — the renderer scripts did not load.');
        }
    }

    scopeLocalStorageClear();

    document.addEventListener('DOMContentLoaded', function () {
        buildMenubar();
        installAccelerators();
        installDragAndDrop();
        installCloseGuard();
        installExternalLinkGuard();
    });

    window.ophisBrowserBridge = {
        // index.html hands us the last renderer <script> so init() runs after every module is in.
        start: function (lastScriptElem) {
            if (lastScriptElem) {
                lastScriptElem.addEventListener('load', callInitOnce);
            }
            window.addEventListener('load', callInitOnce);
        },
        hasFileSystemAccess: hasFsAccess,
        menubarHeightPx: MENUBAR_HEIGHT_PX
    };
})();
