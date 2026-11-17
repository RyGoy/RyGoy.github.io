// Runs the bot (bot.js) on any machine with Node 22.5 or newer, instead of Cloudflare (docs/hosting.md):
//
//   cp .env.example .env    # then fill it in
//   node --env-file=.env server.mjs
//
// It answers on HOST:PORT (127.0.0.1:8787 unless set), behind a web server that gives it an HTTPS address, since
// Telegram and the site only call HTTPS addresses. The flash card accounts are kept in the SQLite file ACCOUNTS_DB
// (left out: accounts off), and the reminders go out once a day at REMIND_AT_UTC (15:07 unless set), as the Cloudflare
// cron does.
import http from "node:http";
import bot from "./bot.js";
import { openDatabase } from "./sqlite.js";

const REQUIRED = ["TELEGRAM_TOKEN", "WEBHOOK_SECRET", "MOD_CHAT_ID", "GITHUB_TOKEN"];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(", ")}. Copy .env.example to .env, fill it in, and run: node --env-file=.env server.mjs`);
  process.exit(1);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name]]));
if (process.env.ACCOUNTS_DB) env.DB = openDatabase(process.env.ACCOUNTS_DB);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = 1024 * 1024;

http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413).end("Too large");
        return;
      }
      chunks.push(chunk);
    }
    const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const request = new Request(`http://${req.headers.host || HOST}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).filter(([, value]) => typeof value === "string"),
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await bot.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, HOST, () => {
  console.log(`Bot listening on http://${HOST}:${PORT}${env.DB ? `, accounts in ${process.env.ACCOUNTS_DB}` : ", accounts off"}`);
});

// The daily reminders: at REMIND_AT_UTC each day, while the server runs.
const [hour, minute] = (process.env.REMIND_AT_UTC || "15:07").split(":").map(Number);
function scheduleDaily() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(async () => {
    try {
      console.log(`Reminders: ${await bot.daily(env)} sent`);
    } catch (err) {
      console.error(err);
    }
    scheduleDaily();
  }, next - now);
}
if (env.DB) scheduleDaily();
