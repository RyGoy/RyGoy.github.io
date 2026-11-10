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

// Colour theme (sidebar): Sepia, the site's own, or Light or Dark (archive.css, :root[data-theme]). The choice is
// remembered in this browser only; partials/head.html applies it before the page paints.
const themeControls = document.querySelector('.theme-controls');
if (themeControls) {
  const KEY = 'ttfl-theme';
  const buttons = themeControls.querySelectorAll('[data-theme-choice]');
  const showTheme = (theme) => {
    if (theme === 'sepia') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  };
  showTheme(document.documentElement.getAttribute('data-theme') || 'sepia');
  themeControls.hidden = false;
  buttons.forEach((button) => button.addEventListener('click', () => {
    showTheme(button.dataset.themeChoice);
    try { localStorage.setItem(KEY, button.dataset.themeChoice); } catch { /* not remembered */ }
  }));
}

// Back-to-top link on list pages (_default/baseof.html). Without JavaScript it is always shown;
// with it, the link appears once the visitor has scrolled past the first screen.
const backToTop = document.querySelector('.back-to-top');
if (backToTop) {
  const updateBackToTop = () => backToTop.classList.toggle('is-hidden', window.scrollY < window.innerHeight);
  updateBackToTop();
  // Animate only later changes, so the link does not visibly fade out as the page loads.
  requestAnimationFrame(() => requestAnimationFrame(() => backToTop.classList.add('is-ready')));
  window.addEventListener('scroll', updateBackToTop, { passive: true });
}
