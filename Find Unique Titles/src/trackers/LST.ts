import { parseImdbIdFromLink, parseSize, parseTags } from "../utils/utils";
import { MetaData, Request, SearchResult, AbstractTracker } from "./tracker";
import { search, SearchResult as SR } from "common/searcher";
import { LST as LSTTracker } from "common/trackers";

const getImdbId = (element: HTMLElement): string | null => {
  const imdbId = element.getAttribute("data-imdb-id");
  if (imdbId) return imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
  return parseImdbIdFromLink(element);
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
        ".torrent-search--list__results tbody tr, .torrent-search--list tbody tr"
      )
    ) as HTMLElement[];

    yield { total: elements.length };
    for (const element of elements) {
      const torrentName = element.textContent?.trim() ?? "";
      const sizeElement = element.querySelector(
        ".torrent-search--list__size, [class*='size']"
      );
      const request: Request = {
        torrents: [
          {
            size: sizeElement ? parseSize(sizeElement.textContent ?? "") : null,
            tags: parseTags(torrentName),
            dom: element,
          },
        ],
        dom: [element],
        imdbId: getImdbId(element),
        title: "",
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
