// ==UserScript==
// @name         Aither - Sequential Bulk Torrent Downloader
// @namespace    https://github.com/Moreasan/trackers-userscripts
// @version      0.1.1
// @description  Sequentially downloads torrents from an Aither user torrent list, with pagination, throttling, progress, and copyable diagnostics.
// @author       Moreasan
// @match        https://aither.cc/users/*/torrents*
// @match        https://aither.cc/torrents/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "aither-bulk-download-state-v1";
  const SETTINGS_KEY = "aither-bulk-download-settings-v1";
  const LOG_LIMIT = 200;

  const DEFAULT_SETTINGS = {
    delaySeconds: 45,
    jitterSeconds: 0,
    pauseEvery: 0,
    pauseSeconds: 300,
    autoStart: false,
  };

  const isListPage =
    location.pathname.includes("/users/") &&
    location.pathname.endsWith("/torrents");
  const isTorrentPage = /^\/torrents\/\d+$/.test(location.pathname);

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const getSettings = () => ({
    ...DEFAULT_SETTINGS,
    ...readJson(SETTINGS_KEY, {}),
  });

  const saveSettings = settings =>
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  const getState = () => readJson(STORAGE_KEY, null);
  const saveState = state =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const clearState = () => localStorage.removeItem(STORAGE_KEY);

  function safeUrl(raw) {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return new URL("/" + raw.replace(/^\/+/, ""), location.origin).href;
  }

  function publicUrl(raw) {
    try {
      const url = new URL(raw, location.href);
      url.pathname = url.pathname.replace(/\/users\/[^/]+/, "/users/<redacted>");
      return url.href;
    } catch {
      return "<invalid-url>";
    }
  }

  function logEvent(state, level, message, details = {}) {
    state.logs ||= [];
    state.logs.push({
      time: new Date().toISOString(),
      level,
      message,
      details,
    });
    if (state.logs.length > LOG_LIMIT) {
      state.logs = state.logs.slice(-LOG_LIMIT);
    }
    saveState(state);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function pageHasStopSignal() {
    const text = document.body?.innerText || "";
    return /captcha|too many requests|rate.?limit|error 429|access denied/i.test(text);
  }

  function createPanel() {
    let panel = document.querySelector("#aither-bulk-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "aither-bulk-panel";
    panel.innerHTML = `
      <div class="aither-title">Aither bulk downloader</div>
      <div class="aither-status">Idle</div>
      <div class="aither-progress"></div>
      <div class="aither-controls">
        <button data-action="start">Start</button>
        <button data-action="pause">Pause</button>
        <button data-action="stop">Stop</button>
        <button data-action="settings">Settings</button>
        <button data-action="debug">Copy debug</button>
      </div>
      <div class="aither-settings" hidden>
        <label>Delay seconds <input name="delaySeconds" type="number" min="1"></label>
        <label>Random jitter seconds <input name="jitterSeconds" type="number" min="0"></label>
        <label>Pause every N downloads <input name="pauseEvery" type="number" min="0"></label>
        <label>Pause duration seconds <input name="pauseSeconds" type="number" min="1"></label>
        <button data-action="save-settings">Save settings</button>
      </div>
      <textarea class="aither-debug" hidden readonly></textarea>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #aither-bulk-panel {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        width: 290px; padding: 12px; color: #fff; background: #202124;
        border: 1px solid #555; border-radius: 7px; box-shadow: 0 3px 14px #0008;
        font: 13px/1.45 Arial, sans-serif;
      }
      #aither-bulk-panel .aither-title { font-weight: 700; margin-bottom: 5px; }
      #aither-bulk-panel .aither-progress { margin: 5px 0 8px; color: #ddd; }
      #aither-bulk-panel button { margin: 2px; padding: 4px 7px; cursor: pointer; }
      #aither-bulk-panel label { display: block; margin: 5px 0; }
      #aither-bulk-panel input { width: 70px; float: right; }
      #aither-bulk-panel textarea { width: 100%; height: 110px; margin-top: 8px; box-sizing: border-box; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);

    panel.querySelector('[data-action="start"]').onclick = start;
    panel.querySelector('[data-action="pause"]').onclick = pause;
    panel.querySelector('[data-action="stop"]').onclick = stop;
    panel.querySelector('[data-action="settings"]').onclick = toggleSettings;
    panel.querySelector('[data-action="save-settings"]').onclick = saveSettingsFromPanel;
    panel.querySelector('[data-action="debug"]').onclick = copyDebug;

    return panel;
  }

  function updatePanel(state, status = "") {
    const panel = createPanel();
    const settings = getSettings();
    const current = state?.queue?.[state?.index] || "";
    const progress = state
      ? `Completed: ${state.completed}<br>
         Page: ${state.pageNumber}<br>
         Page queue: ${state.index}/${state.queue.length}<br>
         Pages visited: ${state.pagesSeen.length}<br>
         Current: ${current ? publicUrl(current) : "none"}`
      : `Delay: ${settings.delaySeconds}s`;

    panel.querySelector(".aither-status").textContent = status || state?.phase || "Idle";
    panel.querySelector(".aither-progress").innerHTML = progress;

    const inputs = panel.querySelectorAll(".aither-settings input");
    const values = getSettings();
    inputs.forEach(input => {
      input.value = values[input.name];
    });
  }

  function toggleSettings() {
    const panel = createPanel();
    const settings = panel.querySelector(".aither-settings");
    settings.hidden = !settings.hidden;
  }

  function saveSettingsFromPanel() {
    const panel = createPanel();
    const settings = {};
    panel.querySelectorAll(".aither-settings input").forEach(input => {
      settings[input.name] = Math.max(0, Number(input.value) || 0);
    });
    settings.delaySeconds = Math.max(1, settings.delaySeconds);
    settings.pauseSeconds = Math.max(1, settings.pauseSeconds);
    saveSettings(settings);
    updatePanel(getState(), "Settings saved");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.querySelector(".aither-debug");
      area.hidden = false;
      area.value = text;
      area.focus();
      area.select();
      return false;
    }
  }

  async function copyDebug() {
    const state = getState();
    const settings = getSettings();
    const report = {
      script: "Aither - Sequential Torrent Downloader",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      page: publicUrl(location.href),
      userAgent: navigator.userAgent,
      settings,
      state: state
        ? {
            phase: state.phase,
            completed: state.completed,
            pageNumber: state.pageNumber,
            queueLength: state.queue.length,
            queueIndex: state.index,
            pagesSeen: state.pagesSeen.map(publicUrl),
            seenCount: state.seen.length,
            nextPage: state.nextPage ? publicUrl(state.nextPage) : null,
            logs: state.logs || [],
          }
        : null,
    };

    const copied = await copyText(JSON.stringify(report, null, 2));
    updatePanel(state, copied ? "Debug copied" : "Select debug text and copy it");
  }

  function start() {
    if (!isListPage) {
      alert("Start the downloader from the filtered user torrents list page.");
      return;
    }

    const existing = getState();
    if (existing && !confirm("Resume the existing downloader state?")) {
      clearState();
    }

    const state = getState() || {
      phase: "collecting",
      pageNumber: 0,
      completed: 0,
      index: 0,
      queue: [],
      seen: [],
      pagesSeen: [],
      nextPage: null,
      logs: [],
    };

    state.phase = "collecting";
    logEvent(state, "info", "Started", { page: publicUrl(location.href) });
    collectPage(state);
    continueProcessing(state);
  }

  function pause() {
    const state = getState();
    if (!state) return;
    state.phase = "paused";
    logEvent(state, "info", "Paused by user");
    updatePanel(state, "Paused");
  }

  function stop() {
    const state = getState();
    if (state) logEvent(state, "info", "Stopped by user");
    clearState();
    updatePanel(null, "Stopped");
  }

  function collectPage(state) {
    const pageUrl = location.href;
    if (state.pagesSeen.includes(pageUrl)) return;

    state.queue = [...document.querySelectorAll("a.user-torrents__name")]
      .map(a => new URL(a.href, location.href).href)
      .filter(url => !state.seen.includes(url));
    state.index = 0;
    state.pageNumber++;
    state.pagesSeen.push(pageUrl);
    state.seen.push(...state.queue);

    const next = document.querySelector(".pagination__next a[href]");
    state.nextPage = next ? safeUrl(next.getAttribute("href")) : null;
    state.phase = "queued";

    logEvent(state, "info", "Collected page", {
      page: publicUrl(pageUrl),
      torrents: state.queue.length,
      nextPage: state.nextPage ? publicUrl(state.nextPage) : null,
    });
    saveState(state);
  }

  function continueProcessing(state) {
    if (state.phase === "paused") {
      updatePanel(state, "Paused");
      return;
    }

    if (pageHasStopSignal()) {
      state.phase = "stopped-safety-signal";
      logEvent(state, "error", "Possible rate-limit or CAPTCHA detected");
      saveState(state);
      updatePanel(state, "Stopped: possible rate limit/CAPTCHA");
      return;
    }

    if (state.index < state.queue.length) {
      state.phase = "opening-detail";
      saveState(state);
      updatePanel(state, "Opening torrent detail…");
      location.href = state.queue[state.index];
      return;
    }

    if (state.nextPage && !state.pagesSeen.includes(state.nextPage)) {
      state.queue = [];
      state.index = 0;
      state.phase = "opening-next-page";
      saveState(state);
      updatePanel(state, "Opening next page…");
      location.href = state.nextPage;
      return;
    }

    state.phase = "finished";
    logEvent(state, "info", "Finished");
    saveState(state);
    updatePanel(state, "Finished");
  }

  async function processTorrentPage(state) {
    if (state.phase === "paused") return;

    // A reload during the cooldown must not click the same download twice.
    if (state.phase === "waiting" && state.resumeAt) {
      const remaining = Math.max(0, state.resumeAt - Date.now());
      updatePanel(state, `Cooldown: ${Math.ceil(remaining / 1000)}s remaining…`);
      await sleep(remaining);
      const latest = getState();
      if (latest && latest.phase !== "paused") continueProcessing(latest);
      return;
    }

    if (pageHasStopSignal()) {
      state.phase = "stopped-safety-signal";
      logEvent(state, "error", "Possible rate-limit or CAPTCHA detected");
      saveState(state);
      updatePanel(state, "Stopped: possible rate limit/CAPTCHA");
      return;
    }

    const button = document.querySelector(
      'a[href*="/torrents/download/"]'
    );

    if (!button) {
      state.phase = "stopped-download-button-missing";
      logEvent(state, "error", "Download button not found", {
        page: publicUrl(location.href),
      });
      saveState(state);
      updatePanel(state, "Stopped: download button not found");
      return;
    }

    const settings = getSettings();
    let waitSeconds = settings.delaySeconds;
    if (settings.jitterSeconds > 0) {
      waitSeconds += Math.random() * settings.jitterSeconds;
    }
    if (
      settings.pauseEvery > 0 &&
      (state.completed + 1) % settings.pauseEvery === 0
    ) {
      waitSeconds += settings.pauseSeconds;
    }

    const torrentUrl = location.href;
    button.click();
    state.index++;
    state.completed++;
    state.phase = "waiting";
    state.resumeAt = Date.now() + waitSeconds * 1000;
    logEvent(state, "info", "Clicked download", {
      torrent: publicUrl(torrentUrl),
      waitSeconds,
    });
    saveState(state);
    updatePanel(state, "Download clicked; waiting…");

    await sleep(waitSeconds * 1000);
    const latest = getState();
    if (latest && latest.phase !== "paused") continueProcessing(latest);
  }

  const current = getState();
  createPanel();
  updatePanel(current, current?.phase || "Idle");

  if (current && isListPage) {
    collectPage(current);
    continueProcessing(current);
  } else if (current && isTorrentPage) {
    processTorrentPage(current);
  }
})();
