// Share buttons on each article (partials/article.html) and on each post and comment
// (partials/entry.html). They open the browser's share sheet, or copy the link
// where there is none. They stay hidden without JavaScript, or when the browser can do neither (the
// clipboard needs https or localhost).
const canShare = typeof navigator.share === 'function';
const canCopy = Boolean(navigator.clipboard && navigator.clipboard.writeText);

const flash = (button, text) => {
  clearTimeout(button.flashTimer);
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  button.flashTimer = setTimeout(() => { button.textContent = button.dataset.label; }, 2000);
};

// The page being visited; a Share button on a post or comment adds that entry's anchor (#entry-…),
// so the link opens the current page at that entry.
const shareUrl = (button) => {
  const url = new URL(location.href);
  const entry = button.closest('.archive-entry');
  if (entry) url.hash = entry.id;
  return url.href;
};

if (canShare || canCopy) {
  document.documentElement.classList.add('can-share');

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.share-button');
    if (!button) return;

    const url = shareUrl(button);
    if (canShare) {
      // Rejects when the visitor closes the share sheet; nothing to report then.
      navigator.share({ title: document.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => flash(button, 'Link copied'),
        () => flash(button, "Couldn't copy"),
      );
    }
  });
}
