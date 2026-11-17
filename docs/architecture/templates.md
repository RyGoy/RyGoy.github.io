# Templates

Hugo builds every page from the templates in `layouts/`. There is no theme: every template is in this repository.

## Chosen by the shape of the data

The same two templates serve most pages, and branch on what the file contains, not on its type:

- **`_default/list.html`** (folders):
  - A post folder (it has `id`): the post with its comments, oldest first.
  - A volume (its section starts with `vol_`): the month-by-month list of posts.
  - Anything else: a list of articles.
- **`_default/single.html`** (single files):
  - A comment or post (it has `id`): that one entry.
  - Anything else: an article (`partials/article.html`).

A few pages have their own layouts: the dictionary, concordance, search, flash cards (`_default/*.html`), the Library (`library/`), commentary (`commentary/`), Most Discussed (`most-discussed/`) and the home page (`index.html`).

## Building blocks

| Partial | Job |
|---|---|
| `partials/entry.html` | Any post or comment: body (`lpPosts.html`), comments link (`lpGo.html`), metadata |
| `partials/volumes.html` | The volumes in order (by the number in their title, since their weights repeat). A *returning* partial: it gives back a list instead of HTML |
| `partials/navbar.html` | The sidebar, cached per section (`baseof.html`), so anything it shows must be the same across that section |
| `partials/head.html`, `body.html`, `footer.html` | The page frame: styles, scripts, the hero, the footer |
| `partials/seo-meta.html`, `structured-data.html` | Titles, descriptions and schema.org data. See [Search and SEO](search-and-seo.md) |
| `partials/commentary*.html` | The commentary panel and links. See [Commentary](commentary.md) |
| `partials/anthology-*.html` | Printout copies and recovered comments. See [Anthology](anthology.md) |
| `partials/archive-links.html`, `entry-photos.html`, `youtube-embeds.html` | Added material under posts and comments. See [Recovered records](recovered-records.md) |
| `partials/poster-filter.html` | Filter by poster, on volumes and posts |

## Settings

`config.toml` holds every setting an administrator changes, one section per feature (`[params.telegram]`, `[params.live_sign]`, `[params.animation_links]`, `[params.webamp_dock]`, `[params.comments_app]`, `[params.link_preview]`, `[params.grand_fluff_auto]`). Each says which template reads it, and features that can be turned off have an `on` switch. New switches go there, not in a template.

## Rules that bite

- **Templates must work on Hugo 0.114**, the deploy's version. `strings.TrimSpace` is too new, for one: use `trim`.
- **Don't name an attribute `data-poster`.** Go's templates treat it as a web address and encode it, so the poster filter uses `data-author`.
- **A wrong reference stops the build on purpose.** A missing book cover, an unknown carousel path or a bad flash card deck all do, so mistakes don't reach the site.

## Connected

- [Content model](content-model.md): what the templates read.
- [Design and themes](design-and-themes.md): the CSS and scripts the templates load.
- [Build and deploy](build-and-deploy.md): where they run.

Details: `CLAUDE.md`, "Template architecture".
