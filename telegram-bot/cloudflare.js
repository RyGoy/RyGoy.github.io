// Runs the bot (bot.js) as a Cloudflare Worker: wrangler.toml names this file. Cloudflare passes the settings (the
// secrets set with `npx wrangler secret put`) and the D1 database in `env`, and calls `scheduled` on wrangler.toml's
// [triggers] cron. Running it on your own machine instead: server.mjs, and docs/hosting.md.
import bot from "./bot.js";

export default {
  fetch: (request, env) => bot.fetch(request, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(bot.daily(env)),
};
