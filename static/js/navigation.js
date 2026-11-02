// Native details remains usable without JavaScript. Expand the desktop index.
const navigation = document.getElementById('navigation');
if (navigation) {
  const desktop = window.matchMedia('(min-width: 68rem)');
  const updateNavigation = () => { navigation.open = desktop.matches; };
  updateNavigation();
  desktop.addEventListener('change', updateNavigation);
}

// Commentary panels (partials/commentary-panel.html) stay hidden until the visitor turns them on.
// The choice is remembered in this browser only.
const commentaryToggle = document.getElementById('commentary-toggle');
if (commentaryToggle) {
  const KEY = 'ttfl-commentary';
  let on = false;
  try { on = localStorage.getItem(KEY) === 'on'; } catch { /* storage blocked: stays off */ }
  const showCommentary = () => {
    document.documentElement.classList.toggle('commentary-on', on);
    commentaryToggle.setAttribute('aria-pressed', String(on));
    commentaryToggle.querySelector('.commentary-state').textContent = on ? 'On' : 'Off';
  };
  showCommentary();
  commentaryToggle.addEventListener('click', () => {
    on = !on;
    showCommentary();
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
  });
}
