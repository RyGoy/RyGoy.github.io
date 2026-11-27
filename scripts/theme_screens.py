"""Screenshots of a built site in each colour theme, at desktop and phone widths, and a comparison with an earlier set.

Take a set before a change and one after, then compare: a change meant to leave the themes as they were should flag
nothing. It serves the build on localhost, opens each page through a throwaway __theme.html that sets the theme
(localStorage 'ttfl-theme', read by the script in partials/head.html before the page paints), and has headless Chrome
screenshot it with reduced motion, which stills the animations. Each shot has a new browser profile, so nothing carries
over between them. The terms banner (static/js/terms-gate.js) waits 20 seconds and never shows.
Pages are served with a seeded Math.random (SEED, added at the top of <head> as they are sent; the files are not
changed), so what is drawn at random (Sepia's hexagon colours, the flash cards' accounts) is the same in every run. What
depends on the clock (the live sign, Thursday evenings) is not held still.

Usage: theme_screens.py <built site> <out dir> [--compare <earlier out dir>] [--pages /a/,/b/] [--themes sepia,dark]
       Build with `hugo --quiet -d <dir>` (outside the repo: no public/). Needs google-chrome and Pillow.
"""
import argparse, concurrent.futures, functools, http.server, os, re, shutil, socketserver, subprocess, sys, tempfile, threading
from urllib.parse import quote

PAGES = [
    '/', '/vol_i/', '/vol_i/462493170453287_462528253783112/',
    '/vol_i/462493170453287_462528253783112/462493170453287_462528253783112-1001592016543397/',
    '/articles/scott-duncan/agency-for-idiots/', '/library/', '/library/hobbes-leviathan/', '/library/quatloosers/',
    '/dictionary/', '/search/', '/accounting/flashcards/', '/most-discussed/',
]
THEMES = ['sepia', 'light', 'dark']
SIZES = [(1366, 2400), (390, 2400)]  # tall windows, so each shot covers more than the first screen
FLAG = 0.1  # percent of pixels changed that counts as a difference

# Sets the theme (Sepia stored by name: with nothing stored, a device in light mode gets Light, and headless Chrome is
# one), marks the visit as just begun for the terms banner, and goes on to the page.
HELPER = """<!doctype html><meta charset="utf-8"><script>
var q = new URLSearchParams(location.search);
try { localStorage.setItem('ttfl-theme', q.get('t')); sessionStorage.setItem('ttfl-arrived', String(Date.now())); } catch (e) {}
location.replace(q.get('to'));
</script>"""


def serve(root):
    handler = functools.partial(QuietHandler, directory=root)
    server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# A small seeded generator (mulberry32) in place of Math.random, the same numbers on every page load.
SEED = b"""<script>(function(){var a=20261127;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})()</script>"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if not path.endswith('.html') or not os.path.isfile(path) or path.endswith('__theme.html'):
            return super().do_GET()
        with open(path, 'rb') as f:
            body = re.sub(rb'<head[^>]*>', lambda m: m.group(0) + SEED, f.read(), count=1)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def name(page, theme, width):
    slug = page.strip('/').replace('/', '_') or 'home'
    return f'{slug[:80]}-{theme}-{width}.png'


def shoot(port, page, theme, size, out):
    width, height = size
    profile = tempfile.mkdtemp(prefix='theme-screens-')
    url = f'http://127.0.0.1:{port}/__theme.html?t={theme}&to={quote(page)}'
    path = os.path.join(out, name(page, theme, width))
    try:
        subprocess.run(['google-chrome', '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
                        '--force-prefers-reduced-motion', '--virtual-time-budget=5000', f'--user-data-dir={profile}',
                        f'--window-size={width},{height}', f'--screenshot={path}', url],
                       capture_output=True, timeout=120)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    return path if os.path.exists(path) else None


def compare(out, earlier, names):
    from PIL import Image, ImageChops
    flagged = 0
    for n in names:
        a_path, b_path = os.path.join(earlier, n), os.path.join(out, n)
        if not (os.path.exists(a_path) and os.path.exists(b_path)):
            print(f'MISSING  {n}'); flagged += 1; continue
        a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
        if a.size != b.size:
            print(f'SIZE     {n}: {a.size} -> {b.size}'); flagged += 1; continue
        mask = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 8 else 0)
        changed = 100 * sum(mask.histogram()[255:]) / (a.width * a.height)
        if changed > FLAG:
            flagged += 1
            faded = Image.blend(b, Image.new('RGB', b.size, 'white'), 0.6)
            faded.paste(Image.new('RGB', b.size, (220, 0, 0)), mask=mask)
            faded.save(os.path.join(out, n.replace('.png', '-diff.png')))
        print(f'{"DIFFERS " if changed > FLAG else "same    "} {n}: {changed:.3f}% changed')
    return flagged


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('site'); ap.add_argument('out')
    ap.add_argument('--compare'); ap.add_argument('--pages'); ap.add_argument('--themes')
    args = ap.parse_args()
    pages = args.pages.split(',') if args.pages else PAGES
    themes = args.themes.split(',') if args.themes else THEMES
    os.makedirs(args.out, exist_ok=True)
    helper = os.path.join(args.site, '__theme.html')
    with open(helper, 'w', encoding='utf-8') as f:
        f.write(HELPER)
    server = serve(args.site)
    port = server.server_address[1]
    jobs = [(p, t, s) for p in pages for t in themes for s in SIZES]
    try:
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            done = list(pool.map(lambda j: shoot(port, *j, args.out), jobs))
    finally:
        server.shutdown()
        os.remove(helper)
    names = [name(p, t, s[0]) for p, t, s in jobs]
    failed = [n for n, d in zip(names, done) if not d]
    for n in failed:
        print(f'FAILED   {n}')
    print(f'{len(names) - len(failed)} of {len(names)} shots in {args.out}')
    flagged = compare(args.out, args.compare, names) if args.compare else 0
    if args.compare:
        print(f'{flagged} flagged (over {FLAG}% of pixels changed)')
    sys.exit(1 if failed or flagged else 0)


if __name__ == '__main__':
    main()
