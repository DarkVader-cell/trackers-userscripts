import { Request, Torrent } from "./trackers/tracker";

export type TorrentAction =
  | "none"
  | "download"
  | "rescue"
  | "raindrop"
  | "qui-paused"
  | "qbittorrent-paused";

export interface AutomationSettings {
  autoAdvancePages: boolean;
  maxAutoPages: number;
  torrentAction: TorrentAction;
  qBittorrentUrl: string;
  qBittorrentUsername: string;
  qBittorrentPassword: string;
  quiUrl: string;
  quiApiKey: string;
}

interface AutomationRun {
  targetTrackerName: string;
  pagesProcessed: number;
}

const RUN_KEY = "find-unique-titles-automation-run";
const DOWNLOAD_TEXT = /\bdownload(?:\s+(?:the\s+)?torrent)?\b/i;
const RESCUE_TEXT = /\brescue(?:\s+(?:the\s+)?torrent)?\b/i;
const RAINDROP_TEXT = /raindrop/i;

const elementText = (element: Element): string =>
  [
    element.textContent,
    element.getAttribute("title"),
    element.getAttribute("aria-label"),
    (element as HTMLInputElement).value,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const actionPattern = (action: TorrentAction): RegExp | null => {
  if (action === "download") return DOWNLOAD_TEXT;
  if (action === "rescue") return RESCUE_TEXT;
  if (action === "raindrop") return RAINDROP_TEXT;
  return null;
};

const actionRoots = (torrent: Torrent, request: Request): HTMLElement[] =>
  Array.from(new Set([torrent.dom, ...request.dom]));

const findActionElement = (
  torrent: Torrent,
  request: Request,
  action: TorrentAction
): HTMLElement | null => {
  const pattern = actionPattern(action);
  if (!pattern) return null;
  for (const root of actionRoots(torrent, request)) {
    const candidates = [
      root,
      ...Array.from(
        root.querySelectorAll<HTMLElement>(
          'a, button, input[type="button"], input[type="submit"]'
        )
      ),
    ];
    const match = candidates.find((candidate) =>
      pattern.test(elementText(candidate))
    );
    if (match) return match;
  }
  return null;
};

const findDownloadUrl = (torrent: Torrent, request: Request): string | null => {
  for (const root of actionRoots(torrent, request)) {
    const candidates = [
      ...(root instanceof HTMLAnchorElement ? [root] : []),
      ...Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]")),
    ];
    const link = candidates.find((candidate) =>
      DOWNLOAD_TEXT.test(elementText(candidate))
    );
    if (link?.href) return link.href;
  }
  return null;
};

const sendToQbittorrentPaused = async (
  torrent: Torrent,
  request: Request,
  settings: AutomationSettings
): Promise<void> => {
  const downloadUrl = findDownloadUrl(torrent, request);
  if (!downloadUrl) throw new Error("Could not find a Download torrent link");
  const baseUrl = settings.qBittorrentUrl.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Set the qBittorrent Web UI URL first");

  if (settings.qBittorrentUsername) {
    const login = await GM.xmlHttpRequest({
      method: "POST",
      url: `${baseUrl}/api/v2/auth/login`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({
        username: settings.qBittorrentUsername,
        password: settings.qBittorrentPassword,
      }).toString(),
      anonymous: false,
    });
    if (
      login.status < 200 ||
      login.status >= 300 ||
      login.responseText.trim() !== "Ok."
    ) {
      throw new Error(`qBittorrent login failed (HTTP ${login.status})`);
    }
  }

  const response = await GM.xmlHttpRequest({
    method: "POST",
    url: `${baseUrl}/api/v2/torrents/add`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({ urls: downloadUrl, paused: "true" }).toString(),
    anonymous: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `qBittorrent rejected the torrent (HTTP ${response.status})`
    );
  }
};

const quiAddTorrentUrl = (quiUrl: string): string => {
  const parsedUrl = new URL(quiUrl);
  const match = parsedUrl.pathname.match(/^(.*)\/instances\/(\d+)\/?$/);
  if (!match) {
    throw new Error(
      "Qui URL must end with /instances/<number>, for example http://localhost:7476/instances/1"
    );
  }
  return `${parsedUrl.origin}${match[1]}/api/instances/${match[2]}/torrents`;
};

const sendToQuiPaused = async (
  torrent: Torrent,
  request: Request,
  settings: AutomationSettings
): Promise<void> => {
  const downloadUrl = findDownloadUrl(torrent, request);
  if (!downloadUrl) throw new Error("Could not find a Download torrent link");
  if (!settings.quiUrl || !settings.quiApiKey) {
    throw new Error("Set both the qui instance URL and API key first");
  }

  const form = new FormData();
  form.append("urls", downloadUrl);
  form.append("paused", "true");
  const response = await GM.xmlHttpRequest({
    method: "POST",
    url: quiAddTorrentUrl(settings.quiUrl),
    // Tampermonkey accepts FormData here; its bundled type definition only lists strings.
    data: form as unknown as string,
    headers: { "X-API-Key": settings.quiApiKey },
    anonymous: false,
  });
  if (response.status !== 201) {
    throw new Error(`qui rejected the torrent (HTTP ${response.status})`);
  }
};

export const performTorrentAction = async (
  request: Request,
  settings: AutomationSettings
): Promise<number> => {
  if (settings.torrentAction === "none") return 0;
  let actioned = 0;
  for (const torrent of request.torrents) {
    if (settings.torrentAction === "qbittorrent-paused") {
      await sendToQbittorrentPaused(torrent, request, settings);
      actioned++;
      continue;
    }
    if (settings.torrentAction === "qui-paused") {
      await sendToQuiPaused(torrent, request, settings);
      actioned++;
      continue;
    }
    const action = findActionElement(torrent, request, settings.torrentAction);
    if (!action) {
      console.warn(
        `[Find Unique Titles] Could not find ${settings.torrentAction} action`,
        torrent.dom
      );
      continue;
    }
    action.click();
    actioned++;
  }
  return actioned;
};

export const startAutomationRun = async (targetTrackerName: string) => {
  await GM.setValue(RUN_KEY, { targetTrackerName, pagesProcessed: 0 });
};

export const getAutomationRun = async (): Promise<AutomationRun | null> =>
  await GM.getValue(RUN_KEY, null as AutomationRun | null);

export const stopAutomationRun = async () => {
  await GM.deleteValue(RUN_KEY);
};

export const advanceToNextPage = async (
  run: AutomationRun,
  settings: AutomationSettings
): Promise<boolean> => {
  if (!settings.autoAdvancePages) return false;
  if (settings.maxAutoPages > 0 && run.pagesProcessed >= settings.maxAutoPages)
    return false;

  const nextUrl = new URL(window.location.href);
  const currentPage = Number.parseInt(
    nextUrl.searchParams.get("page") ?? "1",
    10
  );
  nextUrl.searchParams.set(
    "page",
    String(Number.isFinite(currentPage) ? currentPage + 1 : 2)
  );
  await GM.setValue(RUN_KEY, {
    ...run,
    pagesProcessed: run.pagesProcessed + 1,
  });
  window.location.assign(nextUrl.toString());
  return true;
};
