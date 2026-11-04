// Poster filter (layouts/partials/poster-filter.html): show only, or hide, entries by the people selected.
// The choice is kept in the address (?poster=Name&poster=Other&mode=hide) so a filtered page can be shared,
// and it carries over to the previous/next volume links.
(() => {
  const panel = document.querySelector('.poster-filter');
  if (!panel) return;
  const entries = [...document.querySelectorAll(panel.dataset.target)];
  if (entries.length < 2) return;

  const noun = panel.dataset.noun;
  const SHORT_LIST = 12;
  const label = (name) => name || 'Unknown poster';
  const counts = new Map();
  for (const entry of entries) counts.set(entry.dataset.author, (counts.get(entry.dataset.author) || 0) + 1);
  const names = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || label(a).localeCompare(label(b)));

  const params = new URLSearchParams(location.search);
  const selected = new Set(params.getAll('poster'));
  let mode = params.get('mode') === 'hide' ? 'hide' : 'only';
  let expanded = false;

  const $ = (selector) => panel.querySelector(selector);
  const search = $('.poster-filter-search input');
  const list = $('.poster-filter-names ul');
  const chips = $('.poster-filter-chips');
  const more = $('.poster-filter-more');
  const none = $('.poster-filter-none');
  const status = $('.poster-filter-status');
  const element = (tag, props, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const visible = (name) => !selected.size || (mode === 'only' ? selected.has(name) : !selected.has(name));

  const applyFilter = () => {
    let shown = 0;
    for (const entry of entries) {
      entry.hidden = !visible(entry.dataset.author);
      if (!entry.hidden) shown += 1;
    }
    // Volume pages: hide months left empty, and their links in the month index.
    for (const section of document.querySelectorAll('.month-section')) {
      section.hidden = !section.querySelector('.archive-entry:not([hidden])');
      const heading = section.querySelector('h2[id]');
      const link = heading && document.querySelector(`.date-index a[href="#${CSS.escape(heading.id)}"]`);
      if (link) link.parentElement.hidden = section.hidden;
    }
    status.textContent = selected.size ? `· ${shown} of ${entries.length} ${noun}` : `· ${entries.length} ${noun}`;
  };

  const saveToAddress = () => {
    const next = new URLSearchParams(location.search);
    next.delete('poster');
    next.delete('mode');
    for (const name of selected) next.append('poster', name);
    if (selected.size && mode === 'hide') next.set('mode', 'hide');
    const query = next.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    for (const link of document.querySelectorAll('.volume-pagination a:not([href*="#"])')) {
      link.dataset.href ??= link.getAttribute('href');
      link.setAttribute('href', `${link.dataset.href}${query ? `?${query}` : ''}`);
    }
  };

  const renderChips = () => {
    chips.replaceChildren(...[...selected].map((name) => {
      const remove = element('button', { type: 'button', title: `Remove ${label(name)}` }, label(name), element('span', { ariaHidden: 'true' }, ' ×'));
      remove.setAttribute('aria-label', `Remove ${label(name)} from the filter`);
      remove.addEventListener('click', () => toggle(name, false));
      return element('li', {}, remove);
    }));
    chips.hidden = !selected.size;
  };

  const matches = () => {
    const query = search.value.trim().toLowerCase();
    return names.filter((name) => label(name).toLowerCase().includes(query));
  };

  const renderList = () => {
    const found = matches();
    const searching = search.value.trim() !== '';
    const shown = searching || expanded ? found : found.slice(0, SHORT_LIST);
    list.replaceChildren(...shown.map((name) => {
      const box = element('input', { type: 'checkbox', checked: selected.has(name) });
      box.addEventListener('change', () => toggle(name, box.checked));
      return element('li', {}, element('label', {}, box, element('span', { className: 'poster-filter-name' }, label(name)),
        element('span', { className: 'poster-filter-count' }, String(counts.get(name)))));
    }));
    none.hidden = found.length > 0;
    more.hidden = searching || names.length <= SHORT_LIST;
    more.textContent = expanded ? 'Show fewer people' : `Show all ${names.length} people`;
  };

  const update = () => {
    renderChips();
    renderList();
    applyFilter();
    saveToAddress();
  };

  const toggle = (name, on) => {
    if (on) selected.add(name); else selected.delete(name);
    update();
  };

  for (const radio of panel.querySelectorAll('input[name="poster-filter-mode"]')) {
    radio.checked = radio.value === mode;
    radio.addEventListener('change', () => { mode = radio.value; update(); });
  }
  search.addEventListener('input', renderList);
  // Enter picks the first matching name that is not selected yet.
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = matches().find((candidate) => !selected.has(candidate));
    if (name === undefined) return;
    search.value = '';
    toggle(name, true);
  });
  more.addEventListener('click', () => { expanded = !expanded; renderList(); });
  $('.poster-filter-clear').addEventListener('click', () => { selected.clear(); search.value = ''; update(); });

  panel.hidden = false;
  panel.open = selected.size > 0;
  update();
})();
