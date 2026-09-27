// ==UserScript==
// @name         Aither - Bonus Reward BBCode
// @namespace    https://github.com/DarkVader-cell/trackers-userscripts
// @version      0.4.1
// @description  Finds eligible unique Aither uploads and creates the BBCode reward post.
// @author       Moreasan
// @match        https://aither.cc/users/*/torrents*
// @grant        GM_setClipboard
// @connect      aither.cc
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DarkVader-cell/trackers-userscripts/master/Aither%20-%20Bonus%20Rewards/Aither%20-%20Bonus%20Rewards.user.js
// @updateURL    https://raw.githubusercontent.com/DarkVader-cell/trackers-userscripts/master/Aither%20-%20Bonus%20Rewards/Aither%20-%20Bonus%20Rewards.user.js
// ==/UserScript==

(() => {
  "use strict";

  const BASE_REWARD = 30_000;
  const QUALITY_REWARD = 10_000;
  const FULL_DISC_REWARD = 20_000;
  const EXTRA_SEASON_REWARD = 10_000;
  const CUTOFF = new Date("2023-12-01T00:00:00Z");
  const REQUEST_DELAY_MS = 350;
  const PAGE_SIZE = 25;
  const PANEL_ID = "aither-bonus-reward-panel";
  const STATE_KEY = "aither-bonus-reward-state-v1";
  const DETAIL_CACHE_KEY = "aither-bonus-reward-detail-cache-v1";

  let runState = null;
  let generated = "";
  let runActive = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const readJson = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const saveState = () => {
    if (runState) localStorage.setItem(STATE_KEY, JSON.stringify(runState));
  };

  const loadDetailCache = () => readJson(DETAIL_CACHE_KEY, {});

  const saveDetailCache = (cache) =>
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(cache));

  const newState = () => ({
    version: 1,
    sourcePath: location.pathname,
    phase: "collecting",
    nextPageUrl: location.href,
    pagesSeen: [],
    uploads: [],
    detailProcessed: {},
    parsed: [],
    uniqueChecks: {},
    reportedGroups: {},
    pageReports: {},
    pageSignatures: {},
    errors: [],
    bbcode: "",
    total: 0,
    updatedAt: new Date().toISOString(),
  });

  const checkpoint = () => {
    if (!runState) return;
    runState.updatedAt = new Date().toISOString();
    saveState();
  };

  const isPaused = () => runState?.phase === "paused";
  const isHalted = () =>
    runState?.phase === "paused" || runState?.phase === "stopped";

  const pauseAtCheckpoint = (resumePhase) => {
    if (!runState || !isHalted()) return false;
    runState.resumePhase = resumePhase;
    checkpoint();
    setStatus(
      runState.phase === "paused"
        ? "Paused. Click Resume to continue from the last checkpoint."
        : "Stopped. Click Resume to continue from the last checkpoint."
    );
    return true;
  };

  const absoluteUrl = (value, base = location.href) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    // Aither sometimes emits `users/name/torrents?page=N` without the
    // leading slash. Treat those links as origin-relative, not page-relative.
    const candidate =
      /^(?:https?:)?\/\//i.test(raw) || /^[/?#]/.test(raw)
        ? raw
        : `/${raw.replace(/^\.\//, "")}`;
    try {
      const url = new URL(candidate, base);
      // Repair checkpoints created by the old pagination resolver.
      while (/^\/users\/([^/]+)\/users\/\1(?=\/|$)/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(
          /^\/users\/([^/]+)\/users\/\1(?=\/|$)/i,
          "/users/$1"
        );
      }
      return url.href;
    } catch {
      return null;
    }
  };

  const torrentId = (value) => {
    const match = String(value || "").match(/\/torrents?\/(\d+)(?:[/?#]|$)/i);
    return match?.[1] || null;
  };

  const cleanText = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const escapeBbcode = (value) =>
    cleanText(value).replaceAll("[", "(").replaceAll("]", ")");

  const parseImdbId = (root) => {
    const link = root.querySelector?.('[href*="imdb.com/title/tt"]');
    const match = link?.href.match(/\/title\/(tt\d+)/i);
    return match?.[1] || null;
  };

  const parseYear = (text) => {
    const years = [...String(text || "").matchAll(/\b(19\d{2}|20\d{2})\b/g)]
      .map((match) => Number(match[1]))
      .filter((year) => year >= 1888 && year <= new Date().getFullYear() + 2);
    return years[0] || null;
  };

  const parseDisplayTitle = (rawTitle, year) => {
    let title = cleanText(rawTitle)
      .replace(/\.(?=\S)/g, " ")
      .replace(/[_]+/g, " ");
    const yearMatch = title.match(/\b(?:19|20)\d{2}\b/);
    if (yearMatch) title = title.slice(0, yearMatch.index);
    title = title
      .replace(/\s*[([]?\s*$/, "")
      .replace(/[. _-]+$/, "")
      .trim();
    return `${title || cleanText(rawTitle)}${year ? ` (${year})` : ""}`;
  };

  const parseQuality = (text) => {
    const value = String(text || "").toLowerCase();
    if (/\b2160p\b|\b4k\b|\buhd\b/.test(value)) return "2160p";
    if (/\b1080(?:p|i)\b|\bfhd\b/.test(value)) return "1080p";
    if (/\b720p\b|\bhd\b/.test(value)) return "720p";
    if (/\bsd\b|\b576p?\b|\b480p?\b|\bdvd\b/.test(value)) return "SD";
    return null;
  };

  const isFullDisc = (text) => {
    const value = String(text || "").toLowerCase();
    const source = /\bdvd\b|\bblu[- .]?ray\b|\bbdmv\b/.test(value);
    return (
      source &&
      /full[ -]?disc|bdmv|video_ts|dvd(?:5|9)|disc[ -]?image|complete disc|\.iso\b/.test(
        value
      )
    );
  };

  const parseSeasonCount = (text) => {
    const value = String(text || "").toUpperCase();
    if (!/\b(?:TV|S\d{1,2}|SEASON\s*\d)/.test(value)) return 0;

    let count = 0;
    for (const match of value.matchAll(
      /\bS(\d{1,2})(?:\s*[-–]\s*S?(\d{1,2}))?\b/g
    )) {
      // S01E01 is an episode, not evidence of a complete season.
      const after = value.slice((match.index || 0) + match[0].length);
      if (/^\s*E\d{1,3}/.test(after)) continue;
      const first = Number(match[1]);
      const last = Number(match[2] || match[1]);
      if (last >= first && last - first < 100) count += last - first + 1;
    }
    for (const match of value.matchAll(
      /\bSEASON\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b/g
    )) {
      const first = Number(match[1]);
      const last = Number(match[2] || match[1]);
      if (last >= first && last - first < 100) count += last - first + 1;
    }
    return count;
  };

  const labelContext = (root, pattern) => {
    for (const element of root.querySelectorAll(
      "dt, th, label, .torrent__meta-label, .meta__label"
    )) {
      if (!pattern.test(cleanText(element.textContent))) continue;
      const parent = element.closest("tr, li, dl, .torrent__meta, .meta, div");
      const text = cleanText(
        parent?.textContent || element.parentElement?.textContent
      );
      if (text) return text;
    }
    return "";
  };

  const parseReleaseDate = (root, rawTitle) => {
    const context = labelContext(
      root,
      /release|released|premiere|first aired|air date|originally aired|year/i
    );
    const dateMatch = context.match(
      /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*|\s+)\d{4})\b/i
    );
    if (dateMatch) {
      const date = new Date(dateMatch[1]);
      if (!Number.isNaN(date.getTime()))
        return { date, year: date.getFullYear(), knownMonth: true };
    }
    const year = parseYear(context) || parseYear(rawTitle);
    return year ? { date: null, year, knownMonth: false } : null;
  };

  const releaseIsEligible = (release) => {
    if (!release) return false;
    if (release.date) {
      const timestamp = new Date(release.date).getTime();
      return !Number.isNaN(timestamp) && timestamp < CUTOFF.getTime();
    }
    return release.year < 2023 || (release.year === 2023 && release.knownMonth);
  };

  const categoryFromTitle = (title) => {
    const value = String(title || "").toLowerCase();
    if (/documentar/.test(value)) return "Documentary";
    if (
      /\b(tv|television|series)\b|\bs\d{1,2}(?:e\d{1,3})?\b|\bseason\s*\d/.test(
        value
      )
    )
      return "TV";
    if (/\b(?:flac|mp3|album|ebook|audiobook|comic|game)\b/.test(value))
      return "";
    return "Movie";
  };

  const categoryFrom = (root, text) => {
    const category = cleanText(
      root.querySelector(".torrent__category-link")?.textContent
    );
    const value = `${category} ${text}`.toLowerCase();
    if (/documentar/.test(value)) return "Documentary";
    if (/\b(tv|television|series)\b|\bs\d{1,2}(?:e\d{1,3})?\b/.test(value))
      return "TV";
    if (/\b(movie|film)\b/.test(value)) return "Movie";
    return category || "";
  };

  const getTorrentLinks = (root, base = location.href) => {
    const links = [...root.querySelectorAll("a[href]")];
    const items = new Map();
    for (const link of links) {
      const id = torrentId(link.href);
      if (!id || /\/download\//i.test(link.href)) continue;
      const row =
        link.closest(
          "tr, article, li, .torrent-search-row, .user-torrents__item"
        ) || link;
      const rowText = cleanText(row.textContent);
      const title = cleanText(link.textContent) || rowText;
      if (!title || items.has(id)) continue;
      items.set(id, {
        id,
        url: absoluteUrl(link.getAttribute("href") || link.href, base),
        title,
        rowText,
        imdbId: parseImdbId(row),
      });
    }
    return [...items.values()];
  };

  const numericNextPageUrl = (base) => {
    try {
      const next = new URL(base);
      const currentPage = Number(next.searchParams.get("page")) || 1;
      next.searchParams.set("page", String(currentPage + 1));
      return next.href;
    } catch {
      return null;
    }
  };

  const nextPageUrl = (root, base = location.href, currentCount = 0) => {
    const link = root.querySelector(
      ".pagination__next a[href], a[rel=next][href], .pagination a[aria-label*='Next' i][href]"
    );
    const linkedPage = link
      ? absoluteUrl(link.getAttribute("href") || link.href, base)
      : null;
    if (linkedPage && linkedPage !== base) return linkedPage;

    // Some Aither layouts omit the next link after only a few numbered pages.
    // A full page means another page may exist, so continue deterministically.
    if (currentCount < PAGE_SIZE) return null;
    return numericNextPageUrl(base);
  };

  const fetchDocument = async (url) => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok)
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    const html = await response.text();
    const document = new DOMParser().parseFromString(html, "text/html");
    if (
      /\/login(?:[/?#]|$)/i.test(response.url) ||
      /forgot your password/i.test(document.body?.textContent || "")
    ) {
      throw new Error(
        "Aither returned a login page; make sure you are logged in."
      );
    }
    return document;
  };

  const collectUploads = async (onProgress, firstDocument = document) => {
    const uploads = new Map(
      runState.uploads.map((upload) => [upload.id, upload])
    );
    const pages = new Set(runState.pagesSeen);
    let currentUrl = absoluteUrl(runState.nextPageUrl || location.href);
    let currentDocument =
      currentUrl === location.href && !pages.has(currentUrl)
        ? firstDocument
        : null;

    while (currentUrl && !pages.has(currentUrl)) {
      if (isHalted()) {
        pauseAtCheckpoint("collecting");
        return [...uploads.values()];
      }
      if (!currentDocument) currentDocument = await fetchDocument(currentUrl);
      pages.add(currentUrl);
      const pageNumber =
        Number(new URL(currentUrl).searchParams.get("page")) || pages.size;
      const pageUploads = getTorrentLinks(currentDocument, currentUrl).map(
        (upload) => ({ ...upload, pageUrl: currentUrl, pageNumber })
      );
      const signature = pageUploads.map((upload) => upload.id).join(",");
      if (
        signature &&
        runState.pageSignatures[signature] &&
        runState.pageSignatures[signature] !== currentUrl
      ) {
        runState.nextPageUrl = null;
        checkpoint();
        onProgress(`Stopped: page ${pageNumber} repeated an earlier page.`);
        return [...uploads.values()];
      }
      if (signature) runState.pageSignatures[signature] = currentUrl;
      for (const upload of pageUploads) uploads.set(upload.id, upload);
      runState.pageReports[pageNumber] = {
        pageNumber,
        pageUrl: currentUrl,
        uploads: pageUploads.length,
        qualified: runState.pageReports[pageNumber]?.qualified || 0,
      };
      runState.pagesSeen = [...pages];
      runState.uploads = [...uploads.values()];
      const next = nextPageUrl(currentDocument, currentUrl, pageUploads.length);
      runState.nextPageUrl = next && !pages.has(next) ? next : null;
      checkpoint();
      onProgress(
        `Page ${pageNumber}: ${pageUploads.length} upload(s) on this page; ${uploads.size} collected across ${pages.size} page(s)…`
      );
      if (pauseAtCheckpoint("collecting")) return [...uploads.values()];
      currentUrl = runState.nextPageUrl;
      currentDocument = null;
      if (currentUrl) await sleep(REQUEST_DELAY_MS);
    }
    runState.phase = "reading-details";
    checkpoint();
    return [...uploads.values()];
  };

  const parseTitleOnly = (upload) => {
    const rawTitle = cleanText(upload.title);
    const year = parseYear(rawTitle);
    const category = categoryFromTitle(rawTitle);
    return {
      ...upload,
      rawTitle,
      title: parseDisplayTitle(rawTitle, year),
      year,
      release: year ? { date: null, year, knownMonth: false } : null,
      category,
      quality: parseQuality(rawTitle),
      fullDisc: isFullDisc(rawTitle),
      seasons: category === "TV" ? parseSeasonCount(rawTitle) : 0,
    };
  };

  const parseTorrent = (upload, detail) => ({
    ...parseTitleOnly(upload),
    imdbId: parseImdbId(detail) || upload.imdbId,
  });

  const resultRows = (root) => [
    ...root.querySelectorAll(
      "article.torrent-search-row, .torrent-search--list tbody tr, .torrent-search--list__overview"
    ),
  ];

  const searchTitle = async (imdbId) => {
    const url = `${location.origin}/torrents?imdbId=${encodeURIComponent(
      imdbId.replace(/^tt/, "")
    )}`;
    const result = await fetchDocument(url);
    const rows = resultRows(result);
    const ids = new Set();
    for (const row of rows) {
      for (const link of row.querySelectorAll("a[href]")) {
        const id = torrentId(link.href);
        if (id) ids.add(id);
      }
    }
    return { rowCount: rows.length, ids };
  };

  const makeUniqueRows = async (uploads, onProgress) => {
    const ownIds = new Set(runState.uploads.map((upload) => upload.id));
    const groups = new Map();
    for (const upload of uploads) {
      if (!upload.imdbId) continue;
      const key = upload.imdbId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(upload);
    }

    const unique = [];
    const unresolved = [];
    let checked = 0;
    for (const [imdbId, group] of groups) {
      checked++;
      onProgress(`Checking title uniqueness ${checked}/${groups.size}…`);
      if (isHalted()) {
        pauseAtCheckpoint("checking-unique");
        return { unique, unresolved, paused: true };
      }
      try {
        let result = runState.uniqueChecks[imdbId];
        if (!result) {
          const searchResult = await searchTitle(imdbId);
          const hasExternalTorrent = [...searchResult.ids].some(
            (id) => !ownIds.has(id)
          );
          result = {
            unique:
              Boolean(searchResult.rowCount) &&
              Boolean(searchResult.ids.size) &&
              !hasExternalTorrent,
            rowCount: searchResult.rowCount,
            ids: [...searchResult.ids],
          };
          runState.uniqueChecks[imdbId] = result;
          checkpoint();
        }
        if (result.unique) unique.push(group);
      } catch (error) {
        unresolved.push(`${group[0].title}: ${error.message}`);
        runState.errors.push(`${group[0].title}: ${error.message}`);
        checkpoint();
      }
      await sleep(REQUEST_DELAY_MS);
      if (isHalted()) {
        pauseAtCheckpoint("checking-unique");
        return { unique, unresolved, paused: true };
      }
    }
    return { unique, unresolved, paused: false };
  };

  const groupStats = (group) => ({
    qualities: [...new Set(group.map((item) => item.quality).filter(Boolean))],
    fullDisc: group.filter((item) => item.fullDisc).length,
    seasons: group.reduce((total, item) => total + item.seasons, 0),
    uploadIds: group.map((item) => item.id),
  });

  const calculateReward = (group) => {
    const stats = groupStats(group);
    const reward =
      BASE_REWARD +
      Math.max(0, stats.qualities.length - 1) * QUALITY_REWARD +
      stats.fullDisc * FULL_DISC_REWARD +
      Math.max(0, stats.seasons - 1) * EXTRA_SEASON_REWARD;
    return {
      reward,
      qualities: new Set(stats.qualities),
      seasons: stats.seasons,
    };
  };

  const calculateIncrementalReward = (group) => {
    const current = groupStats(group);
    const previous = runState.reportedGroups[group[0].imdbId];
    if (!previous) return { ...calculateReward(group), stats: current };

    const previousQualityCount = previous.qualities?.length || 0;
    const previousSeasons = previous.seasons || 0;
    const reward =
      (Math.max(0, current.qualities.length - 1) -
        Math.max(0, previousQualityCount - 1)) *
        QUALITY_REWARD +
      (current.fullDisc - (previous.fullDisc || 0)) * FULL_DISC_REWARD +
      (Math.max(0, current.seasons - 1) - Math.max(0, previousSeasons - 1)) *
        EXTRA_SEASON_REWARD;
    return {
      reward: Math.max(0, reward),
      qualities: new Set(current.qualities),
      seasons: current.seasons,
      stats: current,
    };
  };

  const buildBbcode = (rows) => {
    const lines = [
      "[table]",
      "[tr]",
      "[td]#[/td]",
      "[td]Unique Title[/td]",
      "[td]Payout[/td]",
      "[/tr]",
      "",
    ];
    let total = 0;
    rows.forEach((row, index) => {
      total += row.reward;
      lines.push(
        "[tr]",
        `[td]${index + 1}[/td]`,
        `[td][url=${row.url}]${escapeBbcode(row.title)}[/url][/td]`,
        `[td]${row.reward / 1000}k BON[/td]`,
        "[/tr]",
        ""
      );
    });
    lines.push(
      "[tr]",
      "[td][/td]",
      "[td]Total[/td]",
      `[td]${total}[/td]`,
      "[/tr]",
      "",
      "[/table]"
    );
    return { text: lines.join("\n"), total };
  };

  const pageReportText = () =>
    Object.values(runState?.pageReports || {})
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map(
        (report) =>
          `Page ${report.pageNumber}: ${
            report.qualified || 0
          } qualified title(s) from ${report.uploads} upload(s)`
      )
      .join("\n");

  const createPanel = () => {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <strong>Aither bonus reward post</strong>
      <div class="aither-bonus-status">Ready. Open this on your user torrent list.</div>
      <div class="aither-bonus-actions">
        <button data-action="analyze">Analyze uploads</button>
        <button data-action="pause" disabled>Pause</button>
        <button data-action="stop" disabled>Stop</button>
        <button data-action="reset">Reset</button>
        <button data-action="copy" disabled>Copy BBCode</button>
      </div>
      <textarea data-output readonly placeholder="Generated BBCode will appear here…"></textarea>
      <pre data-pages></pre>
      <details><summary>Skipped / needs review</summary><pre data-errors></pre></details>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #${PANEL_ID} { position:fixed; right:16px; bottom:16px; z-index:2147483647; width:440px; max-width:calc(100vw - 32px); padding:12px; color:#fff; background:#202124; border:1px solid #555; border-radius:8px; box-shadow:0 3px 14px #0008; font:13px/1.45 Arial,sans-serif; }
      #${PANEL_ID} strong { display:block; margin-bottom:6px; }
      #${PANEL_ID} button { margin:2px 4px 6px 0; padding:5px 8px; cursor:pointer; }
      #${PANEL_ID} button:disabled { cursor:default; opacity:.6; }
      #${PANEL_ID} textarea { width:100%; height:170px; box-sizing:border-box; resize:vertical; color:#111; }
      #${PANEL_ID} pre { max-height:130px; overflow:auto; white-space:pre-wrap; color:#ffcccb; }
      #${PANEL_ID} [data-pages] { color:#b8d7ff; margin:7px 0 0; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(panel);
    panel
      .querySelector('[data-action="analyze"]')
      .addEventListener("click", analyze);
    panel
      .querySelector('[data-action="pause"]')
      .addEventListener("click", pauseAnalysis);
    panel
      .querySelector('[data-action="stop"]')
      .addEventListener("click", stopAnalysis);
    panel
      .querySelector('[data-action="reset"]')
      .addEventListener("click", resetAnalysis);
    panel
      .querySelector('[data-action="copy"]')
      .addEventListener("click", copyBbcode);
    restorePanelState(panel);
    return panel;
  };

  const setStatus = (message) => {
    createPanel().querySelector(".aither-bonus-status").textContent = message;
  };

  const updatePanelControls = (panel = createPanel()) => {
    const phase = runState?.phase;
    const hasSavedRun = Boolean(runState);
    const paused = phase === "paused";
    const stopped = phase === "stopped";
    const complete = phase === "complete";
    const working = runActive && !paused && !stopped && !complete;
    const analyzeButton = panel.querySelector('[data-action="analyze"]');
    const pauseButton = panel.querySelector('[data-action="pause"]');
    const stopButton = panel.querySelector('[data-action="stop"]');
    const copyButton = panel.querySelector('[data-action="copy"]');

    analyzeButton.disabled = runActive;
    analyzeButton.textContent =
      paused || stopped ? "Resume" : "Analyze uploads";
    pauseButton.disabled = !working;
    stopButton.disabled = !working;
    copyButton.disabled = !generated;
    if (!hasSavedRun) analyzeButton.textContent = "Analyze uploads";
  };

  const restorePanelState = (panel) => {
    if (!runState) {
      runState = readJson(STATE_KEY, null);
      if (runState && runState.sourcePath !== location.pathname)
        runState = null;
    }
    if (!runState) {
      updatePanelControls(panel);
      return;
    }
    runState.reportedGroups ||= {};
    runState.pageReports ||= {};
    runState.pageSignatures ||= {};
    runState.errors ||= [];
    const reports = Object.values(runState.pageReports);
    const lastReport = reports
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .at(-1);
    if (
      runState.phase === "reading-details" &&
      !runState.nextPageUrl &&
      lastReport?.uploads >= PAGE_SIZE
    ) {
      // Older checkpoints could stop collection when the next link vanished.
      runState.phase = "collecting";
      runState.nextPageUrl = numericNextPageUrl(lastReport.pageUrl);
      checkpoint();
    }
    generated = runState.bbcode || "";
    panel.querySelector("[data-output]").value = generated;
    panel.querySelector("[data-pages]").textContent = pageReportText();
    panel.querySelector("[data-errors]").textContent = runState.errors?.length
      ? runState.errors.join("\n")
      : "None";
    if (runState.phase === "complete") {
      panel.querySelector(
        ".aither-bonus-status"
      ).textContent = `Complete: total ${runState.total} BON. Click Analyze uploads to start over.`;
    } else if (runState.phase === "paused" || runState.phase === "stopped") {
      panel.querySelector(
        ".aither-bonus-status"
      ).textContent = `Saved checkpoint: ${runState.phase}. Click Resume to continue.`;
    } else {
      panel.querySelector(
        ".aither-bonus-status"
      ).textContent = `Saved checkpoint from ${new Date(
        runState.updatedAt
      ).toLocaleString()}.`;
    }
    updatePanelControls(panel);
  };

  const copyBbcode = async () => {
    if (!generated) return;
    if (typeof GM_setClipboard === "function")
      GM_setClipboard(generated, "text");
    else await navigator.clipboard.writeText(generated);
    setStatus("BBCode copied to clipboard.");
  };

  const pauseAnalysis = () => {
    if (!runActive || !runState) return;
    runState.phase = "paused";
    checkpoint();
    setStatus("Pausing at the current request…");
    updatePanelControls();
  };

  const stopAnalysis = () => {
    if (!runActive || !runState) return;
    runState.resumePhase = runState.phase;
    runState.phase = "stopped";
    checkpoint();
    setStatus("Stopped. Your checkpoint is saved; click Resume to continue.");
    updatePanelControls();
  };

  const resetAnalysis = () => {
    if (runActive) return;
    if (!confirm("Clear the saved Aither reward analysis and start over?"))
      return;
    localStorage.removeItem(STATE_KEY);
    runState = null;
    generated = "";
    const panel = createPanel();
    panel.querySelector("[data-output]").value = "";
    panel.querySelector("[data-errors]").textContent = "";
    panel.querySelector(".aither-bonus-status").textContent =
      "Ready. Open this on your user torrent list.";
    updatePanelControls(panel);
  };

  const finishAnalysis = (panel, rows, bbcode, groups) => {
    generated = bbcode.text;
    runState.bbcode = generated;
    runState.total = bbcode.total;
    runState.phase = "complete";
    runState.errors = [...new Set(runState.errors)];
    for (const group of groups) {
      const stats = groupStats(group);
      runState.reportedGroups[group[0].imdbId] = stats;
    }
    checkpoint();
    panel.querySelector("[data-output]").value = generated;
    panel.querySelector("[data-pages]").textContent = pageReportText();
    panel.querySelector("[data-errors]").textContent = runState.errors.length
      ? runState.errors.join("\n")
      : "None";
    setStatus(
      `Done: ${rows.length} unique title(s), total ${bbcode.total} BON.`
    );
  };

  const readUploadDetails = async (uploads, onProgress) => {
    const parsedById = new Map(runState.parsed.map((item) => [item.id, item]));
    const detailCache = loadDetailCache();
    for (let index = 0; index < uploads.length; index++) {
      const upload = uploads[index];
      if (runState.detailProcessed[upload.id]) continue;
      if (isPaused() || runState.phase === "stopped") {
        runState.resumePhase = "reading-details";
        checkpoint();
        return false;
      }
      onProgress(`Reading upload details ${index + 1}/${uploads.length}…`);
      try {
        const titleItem = parseTitleOnly(upload);
        let item;
        const cached = detailCache[upload.url];
        if (cached || upload.imdbId) {
          // All reward metadata comes from the upload title. The cache/detail
          // page is only used to recover the IMDb ID for uniqueness checks.
          item = {
            ...titleItem,
            imdbId: upload.imdbId || cached.imdbId,
          };
        } else {
          const detail = await fetchDocument(upload.url);
          item = parseTorrent(upload, detail);
          detailCache[upload.url] = item;
          saveDetailCache(detailCache);
        }
        if (
          releaseIsEligible(item.release) &&
          ["Movie", "TV", "Documentary"].includes(item.category) &&
          item.imdbId
        ) {
          parsedById.set(upload.id, item);
        } else if (releaseIsEligible(item.release) && !item.imdbId) {
          runState.errors.push(
            `${item.title}: IMDb ID not found; uniqueness could not be checked.`
          );
        }
      } catch (error) {
        runState.errors.push(`${upload.title}: ${error.message}`);
      }
      runState.parsed = [...parsedById.values()];
      runState.detailProcessed[upload.id] = true;
      checkpoint();
      await sleep(REQUEST_DELAY_MS);
      if (isHalted()) {
        runState.resumePhase = "reading-details";
        checkpoint();
        return false;
      }
    }
    runState.phase = "checking-unique";
    checkpoint();
    return true;
  };

  async function analyze() {
    if (runActive) return;
    const panel = createPanel();
    const saved = Boolean(runState);
    if (!saved) {
      runState = newState();
      generated = "";
      panel.querySelector("[data-output]").value = "";
      panel.querySelector("[data-pages]").textContent = "";
      panel.querySelector("[data-errors]").textContent = "";
      checkpoint();
    } else if (runState.phase === "complete") {
      // Keep detail/uniqueness checkpoints and previously reported rewards,
      // but rescan pages for newly uploaded torrents only.
      runState.phase = "collecting";
      runState.nextPageUrl = location.href;
      runState.pagesSeen = [];
      runState.pageReports = {};
      runState.pageSignatures = {};
      runState.bbcode = "";
      runState.total = 0;
      runState.errors = [];
      generated = "";
      panel.querySelector("[data-output]").value = "";
      panel.querySelector("[data-pages]").textContent = "";
      panel.querySelector("[data-errors]").textContent = "";
      checkpoint();
    } else if (runState.phase === "paused" || runState.phase === "stopped") {
      runState.phase = runState.resumePhase || "collecting";
      checkpoint();
    }

    runActive = true;
    updatePanelControls(panel);
    try {
      const uploads =
        runState.phase === "collecting"
          ? await collectUploads(setStatus)
          : runState.uploads;
      if (!uploads.length)
        throw new Error("No torrent links were found on this page.");
      if (isPaused() || runState.phase === "stopped") return;

      if (runState.phase === "reading-details") {
        const completed = await readUploadDetails(uploads, setStatus);
        if (!completed) return;
      }
      if (isPaused() || runState.phase === "stopped") return;

      const result = await makeUniqueRows(runState.parsed, setStatus);
      if (result.paused || isPaused() || runState.phase === "stopped") return;
      const pageQualified = {};
      const rows = result.unique
        .map((group) => {
          const reward = calculateIncrementalReward(group);
          if (reward.reward <= 0) return null;
          const page =
            group.find(
              (item) =>
                !runState.reportedGroups[group[0].imdbId]?.uploadIds?.includes(
                  item.id
                )
            )?.pageNumber ||
            group[0].pageNumber ||
            "current";
          pageQualified[page] = (pageQualified[page] || 0) + 1;
          return { title: group[0].title, url: group[0].url, ...reward };
        })
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title));
      for (const [page, qualified] of Object.entries(pageQualified)) {
        if (runState.pageReports[page])
          runState.pageReports[page].qualified = qualified;
      }
      checkpoint();
      finishAnalysis(panel, rows, buildBbcode(rows), result.unique);
    } catch (error) {
      if (runState) {
        runState.errors.push(error.message);
        checkpoint();
      }
      setStatus(`Error: ${error.message}. The checkpoint was saved.`);
    } finally {
      runActive = false;
      updatePanelControls(panel);
    }
  }

  if (/^\/users\/[^/]+\/torrents\/?$/.test(location.pathname)) createPanel();
})();
