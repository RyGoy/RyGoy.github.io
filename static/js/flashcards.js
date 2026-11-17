// Debit/credit flash card game. Decks are embedded as JSON by layouts/_default/flashcards.html.
// The game opens on the first deck (the beginners' story deck, data/flashcards/0-lemonade-stand.yaml) and, at the end
// of each deck, offers the next. A story deck is played in order, and its books (.fc-books) carry every entry from card
// to card, so the player sees what changed and that what the business has still equals what it owes plus its owner's stake.
// Progress is kept in this browser (localStorage, see STORE): where each deck was left, each deck's best score, and
// each card's last answer, from which "Practise my mistakes" deals the cards last answered wrong.
// With accounts on (data-accounts, params.flashcards_accounts), a player who signs in with Telegram also keeps it in
// their account (kept by the commentary bot, telegram-bot/accounts.js), merged with each browser's copy (merge).
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
  //   t:       when anything above last changed (ms), and since: when the player last chose Forget my progress; merge
  //            uses both to put two copies together.
  const STORE = 'ttfl-flashcards';
  const empty = () => ({ v: 1, t: 0, since: 0, mode: null, playing: {}, decks: {}, cards: {} });
  const storage = (() => {
    try {
      localStorage.setItem(`${STORE}-test`, '1');
      localStorage.removeItem(`${STORE}-test`);
      return localStorage;
    } catch {
      return null; // private windows and blocked storage: the game still works, and forgets on leaving
    }
  })();
  // A copy of the progress as read from this browser or the player's account, filled out; anything unreadable is empty.
  const progressFrom = stored => {
    if (stored?.v !== 1) return empty();
    const state = { ...empty(), ...stored };
    for (const key of ['playing', 'decks', 'cards']) if (!state[key] || typeof state[key] !== 'object') state[key] = {};
    return state;
  };
  let saved = (() => {
    try {
      return progressFrom(JSON.parse(storage?.getItem(STORE)));
    } catch { /* unreadable: start afresh */ }
    return empty();
  })();
  // The progress as text, keys sorted and without t, to tell whether two copies hold the same.
  const canon = state => JSON.stringify({ ...state, t: 0 }, (key, value) => (value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : value));
  let kept = canon(saved);
  const write = () => {
    try { storage?.setItem(STORE, JSON.stringify(saved)); } catch { /* full or blocked: keep playing */ }
  };
  // Keeps the progress when it has changed, and has it saved to the player's account.
  const save = () => {
    const now = canon(saved);
    if (now === kept) return;
    kept = now;
    saved.t = Date.now();
    write();
    changed();
  };

  // Puts two copies of the progress together, as when a player signs in on a second device: each card's record with
  // more answers, each deck's better best score, and where the decks are from the copy changed last. A copy older than
  // the other's Forget my progress counts as empty, so what was forgotten on one device doesn't come back from another.
  function merge(a, b) {
    const time = state => state.t || 0;
    if (time(a) < (b.since || 0)) a = { ...empty(), since: a.since || 0 };
    if (time(b) < (a.since || 0)) b = { ...empty(), since: b.since || 0 };
    const [older, newer] = time(a) > time(b) ? [b, a] : [a, b];
    const answers = record => (record?.right || 0) + (record?.wrong || 0);
    const ratio = best => (best ? best.correct / best.answered : -1);
    const cards = { ...older.cards };
    for (const [key, record] of Object.entries(newer.cards)) if (answers(record) >= answers(cards[key])) cards[key] = record;
    const best = { ...older.decks };
    for (const [key, round] of Object.entries(newer.decks)) if (ratio(round) >= ratio(best[key])) best[key] = round;
    return {
      ...empty(), mode: newer.mode, playing: newer.playing, decks: best, cards,
      t: Math.max(time(a), time(b)), since: Math.max(a.since || 0, b.since || 0),
    };
  }

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
    const where = account ? 'Your progress is kept in this browser and in your Telegram account.' : 'Your progress is kept in this browser only.';
    savedNote.textContent = `${text ? `${text} ` : ''}${where}`;
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
    touched = true;
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
    if (!confirm(`Forget your scores, your mistakes and where you are in every deck${account ? ', here and in your Telegram account' : ''}?`)) return;
    saved = { ...empty(), since: Date.now() }; // kept, so the account and other devices forget it too (merge)
    mode = '';
    deckSelect.value = '0';
    fillDecks();
    start();
    noteSaved('Progress forgotten.');
  });

  // Choosing a deck picks it up where it was left.
  deckSelect.addEventListener('change', () => start(true));

  // Accounts: signing in with Telegram (its Login widget, from telegram.org, loaded only when the player asks), then
  // keeping the progress in the account. Each save sends the whole progress with the revision it was merged with;
  // when another device saved in between, the bot answers 409 with its copy, which is merged in and sent again.
  const api = game.dataset.accounts?.replace(/\/+$/, '');
  const ACCOUNT = 'ttfl-flashcards-account'; // { token, name }
  const panel = find('.fc-account');
  let account = null;
  let rev = null; // the account's revision this browser last merged with; null until it has been read
  let edits = 0; // changes made here, and how many of them the account has
  let sent = 0;
  let syncing = null;
  let timer = 0;
  let touched = false; // a card answered on this visit: progress arriving from the account then leaves the card be
  if (api && storage && panel) {
    try { account = JSON.parse(storage.getItem(ACCOUNT)); } catch { /* none */ }
    if (typeof account?.token !== 'string') account = null;
  }

  function changed() {
    if (!account) return;
    edits += 1;
    clearTimeout(timer);
    timer = setTimeout(sync, 3000); // a few answers in a row go in one save
  }

  async function call(method, path, body, keepalive = false) {
    const res = await fetch(`${api}${path}`, {
      method,
      keepalive,
      headers: { ...(account ? { Authorization: `Bearer ${account.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') throw Object.assign(new Error('signed out'), { signedOut: true });
    if (!res.ok && res.status !== 409) throw new Error(data.error || `HTTP ${res.status}`);
    return { status: res.status, data };
  }

  // Merges the account's copy into this browser's. Shows the result if it changed anything here, and marks it to be
  // saved if the account lacks anything from here.
  function absorb(remote) {
    const theirs = progressFrom(remote);
    const merged = merge(saved, theirs);
    if (canon(merged) !== canon(saved)) {
      saved = merged;
      kept = canon(saved);
      write();
      if (touched) fillDecks();
      else openLast();
    }
    if (canon(merged) !== canon(theirs)) edits += 1;
  }

  // Brings this browser and the account level: reads the account the first time, then saves until it has every
  // change made here. One at a time; a change made meanwhile is picked up by the next.
  function sync(keepalive = false) {
    if (!account) return Promise.resolve();
    clearTimeout(timer);
    syncing = (syncing || Promise.resolve()).then(async () => {
      try {
        if (rev === null) {
          const { data } = await call('GET', '/api/progress');
          rev = data.rev;
          remindBox.checked = Boolean(data.remind);
          absorb(data.progress);
        }
        for (let tries = 0; sent < edits && tries < 3; tries++) {
          const at = edits;
          const { status, data } = await call('PUT', '/api/progress', { progress: saved, rev }, keepalive);
          rev = data.rev;
          if (status === 409) absorb(data.progress);
          else sent = at;
        }
        noteAccount(sent < edits ? 'Not all saved to your account yet.' : 'Saved.');
      } catch (err) {
        if (err.signedOut) signOut('You were signed out. Sign in again to keep saving to your account.');
        else noteAccount("Couldn't reach your account just now: your progress is kept in this browser, and saved there when it's back.");
      }
    });
    return syncing;
  }

  function noteAccount(status = '') {
    panel.hidden = false;
    find('.fc-signed-out').hidden = Boolean(account);
    find('.fc-signed-in').hidden = !account;
    find('.fc-account-note').textContent = account ? `Signed in with Telegram as ${account.name || 'you'}. ${status}`.trim() : '';
    noteSaved('');
  }

  function signOut(message) {
    account = null;
    rev = null;
    try { storage.removeItem(ACCOUNT); } catch { /* nothing kept */ }
    noteAccount();
    signInButton.hidden = false;
    telegramSlot.replaceChildren(...(message ? [element('p', { textContent: message })] : []));
  }

  const signInButton = find('.fc-sign-in');
  const telegramSlot = find('.fc-telegram');
  const remindBox = find('.fc-remind');
  if (api && storage && panel) {
    // Telegram's button: its widget calls this with the signed login, which the bot checks.
    window.ttflFlashcardsLogin = async user => {
      try {
        const { data } = await call('POST', '/api/login', user);
        if (!data.token) throw new Error(data.error);
        account = { token: data.token, name: data.name };
        storage.setItem(ACCOUNT, JSON.stringify(account));
        rev = null;
        edits += 1; // what this browser has goes to the account, once merged with it
        telegramSlot.replaceChildren();
        noteAccount('Saving…');
        sync();
      } catch {
        telegramSlot.replaceChildren(element('p', { textContent: "The sign-in didn't work. Please try again." }));
        signInButton.hidden = false;
      }
    };
    signInButton.addEventListener('click', () => {
      signInButton.hidden = true;
      const script = element('script', { async: true, src: 'https://telegram.org/js/telegram-widget.js?22' });
      Object.assign(script.dataset, { telegramLogin: game.dataset.bot, size: 'medium', onauth: 'ttflFlashcardsLogin(user)', requestAccess: 'write' });
      script.addEventListener('error', () => {
        telegramSlot.replaceChildren(element('p', { textContent: "Telegram's sign-in didn't load. Please try again later." }));
        signInButton.hidden = false;
      });
      telegramSlot.replaceChildren(script);
    });
    find('.fc-sign-out').addEventListener('click', () => {
      sync().then(() => signOut('Signed out. Your progress stays in this browser.'));
    });
    remindBox.addEventListener('change', async () => {
      const want = remindBox.checked;
      try {
        const { data } = await call('PUT', '/api/reminders', { remind: want });
        remindBox.checked = data.remind;
        noteAccount(data.remind ? "The bot will remind you when you haven't practised for two days. Send it /stop to turn this off." : 'Reminders are off.');
      } catch (err) {
        remindBox.checked = !want;
        if (err.signedOut) signOut('You were signed out. Sign in again to keep saving to your account.');
        else noteAccount("Couldn't reach your account just now. Please try again.");
      }
    });
    // Leaving the page saves what hasn't been saved yet.
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && sent < edits) sync(true);
    });
    noteAccount();
  }

  // Open on the deck played last, unless it was the mistakes and none are left.
  function openLast() {
    fillDecks();
    deckSelect.value = saved.mode === 'all' || (saved.mode === 'mistakes' && mistakes().length) ? saved.mode
      : String(Math.max(0, decks.findIndex(d => d.key === saved.mode)));
    start(true);
  }
  toolbar.hidden = false;
  form.hidden = false;
  openLast();
  sync();
})();
