# Library

The Library gathers the subjects the group studied and the books behind them, at `/library/`.

## Subjects

- **The five subjects:** accounting, agency, bills of exchange, insurance, and title and property, one section each under `content/`.
- **Where they're listed:** `content/library/_index.md` names them in its `subjects` front matter. The sidebar, the home page and `/library/` all read that one list.
- **What a subject holds:** its own articles. Accounting has the Start Here lesson and the [Flash cards](flash-cards.md).
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
