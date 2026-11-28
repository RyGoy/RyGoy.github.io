# Design and themes

The site's look: a dark "occult codex", in three colour themes, with animations on the home page. All hand-written: one stylesheet and a set of small scripts, no framework.

## The stylesheet and colours

- **One stylesheet:** `static/css/archive.css`, loaded from `partials/head.html`. The font is Cormorant Garamond (`static/fonts/`).
- **Three themes:** Sepia (the default), Light and Dark, switched in the sidebar and kept in the browser (`ttfl-theme`). Until a visitor picks one, a device set to light mode gets Light. An inline script sets `data-theme` on the page before it paints.
- **13 colour roles.** Every themed colour is one of 13 roles (the page, text, the accents, lines, shadow, ...) or a mix of two of them, so a theme sets the roles only: the start of the character themes, where each character is a set of roles. The three current themes also keep the colours the mixes don't reproduce, at their old values, until each is redesigned. Details: `CLAUDE.md`, "Colour themes".
- **Checking a change:** `scripts/theme_screens.py` screenshots each theme before and after and lists what changed.

## On the home page

| Feature | Files |
|---|---|
| Carousel, "The gold is in the comments" (`data/carousel.json`) | `partials/carousel.html`, `static/js/carousel.js` |
| Carousel backgrounds: an ember shader (Dark), plasma lines (Light), metal hexagons (Sepia, three.js from jsDelivr) | `static/js/carousel-shaders.js` |
| Above the title: e^x drawn (Sepia), signal waves (Light), the blade (Dark, with sound from `saber-sound.js`) | `partials/body.html`, `archive.css` |
| Live sign on the show button, lit Thursdays 20:00–23:00 Toronto time | `partials/body.html`, `config.toml` (`[params.live_sign]`) |
| Pop-up videos and Webamp players behind the animations | `static/js/webamp-links.js`, `partials/body.html` |

## Everywhere

| Feature | Files |
|---|---|
| Background ripples that follow the pointer | `static/js/ripple.js` |
| Musical Recap: a play button at the foot of the sidebar that keeps playing from page to page | `static/js/musical-recap.js` |
| Faint emblems and gothic stonework | `static/images/emblems/`, `static/images/gothic/` |
| The terms pop-up on the first visit | `partials/terms-gate.html`, `static/js/terms-gate.js` |
| THERE WERE NO GOATS (footer) | `partials/footer.html`, `archive.css` |

**Reduced motion:** every animation has a still version for visitors who ask their system for less motion.

**Leftovers:** none. The previous design's Tailwind setup, its partials (`alert`, `banner`, `header`) and `static/js/buttons.js` were removed in November 2026.

## Connected

- [Templates](templates.md): the partials that load all this.
- [Hosting and outside services](../hosting.md): jsDelivr and unpkg, which serve three.js and Webamp.

Details: `CLAUDE.md`, "Styling and assets".
