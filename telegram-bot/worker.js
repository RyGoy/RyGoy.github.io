// The commentary bot (a Cloudflare Worker, set up as in README.md).
//
// A contributor sends the bot a note in one message: the title on the first line, then the note. The bot passes it to
// the moderators' group as the Markdown file it will become, with Approve and Reject buttons. Approve commits the file
// to content/commentary/ on main, and the site's deploy publishes it. Nothing is stored here: the moderators' message
// holds the note, and the contributor's chat ID rides in the button.

const REPO = "RyGoy/RyGoy.github.io";
const SITE = "https://thetenderforlaw.com";
// Links to these hosts are site links: they go under `connects` as paths.
const SITE_HOSTS = ["thetenderforlaw.com", "www.thetenderforlaw.com", "rygoy.github.io"];
// A Telegram message holds 4096 characters; the moderators' copy adds the front matter and, later, a status line.
const MAX_TEXT = 3500;
const MAX_FILE = 4000;
const MAX_CONNECTS = 20;

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
  if (msg.chat.type !== "private") return; // The bot talks only in private chats; moderators use the buttons.
  const text = (msg.text || "").trim();
  const reply = (t) => tg(env, "sendMessage", { chat_id: msg.chat.id, text: t });

  if (!text) return reply("Send your note as a text message.");
  if (text.startsWith("/")) {
    // "Add commentary" on a page opens /start <page path>. The prompt asks for a reply, so the note comes
    // back attached to it and the page travels with the note.
    const page = text.startsWith("/start ") ? decodePage(text.slice(7).trim()) : null;
    return tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: prompt(page),
      reply_markup: { force_reply: true, input_field_placeholder: "Title, then your note" },
    });
  }

  const [first, ...rest] = text.split("\n");
  const title = first.trim();
  const body = rest.join("\n").trim();
  if (!body) return reply("Put the title on the first line and the note below it, in one message.");
  if (title.length > 120) return reply("The title (the first line) is too long: keep it under 120 characters.");
  if (text.length > MAX_TEXT) return reply(`The note is too long: keep it under ${MAX_TEXT} characters.`);

  const fromPrompt = (msg.reply_to_message?.text || "").match(/^Page: (\S+)$/m)?.[1];
  const connects = [...new Set([fromPrompt, ...text.match(/https?:\/\/\S+/g) || []].map(sitePath).filter(Boolean))];
  if (connects.length > MAX_CONNECTS) return reply(`Connect at most ${MAX_CONNECTS} pages in one note.`);

  const author = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
  const file = noteFile({ title, author, date: new Date().toISOString().slice(0, 10), connects, body });
  if (file.length > MAX_FILE) return reply("The note is too long: please shorten it.");

  await tg(env, "sendMessage", {
    chat_id: env.MOD_CHAT_ID,
    text: file,
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [[
        { text: "Approve", callback_data: `a:${msg.chat.id}` },
        { text: "Reject", callback_data: `r:${msg.chat.id}` },
      ]],
    },
  });
  return reply("Thank you. Your note has gone to the moderators; you will hear here when it is approved.");
}

async function onButton(cq, env) {
  const answer = (t) => tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: t, show_alert: true });
  // Anyone in the moderators' group may approve; buttons anywhere else are refused.
  if (!cq.message || String(cq.message.chat.id) !== String(env.MOD_CHAT_ID)) return answer("Not allowed.");
  const [action, contributor] = (cq.data || "").split(":");
  const file = cq.message.text;
  const title = JSON.parse(file.match(/^title: (".*")$/m)[1]);
  const by = cq.from.first_name || "a moderator";
  const status = (s) => tg(env, "editMessageText", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: `${file}\n\n${s}`,
    link_preview_options: { is_disabled: true },
  }); // No reply_markup: the buttons go, so a note is decided once.

  if (action === "r") {
    await status(`Rejected by ${by}`);
    await tg(env, "sendMessage", { chat_id: contributor, text: `Your note "${title}" was not approved.` }).catch(console.error);
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
  }
  if (action !== "a") return answer("Unknown button.");

  // The file name ends with the moderators' message ID, so a second click on Approve finds the file already there
  // instead of committing the note twice.
  const name = `${slugify(title)}-${cq.message.message_id}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/content/commentary/${name}.md`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ttfl-commentary-bot",
    },
    body: JSON.stringify({
      message: `Add commentary: ${title}\n\nApproved in Telegram by ${by}.`,
      content: base64(file),
      branch: "main",
    }),
  });
  if (res.status === 422) return answer("This note is already approved.");
  if (!res.ok) {
    console.error("GitHub", res.status, await res.text());
    return answer(`GitHub refused the commit (${res.status}). The note was not published; try again later.`);
  }
  await status(`Approved by ${by}: ${SITE}/commentary/${name}/`);
  await tg(env, "sendMessage", {
    chat_id: contributor,
    text: `Your note "${title}" was approved. It will be on the site in a few minutes: ${SITE}/commentary/${name}/`,
  }).catch(console.error); // A contributor who blocked the bot is not the moderator's problem.
  return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: "Approved and committed." });
}

function prompt(page) {
  return [
    "Write your note as a reply to this message, in one message:",
    "",
    "First line: the title.",
    "Below it: the note. Include the link of every page it connects. Link another note with [[Note title]].",
    "",
    "Your Telegram name is shown as the author. Moderators read every note before it is published.",
    ...(page ? ["", `Page: ${SITE}${page}`] : []),
  ].join("\n");
}

// The note as content/commentary/ holds it (CLAUDE.md, Commentary). Title and author are JSON strings, which YAML
// reads as double-quoted strings. "{{" is written as an entity so a note can't call a Hugo shortcode (an unknown one
// fails the build); it still reads "{{" on the page.
export function noteFile({ title, author, date, connects, body }) {
  const list = connects.map((c) => `\n  - ${JSON.stringify(c)}`).join("");
  const text = body.replaceAll("{{", "{&#123;");
  return `---\ntitle: ${JSON.stringify(title)}\nauthor: ${JSON.stringify(author)}\ndate: ${date}\nconnects:${list || " []"}\n---\n\n${text}\n`;
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
