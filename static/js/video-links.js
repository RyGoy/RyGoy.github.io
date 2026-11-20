// "Accountants set policy": links each mention of Steve Paikin or his show (The Agenda, theagenda.tvo.org),
// "bookkeepers make the rules", and accountants setting (public) policy, in posts, comments and articles, to the video
// static/videos/accountants-set-policy.mp4. Runs before static/js/dictionary-terms.js (both deferred, in that order),
// which then leaves these links alone, as it does every link. Without JavaScript the text is left as it is.
(() => {
  const blocks = [...document.querySelectorAll('.post-message, .longform > .prose')].filter((el) => !el.closest('.source-card'));
  if (!blocks.length) return;
  const VIDEO = document.currentScript.dataset.video;
  const SKIP = 'a, button, code, pre, script, style, summary';
  const pattern = new RegExp([
    String.raw`(?:["“]?The Agenda["”]? with )?(?:Steve\s+|S\.\s*)?Paik[ei]n`,
    String.raw`(?:https?:\/\/)?theagenda\.tvo\.org\/?`,
    String.raw`bookkeepers make the rules?`,
    String.raw`accountants?\b[^.!?\n]{0,40}?\bsets?\b[^.!?\n]{0,25}?\bpolicy`,
  ].join('|'), 'gi');

  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      let last = 0;
      const parts = [];
      for (const m of text.matchAll(pattern)) {
        parts.push(text.slice(last, m.index));
        const a = document.createElement('a');
        a.className = 'video-link';
        a.href = VIDEO;
        a.title = 'Watch: accountants set policy';
        a.textContent = m[0];
        parts.push(a);
        last = m.index + m[0].length;
      }
      if (parts.length) node.replaceWith(...parts, text.slice(last));
    }
  }
})();
