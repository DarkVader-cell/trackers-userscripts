Find Unique Titles is a user script that allow finding content to upload from other trackers.

# Install
Install directly in Tampermonkey from:

`https://raw.githubusercontent.com/DarkVader-cell/trackers-userscripts/master/Find%20Unique%20Titles/dist/find.unique.titles.user.js`

Tampermonkey will check that URL for updates automatically. You can also copy
paste the content of the file `dist/find.unique.titles.user.js`.
You can generate it by running run `npm run dev`.

# Changelog
## 0.0.26
- Add optional page-by-page automation for source listings that use `page=`.
- Add optional actions for confirmed unique torrents: Download torrent, Rescue torrent,
  Raindrop, qui (added paused), or qBittorrent Web UI (added paused).

## 0.0.17
- Recognize Aither's current card-based search results and reduce its search gap.

## 0.0.16
- Use LST's torrent detail route to retrieve IMDb IDs and movie/TV categories.

## 0.0.15
- Parse LST's current card-based torrent results and retrieve IMDb IDs when needed.

## 0.0.14
- Keep the LST tracker selector visible above the current page layout.

## 0.0.13
- Show the LST tracker selector on UNIT3D layouts without a panel actions area.

## 0.0.12
- Add LST (lst.gg) support as a UNIT3D source and target.
- Enable LST and BHD listings to be checked against Aither.
- Improve BHD torrent-row parsing for current and legacy listing layouts.
- Serve updates from the DarkVader-cell repository.

## 2023-12
- Add support for MTV
- Add support for using title and year when IMDB ID is not available when checking titles on PTP.
- The script now highlight the reason why a title can be uploaded
## 2023-11
- Some work is done to use IMDB Scout code for searching
- Add support for TSeeds

## 2023-10
- Add support for TiK
- Add support for Pter
- Fix HDB not working as a source
- Refactor code to use generator for creating search requests. It is essentially practical when you need to do some fetching to build the request (like fetching another page for IMDB id).
- Add support for CHD and HDSky (thanks to @gawain12)
- PTP can be used a source
- Add a settings panel to configure the script (breaking change)

## 2023-09-30

- Add support for BHD page
- Fix an issue where TV content is shown as new content in PTP
- Add support for GPW
