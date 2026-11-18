# Library

The Library gathers the subjects the group studied and the books behind them, at `/library/`.

## Subjects

- **The five subjects:** accounting, agency, bills of exchange, insurance, and title and property, one section each under `content/`.
- **Where they're listed:** `content/library/_index.md` names them in its `subjects` front matter. The sidebar, the home page and `/library/` all read that one list.
- **What a subject holds:** its own articles. Accounting has the Start Here lesson, the [Flash cards](flash-cards.md), the Accounting Lens: the beginner's guide's lessons (`guide/lens/`, mounted at `/accounting/lens/`; drafts, so shown only in a `hugo server -D` preview until approved), and Corporate Registration (`/accounting/corporateregistration/`, a section listing every jurisdiction in its card here): a small linked card for each of 64 jurisdictions (federal Canada, the provinces and territories, then the 50 states, by country and region), each opening its own page with the office that registers corporations, the corporations statute, where security interests are registered (UCC-1 filing or the PPSA registry), four summaries checked in November 2026 with their sources, and what the act requires the articles of incorporation to say, quoted section by section. Each page is a file in `content/accounting/corporateregistration/` with its facts in JSON front matter (`CLAUDE.md` lists the fields); `_index.md` holds the "at the time of this writing" notice and the order of countries and regions. Each jurisdiction shows its flag, `static/images/flags/<flag>.webp`: 250-pixel renders of each "Flag of <name>.svg" on Wikimedia Commons (Georgia's is "Flag of Georgia (U.S. state).svg", the Northwest Territories' "Flag of the Northwest Territories.svg"), downloaded on 2026-11-18 and converted to WebP; federal Canada's, `canada.webp`, is the 1921 Red Ensign, drawn for the site from the shield in `static/images/canada-shield-1921.svg`, a red field and the Union Flag, rendered with headless Chrome. A missing flag or field stops the build.
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
