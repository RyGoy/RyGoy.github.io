// node telegram-bot/test-accounts.mjs: runs the flash card accounts (accounts.js) against a fake Telegram and an
// in-memory SQLite database (sqlite.js, with the real schema.sql) standing in for D1.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import worker from "./bot.js";
import { verifyLogin, reminder } from "./accounts.js";
import { openDatabase } from "./sqlite.js";

const TOKEN = "123:bot-token";
const env = { WEBHOOK_SECRET: "s3cret", TELEGRAM_TOKEN: TOKEN, GITHUB_TOKEN: "G", MOD_CHAT_ID: "-100", DB: openDatabase() };
let sent = [];
let blocked = new Set();
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const method = url.split("/").pop();
  sent.push({ method, body });
  if (blocked.has(body.chat_id)) return Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
  return Response.json({ ok: true, result: { message_id: 1 } });
};

const SITE = "https://thetenderforlaw.com";
const api = (method, path, { body, token, origin = SITE } = {}) => worker.fetch(new Request(`https://bot.example${path}`, {
  method,
  headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
}), env);

// A login signed as Telegram signs it (https://core.telegram.org/widgets/login#checking-authorization), written
// here independently of accounts.js.
function telegramLogin(fields, token = TOKEN) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", key).update(check).digest("hex") };
}
const now = () => Math.floor(Date.now() / 1000);
const ann = telegramLogin({ id: 7, first_name: "Ann", last_name: "Lee", username: "ann", auth_date: now() });

// The login check: a good login passes, and changing any field, an old login or another bot's token fails.
assert.equal(await verifyLogin(ann, TOKEN), 7);
assert.equal(await verifyLogin({ ...ann, id: 8 }, TOKEN), null);
assert.equal(await verifyLogin({ ...ann, first_name: "Bob" }, TOKEN), null);
assert.equal(await verifyLogin(telegramLogin({ id: 7, first_name: "Ann", auth_date: now() - 2 * 86400 }), TOKEN), null);
assert.equal(await verifyLogin(telegramLogin({ id: 7, first_name: "Ann", auth_date: now() }, "other"), TOKEN), null);
assert.equal(await verifyLogin({ id: 7, auth_date: now() }, TOKEN), null);
assert.equal(await verifyLogin(null, TOKEN), null);

// CORS: the site's origins are named back; a preflight is answered.
let res = await api("OPTIONS", "/api/progress");
assert.equal(res.status, 204);
assert.equal(res.headers.get("Access-Control-Allow-Origin"), SITE);
res = await api("OPTIONS", "/api/progress", { origin: "https://evil.example" });
assert.equal(res.headers.get("Access-Control-Allow-Origin"), SITE);

// No session, a forged one, or a bad login: refused.
assert.equal((await api("GET", "/api/progress")).status, 401);
assert.equal((await api("GET", "/api/progress", { token: `7.9999999999.${"0".repeat(64)}` })).status, 401);
assert.equal((await api("POST", "/api/login", { body: { ...ann, id: 8 } })).status, 401);
assert.equal((await api("POST", "/api/login", { body: "not json" })).status, 401);

// Logging in makes the account and keeps only the first name.
res = await api("POST", "/api/login", { body: ann });
assert.equal(res.status, 200);
const { token, name, remind } = await res.json();
assert.equal(name, "Ann");
assert.equal(remind, false);
assert.deepEqual(env.DB.raw.prepare("SELECT id, name FROM players").all().map((r) => ({ ...r })), [{ id: 7, name: "Ann" }]);
// A session for one player can't be edited into another's.
assert.equal((await api("GET", "/api/progress", { token: token.replace(/^7\./, "8.") })).status, 401);

// A new account's progress is empty, at revision 0.
res = await api("GET", "/api/progress", { token });
assert.deepEqual(await res.json(), { name: "Ann", progress: { v: 1 }, rev: 0, remind: false });

// Saving against the current revision works; against an older one, the stored copy comes back to merge with.
const first = { v: 1, t: 1, cards: { "a|x": { right: 1, wrong: 0, last: "right" } } };
res = await api("PUT", "/api/progress", { token, body: { progress: first, rev: 0 } });
assert.deepEqual(await res.json(), { rev: 1 });
res = await api("PUT", "/api/progress", { token, body: { progress: { v: 1, t: 2 }, rev: 0 } });
assert.equal(res.status, 409);
assert.deepEqual(await res.json(), { progress: first, rev: 1 });
assert.equal((await api("GET", "/api/progress", { token }).then((r) => r.json())).rev, 1);

// Bad saves are refused: not v 1, no revision, not JSON, too large.
assert.equal((await api("PUT", "/api/progress", { token, body: { progress: { v: 2 }, rev: 1 } })).status, 400);
assert.equal((await api("PUT", "/api/progress", { token, body: { progress: { v: 1 } } })).status, 400);
assert.equal((await api("PUT", "/api/progress", { token, body: "{" })).status, 400);
assert.equal((await api("PUT", "/api/progress", { token, body: { progress: { v: 1, pad: "x".repeat(300 * 1024) }, rev: 1 } })).status, 413);
assert.equal((await api("GET", "/api/nothing", { token })).status, 404);

// Reminders: on, then the daily run sends one after two days without a save, and no second until the next save.
assert.equal((await api("PUT", "/api/reminders", { token, body: { remind: "yes" } })).status, 400);
res = await api("PUT", "/api/reminders", { token, body: { remind: true } });
assert.deepEqual(await res.json(), { remind: true });
const cron = () => worker.daily(env);
const day = 86400000;
env.DB.raw.prepare("UPDATE players SET updated = ?, progress = ? WHERE id = 7")
  .run(Date.now() - 3 * day, JSON.stringify({ v: 1, cards: { a: { last: "wrong" }, b: { last: "right" }, c: { last: "wrong" } } }));
sent = [];
await cron();
assert.equal(sent.length, 1);
assert.equal(sent[0].body.chat_id, 7);
assert.match(sent[0].body.text, /^Hi Ann, it's been a couple of days/);
assert.match(sent[0].body.text, /2 cards are waiting under Practise my mistakes/);
assert.match(sent[0].body.text, /\/stop/);
assert.equal(sent[0].body.reply_markup.inline_keyboard[0][0].url, `${SITE}/accounting/flashcards/`);
sent = [];
await cron();
assert.equal(sent.length, 0, "one reminder per break");
// Someone who saved recently isn't reminded.
await api("PUT", "/api/progress", { token, body: { progress: { v: 1 }, rev: 1 } });
await cron();
assert.equal(sent.length, 0);
assert.equal(reminder("", { v: 1 }), "It's been a couple of days since your last flash cards.\nPick up where you left off: it takes five minutes.\n\nSend /stop to turn these reminders off.");

// A player who blocked the bot has reminders turned off.
env.DB.raw.prepare("UPDATE players SET updated = ?, nudged = NULL WHERE id = 7").run(Date.now() - 3 * day);
blocked.add(7);
await cron();
assert.equal(env.DB.raw.prepare("SELECT remind FROM players WHERE id = 7").get().remind, 0);
blocked.clear();

// The bot's /stop and /delete. Other messages still reach the commentary bot.
const dm = (text, id = 7) => worker.fetch(new Request("https://bot.example/", {
  method: "POST",
  headers: { "X-Telegram-Bot-Api-Secret-Token": env.WEBHOOK_SECRET },
  body: JSON.stringify({ message: { chat: { id, type: "private" }, from: { id, first_name: "Ann" }, text } }),
}), env);
await api("PUT", "/api/reminders", { token, body: { remind: true } });
sent = [];
await dm("/stop");
assert.match(sent[0].body.text, /^Reminders are off/);
assert.equal(env.DB.raw.prepare("SELECT remind FROM players WHERE id = 7").get().remind, 0);
sent = [];
await dm("/ask");
assert.ok(sent[0].body.reply_markup.force_reply, "/ask is still the commentary bot's");
sent = [];
await dm("/delete");
assert.match(sent[0].body.text, /^Your flash card account is deleted/);
assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM players").get().n, 0);
sent = [];
await dm("/delete");
assert.match(sent[0].body.text, /nothing to delete/);
// A deleted account's session no longer works, and logging in again starts afresh.
assert.equal((await api("GET", "/api/progress", { token })).status, 401);
assert.equal((await api("PUT", "/api/progress", { token, body: { progress: { v: 1 }, rev: 0 } })).status, 401);
const again = await api("POST", "/api/login", { body: ann }).then((r) => r.json());
assert.equal((await api("GET", "/api/progress", { token: again.token }).then((r) => r.json())).rev, 0);
// DELETE /api/account, from the site.
assert.deepEqual(await api("DELETE", "/api/account", { token: again.token }).then((r) => r.json()), { deleted: true });
assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM players").get().n, 0);

// Without the database bound, the API says so and the bot's commands answer kindly.
const { DB, ...bare } = env;
assert.equal((await worker.fetch(new Request("https://bot.example/api/progress"), bare)).status, 503);
assert.equal(await worker.daily(bare), 0);

console.log("accounts: all tests passed");
