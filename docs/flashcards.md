# Flash card questions

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

## Rules

- `prompt`, `debit` and `credit` are required. The build stops and names the file and card number if one is missing.
- An account can't be both a debit and a credit on the same card. The build stops if it is.
- Spell account names exactly as the existing decks do. For example, use `Accounts Payable`, not `A/P`. The game draws its wrong-answer choices from every account name in every deck, so a misspelling becomes a separate account.
- Put the prompt and explanation in double quotes. Inside them, use single quotes, not double quotes.
- The player picks accounts only. Amounts in the prompt are for context and are not checked.
- Write prompts to match the page's stated conventions: a corporation, perpetual inventory, the allowance method for bad debts and the gross method for discounts. If a card uses a different method, say so in its prompt.

## Remove questions

Delete the card from its file. To remove a whole deck, delete its file.
