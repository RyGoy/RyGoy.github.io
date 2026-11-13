// The commentary bot (a Cloudflare Worker, set up as in README.md).
//
// A contributor sends the bot a note in one message: the title on the first line, then the note. The bot passes it to
// the moderators' group as the Markdown file it will become, with Approve and Reject buttons. Approve commits the file
// to content/commentary/ on main, and the site's deploy publishes it. Nothing is stored here: the moderators' message
// holds the note, and the contributor's chat ID rides in the button.
//
// A question ("Ask a question" on the site, or /ask) comes in the same way but goes to the moderators with Reject only:
// a moderator approves it by replying to it in the group with the answer, and the bot commits the question with that
// answer and its author (answer, answered_by), and sends the answer to the one who asked.

const REPO = "RyGoy/RyGoy.github.io";
const SITE = "https://thetenderforlaw.com";
// Links to these hosts are site links: they go under `connects` as paths.
const SITE_HOSTS = ["thetenderforlaw.com", "www.thetenderforlaw.com", "rygoy.github.io"];
// A Telegram message holds 4096 characters; the moderators' copy adds the front matter and, later, a status line.
const MAX_TEXT = 3500;
const MAX_FILE = 4000;
const MAX_CONNECTS = 20;
// The question prompt's first line (how the bot knows a reply is a question) and the moderators' cue to answer.
const ASK_PROMPT = "Ask your question as a reply to this message, in one message:";
const ANSWER_HINT = "Reply to this message with your answer: the question and your answer are published together.";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    // Only Telegram knows the secret (setWebhook's secret_token), so only Telegram can drive the bot.
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    const update = await request.json();
    // Always answer 200: Telegram resends an update until it gets one, which would repeat a commit or a message.
    try {
      if (update.callback_query) await onButton(update.callback_query, env);
      else if (update.message) await onMessage(update.message, env);
    } catch (err) {
      console.error(err);
      const quiet = () => {};
      if (update.message?.chat.type === "private") {
        await tg(env, "sendMessage", { chat_id: update.message.chat.id, text: "Sorry, something went wrong. Please try again later." }).catch(quiet);
      }
      if (update.callback_query) {
        await tg(env, "answerCallbackQuery", { callback_query_id: update.callback_query.id, text: "Something went wrong.", show_alert: true }).catch(quiet);
      }
    }
    return new Response("ok");
  },
};

async function onMessage(msg, env) {
  if (String(msg.chat.id) === String(env.MOD_CHAT_ID)) return onAnswer(msg, env);
  if (msg.chat.type !== "private") return; // The bot talks only in private chats and the moderators' group.
  const text = (msg.text || "").trim();
  const reply = (t) => tg(env, "sendMessage", { chat_id: msg.chat.id, text: t });

  if (!text) return reply("Send your note as a text message.");
  if (text.startsWith("/")) {
    // "Add commentary" on a page opens /start <page path>, "Ask a question" /start Q<page path> (or /ask). The prompt
    // asks for a reply, so the note comes back attached to it and the page travels with the note.
    const arg = text.startsWith("/start ") ? text.slice(7).trim() : "";
    const ask = text === "/ask" || arg.startsWith("Q");
    const page = decodePage(ask ? arg.slice(1) : arg);
    return tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: prompt(page, ask),
      reply_markup: { force_reply: true, input_field_placeholder: ask ? "Title, then your question" : "Title, then your note" },
    });
  }

  const asking = (msg.reply_to_message?.text || "").startsWith(ASK_PROMPT);
  const kind = asking ? "question" : "note";

  const [first, ...rest] = text.split("\n");
  const title = first.trim();
  const body = rest.join("\n").trim();
  if (!body) return reply(`Put the title on the first line and the ${kind} below it, in one message.`);
  if (title.length > 120) return reply("The title (the first line) is too long: keep it under 120 characters.");
  if (text.length > MAX_TEXT) return reply(`The ${kind} is too long: keep it under ${MAX_TEXT} characters.`);

  const fromPrompt = (msg.reply_to_message?.text || "").match(/^Page: (\S+)$/m)?.[1];
  const connects = [...new Set([fromPrompt, ...text.match(/https?:\/\/\S+/g) || []].map(sitePath).filter(Boolean))];
  if (connects.length > MAX_CONNECTS) return reply(`Connect at most ${MAX_CONNECTS} pages in one ${kind}.`);

  const author = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
  const file = noteFile({ title, author, date: new Date().toISOString().slice(0, 10), connects, body, question: asking });
  if (file.length > MAX_FILE) return reply(`The ${kind} is too long: please shorten it.`);

  const reject = { text: "Reject", callback_data: `r:${msg.chat.id}` };
  await tg(env, "sendMessage", {
    chat_id: env.MOD_CHAT_ID,
    // A question is approved by answering it, so it has no Approve button, only the cue to reply.
    text: asking ? `${file}\n${ANSWER_HINT}` : file,
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [asking ? [reject] : [{ text: "Approve", callback_data: `a:${msg.chat.id}` }, reject]] },
  });
  return reply(asking
    ? "Thank you. Your question has gone to the moderators; their answer will come here, and both will be published."
    : "Thank you. Your note has gone to the moderators; you will hear here when it is approved.");
}

// A moderator's reply, in the group, to a question the bot posted: the answer. Other group messages are ignored.
async function onAnswer(msg, env) {
  const asked = msg.reply_to_message;
  if (!asked?.from?.is_bot || !(asked.text || "").includes(`\n${ANSWER_HINT}`)) return;
  const say = (t) => tg(env, "sendMessage", { chat_id: msg.chat.id, text: t, reply_parameters: { message_id: msg.message_id } });
  const answer = (msg.text || "").trim();
  if (!answer) return say("Send the answer as a text message, replying to the question.");

  const question = asked.text.slice(0, asked.text.lastIndexOf(`\n${ANSWER_HINT}`));
  const title = JSON.parse(question.match(/^title: (".*")$/m)[1]);
  const by = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "a moderator";
  // Named after the question's message, like a note, so a second answer finds the file already there.
  const name = `${slugify(title)}-${asked.message_id}`;
  const res = await commit(env, name, answerFile(question, by, answer), `Add question: ${title}\n\nAnswered in Telegram by ${by}.`);
  if (res.status === 422) return say("This question is already answered.");
  if (!res.ok) return say(`GitHub refused the commit (${res.status}). The question was not published; try again later.`);

  await tg(env, "editMessageText", {
    chat_id: msg.chat.id,
    message_id: asked.message_id,
    text: `${question}\n\nAnswered by ${by}: ${SITE}/commentary/${name}/`,
    link_preview_options: { is_disabled: true },
  }); // No reply_markup: Reject goes.
  // The one who asked rides in the Reject button.
  const asker = (asked.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data || "").split(":")[1];
  if (asker) {
    await tg(env, "sendMessage", {
      chat_id: asker,
      text: `Your question "${title}" was answered by ${by}:\n\n${answer}\n\nThe question and answer will be on the site in a few minutes: ${SITE}/commentary/${name}/`,
      link_preview_options: { is_disabled: true },
    }).catch(console.error);
  }
}

async function onButton(cq, env) {
  const answer = (t) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: t, show_alert: true });
  // Anyone in the moderators' group may approve; buttons anywhere else are refused.
  if (!cq.message || String(cq.message.chat.id) !== String(env.MOD_CHAT_ID)) return answer("Not allowed.");
  const [action, contributor] = (cq.data || "").split(":");
  const file = cq.message.text.split(`\n${ANSWER_HINT}`)[0]; // A question's message ends with the cue to answer.
  const title = JSON.parse(file.match(/^title: (".*")$/m)[1]);
  const kind = /^question: true$/m.test(file) ? "question" : "note";
  const by = cq.from.first_name || "a moderator";
  const status = (s) => tg(env, "editMessageText", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: `${file}\n\n${s}`,
    link_preview_options: { is_disabled: true },
  }); // No reply_markup: the buttons go, so a note is decided once.

  if (action === "r") {
    await status(`Rejected by ${by}`);
    await tg(env, "sendMessage", { chat_id: contributor, text: `Your ${kind} "${title}" was not approved.` }).catch(console.error);
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
  }
  if (action !== "a") return answer("Unknown button.");

  // The file name ends with the moderators' message ID, so a second click on Approve finds the file already there
  // instead of committing the note twice.
  if (kind === "question") return answer("A question is approved by replying to it with the answer.");
  const name = `${slugify(title)}-${cq.message.message_id}`;
  const res = await commit(env, name, file, `Add commentary: ${title}\n\nApproved in Telegram by ${by}.`);
  if (res.status === 422) return answer("This note is already approved.");
  if (!res.ok) return answer(`GitHub refused the commit (${res.status}). The note was not published; try again later.`);
  await status(`Approved by ${by}: ${SITE}/commentary/${name}/`);
  await tg(env, "sendMessage", {
    chat_id: contributor,
    text: `Your note "${title}" was approved. It will be on the site in a few minutes: ${SITE}/commentary/${name}/`,
  }).catch(console.error); // A contributor who blocked the bot is not the moderator's problem.
  return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Approved and committed." });
}

function prompt(page, ask) {
  return [
    ...(ask ? [
      ASK_PROMPT,
      "",
      "First line: a short title.",
      "Below it: your question. Include the link of every page it is about.",
      "",
      "Your Telegram name is shown as the one asking. A moderator answers it, and the question and answer are published together.",
    ] : [
      "Write your note as a reply to this message, in one message:",
      "",
      "First line: the title.",
      "Below it: the note. Include the link of every page it connects. Link another note with [[Note title]].",
      "",
      "Your Telegram name is shown as the author. Moderators read every note before it is published.",
    ]),
    ...(page ? ["", `Page: ${SITE}${page}`] : []),
  ].join("\n");
}

// Commits content/commentary/<name>.md to main; GitHub answers 422 when the file is already there.
async function commit(env, name, file, message) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/content/commentary/${name}.md`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ttfl-commentary-bot",
    },
    body: JSON.stringify({ message, content: base64(file), branch: "main" }),
  });
  if (!res.ok && res.status !== 422) console.error("GitHub", res.status, await res.clone().text());
  return res;
}

// The note as content/commentary/ holds it (CLAUDE.md, Commentary). Title and author are JSON strings, which YAML
// reads as double-quoted strings. "{{" is written as an entity so a note can't call a Hugo shortcode (an unknown one
// fails the build); it still reads "{{" on the page. A question has question: true.
export function noteFile({ title, author, date, connects, body, question = false }) {
  const list = connects.map((c) => `\n  - ${JSON.stringify(c)}`).join("");
  const text = body.replaceAll("{{", "{&#123;");
  return `---\ntitle: ${JSON.stringify(title)}\nauthor: ${JSON.stringify(author)}\ndate: ${date}\n${question ? "question: true\n" : ""}connects:${list || " []"}\n---\n\n${text}\n`;
}

// The question's file with the answer and its author added to the front matter, as JSON strings (valid YAML).
export function answerFile(question, by, answer) {
  const end = question.indexOf("\n---\n", 3);
  const text = answer.replaceAll("{{", "{&#123;");
  return `${question.slice(0, end)}\nanswered_by: ${JSON.stringify(by)}\nanswer: ${JSON.stringify(text)}${question.slice(end).replace(/\n*$/, "\n")}`;
}

// A link to this site, as its path ("/vol_i/123_456/"); anything else, null.
export function sitePath(link) {
  if (!link) return null;
  try {
    const url = new URL(link.replace(/[).,;:!?'"\]]+$/, "")); // Drop punctuation that ends the sentence, not the link.
    if (!SITE_HOSTS.includes(url.hostname)) return null;
    return decodeURI(url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`);
  } catch {
    return null;
  }
}

// The /start parameter (partials/commentary-add-link.html): the page's path, which is lowercase, with "/" written "S"
// and the archive's Facebook group ID prefix written "G", so a comment's path fits Telegram's 64 characters.
export const GROUP_PREFIX = "462493170453287_";
export function decodePage(param) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(param)) return null;
  const path = param.replaceAll("G", GROUP_PREFIX).replaceAll("S", "/");
  return /^\/[a-z0-9_\/-]*$/.test(path) ? path : null;
}

export function slugify(title) {
  const slug = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return slug || "note";
}

function base64(text) {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function tg(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}
