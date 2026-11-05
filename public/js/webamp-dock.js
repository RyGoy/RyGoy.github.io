// Sidebar Webamp player (button in partials/navbar.html, playlist in data/webamp.toml).
// Webamp (MIT, https://github.com/captbaritone/webamp) is fetched only when the button is first clicked.
const WEBAMP_URL = 'https://unpkg.com/webamp@2.3.1/built/webamp.bundle.min.mjs';
const WINDOW_HEIGHT = 116; // height of each Winamp window
const webampButton = document.getElementById('webamp-open');
if (webampButton) {
  let webamp;
  const label = webampButton.textContent;
  const fail = message => { webampButton.textContent = message; webampButton.disabled = true; };

  webampButton.addEventListener('click', async () => {
    webampButton.disabled = true; // re-enabled when the player is closed
    if (webamp) { webamp.reopen(); return; }
    webampButton.textContent = 'Loading Webamp…';
    try {
      const { default: Webamp } = await import(WEBAMP_URL);
      if (!Webamp.browserIsSupported()) return fail('Webamp does not work in this browser');
      const tracks = JSON.parse(webampButton.dataset.tracks || '[]').map(({ url, title, artist }) => ({
        url: new URL(url, location.href).href,
        ...(artist ? { metaData: { artist, title } } : { defaultName: title }),
      }));
      // Open with the main, equalizer and playlist windows stacked at the bottom-left, over the sidebar.
      const top = Math.max(0, window.innerHeight - 3 * WINDOW_HEIGHT);
      const windowLayout = {
        main: { position: { left: 0, top } },
        equalizer: { position: { left: 0, top: top + WINDOW_HEIGHT } },
        playlist: { position: { left: 0, top: top + 2 * WINDOW_HEIGHT }, size: { extraHeight: 0, extraWidth: 0 } },
      };
      webamp = new Webamp({ initialTracks: tracks, windowLayout, zIndex: 40 });
      webamp.onClose(() => { webampButton.disabled = false; });
      // Webamp keeps its windows inside the element it renders into, so the dock covers the whole
      // viewport (fixed, so the player stays put while the page scrolls) and the windows can go anywhere.
      const dock = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'webamp-dock' }));
      await webamp.renderInto(dock);
      webampButton.textContent = label;
    } catch {
      webamp = undefined;
      webampButton.disabled = false;
      webampButton.textContent = 'Webamp failed to load. Try again';
    }
  });
}
