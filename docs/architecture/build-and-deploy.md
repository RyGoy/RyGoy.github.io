# Build and deploy

Every push to `main` rebuilds the whole site from scratch and publishes it on GitHub Pages. Nothing is uploaded by hand, and no built copy is kept in the repository.

## The deploy, step by step

`.github/workflows/hugo.yml` runs three jobs:

1. **build**
   - Installs Hugo **0.152.2 extended**: the version that counts, so templates must not use anything newer. (It was 0.114 until November 2026, when 0.114 failed some builds with `readAndProcessContent: open …/public/_index.html: no such file or directory`.)
   - Runs `hugo --minify`, taking the site address from the Pages settings.
   - Builds the search index with Pagefind (`npx pagefind@1.5.2 --site public`). See [Search and SEO](search-and-seo.md).
   - Builds the concordance (`python3 scripts/concordance.py public/concordance`). See [Dictionary and concordance](dictionary-and-concordance.md).
   - Lists the pages that changed since the last deploy, for IndexNow.
2. **deploy**
   - Publishes the built site to GitHub Pages.
   - GitHub's file sync sometimes stalls until its 10-minute limit. The job then asks Pages for a fresh deployment of the same build itself, up to three times. Don't re-run a failed deploy by hand: if every attempt fails, merge or push the next change.
3. **indexnow**: tells search engines which pages changed (`scripts/indexnow.py`), then remembers what it sent.

A run takes about 12 minutes. Watch it with `gh run list --workflow hugo.yml`.

## Locally

- **Preview:** `hugo server --renderToMemory`. Without that flag, newer Hugo versions write a full `public/` folder to disk, about 256,000 files, which once filled the drive's inodes.
- **Production-like build:** `hugo --minify -d <a scratch folder>`. Delete the folder after checking it.
- **Build with the deploy's Hugo, 0.152.2.** If your local Hugo is another version, a template that works for you may not work in the deploy.
- **Before changing the deploy's Hugo, compare the sitemap** (`public/sitemap.xml`) with the live one: a newer Hugo can change URLs. Moving from 0.114 to 0.152 changed one, the category "MAN ≠ PERSON" (`man-person` became `man--person`); `content/categories/man-≠-person/_index.md` sets it back with `url`.
- **Search and the concordance are absent locally** unless you run their steps on a build folder. See [Search and SEO](search-and-seo.md) and [Dictionary and concordance](dictionary-and-concordance.md).

## Where things are

| | |
|---|---|
| The deploy | `.github/workflows/hugo.yml` |
| Site settings | `config.toml` (`baseURL` matters only locally; the deploy uses the Pages domain) |
| The domain | Set in the repository's Pages settings; DNS at register.com. See [Hosting and outside services](../hosting.md) |
| Ignored build output | `public/`, `resources/_gen/` (Hugo's resized images), in `.gitignore` |

## Connected

- [Hosting and outside services](../hosting.md): GitHub Pages, register.com and the other services the build uses.
- [Scripts](scripts.md): the Python helpers the deploy runs.
- [Templates](templates.md): what Hugo builds.

Details: `CLAUDE.md`, "Commands" and "Deployment".
