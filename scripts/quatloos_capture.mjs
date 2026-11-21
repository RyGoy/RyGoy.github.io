// Saves a picture of each Quatloos post that content/library/quatloosers.md cites ({{< quatloos ID ... >}}), so the
// page keeps its evidence if the posts are deleted. Run by hand, not at deploy:
//
//   node scripts/quatloos_capture.mjs [--force]
//
// Needs Google Chrome (google-chrome on the PATH) and ImageMagick (convert). For each post it opens
// https://www.quatloos.com/Q-Forum/viewtopic.php?p=ID in headless Chrome (driven over the DevTools protocol, with
// Node's own WebSocket), screenshots the post's box as the forum shows it, and writes
// static/images/quatloosers/p<ID>.webp and its entry in data/quatloos.json (author, date as the forum shows it, size, the day it was saved). Posts already
// saved are skipped unless --force is given; posts that no longer load keep their earlier picture.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGE = join(ROOT, 'content/library/quatloosers.md');
const DATA = join(ROOT, 'data/quatloos.json');
const IMAGES = join(ROOT, 'static/images/quatloosers');
const PORT = 9333;
const force = process.argv.includes('--force');

const ids = [...new Set([...readFileSync(PAGE, 'utf8').matchAll(/\{\{<\s*quatloos\s+([\d\s]+?)\s*>\}\}/g)]
  .flatMap((m) => m[1].split(/\s+/)))];
const data = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : {};
const todo = ids.filter((id) => force || !data[id]);
console.log(`${ids.length} posts cited, ${todo.length} to save`);
if (!todo.length) process.exit(0);
mkdirSync(IMAGES, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'quatloos-chrome-'));
const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1000,1400', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) throw new Error('Chrome did not start');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let next = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) waiters.filter((w) => w.method === msg.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params); });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next;
  pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });

// Runs in the page: measure the post and read its byline.
const measure = (id) => `(() => {
  const post = document.getElementById('p${id}');
  if (!post) return null;
  post.scrollIntoView();
  const r = post.getBoundingClientRect();
  const author = post.querySelector('.author .username, .author .username-coloured, .postprofile .username, .postprofile .username-coloured');
  const time = post.querySelector('.author time');
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height,
    author: author ? author.textContent.trim() : '',
    date: time ? (time.getAttribute('datetime') || time.textContent.trim()) : (post.querySelector('.author') || {}).textContent?.split('»').pop().trim() || '' };
})()`;

const today = new Date().toISOString().slice(0, 10);
for (const id of todo) {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `https://www.quatloos.com/Q-Forum/viewtopic.php?p=${id}` });
  await Promise.race([loaded, sleep(30000)]);
  await sleep(1500); // let the post's pictures load
  const { result } = await send('Runtime.evaluate', { expression: measure(id), returnByValue: true });
  const box = result.value;
  if (!box) { console.log(`p${id}: not found, kept as it was`); continue; }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
  const png = join(profile, `p${id}.png`);
  writeFileSync(png, Buffer.from(shot.data, 'base64'));
  const webp = join(IMAGES, `p${id}.webp`);
  spawnSync('convert', [png, '-resize', '900x>', '-quality', '80', webp], { stdio: 'inherit' });
  const [w, h] = spawnSync('identify', ['-format', '%w %h', webp]).stdout.toString().split(' ').map(Number);
  data[id] = { image: `/images/quatloosers/p${id}.webp`, w, h, author: box.author, date: box.date, saved: today };
  console.log(`p${id}: ${box.author}, ${box.date}, ${w}x${h}`);
  await sleep(2000); // be gentle with the forum
}

writeFileSync(DATA, JSON.stringify(Object.fromEntries(Object.entries(data).sort()), null, 2) + '\n');
ws.close();
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });
