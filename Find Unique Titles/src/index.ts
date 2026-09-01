import * as trackers from "./trackers";
import { MetaData, Request, SearchResult, tracker } from "./trackers/tracker";
import { addToCache, clearMemoryCache, existsInCache } from "./utils/cache";
import {
  addCounter,
  createAutomationControls,
  createTrackersSelect,
  updateCount,
  updateNewContent,
  updateTotalCount,
} from "./utils/dom";
import { parseReleaseGroup } from "./utils/utils";
import "./settings";
import {
  advanceToNextPage,
  getMaxActionsPerPage,
  getAutomationRun,
  performTorrentAction,
  startAutomationRun,
  stopAutomationRun,
} from "./automation";
import { getSettings, openSettings } from "./settings";
import { appendErrorMessage, showError } from "common/dom";
import { sleep } from "common/http";
import { LEVEL, logger } from "common/logger";

function hideTorrents(request: Request) {
  const elements = new Set([
    ...request.dom,
    ...request.torrents.map((torrent) => torrent.dom),
  ]);
  for (let element of elements) {
    element.style.display = "none";
  }
}

const setUpLogger = (debugMode: boolean) => {
  logger.setPrefix("[Find Unique Titles]");
  if (debugMode) {
    logger.setLevel(LEVEL.DEBUG);
  }
};

const parseSkippedReleaseGroups = (value: string): Set<string> =>
  new Set(
    value
      .split(",")
      .map((group) => group.trim().toLowerCase())
      .filter(Boolean)
  );

const WEB_RELEASE = /\bweb(?:[ ._-]?(?:dl|rip))?\b/i;
const KNOWN_STREAMING_PROVIDER =
  /(?:^|[ ._-])(?:amzn|nf|dsnp|atv|atvp|hmax|hulu|pmtp|pcok|cr|hidi|vmeo|all4|ip|bcore|dscp|hbo|sho|stan|tubi|viap|roku|fod|viki|viu|mubi|kanopy)(?=$|[ ._-])/i;
const PROVIDER_IMMEDIATELY_BEFORE_WEB =
  /\b(?:ma|max|now|it)\b(?=[ ._-]+web(?:[ ._-]?(?:dl|rip))?\b)/i;

const hasKnownStreamingProvider = (title: string): boolean =>
  KNOWN_STREAMING_PROVIDER.test(title) ||
  PROVIDER_IMMEDIATELY_BEFORE_WEB.test(title);

const hasUnknownStreamingProvider = (request: Request): boolean =>
  request.torrents.length > 0 &&
  request.torrents.every((torrent) => {
    const title = torrent.dom.textContent ?? "";
    return WEB_RELEASE.test(title) && !hasKnownStreamingProvider(title);
  });

const shouldSkipRequest = (
  request: Request,
  skippedReleaseGroups: Set<string>,
  skipUnknownStreamingProviders: boolean
): boolean => {
  const releaseGroups = request.torrents
    .map(
      (torrent) =>
        torrent.releaseGroup ?? parseReleaseGroup(torrent.dom.textContent ?? "")
    )
    .filter((group): group is string => Boolean(group));

  const hasSkippedReleaseGroup =
    releaseGroups.length > 0 &&
    releaseGroups.every((group) =>
      skippedReleaseGroups.has(group.toLowerCase())
    );

  return (
    hasSkippedReleaseGroup ||
    (skipUnknownStreamingProviders && hasUnknownStreamingProvider(request))
  );
};

const canPerformTorrentAction = (response: SearchResult): boolean =>
  response === SearchResult.NOT_EXIST ||
  response === SearchResult.NOT_EXIST_WITH_REQUEST ||
  response === SearchResult.EXIST_BUT_MISSING_SLOT;

const main = async function () {
  "use strict";

  const settings = getSettings();
  const skippedReleaseGroups = parseSkippedReleaseGroups(
    settings.skippedReleaseGroups
  );

  setUpLogger(settings.debug);

  logger.info("Init User script");

  if (document.getElementById("tracker-select")) return;
  const url = window.location.href;
  let sourceTracker: tracker | null = null;
  let targetTrackers: Array<tracker> = [];
  Object.keys(trackers).forEach((trackerName) => {
    // @ts-expect-error
    const trackerImplementation: tracker = new trackers[trackerName]();
    if (trackerImplementation.canRun(url)) {
      sourceTracker = trackerImplementation;
    } else if (trackerImplementation.canBeUsedAsTarget()) {
      targetTrackers.push(trackerImplementation);
    }
  });
  if (sourceTracker == null) return;
  const select = createTrackersSelect(
    targetTrackers.map((tracker) => tracker.name())
  );
  (sourceTracker as tracker).insertTrackersSelect(select);
  let stopRequested = false;
  const controls = createAutomationControls(
    select,
    () => {
      stopRequested = true;
      void stopAutomationRun();
      controls.setStatus("Stopping…");
    },
    openSettings
  );
  const runSearch = async (targetName: string, continuingRun = false) => {
    const answer =
      continuingRun ||
      confirm("Start searching new content for:  " + targetName);
    if (answer) {
      const targetTracker = targetTrackers.find(
        (tracker) => tracker.name() === targetName
      ) as tracker;
      if (!targetTracker) return;
      if (!continuingRun && settings.autoAdvancePages) {
        await startAutomationRun(targetName);
      }
      stopRequested = false;
      controls.setStatus(`Checking ${targetName}…`, true);
      let i = 1;
      let newContent = 0;
      let actionsOnPage = 0;
      let actionError = false;
      let terminalStatus: string | null = null;
      let requestGenerator = (sourceTracker as tracker).getSearchRequest();
      const metadata = (await requestGenerator.next()).value as MetaData;
      addCounter();
      updateTotalCount(metadata.total);
      logger.debug(`[{0}] Parsing titles to check`, sourceTracker!!.name());
      for await (const item of requestGenerator) {
        if (stopRequested) break;
        if (item == null) {
          continue;
        }
        const request = item as Request;
        logger.debug(
          `[{0}] Search request: {1}`,
          sourceTracker!!.name(),
          request
        );
        try {
          if (
            shouldSkipRequest(
              request,
              skippedReleaseGroups,
              settings.skipUnknownStreamingProviders
            )
          ) {
            logger.debug("Skipping title configured in settings");
            hideTorrents(request);
            continue;
          }
          if (
            settings.useCache &&
            request.imdbId &&
            existsInCache(targetTracker.name(), request.imdbId)
          ) {
            logger.debug("Title exists in target tracker, found using cache");
            hideTorrents(request);
            continue;
          }
          await sleep(targetTracker.waitTimeInMillisBetweenRequest());
          const response = await targetTracker.search(request);
          logger.debug("Search response: {0}", response);
          if (
            response == SearchResult.EXIST ||
            response == SearchResult.NOT_ALLOWED
          ) {
            if (request.imdbId) {
              await addToCache(targetTracker.name(), request.imdbId);
            }
            hideTorrents(request);
          } else if (response == SearchResult.NOT_LOGGED_IN) {
            alert(`You are not logged in ${targetTracker.name()}`);
            terminalStatus = `Stopped: not logged in to ${targetTracker.name()}`;
            break;
          } else {
            newContent++;
            updateNewContent(newContent);
            if (canPerformTorrentAction(response)) {
              try {
                const maxActions = getMaxActionsPerPage(settings);
                const remainingActions =
                  maxActions === 0
                    ? Number.POSITIVE_INFINITY
                    : Math.max(0, maxActions - actionsOnPage);
                if (
                  remainingActions > 0 &&
                  (!settings.confirmBeforeActions ||
                    confirm(
                      `Perform ${settings.torrentAction} for this confirmed result?`
                    ))
                ) {
                  const actioned = await performTorrentAction(
                    request,
                    settings,
                    remainingActions
                  );
                  actionsOnPage += actioned;
                  if (actioned > 0) {
                    controls.setStatus(
                      `Acted on ${actionsOnPage}${
                        maxActions === 0 ? "" : `/${maxActions}`
                      } item(s)`,
                      true
                    );
                  }
                }
              } catch (e) {
                console.trace("Unable to perform configured torrent action", e);
                request.dom[0].setAttribute(
                  "title",
                  `Torrent action failed: ${(e as Error).message}`
                );
                actionError = true;
                if (settings.stopOnActionError) break;
              }
            }
            if (response == SearchResult.MAYBE_NOT_EXIST) {
              request.dom[0].setAttribute(
                "title",
                "Title may not exist on target tracker"
              );
              request.dom[0].style.border = "2px solid #9b59b6";
            } else if (response == SearchResult.NOT_EXIST_WITH_REQUEST) {
              request.dom[0].setAttribute(
                "title",
                "Title was not found and has matching requests"
              );
              request.dom[0].style.border = "2px solid #2ecc71";
            } else if (response == SearchResult.MAYBE_NOT_EXIST_WITH_REQUEST) {
              request.dom[0].setAttribute(
                "title",
                "Title may not exists and there are matching requests"
              );
              request.dom[0].style.border = "2px solid #e67e22";
            } else if (response == SearchResult.NOT_CHECKED) {
              request.dom[0].setAttribute(
                "title",
                "Title was not checked on target tracker"
              );
              request.dom[0].style.border = "2px solid #e74c3c";
            } else if (response == SearchResult.NOT_EXIST) {
              request.dom[0].setAttribute(
                "title",
                "Title was not found on target tracker"
              );
              request.dom[0].style.border = "2px solid #3498db";
            } else if (response == SearchResult.EXIST_BUT_MISSING_SLOT) {
              request.dom[0].setAttribute(
                "title",
                "Title exists but there is an available slot on target tracker"
              );
              request.dom[0].style.border = "2px solid #ff00ff";
            }
          }
        } catch (e) {
          console.trace("Error occurred: ", e);
          logger.info("Error occurred when checking {0}, {1]", request, e);
          request.dom[0].setAttribute(
            "title",
            "Title was not checked due to an error"
          );
          request.dom[0].style.border = "2px solid red";
        } finally {
          updateCount(i++);
        }
      }
      clearMemoryCache();
      if (terminalStatus) {
        await stopAutomationRun();
        controls.setStatus(terminalStatus);
        return;
      }
      if (stopRequested || (actionError && settings.stopOnActionError)) {
        await stopAutomationRun();
        controls.setStatus(
          stopRequested ? "Stopped" : "Stopped after action error"
        );
        return;
      }
      const run = await getAutomationRun();
      if (run?.targetTrackerName === targetName) {
        if (metadata.total === 0 || !(await advanceToNextPage(run, settings))) {
          await stopAutomationRun();
          controls.setStatus(
            metadata.total === 0 ? "Finished: no more results" : "Finished"
          );
        } else {
          controls.setStatus("Opening next page…", true);
        }
      } else {
        controls.setStatus("Finished");
      }
    }
  };

  select.addEventListener("change", () => void runSearch(select.value));

  const automationRun = await getAutomationRun();
  if (automationRun) {
    if (
      automationRun.nextPageUrl &&
      automationRun.nextPageUrl !== window.location.href
    ) {
      await stopAutomationRun();
    } else {
      select.value = automationRun.targetTrackerName;
      void runSearch(automationRun.targetTrackerName, true);
    }
  }
};

appendErrorMessage();
main().catch((e) => {
  showError(e.message);
});

let currentUrl = document.location.href;
const observer = new MutationObserver(() => {
  const nextUrl = document.location.href;
  if (nextUrl !== currentUrl) {
    currentUrl = nextUrl;
    void main();
  }
});

const config = { subtree: true, childList: true };
observer.observe(document, config);

window.addEventListener("beforeunload", function () {
  observer.disconnect();
});
