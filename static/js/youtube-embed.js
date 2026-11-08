// YouTube videos in posts and comments (layouts/partials/youtube-embeds.html): clicking a thumbnail replaces it with the
// YouTube player, so a page with many linked videos loads none of them until one is played.
document.addEventListener('click', (e) => {
  const link = e.target.closest?.('a.video-embed[data-video]');
  if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const frame = document.createElement('iframe');
  frame.className = 'video-embed';
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(link.dataset.video)}?autoplay=1`;
  frame.title = 'YouTube video';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  link.replaceWith(frame);
  frame.focus();
});
