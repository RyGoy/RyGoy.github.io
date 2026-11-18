# Search and SEO

How visitors find things on the site, and how search engines find the site.

## Site search

- **`/search/` runs Pagefind**, a search index made at deploy time (`npx pagefind@1.5.2 --site public`). It runs in the visitor's browser, with no search server. A plain local `hugo` build has no index.
- **What's indexed:** only elements marked `data-pagefind-body`, which are post pages (the post with its comments) and articles. Single-comment pages and volume lists are left out because they repeat the same text.
- **Filters:** Section, Author, Commenter, Year and Volume, set by `data-pagefind-filter` attributes in the templates (`partials/search-filters.html` and others).
- **The filter boxes** are searchable dropdowns (`static/js/search-filters.js`) in place of Pagefind's checkboxes.
- **The sidebar's search box** sends `?q=` to `/search/`.

## Search engines

- **Titles and descriptions** (`partials/seo-meta.html`): a post or comment is titled by its author and the opening of its message.
- **Canonical addresses and noindex.** Every page names its own address. The 126,000 single-comment pages are marked `noindex` and left out of the sitemap, because each repeats its post's page.
- **Structured data** (`partials/structured-data.html`): the home page is a WebSite, posts are forum posts with their comments, and articles are Articles, with breadcrumbs.
- **`robots.txt` and the sitemap** come from `layouts/robots.txt` and `layouts/_default/sitemap.xml`.
- **IndexNow:** after each deploy, the changed pages are sent to search engines (`scripts/indexnow.py`). See [Build and deploy](build-and-deploy.md).
- **Link previews** (Open Graph and Twitter tags in `partials/head.html`) use the site's card, `[params.link_preview]` in `config.toml`, for pages with no picture of their own.

## Connected

- [Dictionary and concordance](dictionary-and-concordance.md): another way in, by term.
- [Templates](templates.md): where the index and filter attributes are written.
- [Hosting and outside services](../hosting.md): IndexNow and the npm registry.

Details: `CLAUDE.md`, "Search" and "Search engines".
