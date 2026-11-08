// Inline definitions: link TTFL Dictionary terms in posts, comments and articles to their dictionary entry, with
// its first definitions (up to three, with their sources) in a card on hover or focus. The terms come from /dictionary-terms.json
// (layouts/partials/dictionary-terms.html); this script's data-terms attribute holds its address.
// Only terms written in capitals are linked, the way the archive marks a legal term (a term's plural and its other
// written forms count as the term), and only the first use of each term in each post, comment or article. A term with
// no definition yet is linked too; its card says so. Without JavaScript the text is left as it is.
(() => {
  const script = document.currentScript;
  const blocks = [...document.querySelectorAll('.post-message, .longform > .prose')].filter((el) => !el.closest('.source-card'));
  if (!blocks.length || !script) return;
  const SKIP = 'a, button, code, pre, script, style, mark, summary';

  fetch(script.dataset.terms).then((r) => r.json()).then((terms) => {
    const byWord = new Map();
    for (const t of terms) for (const w of t.words) byWord.set(w.toUpperCase().replace(/\s+/g, ' '), t);
    // A term also matches its plural (RIGHT, RIGHTS; PARTY, PARTIES; PUBLIC RECORD, PUBLIC RECORDS) unless that is a term of its own.
    const plural = (w) => (/[^AEIOU]Y$/.test(w) ? `${w.slice(0, -1)}IES` : /(S|X|Z|CH|SH)$/.test(w) ? `${w}ES` : `${w}S`);
    for (const [w, t] of [...byWord]) if (!byWord.has(plural(w))) byWord.set(plural(w), t);
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
      const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text });
      const head = el('p', 'term-card-head');
      head.append(el('strong', '', t.term));
      if (t.n > 1) head.append(el('span', 'term-card-count', `${t.n} definitions`));
      const fill = (count) => {
        if (!t.n) {
          card.replaceChildren(head, el('p', 'term-card-more term-card-empty', 'No definition yet. The link opens its entry in the TTFL Dictionary, with every use in the archive.'));
          return;
        }
        const list = el(t.n > 1 ? 'ol' : 'div', 'term-card-defs');
        for (const d of t.defs.slice(0, count)) {
          const item = el(t.n > 1 ? 'li' : 'div', `term-card-def-${d.kind}`);
          item.append(el('p', '', d.text), el('span', 'term-card-source', d.src));
          list.append(item);
        }
        card.replaceChildren(head, list);
        const rest = t.n - count;
        if (rest > 0) card.append(el('p', 'term-card-more', `${rest} more ${rest === 1 ? 'definition' : 'definitions'} in the TTFL Dictionary`));
      };
      card.hidden = false;
      const r = a.getBoundingClientRect();
      // Show as many of the definitions as fit beside the word, at least one.
      const room = Math.max(innerHeight - r.bottom, r.top) - 14;
      let count = t.defs.length;
      fill(count);
      while (count > 1 && card.offsetHeight > room) fill(--count);
      const width = card.offsetWidth;
      card.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8)) + scrollX}px`;
      // Below the word if it fits there or there is more room below than above; otherwise above it.
      const below = r.bottom + card.offsetHeight + 8 < innerHeight || innerHeight - r.bottom >= r.top;
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
