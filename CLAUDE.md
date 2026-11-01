# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hugo static site ("The Tender For Law"): an archive of old Facebook group posts and comments (2013–2016) plus long-form articles by various authors. No theme (`themes/` is empty); all templates live in `layouts/`. Deployed to GitHub Pages.

## Commands

- Dev server: `hugo server`
- Production build (mirrors CI): `hugo --minify`
- Hugo version is pinned to **0.114.0 extended** in `.github/workflows/hugo.yml`; the local binary matches. Avoid template functions newer than 0.114.
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
- `content/{accounting,agency,bills-of-exchange,insurance,title&property}/_index.html` — subject pages. Currently empty; linked from a hardcoded list in `layouts/partials/navbar.html`.

## Template architecture

Templates branch on the **shape of the data**, not on content type:

- `_default/list.html`: `.Params.id` set means a post bundle; render the post plus comments sorted by `created_time`. Section starting with `vol_` means a volume index (`partials/volume-list.html`, grouped by month). Otherwise it is an article list.
- `_default/single.html`: `.Params.id` set means a single comment/post page. Otherwise it is an article (`partials/article.html`).
- `partials/entry.html` renders any post or comment. It composes `lpPosts.html` (body), `lpGo.html` (comments link, posts only), and `entry-metadata.html`. A comment is recognised by `.Params.post_id`.
- `partials/volumes.html` is a **returning partial**. It sorts volume sections by the number parsed from their title, because the original `weight` values repeat. Use it (via `partialCached`) whenever volumes need ordering.
- `baseof.html` caches the navbar with `partialCached`, keyed on `.FirstSection.RelPermalink` (or `.CurrentSection` under `articles`). Per-page state in the navbar must stay consistent with that key.

## Styling and assets

- Live stylesheet: `static/css/archive.css` (hand-written, dark "occult codex" design), loaded from `partials/head.html`. JS: `static/js/navigation.js`.
- Tailwind (`package.json`, `tailwind.config.js`, `static/css/input.css` → `output.css`) and `static/js/buttons.js` are leftovers from the previous design and are not referenced by current layouts. The same goes for the `alert.html`, `banner.html`, and `header.html` partials.
- Font: Cormorant Garamond (`static/fonts/`, OFL license alongside).
