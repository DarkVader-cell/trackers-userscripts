import { possibleDesiSlot, type DesiRelease } from "./desiSlots";
import { AbstractTracker, Category, Request, SearchResult } from "./tracker";
import { fetchAndParseHtml } from "common/http";

const ORIGIN = "https://desitorrents.tv";
const RESULT_SELECTOR = [
  ".torrent-search--list__name",
  ".torrent-listings-name",
  "article.torrent-search-row",
  "article.torrent-card",
  "article.torrent-search--grouped__result",
  "article.torrent-search--poster__result",
].join(", ");

const hasPagination = (listing: Element) =>
  listing.querySelector(
    'a[rel="next"], a[href*="page="], nav[role="navigation"], .pagination'
  );

const normalizeId = (value: string) =>
  value.replace(/^tt/i, "").replace(/^0+/, "");

export default class DesiTorrents extends AbstractTracker {
  readonly releaseSpecificResults = true;

  private async movieReleases(
    listing: Element,
    matches: Element[],
    imdbId: string
  ): Promise<DesiRelease[]> {
    const titlePaths = new Set(
      Array.from(
        listing.querySelectorAll<HTMLAnchorElement>('a[href*="/title/"]')
      ).flatMap((link) => {
        const url = new URL(link.getAttribute("href")!, ORIGIN);
        return url.origin === ORIGIN &&
          /^\/title\/[\w%-]+\/?$/.test(url.pathname)
          ? [url.pathname]
          : [];
      })
    );
    if (titlePaths.size === 1) {
      const page = await fetchAndParseHtml(
        new URL([...titlePaths][0], ORIGIN).href
      );
      const imdbLink =
        page.querySelector(".meta__imdb a")?.getAttribute("href") ?? "";
      const id = /imdb\.com\/title\/(tt\d+)(?:[/?#]|$)/i.exec(imdbLink)?.[1];
      const table = page.querySelector(".similar-torrents__torrents");
      if (
        id &&
        normalizeId(id) === normalizeId(imdbId) &&
        table &&
        !hasPagination(table.closest(".similar-torrents-list") ?? table)
      ) {
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const releases = rows.flatMap((row) => {
          const name = row
            .querySelector(".torrent-search--grouped__name a")
            ?.textContent?.trim();
          const type = row
            .querySelector(".similar-torrents__type")
            ?.textContent?.trim();
          return name ? [{ name, type }] : [];
        });
        if (releases.length === rows.length && releases.length > 0)
          return releases;
      }
    }

    // A simple list can be used without the title link only if all rows expose
    // their matching IMDb IDs and release names and there is no pagination.
    if (hasPagination(listing)) return [];
    const table = listing.querySelector(".torrent-search--list__results table");
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (matches.some((match) => !table.contains(match))) return [];
    const releases = rows.flatMap((row) => {
      const id = row.getAttribute("data-imdb-id");
      const name = row
        .querySelector(".torrent-search--list__name, .torrent-listings-name")
        ?.textContent?.trim();
      return id && normalizeId(id) === normalizeId(imdbId) && name
        ? [{ name }]
        : [];
    });
    return releases.length === rows.length ? releases : [];
  }
  name(): string {
    return "DesiTorrents";
  }

  canRun(): boolean {
    return false;
  }

  canBeUsedAsSource(): boolean {
    return false;
  }

  canBeUsedAsTarget(): boolean {
    return true;
  }

  async *getSearchRequest(): AsyncGenerator<{ total: number }> {
    yield { total: 0 };
  }

  insertTrackersSelect(): void {}

  async search(request: Request<Category>): Promise<SearchResult> {
    if (request.category !== Category.MOVIE && request.category !== Category.TV)
      return SearchResult.NOT_CHECKED;

    const rawId = "imdbId" in request ? request.imdbId : undefined;
    const imdbId =
      typeof rawId === "string" ? /^tt(\d{7,})$/i.exec(rawId)?.[1] : undefined;
    if (!imdbId) return SearchResult.NOT_CHECKED;

    const url = new URL("/torrents", ORIGIN);
    url.searchParams.set("imdbId", imdbId);
    const page = await fetchAndParseHtml(url.href);
    const listing = page.querySelector(
      ".torrent-search__component, .page__torrents"
    );
    if (!listing) {
      return page.querySelector('form[action$="/login"] input[type="password"]')
        ? SearchResult.NOT_LOGGED_IN
        : SearchResult.NOT_CHECKED;
    }

    const matches = Array.from(listing.querySelectorAll(RESULT_SELECTOR));
    if (matches.length > 0) {
      // Newer UNIT3D list rows expose an IMDb ID; ignore a listing if the
      // returned rows show that the server did not apply our IMDb filter.
      const wrongId = matches.some((match) => {
        const rowId = match
          .closest("[data-imdb-id]")
          ?.getAttribute("data-imdb-id");
        return rowId != null && normalizeId(rowId) !== normalizeId(imdbId);
      });
      if (wrongId) return SearchResult.NOT_CHECKED;
      const candidates = request.torrents.flatMap(({ releaseName }) =>
        releaseName ? [{ name: releaseName }] : []
      );
      if (request.category === Category.MOVIE && candidates.length > 0) {
        const releases = await this.movieReleases(listing, matches, imdbId);
        if (
          candidates.some((candidate) => possibleDesiSlot(candidate, releases))
        ) {
          return SearchResult.POSSIBLE_MISSING_SLOT;
        }
      }
      return SearchResult.EXIST;
    }

    const resultSections = listing.querySelectorAll(
      ".torrent-search--list__results, .torrent-search--card__results, .torrent-search--grouped__results, .torrent-search--poster__results"
    );
    const explicitlyEmpty = Array.from(resultSections).some((section) => {
      const text = section.textContent ?? "";
      return /\b(?:There is no result in database for query|No torrents found)\b/i.test(
        text
      );
    });
    return explicitlyEmpty ? SearchResult.NOT_EXIST : SearchResult.NOT_CHECKED;
  }
}
