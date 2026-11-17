# Flash cards

The debit and credit game at `/accounting/flashcards/`. Each card describes a transaction, and the player marks which accounts to debit and to credit.

## How it's made

- **Decks** are YAML files in `data/flashcards/`: 312 cards in all. How to write one: [Writing flash card decks](../flashcards.md).
- **The template checks every deck at build time** (`layouts/_default/flashcards.html`): missing fields, an account on both sides, a story card without an amount. A bad deck stops the build and names the card.
- **The game runs in the browser** (`static/js/flashcards.js`). The template embeds the decks as JSON, and the script deals them.

## For beginners

- **[Start Here: Debits and Credits](https://thetenderforlaw.com/accounting/start-here/)** (`content/accounting/start-here.md`) explains the idea in five minutes: what the stand has equals what it owes plus Mia's stake. It is careful that Mia, the equity holder, has a claim on the stand, not title to its things.
- **The game opens on Mia's Lemonade Stand** (`data/flashcards/0-lemonade-stand.yaml`), a story deck: its cards are played in order, and *the stand's books* under the card write each answer in and show the two sides still match. Then it moves on to the company decks.

## Progress

- **In the browser:** progress is kept in `localStorage` (key `ttfl-flashcards`): where the player is in each deck, each deck's best score, and each card's last answer. **Practise my mistakes** deals the cards last answered wrong.
- **What a rename resets:** a deck is known by its file name, and a card by its deck and prompt. Renaming a deck file or rewording a prompt starts it afresh for everyone. Rewording an explanation doesn't.
- **On every device:** a player who signs in with Telegram keeps their progress in their account too. See [Flash card accounts](flash-card-accounts.md).

## Connected

- [Library](library.md): the accounting subject it belongs to.
- [Flash card accounts](flash-card-accounts.md): keeping progress across devices.
- [Content model](content-model.md): `data/flashcards/`.

Details: [Writing flash card decks](../flashcards.md).
