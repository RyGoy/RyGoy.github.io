// Searchable dropdowns in place of Pagefind UI's filter checkboxes (layouts/_default/search.html).
// Each filter in the index (Section, Volume, Year, Author, Commenter) gets a text box whose list of values narrows as you
// type (the browser's own <datalist>); picking a value adds it as a tag, and × on a tag removes it. The selection goes to
// the results through PagefindUI.triggerFilters, so values combine exactly as the checkboxes did. If the index's filters
// can't be read, Pagefind's own checkbox panel stays. The dropdowns go under the search box.
window.searchFilters = async (ui, pagefindUrl, box) => {
  let all;
  try {
    const pagefind = await import(pagefindUrl);
    all = await pagefind.filters();
  } catch {
    return;
  }
  const ORDER = ['Section', 'Volume', 'Year', 'Author', 'Commenter'];
  const rank = (name) => (ORDER.indexOf(name) + 1) || ORDER.length + 1;
  const names = Object.keys(all || {}).filter((name) => Object.keys(all[name]).length).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (!names.length) return;

  const selected = {};
  const apply = () => ui.triggerFilters(selected);

  for (const name of names) {
    const values = Object.keys(all[name]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const byKey = new Map(values.map((value) => [value.toLocaleLowerCase(), value]));
    const id = `search-filter-${name.toLowerCase()}`;
    selected[name] = [];

    const field = document.createElement('div');
    field.className = 'search-filter';
    const label = document.createElement('label');
    label.className = 'poster-filter-search';
    label.textContent = name;
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', id, autocomplete: 'off', spellcheck: false, placeholder: `Any ${name.toLowerCase()}` });
    input.setAttribute('list', `${id}-values`);
    const list = document.createElement('datalist');
    list.id = `${id}-values`;
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.label = `${all[name][value]}`;  // how many pages have it
      list.append(option);
    }
    label.append(input);
    const chips = document.createElement('ul');
    chips.className = 'poster-filter-chips';
    chips.setAttribute('aria-label', `Chosen ${name.toLowerCase()} filters`);

    const render = () => {
      chips.replaceChildren(...selected[name].map((value) => {
        const item = document.createElement('li');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = `${value} ×`;
        remove.setAttribute('aria-label', `Remove ${name}: ${value}`);
        remove.addEventListener('click', () => {
          selected[name] = selected[name].filter((v) => v !== value);
          render();
          apply();
          input.focus();
        });
        item.append(remove);
        return item;
      }));
    };
    // A value counts once it matches one in the list exactly (any case): picked from the list, or typed and Enter.
    const choose = () => {
      const value = byKey.get(input.value.trim().toLocaleLowerCase());
      if (!value) return;
      input.value = '';
      if (!selected[name].includes(value)) {
        selected[name].push(value);
        render();
        apply();
      }
    };
    input.addEventListener('change', choose);
    input.addEventListener('input', (event) => { if (event.inputType === 'insertReplacementText' || !event.inputType) choose(); });

    field.append(label, list, chips);
    box.append(field);
  }
  // Under the search box (inside Pagefind's form, which ignores Enter for submitting), else where the page put it.
  document.querySelector('#search .pagefind-ui__search-input')?.after(box);
  box.hidden = false;
  document.getElementById('search').classList.add('has-filter-dropdowns');
};
