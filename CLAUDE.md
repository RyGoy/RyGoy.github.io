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

`.github/workflows/hugo.yml` builds on push to `main` (or manual dispatch) and deploys `./public` via `actions/upload-pages-artifact` / `actions/deploy-pages`. CI rebuilds `public/` from scratch. With ~126k files, GitHub Pages' file sync (usually ~2 minutes) sometimes passes the deploy step's 10-minute limit and fails with "Timeout reached"; `actions/deploy-pages` caps its `timeout` input at 10 minutes, so raising it has no effect. Don't re-run a timed-out deploy: the Pages deployment is named after the commit, and retries of a cancelled one never start (the log shows an empty "Current status"). Deploy a new commit instead (merge or push the next change).

There is no `.gitignore`: `public/`, `node_modules/`, and `resources/` are committed. The committed `public/` is a stale build artifact, not the source of truth. Don't edit it by hand, and keep regenerated `public/` churn out of unrelated commits.

## Content model

Content is machine-exported Facebook data. Front matter is **JSON** (or TOML `+++` for articles).

- `content/vol_<roman>/` — one section per volume. `_index.md` holds `Title` ("Volume N") and `weight`.
- `content/vol_*/<post_id>/_index.md` — a **post**, as a branch bundle. Fields include `id`, `created_time`, `from_name`, `from_id`, `message`, `link`, `name`, `caption`, `description`, `source`, `type`, `place`.
- `content/vol_*/<post_id>/<post_id>-<comment_id>.md` — **comments** on that post. Fields: `id`, `post_id`, `from_name`, `message`, `created_time`.
- `content/articles/<author>/*.md` — articles, TOML front matter (`author`, `title`, `date`, `weight`, `tags`, `categories`). Author dirs are sections, ordered `ByWeight`.
- `content/{accounting,agency,bills-of-exchange,insurance,title&property}/` — subject pages, grouped as the **Library**. `content/library/_index.md` lists them in its `subjects` front matter; the sidebar Library group, the home page Library section and `/library/` (`layouts/library/list.html`) all read that list. `title&property` is published at `/titleproperty/`, with an alias from `/title&property/`.
- `content/library/*.md` — library books (`layouts/library/single.html`). Front matter: `author`, `edition` (not `published`, which Hugo reads as a date), `description`, `pdf` and `source` (+ optional `source_label`). A `pdf` starting with `/` is a copy in `static/library/` (public-domain works only); a full address opens someone else's copy. `coming_soon = true` (books still in copyright) shows a "Coming soon" button to the home page until wfgresearch.org publishes the copy with its license and notice; then replace it with `pdf` pointing at that copy and `source` at its notice page. The body of `content/library/_index.md` is the "Reading the Bible" guide (heading from `guide_title`), rendered on `/library/` below the cards; it uses the `cards`, `card` and `callout` shortcodes in `layouts/shortcodes/`.

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

Searches can also be filtered by `Author` (who wrote a post, article or commentary note) and `Commenter` (who commented on a post). These come from `data-pagefind-filter` on the names in `partials/lpPosts.html`, `partials/article.html` and `commentary/single.html`. `Year` (posts, articles, notes) and `Volume` (posts) come from empty elements written by `partials/search-filters.html`: one `data-pagefind-filter` attribute holds only one filter, and the values are plain numbers so the search page lists them in numeric order.

## Most Discussed

`/most-discussed/` (`content/most-discussed/_index.md`, `layouts/most-discussed/list.html`) shows the 100 posts with the most comments, from all volumes. `partials/volumes.html` appends it after the last volume, so the sidebar, the home page and the previous/next links treat it as a volume. Its `symbol` (✝) and `number` (∞) front matter stand in for the roman numeral and the volume number. The page is laid out like a volume page: the same header, with places in tens (Places 1–10 …) for months, and the poster filter hides empty sections. Its heading emblem is a crucifix (`static/images/emblems/crucifix.svg`, `.discussed-heading`) in place of the rose window used on every other page.

## Dictionary, concordance and inline definitions

`/dictionary/` (`content/dictionary.md`, `layouts/_default/dictionary.html`) lists the terms in `data/dictionary.json`, every definition shown. Definitions are in the archive's own words; ones that quote a statute, dictionary or other writer are left out. The exception is kind `wex`: for terms the archive does not define, the opening paragraph of the term's entry in Wex, the legal dictionary of Cornell Law School's Legal Information Institute (shared under CC BY-NC-SA 2.5), credited and linked, with its `license` ({name, url}). These are light blue on the page and in the inline cards, and a note under the page heading says so. A definition by someone other than Scott Duncan gives the writer in `by` (Chris Schulte on Accounting), shown before its source. A term can have an empty `definitions` list: it is listed as "No definition yet", is in the concordance, and is linked inline with a card that says so. The terms written in capitals in Scott Duncan's and ROGUESUPPORT INC's articles were added this way when his posts and comments in the volumes had no definition of them. An entry's optional `match` list gives the words to look for when the term is not itself one (`Include, Including`); an empty list leaves it out of the next two features. An entry's optional `forms` list gives other written forms (`ACCEPTED, ACCEPTING` for Acceptance; `LEGALLY` for Legal) that are linked inline as the term; they are not counted in the concordance, which keeps its output (and the deploy's file count) down.

- **Concordance**: `scripts/concordance.py` (standard library Python) finds every use of each term in posts, comments and articles (whole word, any case) and writes `public/concordance/index.json` and `<id>/<n>.json` chunks of 500. The deploy workflow runs it after Pagefind; a plain `hugo` build has no concordance, and `/concordance/` (`layouts/_default/concordance.html`) says so. To try it locally, run the script with a build directory's `concordance/` as the argument. The output is about 55 MB, so don't write it into the committed `public/`.
- **Inline definitions**: `static/js/dictionary-terms.js` links the first use of each term written in capitals (or its plural, unless that is a term of its own) in each post, comment and article to its entry, with its first definitions (up to three, numbered, each with its source) in a card on hover or focus. Its terms come from `/dictionary-terms.json`, built by `partials/dictionary-terms.html`.

## YouTube videos in posts and comments

A post or comment whose message links a YouTube video (`youtube.com/watch?v=`, `youtu.be/`, `embed/`, `shorts/`, mobile links), or a post whose link is one, shows each video under its text and above the link card (`partials/youtube-embeds.html`, called from `partials/lpPosts.html`). Message text is front matter, where shortcodes don't run, so the template finds the links itself. Each video is a thumbnail until clicked; `static/js/youtube-embed.js` then swaps in the youtube-nocookie player, so pages with dozens of videos load none up front. Without JavaScript the thumbnail links to YouTube. Removed videos show YouTube's grey placeholder.

## Archived links

Posts and comments show archived copies of their outside links: under a post's link card, and in a list under a message, each labelled "Archived link (<archive>, saved <date>)" with a note that it was added by this site and is not part of the original. The record is never changed: messages and original links render exactly as exported (apart from the added elements, a build is byte-identical to one without this feature).

- `scripts/archive_links.py` (standard library Python) reads the addresses from `content/vol_*/` and asks the Wayback Machine (CDX search, captures saved with status 200 only) and archive.today (Memento TimeMap at archive.ph) for the copy closest to the post's or comment's date. It writes every answer to `scripts/archive-checks.json` (so a run can be stopped and continued) and the confirmed copies to `data/archives.json`, keyed by post or comment ID. It is run by hand, not at deploy: it asks slowly and takes hours, and archive.today refuses many automated clients. Failed checks (errors, refusals, CAPTCHAs) are asked again on the next run and show nothing meanwhile.
- `partials/archive-links.html` (called from `partials/lpPosts.html`) shows only what `data/archives.json` lists; it finds no addresses itself. An address with no confirmed copy shows nothing.
- Left out of the check: Facebook (the Wayback Machine's copies are its log-in or security check page, saved with status 200), YouTube links in comments (shown as video thumbnails), addresses that are already archive copies, and addresses written with "..." or "…" (possibly shortened for display, so the address may name a different page). Of an address written with a final full stop, the reading with the stop is tried first, then the one without.
- The Wayback Machine refuses to search some sites (such as Dropbox, "excluded from the Wayback Machine"); the script records those as having no copy after checking that the Wayback Machine answers other searches.
- Archived links are kept out of the search index (`data-pagefind-ignore`).

## The Tender For Law Anthology

Anibal Jose Baez (as "Mackximus"/MAXIMILIANO PEREZ) printed the group's feed from Facebook on 13 and 14 June 2014 and shared it as nine PDFs, "The Tender For Law Anthology" (https://app.box.com/s/47vmhgo8olstohisc2ju, 1.5 GB, not hosted here). The printout has names, pictures and comments the Facebook export lost. All nine volumes are done. They come from four separate print runs (the footer's "N of M" and time):

| Volume | Print run | Printout pages | Feed activity |
|---|---|---|---|
| 1 | of 3948, 14 Jun 07:56 | 2676–3948 | 8 Jan – 9 Jul 2013 |
| 2 | of 3948 | 1450–2675 | 9 Jul – 1 Aug 2013 |
| 3 | of 4705, 13 Jun 18:00 | 3290–4697 | Aug – 28 Oct 2013 |
| 4 | of 4705 | 2076–3290 | 25 Oct – 13 Nov 2013 |
| 5 | of 4705 | 640–2075 | 13 Nov – 28 Dec 2013 |
| 6 | of 2714, 13 Jun 13:37 | 1413–2703 | 28 Dec 2013 – 7 Feb 2014 |
| 7 | of 3136, 13 Jun 09:02 | 2285–3134 | 4 Feb – 5 Apr 2014 |
| 8 | of 3136 | 1521–2285 | 5 Apr – 9 May 2014 |
| 9 | of 3136 | 1–1521 | 9 May – 13 Jun 2014 |

The feed is ordered by last activity, so old posts revived by new comments are printed in later volumes. Nothing after 13 June 2014 was printed: later posts and comments (the rest of site Volume 6 and Volumes 7–14) have no copy. Some accounts never appear in the printout (Adam Thomas, Blake Gardner, Dean Kory, Lana Dukakis, Sky Kittycat: probably blocked by the printing account), so their comments have no copy either.

- `static/anthology/v<N>/<id>.webp`: a cropped picture of each post and comment as printed, named by its site `id` (or the id of a recovered item).
- `data/anthology/v<N>.json`: `printed` (the print date, shown in every caption), `entries` (site id → picture, PDF page, printed name; `missing` and the printed `text` when the export has no name or no content), `recovered` (post id → comments the export lacks: picture, printed name, time in UTC, text, complete `links`), and the volume's title and Box address.
- `content/vol_*/anthology-v<N>-<page>/_index.md`: posts the export lacks entirely, in the volume for their quarter. Front matter `anthology`, `time_unknown` (the printout gives posts a date only), `anthology_text`, `anthology_links`.
- Templates: `partials/anthology-entry.html` looks an id up. `partials/anthology-copy.html` (from `entry.html`) folds the picture under "Printed copy · Anthology Volume N, page P", or shows it in place of a name or content the export lacks. `partials/anthology-comments.html` merges recovered comments into a post's comments by time (the post page and the comments link both count it); `partials/anthology-comment.html` renders one. `partials/anthology-links.html` lists printed addresses (YouTube ones as thumbnails).
- Names that come only from the printout (recovered posts and comments, names the export lacks) are shown in the dictionary's Wex blue (`.anthology-name`). The exported record itself is not edited.
- Pipeline (`scripts/anthology/`, Python with Pillow, plus poppler's `pdftotext`/`pdftoppm`): `pdftotext -bbox-layout vol.pdf bbox.html`; `pdftoppm -r 110 -png vol.pdf pages/p` (pages are `pages/p-NNNN.png`, four digits); `parse.py bbox.html parsed.json [<last header page>]` (splits the feed column into posts and comments with their page strips; a post headed after `<last header page>` belongs to the next volume); `match.py <repo> parsed.json matched.json pages` (matches by time, name and text; names are read by their blue colour; it ignores `anthology-*` posts, so a re-run needs no clean-up first); `build.py <repo> <N> matched.json pages [<last page>[:<first borrowed page>]|-] [<printed date>]`; `verify.py <repo> <build dir> <N>` after a Hugo build; `audit.py <repo> <N> raw.txt parsed.json out.txt` (`raw.txt` from plain `pdftotext`) lists site posts and comments with no copy whose text is in the PDF, and recovered items that duplicate the site. Its leftovers are mostly false alarms: quotes, YouTube addresses, comments dated after the printout, and threads printed in another volume.
- Joins between volumes. The printout runs newest first, so a post headed on the last page of volume N continues at the start of volume N-1. Every post belongs to the volume where its header is printed: that volume gets the continuation pages appended to its `bbox.html` and `pages/` (as pages count+1…), passes `build.py` its real last page (and the first borrowed page when it isn't 1), and items on borrowed pages are labelled with their own volume (`volume` in the entry). The other volume's parser skips the opening fragment (it has no header). Because of the separate print runs, find joins by content: v2 + v1 p1; v3's last page is v2's first (the FEATURE! post stays in v2); v4's last page is v3's first (nothing appended); v5 + v4 p1; v6's last post is printed whole in v5 (kept in v5 only); v7/v6 no overlap; v8 + v7 pp2–6 (v7 p1 is v8's last page); v9's last page is v8's first (kept in v8). Parse arguments used: v2 1226, v3 1407, v5 1436, v6 1290, v8 765, v9 1520; build: v2 1226, v5 1436, v8 765:2, others `-`; printed 2014-06-14 for v1–v2, 2014-06-13 for v3–v9.
- Printout quirks the scripts handle: times are US Eastern (with daylight saving); an edited comment shows its edit time; long posts are cut short ("See More"); many members were renamed between the export and the printout ("Harry Wombat"/"Harry Nosed Wombat", "August le Blanc"/"Bobis Youruncle", "Anibal Jose Baez"/"Mackximus Minimus"; `match.py` learns such aliases from agreeing comments); 2014 dates have no year, and the newest are relative ("11 hrs", "Yesterday at"), counted back from the footer's print time (their recovered times are estimates, `time_approx`); emoticons print as pictures; members pasted other threads, date lines included, into comments (kept as one comment); Facebook exported photos, files and shares as empty posts (matched by poster and day); every page break can drop a strip of content, including name or date lines, which no crop can recover. The parser keeps a post whose name and date fell into a page break (matched by its text and its comments' times), and a comment whose date fell into one (matched by text). When a break swallows one comment's end and the next one's start, the one printed item holds both; both comments link to it (`partial`, "cut by a page break").

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

- Home page carousel, headed "The gold is in the comments": `partials/carousel.html` (between the hero and the volumes) and `static/js/carousel.js`, cover-flow style (current frame in front, the others stepped back to each side, wrapping round, no autoplay; frames are wide, 16:9, on desktop and tall, 2:3, on phones). Its frames are placeholders numbered 1–5 until their content is decided.
- Live stylesheet: `static/css/archive.css` (hand-written, dark "occult codex" design), loaded from `partials/head.html`. JS: `static/js/navigation.js`.
- Volume pages and the posts and comments in them show their volume's roman numeral (`data-numeral` on the heading) where other pages show the faint rose window.
- Faint emblems (`static/images/emblems/`) and gothic stonework (`static/images/gothic/`: ashlar texture on the page and sidebar, blind-arcade frieze under the masthead and atop the footer) are CSS-only decoration. Keep them faint.
- Tailwind (`package.json`, `tailwind.config.js`, `static/css/input.css` → `output.css`) and `static/js/buttons.js` are leftovers from the previous design and are not referenced by current layouts. The same goes for the `alert.html`, `banner.html`, and `header.html` partials.
- Font: Cormorant Garamond (`static/fonts/`, OFL license alongside).
- Favicon: a brass cross (`static/images/favicon-crucifix.svg`, with `favicon-32.png` and `apple-touch-icon.png` for browsers and phones that want a PNG), linked in `partials/head.html`.
- Link previews: `partials/head.html` writes Open Graph and Twitter tags on every page: its title, its description or else the Grand Fluff Auto pop-up's text, and the pop-up's picture. Both come from `[params.preview]` in `config.toml`, which the pop-up in `partials/footer.html` also uses for its picture.
- The footer licence is CC BY-NC-ND 3.0 Unported, with Creative Commons' official 88×31 button (`static/images/cc/by-nc-nd.svg`, from their press kit with a `viewBox` added so it scales) linking to the licence deed.
