# Library

The Library gathers the subjects the group studied and the books behind them, at `/library/`.

## Subjects

- **The five subjects:** accounting, agency, bills of exchange, insurance, and title and property, one section each under `content/`.
- **Where they're listed:** `content/library/_index.md` names them in its `subjects` front matter. The sidebar, the home page and `/library/` all read that one list.
- **What a subject holds:** its own articles. Accounting has the Start Here lesson, the [Flash cards](flash-cards.md), the Accounting Lens: the beginner's guide's lessons (`guide/lens/`, mounted at `/accounting/lens/`; drafts, so shown only in a `hugo server -D` preview until approved), and Corporate Registration (`/accounting/corporateregistration/`): for each US state and Canadian province and territory, the office that registers corporations, the corporations statute, where security interests are registered (UCC-1 filing in the US, the PPSA registry in Canada; each country's `security_label` names the line), and four summaries checked in November 2026 (`legal_system`, `minimums`, `number_names`, `tax`, each with its source in `sources`; `notes` records what couldn't be confirmed and isn't shown), with an optional `articles` fold-out quoting what the act requires the articles of incorporation to say (`document`, `who_may_incorporate`, `items` of `section` and `text`, `url`), from `data/corporate_registration.json` (countries, then regions, each a card as on `/library/`; `layouts/_default/corporate-registration.html`, and a jurisdiction missing a field stops the build). Each jurisdiction shows its flag, `static/images/flags/<name, lowercase, hyphenated>.webp`: 250-pixel renders of each "Flag of <name>.svg" on Wikimedia Commons (Georgia's is "Flag of Georgia (U.S. state).svg", the Northwest Territories' "Flag of the Northwest Territories.svg"), downloaded on 2026-11-18 and converted to WebP. Federal Canada's flag, `canada.webp`, is the 1921 Red Ensign, drawn for the site from the shield in `static/images/canada-shield-1921.svg` (in the fly), a red field and the Union Flag (in the canton), rendered with headless Chrome. A missing flag stops the build; replace a file when a flag changes. Canada is listed before the United States, its federal card first.
- **The "Reading the Bible" guide** is the body of `content/library/_index.md`, shown under the cards on `/library/`.

## Books

Each book is a file in `content/library/` (`layouts/library/single.html`):

| Front matter | What it does |
|---|---|
| `author`, `edition`, `description` | Shown on the page |
| `pdf` | Starting with `/`: a copy in `static/library/` (public-domain or freely licensed). A full address: someone else's copy |
| `source` (+ `source_label`) | Where the text comes from |
| `cover`, `cover_alt`, `cover_credit`, `cover_credit_url` | The cover image in `assets/images/library/`, shown beside the summary (360 px) and as a thumbnail in the list (72 px). A missing file stops the build |
| `coming_soon = true` + `[copyright]` | A book still in copyright: its buttons are switched off, and a Copyright section says when it's expected to enter the public domain in the US and Canada |
| `emblem = "cobra"`, `[emblem_video]` | The cobra emblem beside the title, playing a video in a pop-up |

## Connected

- [Content model](content-model.md): where books and subjects live.
- [Flash cards](flash-cards.md): the accounting subject's game.
- [Templates](templates.md): `layouts/library/`.

Details: `CLAUDE.md`, "Content model" (the Library and library books bullets).
