# Scripts

The site itself is HTML, CSS and JavaScript. Python came in on 6 November 2026, with `scripts/concordance.py` (commit `3350173b8f`), only as helpers: two run in every deploy, and the rest are run by hand when the archive is worked on. They use Python's standard library unless noted. The bot is JavaScript (Node); see [Telegram bot](telegram-bot.md).

## Run by the deploy

| Script | Job | Note |
|---|---|---|
| `scripts/concordance.py` | Finds every use of each dictionary term and writes the concordance | [Dictionary and concordance](dictionary-and-concordance.md) |
| `scripts/indexnow.py` | Tells search engines which pages changed | [Search and SEO](search-and-seo.md) |

## Run by hand

| Script | Job | Note |
|---|---|---|
| `scripts/import_db.py "<TTFL DB.db>" [--dry-run]` | Imports the posts and comments a later export has and the site lacks | [Recovered records](recovered-records.md) |
| `scripts/archive_links.py` | Finds archived copies of outside links; slow, can be stopped and continued | [Recovered records](recovered-records.md) |
| `scripts/import_photos.py <collection>` | Copies recovered pictures in and writes `data/photos.json` | [Recovered records](recovered-records.md) |
| `scripts/theme_colours.py` | Works out the Light and Dark colours from the Sepia ones | [Design and themes](design-and-themes.md) |
| `scripts/anthology/*.py` | The printout pipeline (needs Pillow and poppler) | [Anthology](anthology.md) |
| `scripts/guide_build.py [check]` | Builds the beginner's guide's term notes and quote candidates, and checks every quote in its lessons | `guide/README.md` |
| `scripts/docs_changelog.py` | Refreshes [What we built](../changelog.md) from GitHub (needs `gh`) | [Home](../README.md) |

## Connected

- [Build and deploy](build-and-deploy.md): where the deploy's two scripts run.

Details: `CLAUDE.md`, under each feature.
