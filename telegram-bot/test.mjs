// node telegram-bot/test.mjs: runs the bot against fake Telegram and GitHub APIs.
import assert from "node:assert/strict";
import worker, { noteFile, answerFile, sitePath, decodePage, slugify, GROUP_PREFIX } from "./worker.js";

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

// A question: /start Q<page> asks for it; it reaches the moderators with Reject only and the cue to answer.
calls = [];
await post({ message: { chat: dm, from: user, text: `/start Q${param}` } });
const askPrompt = calls[0].body.text;
assert.match(askPrompt, /^Ask your question/);
assert.match(askPrompt, /^Page: https:\/\/thetenderforlaw\.com\/vol_iii\/462493170453287_536381629731107\/$/m);
calls = [];
await post({ message: { chat: dm, from: user, text: "Who holds the title?\nIf I pay the debt, {{ who }} owns the car?", reply_to_message: { text: askPrompt } } });
const qToMods = calls.find((c) => c.body.chat_id === "-100");
const qText = qToMods.body.text;
assert.match(qText, /^---\ntitle: "Who holds the title\?"\nauthor: "Ann Lee"\ndate: \d{4}-\d\d-\d\d\nquestion: true\nconnects:\n  - "\/vol_iii\/462493170453287_536381629731107\/"\n---\n\n/);
assert.match(qText, /\nReply to this message with your answer/);
assert.deepEqual(qToMods.body.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["r:7"]);
assert.ok(calls.some((c) => c.body.chat_id === 7 && /question has gone/.test(c.body.text)));
// /ask works without a page.
calls = [];
await post({ message: { chat: dm, from: user, text: "/ask" } });
assert.match(calls[0].body.text, /^Ask your question/);
assert.doesNotMatch(calls[0].body.text, /^Page:/m);

// A moderator answers by replying to it in the group: the question is committed with the answer and its author.
const asked = { message_id: 77, from: { is_bot: true }, text: qText, reply_markup: qToMods.body.reply_markup };
const mod = { first_name: "Mod", last_name: "Erator" };
files.clear(); calls = [];
await post({ message: { message_id: 78, chat: { id: -100, type: "supergroup" }, from: mod, text: "The one on the title.\nSee [[Other note]].", reply_to_message: asked } });
const qCommit = calls.find((c) => c.github);
assert.match(qCommit.github, /\/content\/commentary\/who-holds-the-title-77\.md$/);
const qFile = files.get(qCommit.github);
assert.match(qFile, /\nquestion: true\nconnects:\n  - "[^"]+"\nanswered_by: "Mod Erator"\nanswer: "The one on the title.\\nSee \[\[Other note\]\]."\n---\n\nIf I pay the debt, \{&#123; who \}\} owns the car\?\n$/);
assert.ok(!qFile.includes("Reply to this message"), "the cue is not committed");
assert.ok(calls.some((c) => c.method === "editMessageText" && c.body.message_id === 77 && !c.body.reply_markup && /Answered by Mod Erator: https:\/\/thetenderforlaw\.com\/commentary\/who-holds-the-title-77\/$/.test(c.body.text)));
assert.ok(calls.some((c) => c.method === "sendMessage" && c.body.chat_id === "7" && /answered by Mod Erator:\n\nThe one on the title\./.test(c.body.text)));
// A second answer finds it already there; Approve can't publish a question without one.
calls = [];
await post({ message: { message_id: 79, chat: { id: -100, type: "supergroup" }, from: mod, text: "Again", reply_to_message: asked } });
assert.equal(files.size, 1);
assert.ok(calls.some((c) => /already answered/.test(c.body.text || "")));
calls = [];
await post({ callback_query: { id: "q", data: "a:7", from: mod, message: { message_id: 77, chat: { id: -100 }, text: qText } } });
assert.ok(!calls.some((c) => c.github));
// Rejecting a question says "question".
calls = [];
await post({ callback_query: { id: "q", data: "r:7", from: mod, message: { message_id: 77, chat: { id: -100 }, text: qText } } });
assert.ok(calls.some((c) => c.method === "sendMessage" && /Your question "Who holds the title\?" was not approved/.test(c.body.text)));
// Other group messages, and replies to anything but a question, are ignored.
calls = [];
await post({ message: { message_id: 80, chat: { id: -100, type: "supergroup" }, from: mod, text: "hello" } });
await post({ message: { message_id: 81, chat: { id: -100, type: "supergroup" }, from: mod, text: "hi", reply_to_message: { message_id: 42, from: { is_bot: true }, text: file } } });
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
