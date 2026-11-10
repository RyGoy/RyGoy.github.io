"""Audit one Anthology volume: site posts and comments without a printed copy whose text is in the PDF, and
recovered items that duplicate something the site already has.
Usage: audit.py <repo> <volume> <pdf raw text> <parsed.json> <out.txt>
"""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from match import norm, words, similarity, pdf_date

repo, vol, raw_path, parsed_path, out_path = sys.argv[1:6]
data = json.load(open(f'{repo}/data/anthology/v{vol}.json'))
entries = {}  # copies from every volume: a post or comment may be printed in another volume
for f in glob.glob(f'{repo}/data/anthology/v*.json'):
    entries.update(json.load(open(f))['entries'])
pdf = norm(open(raw_path, encoding='utf-8', errors='replace').read())
parsed = json.load(open(parsed_path))
# The volume's dates: when its posts were last active (the feed runs by latest activity, and an old post bumped by a
# new comment prints among the new ones), a day either side (UTC dates run up to a day later).
from datetime import datetime, timedelta
_day = lambda t: [datetime.strptime(d, '%B %d, %Y') for d in [pdf_date(t)] if d]
_dates = [max(d) for pp in parsed for d in [_day(pp['date']) + [x for c in pp['comments'] for x in _day(c['date'])]] if d]
first_date = (min(_dates) - timedelta(days=1)).strftime('%Y-%m-%d')
last_date = (max(_dates) + timedelta(days=1)).strftime('%Y-%m-%d')

posts, comments = {}, {}
for f in glob.glob(f'{repo}/content/vol_*/*/*.md'):
    try:
        d = json.loads(open(f, encoding='utf-8').read())
    except Exception:
        continue
    d['path'] = os.path.relpath(f, repo)
    (comments if d.get('post_id') else posts)[d['id']] = d

def in_pdf(text):
    """Is this text in the PDF? Six-word runs from a few places in it, ignoring layout."""
    w = norm(text).split()
    if len(w) < 6:
        return None
    probes = [' '.join(w[i:i + 6]) for i in range(0, len(w) - 5, max(1, (len(w) - 5) // 4))][:5]
    hits = sum(p in pdf for p in probes)
    return hits >= max(1, len(probes) // 2)

out = open(out_path, 'w')
# 1. Site posts in the volume's dates without a printed copy.
in_range = [p for p in posts.values() if first_date <= p['created_time'][:10] <= last_date and not p['id'].startswith('anthology-')]
missing_posts = [p for p in in_range if p['id'] not in entries]
found = [p for p in missing_posts if in_pdf(' '.join(filter(None, [p.get('message'), p.get('name'), p.get('description')])))]
out.write(f'POSTS in range {len(in_range)}, without copy {len(missing_posts)}, of which text found in PDF {len(found)}\n')
for p in found:
    out.write(f"  {p['id']} {p['created_time'][:16]} {p.get('from_name')!r} {(p.get('message') or p.get('name') or '')[:80]!r}\n")
# 2. Comments of matched posts without a printed copy.
matched_posts = {k for k in data['entries'] if k in posts}  # this volume's posts
cs = [c for c in comments.values() if c['post_id'] in matched_posts]
missing_c = [c for c in cs if c['id'] not in entries]
found_c = [c for c in missing_c if in_pdf(c.get('message') or '')]
out.write(f'\nCOMMENTS of matched posts {len(cs)}, without copy {len(missing_c)}, text found in PDF {len(found_c)}\n')
for c in found_c:
    out.write(f"  {c['post_id']} {c['id']} {c['created_time'][:16]} {c.get('from_name')!r} {(c.get('message') or '')[:70]!r}\n")
# 3. Comments of posts with NO copy (posts outside range too), whose text is in the PDF.
other = [c for c in comments.values() if c['post_id'] not in matched_posts and first_date <= c['created_time'][:10] <= last_date]
found_o = [c for c in other if in_pdf(c.get('message') or '')]
out.write(f'\nCOMMENTS in range on posts without copy {len(other)}, text found in PDF {len(found_o)}\n')
for c in found_o:
    out.write(f"  {c['post_id']} {c['id']} {c['created_time'][:16]} {c.get('from_name')!r} {(c.get('message') or '')[:70]!r}\n")
# 4. Recovered comments that duplicate a site comment of the same post.
dups = []
for post_id, rec in data['recovered'].items():
    site_cs = [c for c in comments.values() if c['post_id'] == post_id] if post_id in posts and not post_id.startswith('anthology-') else []
    for r in rec:
        body = r['text'][len(r.get('name') or ''):]
        for c in site_cs:
            if len(words(body)) >= 4 and len(words(c.get('message') or '')) >= 4 and similarity(body, c.get('message') or '') >= 0.8:
                dups.append((post_id, r['id'], c['id'], body[:60]))
out.write(f'\nRECOVERED comments duplicating a site comment: {len(dups)}\n')
for d in dups:
    out.write(f'  {d}\n')
# 5. Recovered posts that duplicate a site post.
dp = []
for key in [k for k in data['entries'] if k.startswith('anthology-')]:
    f = glob.glob(f'{repo}/content/vol_*/{key}/_index.md')[0]
    t = json.loads(open(f).read())['anthology_text']
    for p in posts.values():
        if p['id'].startswith('anthology-'):
            continue
        st = ' '.join(filter(None, [p.get('message'), p.get('name'), p.get('description')]))
        if len(words(t)) >= 6 and similarity(t, st) >= 0.85 and first_date[:4] <= p['created_time'][:4] <= last_date[:4]:
            dp.append((key, p['id'], p['created_time'][:10], p.get('from_name'), t[:50]))
out.write(f'\nRECOVERED posts similar to a site post: {len(dp)}\n')
for d in dp:
    out.write(f'  {d}\n')
print(open(out_path).read()[:400])
