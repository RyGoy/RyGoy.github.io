// Debit/credit flash card game. Decks are embedded as JSON by layouts/_default/flashcards.html.
(() => {
  const data = document.getElementById('fc-data');
  const game = document.getElementById('flashcards');
  if (!data || !game) return;

  const OPTION_COUNT = 8; // accounts listed per card: the answer plus random distractors
  const decks = JSON.parse(data.textContent);
  const allCards = decks.flatMap(deck => deck.cards);
  const accounts = [...new Set(allCards.flatMap(card => [...card.debit, ...card.credit]))];

  const find = selector => game.querySelector(selector);
  const toolbar = find('.fc-toolbar');
  const deckSelect = find('.fc-deck');
  const score = find('.fc-score');
  const form = find('.fc-card');
  const progress = find('.fc-progress');
  const prompt = find('.fc-prompt');
  const table = find('.fc-accounts');
  const rows = table.tBodies[0];
  const result = find('.fc-result');
  const checkButton = find('.fc-check');
  const nextButton = find('.fc-next');

  let queue = [];
  let position = 0;
  let correct = 0;
  let answered = 0;
  let card = null;

  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const sameAccounts = (a, b) => a.length === b.length && a.every(name => b.includes(name));
  const element = (tag, props) => Object.assign(document.createElement(tag), props);

  function start() {
    const deck = decks[deckSelect.value];
    queue = shuffle([...(deck ? deck.cards : allCards)]);
    position = correct = answered = 0;
    score.textContent = '';
    showCard();
  }

  function showCard() {
    card = queue[position];
    if (!card) return finish();
    const answer = [...card.debit, ...card.credit];
    const distractors = shuffle(accounts.filter(name => !answer.includes(name)))
      .slice(0, Math.max(0, OPTION_COUNT - answer.length));
    progress.textContent = `Card ${position + 1} of ${queue.length}`;
    prompt.textContent = card.prompt;
    rows.replaceChildren(...[...answer, ...distractors].sort((a, b) => a.localeCompare(b)).map(accountRow));
    table.hidden = false;
    result.hidden = true;
    checkButton.hidden = false;
    nextButton.hidden = true;
  }

  function accountRow(name) {
    const row = element('tr');
    row.dataset.account = name;
    row.append(element('th', { scope: 'row', textContent: name }));
    for (const side of ['debit', 'credit']) {
      const input = element('input', { type: 'checkbox', name: side, value: name });
      input.setAttribute('aria-label', `${side === 'debit' ? 'Debit' : 'Credit'} ${name}`);
      const cell = element('td');
      cell.append(input);
      row.append(cell);
    }
    row.append(element('td', { className: 'fc-mark' }));
    return row;
  }

  function showResult(className, verdict, ...lines) {
    result.className = `fc-result ${className}`;
    result.replaceChildren(
      element('p', { className: 'fc-verdict', textContent: verdict }),
      ...lines.filter(Boolean).map(text => element('p', { textContent: text })),
    );
    result.hidden = false;
  }

  function check() {
    const chosen = side => [...rows.querySelectorAll(`input[name="${side}"]:checked`)].map(input => input.value);
    const debit = chosen('debit');
    const credit = chosen('credit');
    if (!debit.length || !credit.length) {
      showResult('is-warning', 'Choose at least one debit and one credit.');
      return;
    }
    const right = sameAccounts(debit, card.debit) && sameAccounts(credit, card.credit);
    answered += 1;
    if (right) correct += 1;
    score.textContent = `Score: ${correct} / ${answered}`;

    for (const row of rows.rows) {
      const name = row.dataset.account;
      const expected = card.debit.includes(name) ? 'debit' : card.credit.includes(name) ? 'credit' : '';
      const picked = row.querySelector('input:checked')?.name || '';
      row.querySelectorAll('input').forEach(input => { input.disabled = true; });
      if (!expected && !picked) continue;
      const ok = expected === picked;
      row.classList.add(ok ? 'is-right' : 'is-wrong');
      row.querySelector('.fc-mark').textContent = ok ? '✓' : expected ? `Should be ${expected}` : 'Not used';
    }
    showResult(
      right ? 'is-right' : 'is-wrong',
      right ? 'Correct' : 'Not quite',
      `Debit: ${card.debit.join(', ')}. Credit: ${card.credit.join(', ')}.`,
      card.explain,
    );
    checkButton.hidden = true;
    nextButton.hidden = false;
    nextButton.focus();
  }

  function finish() {
    card = null;
    progress.textContent = 'Deck complete';
    prompt.textContent = `You got ${correct} of ${answered} right.`;
    table.hidden = true;
    rows.replaceChildren();
    result.hidden = true;
    checkButton.hidden = true;
    nextButton.textContent = 'Play again';
    nextButton.hidden = false;
    nextButton.focus();
  }

  // An account sits on one side of an entry, so checking one side clears the other.
  rows.addEventListener('change', event => {
    const input = event.target;
    if (!input.checked) return;
    const other = input.name === 'debit' ? 'credit' : 'debit';
    input.closest('tr').querySelector(`input[name="${other}"]`).checked = false;
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (card) check();
  });

  nextButton.addEventListener('click', () => {
    nextButton.textContent = 'Next card';
    if (card) {
      position += 1;
      showCard();
    } else {
      start();
    }
    if (card) prompt.focus();
  });

  deckSelect.append(
    element('option', { value: 'all', textContent: `All decks (${allCards.length})` }),
    ...decks.map((deck, index) => element('option', { value: String(index), textContent: `${deck.title} (${deck.cards.length})` })),
  );
  deckSelect.addEventListener('change', start);

  toolbar.hidden = false;
  form.hidden = false;
  start();
})();
