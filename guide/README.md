# A beginner's guide to THE TENDER FOR LAW

THE TENDER FOR LAW archive holds five years of a Facebook group: 130,000 posts and comments. Most of it is conversation. The teaching is Scott Duncan's (about 19,000 of those posts and comments, and 45 articles), with Chris Schulte's articles on accounting, and nearly all of it answers whatever someone happened to ask. It assumes a way of seeing that nobody stops to teach: **everything is accounting**.

This guide teaches that way of seeing first, then leads you through the archive's best material with it, in order. It quotes only the archive's own words, each linked to where it was written.

**On the site:** the lessons in `lens/` are also the site's pages, at `/accounting/lens/` (the Accounting page's third card). While a lesson has `draft: true`, only a preview shows it: `hugo server -D --renderToMemory`. Removing `draft: true` publishes it with the next deploy.

**Reading it in Obsidian:** open this `guide/` folder as a vault (Obsidian → Open folder as vault → `guide`). Start with Path 1 below. Ctrl+G shows the graph: lessons, the terms they teach, and how they connect.

> [!warning] A pilot
> This is the first path of the guide, drafted for review. Each lesson waits for a reader who knows the material to approve it.

## Paths

1. [**The accounting lens**](lens/_index.md): eight lessons, from debits and credits to tender. Start here. Its map: `paths/accounting-lens.canvas`.
2. *Bills of exchange* (to come)
3. *Agency* (to come)
4. *Surety and insurance* (to come)
5. *Title and property* (to come)

## Terms

`terms/` holds one note for each of the 434 terms in the site's [Dictionary](https://thetenderforlaw.com/dictionary/): its definitions, with links to where they were written, the lessons that teach it, and Scott Duncan's clearest uses of it. Open any of them from a lesson's "Words to know", or search (Ctrl+O).

## How it's made

| Folder | What | Written by |
|---|---|---|
| `lens/` | The lessons | Hand, from the sources; every quote checked |
| `lens/_index.md` | Path 1's lesson plan: the order to read the lessons in | Hand |
| `paths/` | Each path's canvas map | Hand |
| `terms/` | One note per dictionary term | `scripts/guide_build.py`, from `data/dictionary.json` and the archive |
| `sources/` | For each lesson, the 25 best candidates to quote, with the question each answered | `scripts/guide_build.py` |

- `python3 scripts/guide_build.py` rebuilds `terms/` and `sources/` (a few minutes) and checks every quote in the lessons.
- `python3 scripts/guide_build.py check` only checks the quotes: each must appear word for word at the address it links. That covers the blockquotes and the quotes in the running text, written with the quoted words as the link, inside the quote marks: `"[simply means “responsible party”](https://thetenderforlaw.com/vol_v/…/)"`. After a bracket, use curly marks, `(“[…](…)”)`, which the site would otherwise leave straight.
- **Scott's words first:** a lesson says what it means in Scott Duncan's own words wherever he has them, each quote linked to where he wrote it, and each term linked to its note in `terms/` (the Dictionary, on the site).
- **A new lesson** is a file in `lens/` with front matter like the others: its `terms:` (dictionary terms it teaches, which link back to it) and its `search:` words (which choose its `sources/`).
- **Running it never touches a lesson**, so editing a lesson is safe.

Scott Duncan's and Chris Schulte's words are theirs, shared under the site's licence (CC BY-NC-ND 3.0).
