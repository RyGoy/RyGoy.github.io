// Share button in the masthead (_default/baseof.html) and Copy button on each post and comment
// (partials/entry.html). Both stay hidden without JavaScript, or when the browser can do neither
// (the clipboard needs https or localhost).
const canShare = typeof navigator.share === 'function';
const canCopy = Boolean(navigator.clipboard && navigator.clipboard.writeText);

const flash = (button, text) => {
  clearTimeout(button.flashTimer);
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  button.flashTimer = setTimeout(() => { button.textContent = button.dataset.label; }, 2000);
};

const copy = (button, text, done) => navigator.clipboard.writeText(text).then(
  () => flash(button, done),
  () => flash(button, "Couldn't copy"),
);

// Author, date, text and link of one entry, for pasting elsewhere.
const entryText = (entry) => {
  const author = entry.querySelector('.entry-header h2')?.textContent.trim();
  const date = entry.querySelector('.entry-header time')?.textContent.trim();
  const body = [...entry.children]
    .filter((el) => !el.matches('.entry-header, .entry-footer'))
    .map((el) => el.innerText.trim())
    .filter(Boolean);
  // The Unique ID link in partials/entry-metadata.html is the entry's own page.
  const link = entry.querySelector('.archival-metadata dd a')?.href;
  return [[author, date].filter(Boolean).join(' · '), ...body, link].filter(Boolean).join('\n\n');
};

if (canShare || canCopy) {
  if (canCopy) document.documentElement.classList.add('can-copy');
  document.documentElement.classList.add('can-share');

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.share-button, .copy-button');
    if (!button) return;

    if (button.classList.contains('share-button')) {
      if (canShare) {
        // Rejects when the visitor closes the share sheet; nothing to report then.
        navigator.share({ title: document.title, url: location.href }).catch(() => {});
      } else {
        copy(button, location.href, 'Link copied');
      }
    } else {
      const entry = button.closest('.archive-entry');
      if (entry) copy(button, entryText(entry), 'Copied');
    }
  });
}
