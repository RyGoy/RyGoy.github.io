// Every mention of Quatloos (Quatloos, Quatloosers, Quatloosia, QUATLOOS, the "Quatloops" spellings…) in a post, a
// comment or an article links to the Library's Quatloosers page (data-quatloos on this script's tag). The record itself
// is not changed: the links are added in the browser, as dictionary-terms.js does. Text already in a link, and web
// addresses written out (quatloos.com, quatloosia.blogspot.com), are left alone, and so is the Quatloosers page itself.
(() => {
  const target = document.currentScript.dataset.quatloos;
  if (!target || location.pathname === target) return;
  const SKIP = 'a, button, code, pre, script, style, summary';
  const WORD = /\bquatloo[a-z]*(?![a-z]*\.[a-z])/gi;
  const run = () => {
    for (const block of document.querySelectorAll('.post-message, .longform > .prose')) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest(SKIP) || !/quatloo/i.test(n.data) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.data;
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of text.matchAll(WORD)) {
          frag.append(text.slice(last, m.index));
          const a = document.createElement('a');
          a.href = target;
          a.className = 'quatloos-link';
          a.title = 'Quatloosers, in the Library';
          a.textContent = m[0];
          frag.append(a);
          last = m.index + m[0].length;
        }
        if (!last) continue;
        frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
