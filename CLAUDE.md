# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hugo static site ("The Tender For Law"): an archive of old Facebook group posts and comments (2013–2016) plus long-form articles by various authors. No theme (`themes/` is empty); all templates live in `layouts/`. Deployed to GitHub Pages.

## Commands

- Dev server: `hugo server`
- Production build (mirrors CI): `hugo --minify`
- Hugo version is pinned to **0.114.0 extended** in `.github/workflows/hugo.yml` (the local binary may be newer). Avoid template functions newer than 0.114.
- No tests or linter. Verify changes by building and inspecting output. The content tree is ~126k files, so full builds are slow.

## Deployment

`.github/workflows/hugo.yml` builds on push to `main` (or manual dispatch) and deploys `./public` via `actions/upload-pages-artifact` / `actions/deploy-pages`. CI rebuilds `public/` from scratch.

There is no `.gitignore`: `public/`, `node_modules/`, and `resources/` are committed. The committed `public/` is a stale build artifact, not the source of truth. Don't edit it by hand, and keep regenerated `public/` churn out of unrelated commits.

## Content model

Content is machine-exported Facebook data. Front matter is **JSON** (or TOML `+++` for articles).

- `content/vol_<roman>/` — one section per volume. `_index.md` holds `Title` ("Volume N") and `weight`.
- `content/vol_*/<post_id>/_index.md` — a **post**, as a branch bundle. Fields include `id`, `created_time`, `from_name`, `from_id`, `message`, `link`, `name`, `caption`, `description`, `source`, `type`, `place`.
- `content/vol_*/<post_id>/<post_id>-<comment_id>.md` — **comments** on that post. Fields: `id`, `post_id`, `from_name`, `message`, `created_time`.
- `content/articles/<author>/*.md` — articles, TOML front matter (`author`, `title`, `date`, `weight`, `tags`, `categories`). Author dirs are sections, ordered `ByWeight`.
- `content/{accounting,agency,bills-of-exchange,insurance,title&property}/` — subject pages, grouped as the **Library**. `content/library/_index.md` lists them in its `subjects` front matter; the sidebar Library group, the home page Library section and `/library/` (`layouts/library/list.html`) all read that list. `title&property` is published at `/titleproperty/`, with an alias from `/title&property/`.
- `content/library/*.md` — library books (`layouts/library/single.html`). Front matter: `author`, `edition` (not `published`, which Hugo reads as a date), `description`, `pdf` and `source` (+ optional `source_label`). A `pdf` starting with `/` is a copy in `static/library/` (public-domain works only); a full address opens someone else's copy. The body of `content/library/_index.md` (the "Which Bible?" guide) renders on `/library/` below the cards.

## Template architecture

Templates branch on the **shape of the data**, not on content type:

- `_default/list.html`: `.Params.id` set means a post bundle; render the post plus comments sorted by `created_time`. Section starting with `vol_` means a volume index (`partials/volume-list.html`, grouped by month). Otherwise it is an article list.
- `_default/single.html`: `.Params.id` set means a single comment/post page. Otherwise it is an article (`partials/article.html`).
- `partials/entry.html` renders any post or comment. It composes `lpPosts.html` (body), `lpGo.html` (comments link, posts only), and `entry-metadata.html`. A comment is recognised by `.Params.post_id`.
- `partials/volumes.html` is a **returning partial**. It sorts volume sections by the number parsed from their title, because the original `weight` values repeat. Use it (via `partialCached`) whenever volumes need ordering.
- `baseof.html` caches the navbar with `partialCached`, keyed on `.FirstSection.RelPermalink` (or `.CurrentSection` under `articles`, or the page's own address for top-level pages such as `/agency/`). Per-page state in the navbar must stay consistent with that key.

## Search

`/search/` (`content/search.md`, `layouts/_default/search.html`) runs the Pagefind UI. After `hugo`, the deploy workflow runs `npx pagefind@1.5.2 --site public`, which writes the index to `public/pagefind/`. `hugo` alone produces no index, so the search page shows "Search needs JavaScript and the search index". To try search locally, build into another directory and run `npx pagefind@1.5.2 --site <dir> --serve`.

Only elements marked `data-pagefind-body` are indexed: post bundles (the post plus its comments, in `_default/list.html`) and articles, meaning pages in `articles` and in the subject sections (`partials/article.html`). Single-comment pages and volume indexes are left out because they repeat that text. Each indexed page sets a `Section` filter (`Volumes`, `Articles` or `Commentary`). `data-pagefind-ignore` keeps the metadata and "Read Comments" labels out of the results. The sidebar search box (`partials/navbar.html`) submits `?q=` to `/search/`.

Searches can also be filtered by `Author` (who wrote a post, article or commentary note) and `Commenter` (who commented on a post). These come from `data-pagefind-filter` on the names in `partials/lpPosts.html`, `partials/article.html` and `commentary/single.html`.

## Poster filter

Volume pages (the posts) and post pages (the comments) have a "Filter by poster" panel (`partials/poster-filter.html`, `static/js/poster-filter.js`). The list of names is built from each entry's `data-author` attribute. Don't name that attribute `data-poster`: Go templates treat `poster` as a URL attribute and percent-encode it. The selection is kept in the address (`?poster=Name&poster=Other&mode=hide`) and carried to the previous/next volume links. Without JavaScript, the panel stays hidden.

## Commentary

Older students' notes connecting posts and articles. Each note is a Markdown file in `content/commentary/` with YAML front matter: `title`, `author`, `date`, and `connects` (a list of site links, or full `https://` addresses). `[[Note title]]`, `[[/site/link/]]` and `[[target|label]]` in the text link like Obsidian, so the folder works as an Obsidian vault.

- `partials/commentary.html` is a **returning partial** (use via `partialCached`). It builds `links` (note → pages it connects) and `backlinks` (page → notes) once per build. `partials/commentary-resolve.html` turns a reference into a page.
- `partials/commentary-panel.html` is the COMMENTARY panel on posts, comments and articles. CSS hides it unless the sidebar switch puts `.commentary-on` on `<html>` (`static/js/navigation.js`, stored per browser, off by default).
- `layouts/commentary/` holds the note page (wikilinks, Connects, Linked from) and `/commentary/` (d3 connections map from cdnjs, `static/js/commentary-graph.js`, plus the list of notes).
- Approval is GitHub's: "Add commentary" (`partials/commentary-add-link.html`) opens GitHub's new-file editor with a prefilled note. Accounts without write access can only open a pull request, so their notes appear after approval. Accounts with write access (blanket approval) commit directly.
- Notes are searchable with the `Commentary` filter. `partials/page-label.html` gives posts and comments their "Volume N · Author · date" name, shared by search titles and commentary links.

## Styling and assets

- Live stylesheet: `static/css/archive.css` (hand-written, dark "occult codex" design), loaded from `partials/head.html`. JS: `static/js/navigation.js`.
- Faint emblems (`static/images/emblems/`) and gothic stonework (`static/images/gothic/`: ashlar texture on the page and sidebar, blind-arcade frieze under the masthead and atop the footer) are CSS-only decoration. Keep them faint.
- Tailwind (`package.json`, `tailwind.config.js`, `static/css/input.css` → `output.css`) and `static/js/buttons.js` are leftovers from the previous design and are not referenced by current layouts. The same goes for the `alert.html`, `banner.html`, and `header.html` partials.
- Font: Cormorant Garamond (`static/fonts/`, OFL license alongside).
