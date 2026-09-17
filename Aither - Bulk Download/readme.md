# Aither - Sequential Bulk Torrent Downloader

Tampermonkey userscript for sequentially downloading torrents from an Aither user-torrent listing.

## Features

- Processes only `a.user-torrents__name` torrent links.
- Clicks Aither's `/torrents/download/{id}` link on each detail page.
- Follows Aither's `?page=N` pagination while preserving the current filtered listing.
- Persists progress in `localStorage` across full-page navigation and reloads.
- Configurable base delay, random jitter, and periodic pauses.
- Live progress panel with start, pause, stop, settings, and debug controls.
- Copyable diagnostics with usernames redacted from URLs and no cookies or credentials.
- Stops when a likely CAPTCHA/rate-limit signal or missing download button is detected.

## Installation

Install the raw file directly in Tampermonkey:

`https://raw.githubusercontent.com/Moreasan/trackers-userscripts/master/Aither%20-%20Bulk%20Download/Aither%20-%20Bulk%20Download.user.js`

Or open `Aither - Bulk Download.user.js` and create a new Tampermonkey script by pasting its contents.

## Usage

1. Open the filtered Aither user-torrent list.
2. Click **Start Aither downloader**.
3. Configure the delay and optional pauses with **Settings**.
4. Use **Copy debug** to copy a sanitized diagnostic report when reporting a problem.

The script is deliberately single-threaded and does not attempt to bypass rate limits. Stop it if Aither shows a CAPTCHA, warning, HTTP 429 message, or other account notice. Use automation only where permitted by Aither's rules or staff.

## Resetting saved progress

To discard saved progress, run this in the Aither page console:

```js
localStorage.removeItem("aither-bulk-download-state-v1");
```

Settings are stored separately under `aither-bulk-download-settings-v1`.
