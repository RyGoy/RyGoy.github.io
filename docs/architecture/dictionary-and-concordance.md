# Dictionary and concordance

The group's own vocabulary, three ways: a dictionary page, a concordance of every use, and definitions that pop up where a term appears.

## The dictionary

- **The list:** `/dictionary/` lists every term in `data/dictionary.json`, with all its definitions.
- **Definitions are in the archive's own words.** The exception is kind `wex`: for terms the archive never defines, the opening of Cornell's Wex entry, credited, licensed and shown in light blue.
- **Optional fields per term:**
  - `match`: the words to look for, when the term itself isn't one.
  - `forms`: other spellings that link to it inline.
  - `by`: who wrote a definition, when it isn't Scott Duncan.
  - An empty `definitions` list: the term shows "No definition yet".

## The concordance

- **What it is:** every use of each term, in posts, comments and articles, found by `scripts/concordance.py`.
- **When it's made:** at deploy, after Pagefind. It writes `public/concordance/` (an index plus chunks of 500 uses), about 55 MB.
- **The page:** `/concordance/` reads those files in the browser.
- **Locally there's none**, unless you run the script on a build folder.

## Inline definitions

- **What happens:** `static/js/dictionary-terms.js` links the first use of each term written in capitals in a post, comment or article. Hovering over it or focusing it shows a card with up to three definitions.
- **Where the terms come from:** `/dictionary-terms.json`, which `partials/dictionary-terms.html` builds.

## Connected

- [Content model](content-model.md): `data/dictionary.json`.
- [Build and deploy](build-and-deploy.md): the concordance step.
- [Scripts](scripts.md): `concordance.py`.
- [Search and SEO](search-and-seo.md): the other way to find things.

Details: `CLAUDE.md`, "Dictionary, concordance and inline definitions".
