// Flash card accounts (README.md, "Flash card accounts"): players sign in on the flash card page with the Telegram
// Login widget, and their progress is kept in the database env.DB (schema.sql: D1 on Cloudflare, a SQLite file with
// server.mjs; docs/hosting.md), so it follows them to
// every device they sign in on. Players who ask for it get a reminder from the bot after two days without practice.
//
// The browser owns the progress: it merges its own copy with the stored one (static/js/flashcards.js) and saves the
// result here. Each save names the revision it was merged with, and a save made against an older revision is refused
// with the stored copy, so two devices can't overwrite each other's answers.
//
// Kept for each player: their Telegram ID, first name, progress, when it was last saved, whether they want reminders
// and when the last one was sent. /delete in the bot, or DELETE /api/account, removes the row.

const ORIGINS = ["https://thetenderforlaw.com", "https://www.thetenderforlaw.com", "https://rygoy.github.io", "http://localhost:1313"];
const PAGE = "https://thetenderforlaw.com/accounting/flashcards/";
const LOGIN_MAX_AGE = 24 * 60 * 60; // seconds a Telegram login may be used for, after Telegram signed it
const SESSION_DAYS = 180;
const MAX_PROGRESS = 256 * 1024; // bytes; every card's last answer for ~300 cards is about 70 KB
const REMIND_AFTER = 2 * 24 * 60 * 60 * 1000; // ms without a save before a reminder
const REMIND_BATCH = 100; // reminders sent per run of the daily cron

const enc = new TextEncoder();

export async function handleApi(request, env) {
  const origin = request.headers.get("Origin");
  const cors = {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const json = (body, status = 200) => Response.json(body, { status, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.DB) return json({ error: "Accounts are not set up." }, 503);

  const route = `${request.method} ${new URL(request.url).pathname}`;
  try {
    if (route === "POST /api/login") {
      const login = await request.json().catch(() => null);
      const id = await verifyLogin(login, env.TELEGRAM_TOKEN);
      if (!id) return json({ error: "The Telegram login could not be checked." }, 401);
      const name = String(login.first_name || "").slice(0, 64);
      const row = await env.DB.prepare(
        "INSERT INTO players (id, name, updated) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET name = ?2 RETURNING remind",
      ).bind(id, name, Date.now()).first();
      return json({ token: await session(id, env.TELEGRAM_TOKEN), name, remind: Boolean(row.remind) });
    }

    const id = await player(request, env.TELEGRAM_TOKEN);
    if (!id) return json({ error: "Not signed in." }, 401);
    const gone = () => json({ error: "No account: sign in again." }, 401); // deleted with /delete, or never made

    if (route === "GET /api/progress") {
      const row = await env.DB.prepare("SELECT name, progress, rev, remind FROM players WHERE id = ?1").bind(id).first();
      if (!row) return gone();
      return json({ name: row.name, progress: JSON.parse(row.progress), rev: row.rev, remind: Boolean(row.remind) });
    }
    if (route === "PUT /api/progress") {
      const text = await request.text();
      if (enc.encode(text).length > MAX_PROGRESS + 1024) return json({ error: "Too large." }, 413);
      const body = JSON.parse(text);
      const progress = JSON.stringify(body?.progress);
      if (body?.progress?.v !== 1 || !Number.isInteger(body.rev)) {
        return json({ error: "Expected { progress: { v: 1, ... }, rev }." }, 400);
      }
      if (enc.encode(progress).length > MAX_PROGRESS) return json({ error: "Too large." }, 413);
      const saved = await env.DB.prepare(
        "UPDATE players SET progress = ?2, rev = rev + 1, updated = ?3 WHERE id = ?1 AND rev = ?4 RETURNING rev",
      ).bind(id, progress, Date.now(), body.rev).first();
      if (saved) return json({ rev: saved.rev });
      const row = await env.DB.prepare("SELECT progress, rev FROM players WHERE id = ?1").bind(id).first();
      if (!row) return gone();
      return json({ progress: JSON.parse(row.progress), rev: row.rev }, 409); // merge with this and save again
    }
    if (route === "PUT /api/reminders") {
      const body = await request.json().catch(() => null);
      if (typeof body?.remind !== "boolean") return json({ error: "Expected { remind: true | false }." }, 400);
      const row = await env.DB.prepare("UPDATE players SET remind = ?2 WHERE id = ?1 RETURNING remind")
        .bind(id, body.remind ? 1 : 0).first();
      return row ? json({ remind: Boolean(row.remind) }) : gone();
    }
    if (route === "DELETE /api/account") {
      await env.DB.prepare("DELETE FROM players WHERE id = ?1").bind(id).run();
      return json({ deleted: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: "Expected JSON." }, 400);
    console.error(err);
    return json({ error: "Something went wrong." }, 500);
  }
}

// The bot's account commands, in a private chat: /stop turns reminders off, /delete removes the player's row.
// Returns false for any other message, which the commentary bot handles.
export async function onAccountCommand(msg, env, tg) {
  const command = (msg.text || "").trim().split(/[\s@]/)[0];
  if (!["/stop", "/delete"].includes(command)) return false;
  const reply = (text) => tg(env, "sendMessage", { chat_id: msg.chat.id, text });
  if (!env.DB) {
    await reply("Flash card accounts are not set up.");
    return true;
  }
  if (command === "/stop") {
    const row = await env.DB.prepare("UPDATE players SET remind = 0 WHERE id = ?1 RETURNING id").bind(msg.from.id).first();
    await reply(row ? "Reminders are off. Turn them back on under the flash cards." : "You have no flash card account, so no reminders are coming.");
  } else {
    const done = await env.DB.prepare("DELETE FROM players WHERE id = ?1").bind(msg.from.id).run();
    await reply(done.meta.changes
      ? "Your flash card account is deleted: your progress, your name and your reminders. Progress kept in your browser stays there until you choose Forget my progress."
      : "You have no flash card account, so there was nothing to delete.");
  }
  return true;
}

// The daily cron: one reminder to each player who asked for them and hasn't saved for two days, and no other until
// they play again (nudged < updated). A player who blocked the bot has reminders turned off.
export async function sendReminders(env, tg, now = Date.now()) {
  if (!env.DB) return 0;
  const { results } = await env.DB.prepare(
    "SELECT id, name, progress FROM players WHERE remind = 1 AND updated < ?1 AND (nudged IS NULL OR nudged < updated) LIMIT ?2",
  ).bind(now - REMIND_AFTER, REMIND_BATCH).all();
  for (const row of results) {
    try {
      await tg(env, "sendMessage", {
        chat_id: row.id,
        text: reminder(row.name, JSON.parse(row.progress)),
        reply_markup: { inline_keyboard: [[{ text: "Play the flash cards", url: PAGE }]] },
      });
      await env.DB.prepare("UPDATE players SET nudged = ?2 WHERE id = ?1").bind(row.id, now).run();
    } catch (err) {
      console.error(err);
      // Blocked, or the chat is gone: stop trying. Anything else (Telegram down) is retried tomorrow.
      if (/Forbidden|chat not found/i.test(err.message)) {
        await env.DB.prepare("UPDATE players SET remind = 0 WHERE id = ?1").bind(row.id).run();
      }
    }
  }
  return results.length;
}

export function reminder(name, progress) {
  const mistakes = Object.values(progress?.cards || {}).filter((card) => card?.last === "wrong").length;
  return [
    `${name ? `Hi ${name}, it's` : "It's"} been a couple of days since your last flash cards.`,
    mistakes ? `${mistakes} ${mistakes === 1 ? "card is" : "cards are"} waiting under Practise my mistakes.` : "Pick up where you left off: it takes five minutes.",
    "",
    "Send /stop to turn these reminders off.",
  ].join("\n");
}

// The Telegram Login widget's data, checked as https://core.telegram.org/widgets/login#checking-authorization says:
// an HMAC-SHA256 of its fields, keyed with the SHA-256 of the bot's token. Returns the Telegram user ID, or null.
export async function verifyLogin(login, token, now = Date.now()) {
  if (!login || typeof login !== "object" || typeof login.hash !== "string") return null;
  const { hash, ...fields } = login;
  if (Object.values(fields).some((value) => !["string", "number"].includes(typeof value))) return null;
  const check = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("\n");
  const key = await hmacKey(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(check)));
  if (!equal(expected, hash.toLowerCase())) return null;
  const age = now / 1000 - Number(fields.auth_date);
  if (!(age >= -60 && age <= LOGIN_MAX_AGE)) return null;
  return Number.isSafeInteger(Number(fields.id)) ? Number(fields.id) : null;
}

// A session is "<id>.<expiry>.<signature>", signed with a key made from the bot's token, so changing the token signs
// everyone out. The browser sends it as "Authorization: Bearer <session>".
export async function session(id, token, now = Date.now()) {
  const body = `${id}.${Math.floor(now / 1000) + SESSION_DAYS * 86400}`;
  return `${body}.${await sign(body, token)}`;
}

async function player(request, token) {
  const [, value] = (request.headers.get("Authorization") || "").match(/^Bearer (\d+\.\d+\.[0-9a-f]{64})$/) || [];
  if (!value) return null;
  const [id, expires, signature] = value.split(".");
  if (Number(expires) < Date.now() / 1000) return null;
  return equal(await sign(`${id}.${expires}`, token), signature) ? Number(id) : null;
}

async function sign(text, token) {
  const key = await hmacKey(await crypto.subtle.digest("SHA-256", enc.encode(`ttfl-flashcards-session\n${token}`)));
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

const hmacKey = (raw) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
// Compares without stopping at the first difference, so the time taken says nothing about how much matched.
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
