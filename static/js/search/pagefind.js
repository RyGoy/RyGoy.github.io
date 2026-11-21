// Pagefind UI loads this module in place of Pagefind's own (bundlePath in layouts/_default/search.html). Everything
// passes through to /pagefind/pagefind.js, the same module instance the search page and search-filters.js use,
// except search: a search of several words lists the pages that have them as a phrase first, then the pages that
// have every word anywhere. The index keeps words as written (--force-language in .github/workflows/hugo.yml), so
// every result has every word as typed; only the last is also matched as the start of a longer word, as you type.
import * as pagefind from '../../pagefind/pagefind.js';

export * from '../../pagefind/pagefind.js';

export async function search(term, options) {
  const words = (term ?? '').trim();
  // One word, no words (filters only), or already a quoted phrase: nothing to add.
  if (!/\s/.test(words) || /^".+"$/.test(words)) return pagefind.search(term, options);
  const [all, phrase] = await Promise.all([
    pagefind.search(term, options),
    pagefind.search(`"${words.replace(/"/g, '')}"`, options),
  ]);
  if (!all || !phrase?.results.length) return all;
  const first = new Set(phrase.results.map((result) => result.id));
  return { ...all, results: [...phrase.results, ...all.results.filter((result) => !first.has(result.id))] };
}
