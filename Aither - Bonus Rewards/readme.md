# Aither - Bonus Reward BBCode

Tampermonkey userscript for generating the BBCode table used for Aither's unique-title bonus contest.

## Usage

1. Open your Aither user torrent list: `/users/<username>/torrents`.
2. Click **Analyze uploads**.
3. Review the skipped/needs-review list.
4. Click **Copy BBCode** and paste the generated table into the contest post.

The script follows the list pagination, reads each torrent detail page, checks the release cutoff, limits results to movies/TV/documentaries, and checks the IMDb search results to make sure every matching torrent is one of your uploads.

## Reward calculation

-   30,000 BON for each unique title.
-   10,000 BON for each additional distinct quality (SD, 720p, 1080p, 2160p).
-   20,000 BON for each full-disc upload.
-   10,000 BON for each additional complete season detected from season notation such as `S01-S05`.

Uploads without an IMDb ID, unreadable metadata, or a 2023 release without a month are shown under **Skipped / needs review** rather than being claimed automatically.

The script uses a small delay between requests and does not attempt to bypass Aither rate limits.

## Publishing a release

The repository includes a GitHub Actions workflow. After committing the changes, push a tag such as `aither-bonus-v0.2.0`; the workflow creates a GitHub release with the userscript and this README attached. The workflow can also be started manually from GitHub Actions.

## Resume support

Progress is checkpointed in `localStorage` after each page, torrent detail page, and uniqueness check. **Pause** stops at the current request, while **Stop** preserves the checkpoint. Reloading the page or reopening the user-torrent list lets you click **Resume** and continue without repeating completed work. **Reset** clears the saved analysis. Parsed torrent details are also cached locally to reduce repeat requests.
