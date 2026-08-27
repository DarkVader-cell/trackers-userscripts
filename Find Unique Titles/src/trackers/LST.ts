import { parseImdbIdFromLink, parseSize, parseTags } from "../utils/utils";
import {
  Category,
  MetaData,
  Request,
  SearchResult,
  AbstractTracker,
} from "./tracker";
import { fetchAndParseHtml } from "common/http";
import { search, SearchResult as SR } from "common/searcher";
import { LST as LSTTracker } from "common/trackers";

const getImdbId = (element: HTMLElement): string | null => {
  const imdbId = element.getAttribute("data-imdb-id");
  if (imdbId) return imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
  return parseImdbIdFromLink(element);
};

const getCategory = (element: HTMLElement): Category | undefined => {
  const category = element
    .querySelector(".torrent-search-row__category")
    ?.textContent?.trim()
    .toLowerCase();
  if (category?.includes("movie")) return Category.MOVIE;
  if (category?.includes("tv") || category?.includes("television"))
    return Category.TV;
  return undefined;
};

export default class LST extends AbstractTracker {
  canBeUsedAsSource(): boolean {
    return true;
  }

  canBeUsedAsTarget(): boolean {
    return true;
  }

  canRun(url: string): boolean {
    return url.includes("lst.gg/torrents");
  }

  async *getSearchRequest(): AsyncGenerator<MetaData | Request, void, void> {
    const elements = Array.from(
      document.querySelectorAll(
        ".torrent-search--list__results tbody tr, .torrent-search--list tbody tr, article.torrent-search-row"
      )
    ) as HTMLElement[];

    yield { total: elements.length };
    for (const element of elements) {
      const torrentName =
        element.querySelector(".torrent-search-row__name")?.textContent?.trim() ??
        element.textContent?.trim() ??
        "";
      const sizeElement = element.querySelector(
        ".torrent-search--list__size, .torrent-search-row__stat--size, [class*='size']"
      );
      let imdbId = getImdbId(element);
      const torrentLink = element.querySelector(
        ".torrent-search-row__name a, a[href*='/torrents/']"
      ) as HTMLAnchorElement | null;
      if (!imdbId && torrentLink?.href) {
        const torrentPage = await fetchAndParseHtml(torrentLink.href);
        imdbId = parseImdbIdFromLink(torrentPage);
      }
      const request: Request = {
        torrents: [
          {
            size: sizeElement ? parseSize(sizeElement.textContent ?? "") : null,
            tags: parseTags(torrentName),
            dom: element,
          },
        ],
        dom: [element],
        imdbId,
        title: torrentName,
        category: getCategory(element),
      };
      yield request;
    }
  }

  name(): string {
    return "LST";
  }

  async search(request: Request): Promise<SearchResult> {
    if (!request.imdbId) return SearchResult.NOT_CHECKED;
    const result = await search(LSTTracker, {
      movie_title: "",
      movie_imdb_id: request.imdbId,
    });
    if (result === SR.LOGGED_OUT) return SearchResult.NOT_LOGGED_IN;
    return result === SR.NOT_FOUND ? SearchResult.NOT_EXIST : SearchResult.EXIST;
  }

  insertTrackersSelect(select: HTMLElement): void {
    select.classList.add("form__select");
    Object.assign(select.style, {
      position: "fixed",
      top: "72px",
      right: "16px",
      zIndex: "2147483647",
      display: "block",
      visibility: "visible",
      width: "170px",
    });
    document.body.appendChild(select);
  }
}
