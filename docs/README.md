# The Tender For Law: how it's built

Start here. These notes explain the site's architecture in plain terms: what each part does, which files hold it, and how the parts connect. They're written for people. `CLAUDE.md` at the top of the repository holds the full working detail for Claude Code, and each note points to its section there.

**Reading these in Obsidian:** open this `docs/` folder as a vault (Obsidian → Open folder as vault → `docs`), not the whole repository: the archive's 126,000 content files would slow Obsidian down. The links between notes are ordinary Markdown links, so they also work on GitHub, and Obsidian's graph view (Ctrl/Cmd+G) draws them as a map. `architecture.canvas` is a hand-laid map of the system to move around and annotate (Obsidian only). Obsidian keeps its own settings in `docs/.obsidian/`, which git ignores.

## The map

- [Overview](architecture/overview.md): the whole system on one page, and where to go next.
- [Hosting and outside services](hosting.md): everything the site depends on outside this repository (Cloudflare and others), and how to move the bot between hosts.
- [What we built](changelog.md): every change merged so far, by date, linked to the notes it touches.

## The parts

| Part | Note |
|---|---|
| Building and publishing the site | [Build and deploy](architecture/build-and-deploy.md) |
| What the content is: volumes, posts, comments, articles, books | [Content model](architecture/content-model.md) |
| How pages are made from the content | [Templates](architecture/templates.md) |
| Finding things, and being found | [Search and SEO](architecture/search-and-seo.md) |
| The dictionary, concordance and inline definitions | [Dictionary and concordance](architecture/dictionary-and-concordance.md) |
| The Library: subjects and books | [Library](architecture/library.md) |
| Students' notes and questions | [Commentary](architecture/commentary.md) |
| The Telegram bot | [Telegram bot](architecture/telegram-bot.md) |
| The debit and credit game | [Flash cards](architecture/flash-cards.md), and the deck authors' guide, [Writing flash card decks](flashcards.md) |
| Signing in to keep flash card progress | [Flash card accounts](architecture/flash-card-accounts.md) |
| The 2014 printout and what it recovered | [Anthology](architecture/anthology.md) |
| Archived links, recovered pictures, profile links, imported posts | [Recovered records](architecture/recovered-records.md) |
| Themes, animations and decoration | [Design and themes](architecture/design-and-themes.md) |
| The Python helpers, and when they run | [Scripts](architecture/scripts.md) |

## Keeping these notes true

When a change alters how a part works, update its note in the same change, and add outside services to [Hosting and outside services](hosting.md). Refresh the change log with `python3 scripts/docs_changelog.py` (it reads the merged pull requests through the GitHub CLI, `gh`).
