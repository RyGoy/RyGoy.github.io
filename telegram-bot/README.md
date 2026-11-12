# Commentary bot

Contributors send commentary to a Telegram bot. Moderators approve it in a Telegram group, and the bot commits each approved note to `content/commentary/` on `main`, which deploys it. It runs as a Cloudflare Worker (`worker.js`); GitHub Pages can't run a bot.

## How it works

1. "Add commentary" on a page opens the bot with that page (`params.commentary_telegram_bot` in `config.toml`; `layouts/partials/commentary-add-link.html`). The bot asks for the note as a reply, with the page's link in its prompt.
2. The contributor sends one message: the title on the first line, then the note. Every link to the site in it, and the page from the prompt, go under `connects`; `[[Note title]]` links another note. Their Telegram name is the author.
3. The bot posts the note to the moderators' group as the exact file it will commit, with **Approve** and **Reject**.
4. **Approve** commits `content/commentary/<title>-<message id>.md` and tells the contributor its address. **Reject** tells them it was not approved. Either way the buttons go, so each note is decided once (a second Approve finds the file already there).

Nothing is stored in the Worker: the note lives in the moderators' message, and the contributor's chat ID in the button. Anyone in the moderators' group can approve, so keep it to moderators.

Notes can't break the build: Hugo strips raw HTML from Markdown, unknown links are ignored, and the bot writes `{{` as `{&#123;` so a note can't call a shortcode.

## Setting it up

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
7. **Turn it on for the site.** Set `commentary_telegram_bot` in `config.toml` to the bot's username, without the `@`.

To change the bot, edit `worker.js`, run `npm test` here, and `npx wrangler deploy` again. `npx wrangler tail` shows its logs.
