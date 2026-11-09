"""Check a built site against data/anthology/v<N>.json: every picture exists and is shown on the right page, every
recovered comment and post is there with its name in blue, and names and texts the export lacks are filled in.
Usage: verify.py <repo> <build dir> <volume>
"""
import glob, html, json, os, re, sys
from PIL import Image

repo, build, vol = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(f'{repo}/data/anthology/v{vol}.json'))
problems = []

# Where each post lives, and which post each comment belongs to.
post_dir, comment_post = {}, {}
for f in glob.glob(f'{repo}/content/vol_*/*/*.md'):
    try:
        d = json.loads(open(f, encoding='utf-8').read())
    except Exception:
        continue
    rel = os.path.relpath(os.path.dirname(f), f'{repo}/content')
    if f.endswith('_index.md'):
        post_dir[d['id']] = rel
    else:
        comment_post[d['id']] = d['post_id']

pages = {}
def page_html(post_id):
    if post_id not in pages:
        path = f'{build}/{post_dir[post_id]}/index.html'
        pages[post_id] = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    return pages[post_id]

def check_image(e, what):
    path = f'{repo}/static/{e["image"]}'
    if not os.path.exists(path):
        problems.append(f'{what}: missing image file {e["image"]}'); return
    w, h = Image.open(path).size
    if (w, h) != (e['w'], e['h']) or h < 12:
        problems.append(f'{what}: image size {w}x{h} vs data {e["w"]}x{e["h"]}')

counts = {'entries': 0, 'shown': 0, 'folded': 0, 'blue names': 0, 'recovered': 0, 'new posts': 0}
for key, e in data['entries'].items():
    counts['entries'] += 1
    check_image(e, key)
    post = key if key in post_dir else comment_post.get(key)
    if post is None:
        problems.append(f'{key}: not a post or comment on the site'); continue
    doc = page_html(post)
    if doc is None:
        problems.append(f'{key}: no built page for post {post}'); continue
    m = re.search(rf'<article[^>]*id="?entry-{re.escape(key)}"?[^>]*>(.*?)</article>', doc, re.S)
    if not m:
        problems.append(f'{key}: entry not on its page'); continue
    block = m.group(1)
    src = '/' + e['image']
    if src not in block:
        problems.append(f'{key}: picture not shown'); continue
    if e.get('missing') or key.startswith('anthology-'):
        counts['shown'] += 1
        if 'is-shown' not in block:
            problems.append(f'{key}: picture should stand in for missing content but is folded')
    else:
        counts['folded'] += 1
    if e.get('name') and ('anthology-name' in block):
        counts['blue names'] += 1
    if key.startswith('anthology-'):
        counts['new posts'] += 1
        if e.get('name') and 'anthology-name' not in block:
            problems.append(f'{key}: recovered post name not blue')

for post, comments in data['recovered'].items():
    doc = page_html(post)
    for c in comments:
        counts['recovered'] += 1
        check_image(c, c['id'])
        m = doc and re.search(rf'<article[^>]*id="?entry-{re.escape(c["id"])}"?[^>]*>(.*?)</article>', doc, re.S)
        if not m:
            problems.append(f'{c["id"]}: recovered comment not on page {post}'); continue
        block = m.group(1)
        if '/' + c['image'] not in block:
            problems.append(f'{c["id"]}: recovered picture missing')
        if c.get('name') and not re.search(r'anthology-name[^>]*>' + re.escape(html.escape(c['name'], quote=False)), block):
            problems.append(f'{c["id"]}: name {c["name"]!r} not shown in blue')
        for url in c.get('links', []):
            if html.escape(url) not in block and url not in block:
                problems.append(f'{c["id"]}: link {url} not shown')

print(counts)
print(len(problems), 'problems')
for p in problems[:40]:
    print(' ', p)
