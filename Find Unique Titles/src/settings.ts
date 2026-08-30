const defaultConfig: Settings = {
  onlyNewTitles: false,
  useCache: true,
  debug: false,
  sizeDifferenceThreshold: 1.2,
  skippedReleaseGroups: "",
  skipUnknownStreamingProviders: false,
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
      GM_config.frame.style.height = "320px"; // Adjust width as needed
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
  };
};

interface Settings {
  useCache: boolean;
  onlyNewTitles: boolean;
  debug: boolean;
  sizeDifferenceThreshold: number;
  skippedReleaseGroups: string;
  skipUnknownStreamingProviders: boolean;
}
