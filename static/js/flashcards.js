// Debit/credit flash card game. Decks are embedded as JSON by layouts/_default/flashcards.html.
// The game opens on the first deck (the beginners' story deck, data/flashcards/0-lemonade-stand.yaml) and, at the end
// of each deck, offers the next. A story deck is played in order, and its books (.fc-books) carry every entry from card
// to card, so the player sees what changed and that what the business has still equals what it owes plus its owner's stake.
// Progress is kept in this browser (localStorage, see STORE): where each deck was left, each deck's best score, and
// each card's last answer, from which "Practise my mistakes" deals the cards last answered wrong.
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
    deck.cards.forEach(card => {
      card.pool = own.length ? own : sharedAccounts;
      card.key = `${deck.key}|${card.prompt}`; // a card's progress follows its deck file and prompt
    });
  });
  const allCards = decks.flatMap(deck => deck.cards);

  // Progress, under one key:
  //   playing: mode -> { order, position, correct, answered }, where a mode is a deck's key (its file name), "all" or
  //            "mistakes"; order lists the dealt cards' indexes in the deck (in every card for "all" and "mistakes"),
  //            and position counts the cards answered.
  //   mode:    the mode played last, which the page opens on.
  //   decks:   deck key or "all" -> { correct, answered } of the best finished round.
  //   cards:   card key -> { right, wrong, last }, last being "right" or "wrong".
  const STORE = 'ttfl-flashcards';
  const empty = () => ({ v: 1, mode: null, playing: {}, decks: {}, cards: {} });
  const storage = (() => {
    try {
      localStorage.setItem(`${STORE}-test`, '1');
      localStorage.removeItem(`${STORE}-test`);
      return localStorage;
    } catch {
      return null; // private windows and blocked storage: the game still works, and forgets on leaving
    }
  })();
  let saved = (() => {
    try {
      const stored = JSON.parse(storage?.getItem(STORE));
      if (stored?.v === 1) return { ...empty(), ...stored };
    } catch { /* unreadable: start afresh */ }
    return empty();
  })();
  const save = () => {
    try { storage?.setItem(STORE, JSON.stringify(saved)); } catch { /* full or blocked: keep playing */ }
  };

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
  const savedPanel = find('.fc-saved');
  const savedNote = find('.fc-saved-note');

  let deck = null; // the deck being played, or null for all decks or the mistakes
  let mode = ''; // deck.key, "all" or "mistakes"
  let order = [];
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
  const mistakes = () => allCards.map((c, i) => i).filter(i => saved.cards[allCards[i].key]?.last === 'wrong');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Slide each new card in, as if dealt from the deck.
  const deal = () => {
    if (reducedMotion.matches || !form.animate) return;
    form.animate(
      [{ opacity: 0, transform: 'translate(1.5rem, -.5rem) rotate(1.5deg)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(.2, .7, .3, 1)' },
    );
  };

  // The Deck menu: each deck with its best score once finished, then all decks, then the mistakes while there are any
  // (or while they are being played).
  function fillDecks() {
    const value = deckSelect.value;
    const best = key => (saved.decks[key] ? ` · best ${saved.decks[key].correct}/${saved.decks[key].answered}` : '');
    const missed = mistakes().length;
    deckSelect.replaceChildren(
      ...decks.map((d, index) => element('option', { value: String(index), textContent: `${saved.decks[d.key] ? '✓ ' : ''}${d.title} (${d.cards.length})${best(d.key)}` })),
      element('option', { value: 'all', textContent: `All decks, shuffled (${allCards.length})${best('all')}` }),
      ...(missed || mode === 'mistakes' ? [element('option', { value: 'mistakes', textContent: `Practise my mistakes (${missed})` })] : []),
    );
    if ([...deckSelect.options].some(option => option.value === value)) deckSelect.value = value;
  }

  // Deals the chosen deck: where it was left, when resume is set and the deck hasn't changed since, else afresh.
  function start(resume = false) {
    deck = decks[deckSelect.value] || null;
    mode = deck ? deck.key : deckSelect.value;
    const list = deck ? deck.cards : allCards;
    const left = saved.playing[mode];
    const fits = left && left.size === list.length && left.position <= left.order.length
      && left.order.every(i => Number.isInteger(i) && i >= 0 && i < list.length);
    if (resume && fits) {
      ({ order, position, correct, answered } = left);
    } else {
      order = mode === 'mistakes' ? shuffle(mistakes()) : list.map((c, i) => i);
      if (!deck?.story && mode !== 'mistakes') shuffle(order);
      position = correct = answered = 0;
    }
    queue = order.map(i => list[i]);
    saved.mode = mode;
    remember();
    score.textContent = answered ? `Score: ${correct} / ${answered}` : '';
    balances = new Map();
    if (deck?.story) queue.slice(0, position).forEach(apply);
    againButton.hidden = true;
    nextButton.textContent = 'Next card';
    renderBooks();
    noteSaved(resume && fits && position ? `Picked up where you left off, at card ${position + 1}.` : '');
    showCard();
  }

  // Keeps where the current deck is, so a reload or a later visit picks it up.
  function remember(at = position) {
    saved.playing[mode] = { order, position: at, correct, answered, size: (deck ? deck.cards : allCards).length };
    save();
  }

  function noteSaved(text) {
    savedPanel.hidden = !storage;
    savedNote.textContent = `${text ? `${text} ` : ''}Your progress is kept in this browser only.`;
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

    const record = saved.cards[card.key] || { right: 0, wrong: 0 };
    record[right ? 'right' : 'wrong'] += 1;
    record.last = right ? 'right' : 'wrong';
    saved.cards[card.key] = record;
    remember(position + 1); // answered: a reload deals the next card
    fillDecks();
    noteSaved('');

    checkButton.hidden = true;
    nextButton.hidden = false;
    nextButton.focus();
  }

  // A story deck's books. Each account's balance is kept on its own side: debits less credits for what the business
  // has and its costs, credits less debits for what it owes, its owner's money and its income.
  const kindOf = name => deck?.accounts[name];
  const growsOnLeft = name => ['asset', 'expense'].includes(kindOf(name));

  // Writes an entry into the books and returns each account's change.
  function apply(entry) {
    const changed = new Map();
    for (const [names, side] of [[entry.debit, 'debit'], [entry.credit, 'credit']]) {
      for (const name of names) {
        const change = (side === 'debit') === growsOnLeft(name) ? entry.amount : -entry.amount;
        balances.set(name, (balances.get(name) || 0) + change);
        changed.set(name, change);
      }
    }
    return changed;
  }

  function post(entry) {
    if (deck?.story) renderBooks(apply(entry));
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
    delete saved.playing[mode];
    const best = saved.decks[mode];
    if (mode !== 'mistakes' && answered && (!best || correct / answered > best.correct / best.answered)) {
      saved.decks[mode] = { correct, answered };
    }
    save();
    const left = mistakes().length;
    progress.textContent = 'Deck complete';
    prompt.textContent = `You got ${correct} of ${answered} right.${mode === 'mistakes' ? (left ? ` ${left} still to practise.` : ' No mistakes left.') : ''}`;
    table.hidden = true;
    rows.replaceChildren();
    result.hidden = true;
    checkButton.hidden = true;
    if (following) {
      nextButton.textContent = `Next deck: ${following.title}`;
      nextButton.dataset.deck = String(index + 1);
      againButton.hidden = false;
    } else if (mode === 'mistakes') {
      nextButton.textContent = left ? 'Practise them again' : 'Back to the first deck';
      nextButton.dataset.deck = left ? 'mistakes' : '0';
    } else {
      nextButton.textContent = 'Play again';
      delete nextButton.dataset.deck;
    }
    fillDecks();
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
      noteSaved('');
      showCard();
    } else {
      if (nextButton.dataset.deck) {
        if (nextButton.dataset.deck === 'mistakes') mode = 'mistakes'; // keeps the option while it is refilled
        fillDecks();
        deckSelect.value = nextButton.dataset.deck;
      }
      start();
    }
    if (card) prompt.focus();
  });
  againButton.addEventListener('click', () => {
    start();
    prompt.focus();
  });
  find('.fc-restart').addEventListener('click', () => {
    start();
    prompt.focus();
  });
  find('.fc-forget').addEventListener('click', () => {
    if (!confirm('Forget your scores, your mistakes and where you are in every deck?')) return;
    saved = empty();
    try { storage?.removeItem(STORE); } catch { /* nothing kept */ }
    mode = '';
    deckSelect.value = '0';
    fillDecks();
    start();
    noteSaved('Progress forgotten.');
  });

  // Choosing a deck picks it up where it was left.
  deckSelect.addEventListener('change', () => start(true));

  // Open on the deck played last, unless it was the mistakes and none are left.
  fillDecks();
  const opening = saved.mode === 'all' || (saved.mode === 'mistakes' && mistakes().length) ? saved.mode
    : String(Math.max(0, decks.findIndex(d => d.key === saved.mode)));
  deckSelect.value = opening;
  toolbar.hidden = false;
  form.hidden = false;
  start(true);
})();
