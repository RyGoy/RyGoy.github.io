// Inline definitions: link TTFL Dictionary terms in posts, comments and articles to their dictionary entry, with
// the first definition in a card on hover or focus. The terms come from /dictionary-terms.json
// (layouts/partials/dictionary-terms.html); this script's data-terms attribute holds its address.
// Only terms written in capitals are linked, the way the archive marks a legal term, and only the first use of
// each term in each post, comment or article. Without JavaScript the text is left as it is.
(() => {
  const script = document.currentScript;
  const blocks = [...document.querySelectorAll('.post-message, .longform > .prose')].filter((el) => !el.closest('.source-card'));
  if (!blocks.length || !script) return;
  const SKIP = 'a, button, code, pre, script, style, mark, summary';

  fetch(script.dataset.terms).then((r) => r.json()).then((terms) => {
    const byWord = new Map();
    for (const t of terms) for (const w of t.words) byWord.set(w.toUpperCase().replace(/\s+/g, ' '), t);
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const words = [...byWord.keys()].sort((a, b) => b.length - a.length).map(escape);
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`, 'gu');

    const card = document.createElement('div');
    card.className = 'term-card';
    card.id = 'term-card';
    card.setAttribute('role', 'tooltip');
    card.hidden = true;
    document.body.append(card);

    for (const block of blocks) {
      const linked = new Set();
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue;
        let last = 0;
        let parts = null;
        for (const m of text.matchAll(pattern)) {
          const term = byWord.get(m[0].replace(/\s+/g, ' '));
          if (!term || linked.has(term.id)) continue;
          linked.add(term.id);
          parts ??= [];
          parts.push(text.slice(last, m.index));
          const a = document.createElement('a');
          a.className = 'term-link';
          a.href = `${script.dataset.dictionary}#${term.id}`;
          a.dataset.term = term.id;
          a.textContent = m[0];
          parts.push(a);
          last = m.index + m[0].length;
        }
        if (parts) node.replaceWith(...parts, text.slice(last));
      }
    }

    const byId = new Map(terms.map((t) => [t.id, t]));
    let current = null;
    const show = (a) => {
      const t = byId.get(a.dataset.term);
      const title = document.createElement('strong');
      title.textContent = t.term;
      const text = document.createElement('p');
      text.textContent = t.text;
      const more = document.createElement('span');
      more.textContent = `${t.n} ${t.n === 1 ? 'definition' : 'definitions'} in the TTFL Dictionary`;
      card.replaceChildren(title, text, more);
      card.hidden = false;
      const r = a.getBoundingClientRect();
      const width = card.offsetWidth;
      card.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8)) + scrollX}px`;
      const below = r.bottom + card.offsetHeight + 8 < innerHeight;
      card.style.top = `${(below ? r.bottom + 6 : r.top - card.offsetHeight - 6) + scrollY}px`;
      a.setAttribute('aria-describedby', card.id);
      current = a;
    };
    const hide = () => {
      card.hidden = true;
      current?.removeAttribute('aria-describedby');
      current = null;
    };
    const target = (e) => e.target.closest?.('.term-link');
    document.addEventListener('pointerover', (e) => { const a = target(e); if (a && e.pointerType !== 'touch') show(a); });
    document.addEventListener('pointerout', (e) => { if (target(e) === current) hide(); });
    document.addEventListener('focusin', (e) => { const a = target(e); if (a) show(a); });
    document.addEventListener('focusout', (e) => { if (target(e) === current) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hide(); });
    addEventListener('scroll', () => { if (current && !current.matches(':focus')) hide(); }, { passive: true });
  }).catch(() => {});
})();
