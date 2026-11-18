# Commentary bot

Contributors send commentary to a Telegram bot. Moderators approve it in a Telegram group, and the bot commits each approved note to `content/commentary/` on `main`, which deploys it. GitHub Pages can't run a bot, so it runs elsewhere: today as a Cloudflare Worker, or on a machine of your own. The bot itself (`bot.js`, `accounts.js`) is the same either way; `cloudflare.js` starts it on Cloudflare and `server.mjs` on your own machine. Every outside service, and how to move the bot from one host to the other, is in [`docs/hosting.md`](../docs/hosting.md).

## How it works

1. "Add commentary" on a page opens the bot with that page (`bot` in `[params.telegram]` in `config.toml`; `layouts/partials/commentary-add-link.html`). The bot asks for the note as a reply, with the page's link in its prompt.
2. The contributor sends one message: the title on the first line, then the note. Every link to the site in it, and the page from the prompt, go under `connects`; `[[Note title]]` links another note. Their Telegram name is the author.
3. The bot posts the note to the moderators' group as the exact file it will commit, with **Approve** and **Reject**.
4. **Approve** commits `content/commentary/<title>-<message id>.md` and tells the contributor its address. **Reject** tells them it was not approved. Either way the buttons go, so each note is decided once (a second Approve finds the file already there).

**Questions.** "Ask a question" on a page (or `/ask` in the bot) works the same way, but the moderators' copy has only **Reject** and ends with "Reply to this message with your answer". A moderator approves a question by **replying to it in the group** with the answer: the bot commits the question with the answer and the moderator's Telegram name (`answer` and `answered_by` in its front matter, beside `question: true`), marks the group message answered, and sends the answer to the one who asked. The page shows the question, then the answer. A second reply finds the file already there. The bot sees these replies with Telegram's default privacy mode (a bot in a group receives replies to its own messages), so nothing needs changing in BotFather; other group messages are ignored.

The commentary bot stores nothing (the flash card accounts below do): the note (or question) lives in the moderators' message, and the contributor's chat ID in the button. Anyone in the moderators' group can approve, so keep it to moderators.

Notes can't break the build: Hugo strips raw HTML from Markdown, unknown links are ignored, and the bot writes `{{` as `{&#123;` so a note can't call a shortcode.

## Setting it up

These steps put it on Cloudflare. To run it on your own machine instead, follow steps 1 to 3, then [`docs/hosting.md`](../docs/hosting.md), "Moving the bot from Cloudflare to your own machine", from its step 1.

You need a Telegram account, a free Cloudflare account, and GitHub access to this repository.

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the steps. Keep the token it gives you. The username (ending in `bot`) goes in `config.toml` at the end.
2. **Create the moderators' group.** Make a private Telegram group, add the moderators and the bot. Send `/start` in the group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the `chat` `id` (a negative number) of that message.
3. **Create a GitHub token.** GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. Repository access: only `RyGoy/RyGoy.github.io`. Permissions: **Contents: Read and write**. Commits are made as the token's owner.
4. **Deploy the Worker.** In this folder:

   ```sh
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put TELEGRAM_TOKEN    # the bot token from step 1
   npx wrangler secret put MOD_CHAT_ID       # the group's chat id from step 2
   npx wrangler secret put GITHUB_TOKEN      # the token from step 3
   npx wrangler secret put WEBHOOK_SECRET    # any long random string, e.g. from: openssl rand -hex 32
   ```

   `deploy` prints the Worker's address, like `https://ttfl-commentary-bot.<you>.workers.dev`.
5. **Point Telegram at the Worker**, with the same `WEBHOOK_SECRET`:

   ```sh
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d url=https://ttfl-commentary-bot.<you>.workers.dev \
     -d secret_token=<WEBHOOK_SECRET> \
     -d 'allowed_updates=["message","callback_query"]'
   ```

6. **Try it.** Message the bot `/start`, reply with a test note, and approve it in the group. Delete the test file from `content/commentary/` afterwards.
7. **Turn it on for the site.** In `config.toml`, under `[params.telegram]`, set `bot` to the bot's username, without the `@`, and `commentary = true`.

To change the bot, edit `bot.js` (or `accounts.js`), run `npm test` here, and deploy again: `npx wrangler deploy` on Cloudflare (`npx wrangler tail` shows its logs), or restart `server.mjs` on your own machine.

## Flash card accounts

The same bot lets players of the [flash cards](https://thetenderforlaw.com/accounting/flashcards/) sign in with Telegram, so their progress follows them to every device, and get a reminder from the bot after two days without practice. This part does keep data: each player's Telegram ID, first name, progress, when they last played, and whether they want reminders, in a database (`schema.sql`, `accounts.js`): Cloudflare D1, or a SQLite file when the bot runs on your own machine. The site says so beside the sign-in button.

- **Signing in** uses Telegram's Login widget on the flash card page. The bot checks the login's signature with the bot's token (`POST /api/login`) and returns a session, signed with a key made from the token, that lasts 180 days. Changing the bot's token signs everyone out.
- **Progress** is saved by the browser (`GET`/`PUT /api/progress`), which merges its own copy with the account's. Each save names the revision it was merged with; a save against an older one gets the stored copy back to merge (409).
- **Reminders** are opt in (the checkbox under the game, `PUT /api/reminders`). Once a day (`[triggers]` in `wrangler.toml` on Cloudflare, `REMIND_AT_UTC` in `server.mjs`'s `.env` on your own machine) the bot sends one message to each player who asked and hasn't played for two days, and no other until they play again. Players who blocked the bot are taken off.
- **In the bot**, `/stop` turns reminders off and `/delete` deletes the player's row. Under the game, Forget my progress erases the progress but keeps the account.

### Setting it up

On Cloudflare, as follows. On your own machine, set `ACCOUNTS_DB` in `.env` (the file and its table are made when the server starts), do step 2, and set `accounts` under `[params.telegram]` to your server's address.

1. **Create the database**, in this folder:

   ```sh
   npx wrangler d1 create ttfl-accounts
   ```

   Uncomment the `[[d1_databases]]` block in `wrangler.toml` and put the `database_id` it printed there. Then make the table and deploy:

   ```sh
   npx wrangler d1 execute ttfl-accounts --remote --file schema.sql
   npx wrangler deploy
   ```

2. **Allow the site to use the bot's login.** In [@BotFather](https://t.me/BotFather), send `/setdomain`, choose the bot and send `thetenderforlaw.com`. The Login widget works only on that domain, so it can't be tried on a local preview.
3. **Tell the bot's commands** (optional): BotFather's `/setcommands` with `stop - Turn flash card reminders off` and `delete - Delete my flash card account`.
4. **Turn it on for the site.** In `config.toml`, set `accounts` under `[params.telegram]` to the Worker's address (from `deploy`, like `https://ttfl-commentary-bot.<you>.workers.dev`). The sign-in shows under the game after the next deploy.

The site's addresses allowed to call the API are `ORIGINS` in `accounts.js`. `npm test` runs `test-accounts.mjs` too, against an in-memory SQLite database standing in for D1 (`sqlite.js`), and `test-server.mjs`, which starts `server.mjs`.

**Turning it off:** set `accounts = ""` under `[params.telegram]`. The sign-in goes from the site and progress stays in each browser. To stop reminders too, comment out `[triggers]` in `wrangler.toml` and deploy again. The data stays in D1 until it is deleted (`npx wrangler d1 execute ttfl-accounts --remote --command "DELETE FROM players"`).

## Turning it off

- **The site's link:** set `commentary = false` under `[params.telegram]` in `config.toml`. After the deploy, "Add commentary" opens GitHub's editor instead of the bot; `true` brings the bot back. The bot itself still answers anyone who messages it.
- **The bot, at once:** `curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook?drop_pending_updates=true"`. Telegram stops passing anything to the bot, so new notes and the Approve and Reject buttons do nothing, and messages sent meanwhile are dropped. Step 5 (`setWebhook`) turns it back on.
