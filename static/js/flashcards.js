// Debit/credit flash card game. Decks are embedded as JSON by layouts/_default/flashcards.html.
// The game opens on the first deck (the beginners' story deck, data/flashcards/0-lemonade-stand.yaml) and, at the end
// of each deck, offers the next. A story deck is played in order, and its books (.fc-books) carry every entry from card
// to card, so the player sees what changed and that what the business has still equals what it owes plus its owner's stake.
(() => {
  const data = document.getElementById('fc-data');
  const game = document.getElementById('flashcards');
  if (!data || !game) return;

  const OPTION_COUNT = 8; // accounts listed per card: the answer plus random distractors
  const decks = JSON.parse(data.textContent);
  // Wrong-answer choices come from the card's own deck when it lists its accounts (the lemonade stand's), else from
  // every account in the decks that don't, so the beginners' accounts and the company's don't mix.
  const sharedAccounts = [...new Set(decks.filter(deck => !Object.keys(deck.accounts).length)
    .flatMap(deck => deck.cards.flatMap(card => [...card.debit, ...card.credit])))];
  decks.forEach(deck => {
    const own = Object.keys(deck.accounts);
    deck.cards.forEach(card => { card.pool = own.length ? own : sharedAccounts; });
  });
  const allCards = decks.flatMap(deck => deck.cards);

  const find = selector => game.querySelector(selector);
  const toolbar = find('.fc-toolbar');
  const deckSelect = find('.fc-deck');
  const score = find('.fc-score');
  const form = find('form.fc-card');
  const progress = find('.fc-progress');
  const prompt = find('.fc-prompt');
  const table = find('.fc-accounts');
  const rows = table.tBodies[0];
  const result = find('.fc-result');
  const checkButton = find('.fc-check');
  const nextButton = find('.fc-next');
  const againButton = find('.fc-again');
  const books = find('.fc-books');
  const booksTitle = find('#fc-books-title');
  const booksSides = find('.fc-books-sides');
  const booksCheck = find('.fc-books-check');

  let deck = null; // the deck being played, or null for all decks
  let queue = [];
  let position = 0;
  let correct = 0;
  let answered = 0;
  let card = null;
  let balances = new Map(); // a story deck's accounts: name -> balance, in the order they first appear

  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const sameAccounts = (a, b) => a.length === b.length && a.every(name => b.includes(name));
  const element = (tag, props, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const money = amount => `$${Math.abs(amount).toLocaleString('en-US')}`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Slide each new card in, as if dealt from the deck.
  const deal = () => {
    if (reducedMotion.matches || !form.animate) return;
    form.animate(
      [{ opacity: 0, transform: 'translate(1.5rem, -.5rem) rotate(1.5deg)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(.2, .7, .3, 1)' },
    );
  };

  function start() {
    deck = decks[deckSelect.value] || null;
    queue = deck ? (deck.story ? [...deck.cards] : shuffle([...deck.cards])) : shuffle([...allCards]);
    position = correct = answered = 0;
    score.textContent = '';
    balances = new Map();
    againButton.hidden = true;
    nextButton.textContent = 'Next card';
    renderBooks();
    showCard();
  }

  function showCard() {
    card = queue[position];
    if (!card) return finish();
    const answer = [...card.debit, ...card.credit];
    const distractors = shuffle(card.pool.filter(name => !answer.includes(name)))
      .slice(0, Math.max(0, OPTION_COUNT - answer.length));
    progress.textContent = `Card ${position + 1} of ${queue.length}`;
    prompt.textContent = card.prompt;
    rows.replaceChildren(...[...answer, ...distractors].sort((a, b) => a.localeCompare(b)).map(accountRow));
    table.hidden = false;
    result.hidden = true;
    checkButton.hidden = false;
    nextButton.hidden = true;
    deal();
  }

  function accountRow(name) {
    const row = element('tr');
    row.dataset.account = name;
    row.append(element('th', { scope: 'row', textContent: name }));
    for (const side of ['debit', 'credit']) {
      const input = element('input', { type: 'checkbox', name: side, value: name });
      input.setAttribute('aria-label', `${side === 'debit' ? 'Debit' : 'Credit'} ${name}`);
      row.append(element('td', {}, input));
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
    post(card);
    checkButton.hidden = true;
    nextButton.hidden = false;
    nextButton.focus();
  }

  // A story deck's books. Each account's balance is kept on its own side: debits less credits for what the business
  // has and its costs, credits less debits for what it owes, its owner's money and its income.
  const kindOf = name => deck?.accounts[name];
  const growsOnLeft = name => ['asset', 'expense'].includes(kindOf(name));

  function post(entry) {
    if (!deck?.story) return;
    const changed = new Map();
    for (const [names, side] of [[entry.debit, 'debit'], [entry.credit, 'credit']]) {
      for (const name of names) {
        const change = (side === 'debit') === growsOnLeft(name) ? entry.amount : -entry.amount;
        balances.set(name, (balances.get(name) || 0) + change);
        changed.set(name, change);
      }
    }
    renderBooks(changed);
  }

  function renderBooks(changed = new Map()) {
    books.hidden = !deck?.story;
    if (books.hidden) return;
    booksTitle.textContent = "The stand's books";
    const total = kind => [...balances].filter(([name]) => kindOf(name) === kind).reduce((sum, [, amount]) => sum + amount, 0);
    const line = (name, sign = 1) => {
      const amount = balances.get(name) * sign;
      const change = changed.get(name);
      return element('li', { className: change ? 'is-changed' : '' },
        element('span', { textContent: name }),
        change ? element('span', { className: 'fc-books-change', textContent: `${change * sign > 0 ? '+' : '−'}${money(change)}` }) : '',
        element('span', { className: 'fc-books-amount', textContent: `${amount < 0 ? '−' : ''}${money(amount)}` }),
      );
    };
    const group = (heading, kinds, sign = () => 1) => {
      const names = [...balances.keys()].filter(name => kinds.includes(kindOf(name)));
      return names.length ? [element('h3', { textContent: heading }), element('ul', {}, ...names.map(name => line(name, sign(name))))] : [];
    };
    const has = total('asset');
    const owes = total('liability');
    const stake = total('equity') + total('income') - total('expense');
    const side = (heading, children, sum) => element('div', { className: 'fc-books-side' },
      element('p', { className: 'fc-books-heading', textContent: heading }),
      ...(children.length ? children : [element('p', { className: 'fc-books-empty', textContent: 'Nothing yet' })]),
      element('p', { className: 'fc-books-total' }, element('span', { textContent: 'Total' }), element('span', { textContent: money(sum) })),
    );
    booksSides.replaceChildren(
      side('What the stand has', group('Assets', ['asset']), has),
      side('What it owes + Mia\'s stake', [
        ...group('Owes (liabilities)', ['liability']),
        ...group("Mia's stake (equity)", ['equity', 'income', 'expense'], name => (kindOf(name) === 'expense' ? -1 : 1)),
      ], owes + stake),
    );
    booksCheck.textContent = balances.size
      ? `${money(has)} has = ${money(owes)} owed + ${money(stake)} stake. ${has === owes + stake ? 'The two sides match.' : 'The two sides don\'t match.'}`
      : 'The stand starts with nothing. Each answer is written into its books here.';
  }

  function finish() {
    card = null;
    const index = deck ? decks.indexOf(deck) : -1;
    const following = index >= 0 ? decks[index + 1] : null;
    progress.textContent = 'Deck complete';
    prompt.textContent = `You got ${correct} of ${answered} right.`;
    table.hidden = true;
    rows.replaceChildren();
    result.hidden = true;
    checkButton.hidden = true;
    if (following) {
      nextButton.textContent = `Next deck: ${following.title}`;
      nextButton.dataset.deck = String(index + 1);
      againButton.hidden = false;
    } else {
      nextButton.textContent = 'Play again';
      delete nextButton.dataset.deck;
    }
    nextButton.hidden = false;
    nextButton.focus();
    deal();
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
    if (card) {
      position += 1;
      showCard();
    } else {
      if (nextButton.dataset.deck) deckSelect.value = nextButton.dataset.deck;
      start();
    }
    if (card) prompt.focus();
  });
  againButton.addEventListener('click', () => {
    start();
    prompt.focus();
  });

  deckSelect.append(
    ...decks.map((d, index) => element('option', { value: String(index), textContent: `${d.title} (${d.cards.length})` })),
    element('option', { value: 'all', textContent: `All decks, shuffled (${allCards.length})` }),
  );
  deckSelect.addEventListener('change', start);

  toolbar.hidden = false;
  form.hidden = false;
  start();
})();
