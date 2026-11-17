// node telegram-bot/test-server.mjs: starts server.mjs (the bot on your own machine) and checks it answers as the
// Cloudflare Worker does: the webhook wants its secret, the accounts API its session, and accounts are kept in the file.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ttfl-bot-"));
const PORT = 8000 + Math.floor(Math.random() * 1000);
const settings = { TELEGRAM_TOKEN: "1:t", WEBHOOK_SECRET: "s", MOD_CHAT_ID: "-1", GITHUB_TOKEN: "g", PORT: String(PORT), ACCOUNTS_DB: join(dir, "accounts.db") };
const server = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { ...process.env, ...settings } });
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => /listening/.test(d) && resolve());
    server.on("exit", (code) => reject(new Error(`server.mjs exited (${code})`)));
  });
  const base = `http://127.0.0.1:${PORT}`;
  assert.equal((await fetch(`${base}/`, { method: "POST", body: "{}" })).status, 403);
  assert.equal((await fetch(`${base}/api/progress`)).status, 401);
  const preflight = await fetch(`${base}/api/progress`, { method: "OPTIONS", headers: { Origin: "https://thetenderforlaw.com" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://thetenderforlaw.com");
  assert.equal((await fetch(`${base}/api/login`, { method: "POST", body: JSON.stringify({ id: 1, hash: "x", auth_date: 1 }) })).status, 401);
  assert.ok(existsSync(settings.ACCOUNTS_DB), "the accounts file is made");
  console.log("server: all tests passed");
} finally {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

// Without its settings it stops and says which are missing.
const bare = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { PATH: process.env.PATH } });
let err = "";
bare.stderr.on("data", (d) => (err += d));
assert.equal(await new Promise((resolve) => bare.on("exit", resolve)), 1);
assert.match(err, /Missing settings: TELEGRAM_TOKEN, WEBHOOK_SECRET, MOD_CHAT_ID, GITHUB_TOKEN/);
