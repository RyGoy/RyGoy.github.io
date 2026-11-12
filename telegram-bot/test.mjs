// node telegram-bot/test.mjs: runs the bot against fake Telegram and GitHub APIs.
import assert from "node:assert/strict";
import worker, { noteFile, sitePath, decodePage, slugify, GROUP_PREFIX } from "./worker.js";

const env = { WEBHOOK_SECRET: "s3cret", TELEGRAM_TOKEN: "T", GITHUB_TOKEN: "G", MOD_CHAT_ID: "-100" };
let calls = [];
let files = new Map();
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url.startsWith("https://api.github.com/")) {
    calls.push({ github: url, body });
    if (files.has(url)) return new Response("{}", { status: 422 });
    files.set(url, Buffer.from(body.content, "base64").toString("utf8"));
    return new Response("{}", { status: 201 });
  }
  const method = url.split("/").pop();
  calls.push({ method, body });
  return Response.json({ ok: true, result: { message_id: 1 } });
};
const post = (update, secret = env.WEBHOOK_SECRET) =>
  worker.fetch(new Request("https://bot/", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify(update),
  }), env);
const user = { id: 7, first_name: "Ann", last_name: "Lee" };
const dm = { id: 7, type: "private" };

// The webhook secret is required.
assert.equal((await post({}, "wrong")).status, 403);

// /start with the page opens a prompt naming it, as a forced reply.
const page = "/vol_iii/462493170453287_536381629731107/";
const param = page.replaceAll(GROUP_PREFIX, "G").replaceAll("/", "S");
await post({ message: { chat: dm, from: user, text: `/start ${param}` } });
assert.equal(calls[0].method, "sendMessage");
assert.ok(calls[0].body.reply_markup.force_reply);
assert.match(calls[0].body.text, /^Page: https:\/\/thetenderforlaw\.com\/vol_iii\/462493170453287_536381629731107\/$/m);

// The note, sent as a reply to that prompt, goes to the moderators as its file.
const calls0Prompt = calls[0].body.text;
calls = [];
const note = "The cobra and the crown\nSee https://thetenderforlaw.com/titleproperty/maxims-of-equity/. And {{< oops >}} plus [[Other note]].";
await post({ message: { chat: dm, from: user, text: note, reply_to_message: { text: calls0Prompt } } });
const toMods = calls.find((c) => c.body.chat_id === "-100");
assert.ok(toMods, "sent to the moderators");
const file = toMods.body.text;
assert.match(file, /^---\ntitle: "The cobra and the crown"\nauthor: "Ann Lee"\ndate: \d{4}-\d\d-\d\d\nconnects:\n  - "\/vol_iii\/462493170453287_536381629731107\/"\n  - "\/titleproperty\/maxims-of-equity\/"\n---\n\n/);
assert.ok(file.includes("{&#123;< oops >}}") && !file.includes("{{"), "shortcodes neutralised");
assert.ok(file.includes("[[Other note]]"));
assert.deepEqual(toMods.body.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["a:7", "r:7"]);

// Approve commits that file once; a second click finds it already there.
const cq = (data, chatId = -100) => ({
  callback_query: { id: "q", data, from: { first_name: "Mod" }, message: { message_id: 42, chat: { id: chatId }, text: file } },
});
calls = [];
await post(cq("a:7"));
const commit = calls.find((c) => c.github);
assert.match(commit.github, /\/repos\/RyGoy\/RyGoy\.github\.io\/contents\/content\/commentary\/the-cobra-and-the-crown-42\.md$/);
assert.equal(files.get(commit.github), file);
assert.equal(commit.body.branch, "main");
assert.ok(calls.some((c) => c.method === "editMessageText" && !c.body.reply_markup && c.body.text.endsWith("Approved by Mod: https://thetenderforlaw.com/commentary/the-cobra-and-the-crown-42/")));
assert.ok(calls.some((c) => c.method === "sendMessage" && c.body.chat_id === "7" && /was approved/.test(c.body.text)));
calls = [];
await post(cq("a:7"));
assert.equal(files.size, 1);
assert.ok(calls.some((c) => c.method === "answerCallbackQuery" && /already approved/.test(c.body.text)));

// Buttons outside the moderators' group do nothing.
calls = [];
await post(cq("a:7", 999));
assert.ok(!calls.some((c) => c.github));

// Reject tells the contributor and commits nothing.
calls = [];
await post(cq("r:7"));
assert.ok(!calls.some((c) => c.github));
assert.ok(calls.some((c) => c.method === "sendMessage" && /not approved/.test(c.body.text)));

// A one-line message is refused; group chatter is ignored.
calls = [];
await post({ message: { chat: dm, from: user, text: "Just a title" } });
assert.match(calls[0].body.text, /first line/);
calls = [];
await post({ message: { chat: { id: -5, type: "group" }, from: user, text: "hello\nthere" } });
assert.equal(calls.length, 0);

// Helpers.
assert.equal(sitePath("https://rygoy.github.io/library/the-art-of-war)."), "/library/the-art-of-war/");
assert.equal(sitePath("https://example.com/vol_i/"), null);
assert.equal(decodePage(param), page);
assert.equal(decodePage("not valid!"), null);
assert.equal(decodePage("vol_i"), null); // no leading slash
const comment = "/vol_iii/462493170453287_536381629731107/462493170453287_536381629731107-536398109729459/";
assert.equal(decodePage("Svol_iiiSG536381629731107SG536381629731107-536398109729459S"), comment);
assert.equal(slugify("Équité & «Law»!"), "equite-law");
assert.equal(slugify("???"), "note");
assert.match(noteFile({ title: 'He said "no"', author: "A", date: "2026-01-01", connects: [], body: "x" }), /title: "He said \\"no\\""\n.*connects: \[\]/s);

console.log("all bot tests passed");
