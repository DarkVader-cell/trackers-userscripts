const defaultConfig: Settings = {
  onlyNewTitles: false,
  useCache: true,
  debug: false,
  sizeDifferenceThreshold: 1.2,
  skippedReleaseGroups: "",
  skipUnknownStreamingProviders: false,
  autoAdvancePages: false,
  maxAutoPages: 0,
  torrentAction: "none",
  qBittorrentUrl: "",
  qBittorrentUsername: "",
  qBittorrentPassword: "",
  quiUrl: "",
  quiApiKey: "",
  enableActionCooldown: true,
  actionCooldownMs: 1500,
  maxActionsPerPage: 10,
  confirmBeforeActions: false,
  stopOnActionError: true,
};

// Initialize the library
GM_config.init({
  id: "find-unique-titles-settings",
  title: "Find Unique Titles",
  fields: {
    onlyNewTitles: {
      label: "Only new titles",
      type: "checkbox",
      default: defaultConfig.onlyNewTitles,
    },
    useCache: {
      label: "Use cache",
      type: "checkbox",
      default: defaultConfig.useCache,
    },
    sizeDifferenceThreshold: {
      label: "Size Difference Threshold",
      type: "float",
      default: defaultConfig.sizeDifferenceThreshold,
    },
    skippedReleaseGroups: {
      label: "Skip release groups (comma-separated)",
      type: "text",
      default: defaultConfig.skippedReleaseGroups,
    },
    skipUnknownStreamingProviders: {
      label: "Hide WEB releases with unknown streaming provider",
      type: "checkbox",
      default: defaultConfig.skipUnknownStreamingProviders,
    },
    autoAdvancePages: {
      label: "Automatically continue to the next page",
      type: "checkbox",
      default: defaultConfig.autoAdvancePages,
    },
    maxAutoPages: {
      label: "Maximum additional pages (0 = no limit)",
      type: "int",
      default: defaultConfig.maxAutoPages,
    },
    torrentAction: {
      label: "Action for confirmed unique torrents",
      type: "select",
      options: [
        "none",
        "download",
        "rescue",
        "raindrop",
        "qui-paused",
        "qbittorrent-paused",
      ],
      default: defaultConfig.torrentAction,
    },
    qBittorrentUrl: {
      label: "qBittorrent Web UI URL (for qbittorrent-paused)",
      type: "text",
      default: defaultConfig.qBittorrentUrl,
    },
    qBittorrentUsername: {
      label: "qBittorrent username (optional)",
      type: "text",
      default: defaultConfig.qBittorrentUsername,
    },
    qBittorrentPassword: {
      label: "qBittorrent password (optional)",
      type: "password",
      default: defaultConfig.qBittorrentPassword,
    },
    quiUrl: {
      label: "qui instance URL (ends in /instances/<number>)",
      type: "text",
      default: defaultConfig.quiUrl,
    },
    quiApiKey: {
      label: "qui API key",
      type: "password",
      default: defaultConfig.quiApiKey,
    },
    enableActionCooldown: {
      label: "Enable a delay between automated actions",
      type: "checkbox",
      default: defaultConfig.enableActionCooldown,
    },
    actionCooldownMs: {
      label: "Delay between actions in ms (250–60000)",
      type: "int",
      default: defaultConfig.actionCooldownMs,
    },
    maxActionsPerPage: {
      label: "Maximum actions per page (0 = no limit)",
      type: "int",
      default: defaultConfig.maxActionsPerPage,
    },
    confirmBeforeActions: {
      label: "Ask before acting on each confirmed result",
      type: "checkbox",
      default: defaultConfig.confirmBeforeActions,
    },
    stopOnActionError: {
      label: "Stop the automation if an action fails",
      type: "checkbox",
      default: defaultConfig.stopOnActionError,
    },
    debug: {
      label: "Debug mode",
      type: "checkbox",
      default: defaultConfig.debug,
    },
  },
  css: `
        #find-unique-titles-settings {
        }
        #find-unique-titles-settings .config_var {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
    `,
  events: {
    open: function () {
      GM_config.frame.style.width = "500px"; // Adjust width as needed
      GM_config.frame.style.height = "760px"; // Adjust width as needed
      GM_config.frame.style.position = "fixed";
      GM_config.frame.style.left = "50%";
      GM_config.frame.style.top = "50%";
      GM_config.frame.style.transform = "translate(-50%, -50%)";
    },
    save: function () {
      GM_config.close();
    },
  },
});

// Add menu command to open the configuration
GM_registerMenuCommand("Settings", () => GM_config.open());

export const getSettings = (): Settings => {
  return {
    onlyNewTitles: GM_config.get("onlyNewTitles"),
    useCache: GM_config.get("useCache"),
    debug: GM_config.get("debug"),
    sizeDifferenceThreshold: GM_config.get("sizeDifferenceThreshold"),
    skippedReleaseGroups: GM_config.get("skippedReleaseGroups"),
    skipUnknownStreamingProviders: GM_config.get(
      "skipUnknownStreamingProviders"
    ),
    autoAdvancePages: GM_config.get("autoAdvancePages"),
    maxAutoPages: GM_config.get("maxAutoPages"),
    torrentAction: GM_config.get("torrentAction"),
    qBittorrentUrl: GM_config.get("qBittorrentUrl"),
    qBittorrentUsername: GM_config.get("qBittorrentUsername"),
    qBittorrentPassword: GM_config.get("qBittorrentPassword"),
    quiUrl: GM_config.get("quiUrl"),
    quiApiKey: GM_config.get("quiApiKey"),
    enableActionCooldown: GM_config.get("enableActionCooldown"),
    actionCooldownMs: GM_config.get("actionCooldownMs"),
    maxActionsPerPage: GM_config.get("maxActionsPerPage"),
    confirmBeforeActions: GM_config.get("confirmBeforeActions"),
    stopOnActionError: GM_config.get("stopOnActionError"),
  };
};

export interface Settings {
  useCache: boolean;
  onlyNewTitles: boolean;
  debug: boolean;
  sizeDifferenceThreshold: number;
  skippedReleaseGroups: string;
  skipUnknownStreamingProviders: boolean;
  autoAdvancePages: boolean;
  maxAutoPages: number;
  torrentAction: import("./automation").TorrentAction;
  qBittorrentUrl: string;
  qBittorrentUsername: string;
  qBittorrentPassword: string;
  quiUrl: string;
  quiApiKey: string;
  enableActionCooldown: boolean;
  actionCooldownMs: number;
  maxActionsPerPage: number;
  confirmBeforeActions: boolean;
  stopOnActionError: boolean;
}

export const openSettings = () => GM_config.open();
