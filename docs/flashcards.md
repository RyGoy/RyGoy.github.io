# Flash card questions

How the game works, and how it connects to the rest of the site: [Flash cards](architecture/flash-cards.md) and [Flash card accounts](architecture/flash-card-accounts.md), in [the map](README.md).

The game page is `/accounting/flashcards/` (`content/accounting/flashcards.md`). It loads every YAML file in `data/flashcards/`. Each file is one deck and shows up in the page's **Deck** menu.

## Add questions

1. Add cards to an existing deck file, or create a new file in `data/flashcards/`, such as `7-inventory.yaml`. Only `.yaml` files go there: Hugo stops on any other file type. Files are listed in filename order, so a number prefix sets the menu order.
2. Use this format:

   ```yaml
   title: Inventory          # name shown in the Deck menu (optional; defaults to the filename)
   cards:
     - prompt: "The company buys $500 of goods for resale on account."
       debit: Inventory
       credit: Accounts Payable
       explain: "Goods held for sale are inventory."   # optional, shown after answering

     - prompt: "Equipment costing $10,000 with $7,000 accumulated depreciation is sold for $4,000."
       debit: [Cash, Accumulated Depreciation]          # use [A, B] for more than one account
       credit: [Equipment, Gain on Disposal of Assets]
   ```

3. Run `hugo server` and open `/accounting/flashcards/` to check the new cards.

## Story decks

`0-lemonade-stand.yaml` is a story deck: the beginners' deck, after the lesson at `/accounting/start-here/` (`content/accounting/start-here.md`). The game opens on it. Its cards are played in order, not shuffled, and after each answer the stand's books under the card (`.fc-books`) write the entry in and show what the stand has against what it owes plus Mia's stake. A story deck adds:

```yaml
story: true
accounts:                 # every account its cards use, and its kind: asset, liability, equity, income or expense
  Cash: asset
  "Mia's Money": equity
cards:
  - prompt: "Mia puts $20 of her own savings into the cash tin."
    amount: 20            # required: the entry's amount, for the books
    debit: Cash           # exactly one debit and one credit
    credit: "Mia's Money"
```

The build stops if a story card has no amount, more than one debit or credit, or an account not listed under `accounts`. A deck that lists its `accounts` (story or not) takes its wrong-answer choices from that list only.

## Players' progress

The game keeps each player's progress in their browser (`localStorage`, key `ttfl-flashcards`; `static/js/flashcards.js`): where they are in each deck, each deck's best score (shown in the Deck menu), and each card's last answer. **Practise my mistakes** deals the cards last answered wrong. A deck is known by its file name and a card by its deck and prompt, so renaming a deck file, or rewording a prompt, starts that deck or card afresh for everyone. Fixing a typo in an explanation or an account name doesn't. Adding or removing cards in a deck restarts it for players partway through it; their best score and mistakes are kept.

With flash card accounts on (`accounts` under `[params.telegram]` in `config.toml`; setup in `telegram-bot/README.md`, "Flash card accounts"), a player can sign in with Telegram under the game. Their progress is then also kept in their account and merged with each browser's copy when they sign in or load the page: each card keeps the record with more answers, each deck the better best score, and where they are in the decks comes from the copy changed last. Forget my progress, when signed in, forgets in the account and on their other devices too. Signed-in players can ask the bot to remind them after two days without practice.

## Rules

- `prompt`, `debit` and `credit` are required. The build stops and names the file and card number if one is missing.
- An account can't be both a debit and a credit on the same card. The build stops if it is.
- Spell account names exactly as the existing decks do. For example, use `Accounts Payable`, not `A/P`. The game draws its wrong-answer choices from every account name in every deck that doesn't list its own `accounts`, so a misspelling becomes a separate account.
- Put the prompt and explanation in double quotes. Inside them, use single quotes, not double quotes.
- The player picks accounts only. Amounts in the prompt are for context and are not checked.
- Write prompts to match the page's stated conventions: a corporation, perpetual inventory, the allowance method for bad debts and the gross method for discounts. If a card uses a different method, say so in its prompt.

## Remove questions

Delete the card from its file. To remove a whole deck, delete its file.
