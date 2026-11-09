"""Write the site's Anthology additions for one volume from matched.json.

- static/anthology/v<N>/<id>.webp: a cropped picture of each post and comment as printed.
- data/anthology/v<N>.json: for each site post or comment, its picture and page; the comments the site lacks (by
  post); and the volume's details.
- content/vol_*/anthology-v<N>-<page>-<n>/_index.md: the posts the site lacks.
Usage: build.py <repo> <volume number> <matched.json> <pages dir>
"""
import json, os, re, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import crop

EASTERN = ZoneInfo('America/New_York')
URL = re.compile(r'https?://\S+')
ROMAN = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x', 11: 'xi',
         12: 'xii', 13: 'xiii', 14: 'xiv'}


def trim(img, margin=4, white=245):
    """Drop blank rows at the top and bottom (page breaks leave white bands); keep a small margin."""
    gray = img.convert('L')
    w, h = gray.size
    px = gray.load()
    rows = [y for y in range(h) if any(px[x, y] < white for x in range(8, w - 8, 3))]
    if not rows:
        return img
    return img.crop((0, max(0, rows[0] - margin), w, min(h, rows[-1] + margin + 1)))


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=75, method=6)
    return img.size


def links(lines, x1s, right):
    """Complete addresses in the printed text. An address that reaches the right edge continues on the next line;
    addresses Facebook shortened with "..." are left out (they may name a different page)."""
    out = []
    for i, line in enumerate(lines):
        for m in URL.finditer(line):
            url, j, end = m.group(0), i, m.end()
            while end == len(lines[j]) and j + 1 < len(lines) and j < len(x1s) and x1s[j] > right:
                piece = lines[j + 1].split(' ', 1)[0]
                if not piece or URL.match(piece):
                    break
                url, j, end = url + piece, j + 1, len(piece)
            if '...' in url or '\u2026' in url:
                continue
            url = url.rstrip('.,;:!?)\'"')
            if url not in out:
                out.append(url)
    return out


def missing(repo, path, post=False):
    """True when the exported record has no name, or no content (stickers, photos and deleted links print in the
    Anthology but export as nothing): the picture then stands in for what is missing."""
    d = json.loads(open(os.path.join(repo, path), encoding='utf-8').read())
    content = [d.get('message')] + ([d.get('name'), d.get('description'), d.get('caption')] if post else [])
    return not (d.get('from_name') or '').strip() or not any(re.search(r'\w', c or '') for c in content)


def utc_text(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%S+0000')


def main(repo, volume, matched_path, pages):
    volume = int(volume)
    vkey = f'v{volume}'
    M = json.load(open(matched_path))
    img_dir = os.path.join(repo, 'static', 'anthology', vkey)
    entries, recovered, new_posts, skipped = {}, {}, [], []
    pdf_page = lambda segs: segs[0][0]
    for r in M['results']:
        pp = r['pdf']
        page = pdf_page(pp['segments'])
        if r['site_post']:
            post_key = r['site_post']
        else:
            # A post the site lacks: a page of its own in the volume for its quarter. One whose header fell into a
            # page break takes its date from its first comment; with neither, there is nothing to place it by.
            m = re.match(r'\w+ \d{1,2}, \d{4}', pp['date']) or next(
                (re.match(r'\w+ \d{1,2}, \d{4}', c['pdf']['date']) for c in r['comments'] if c['pdf'].get('date')), None)
            if not m:
                skipped.append(page)
                continue
            local = datetime.strptime(m[0], '%B %d, %Y')
            n = sum(1 for p in new_posts if p['page'] == page)
            post_key = f'anthology-{vkey}-{page:04d}' + (f'-{n + 1}' if n else '')
        img = trim(crop.crop(pages, pp['segments']))
        w, h = save(img, os.path.join(img_dir, post_key + '.webp'))
        entry = {'image': f'anthology/{vkey}/{post_key}.webp', 'page': page, 'w': w, 'h': h}
        if r['name']:
            entry['name'] = r['name']
        if r['site_post']:
            if missing(repo, M['site_posts'][post_key]['path'], post=True):
                entry['missing'] = True
                entry['text'] = ' '.join(pp['text'])
            entries[post_key] = entry
        else:
            new_posts.append({'key': post_key, 'page': page, 'local': local, 'entry': entry, 'pdf': pp, 'name': r['name']})
        partial = {k: cid for cid, k in r.get('partial', [])}
        for k, c in enumerate(r['comments']):
            pc = c['pdf']
            key = c['site'] or f'{post_key}-c{k + 1}'
            img = trim(crop.crop(pages, pc['segments']))
            w, h = save(img, os.path.join(img_dir, key + '.webp'))
            ce = {'image': f'anthology/{vkey}/{key}.webp', 'page': pdf_page(pc['segments']), 'w': w, 'h': h}
            if c['author']:
                ce['name'] = c['author']
            if k in partial:
                # This picture also holds the start of another comment, whose end a page break swallowed.
                entries[partial[k]] = dict(ce, partial=True)
            if c['site']:
                if missing(repo, M['site_comments'][c['site']]['path']):
                    ce['missing'] = True
                    ce['text'] = c['text']
                entries[c['site']] = ce
            else:
                text_lines = [l for l in pc['lines'] if l != pc['date']]
                x1s = [x for l, x in zip(pc['lines'], pc.get('x1', [])) if l != pc['date']]
                ce.update({'id': key, 'time': c['utc'] and utc_text(datetime.fromisoformat(c['utc'])),
                           'text': ' '.join(text_lines), 'links': links(text_lines, x1s, 590)})
                recovered.setdefault(post_key, []).append(ce)
    # Pages for the posts the site lacks.
    for p in new_posts:
        local = p['local']
        utc = datetime(local.year, local.month, local.day, tzinfo=EASTERN).astimezone(timezone.utc)
        vol = ROMAN[(local.year - 2013) * 4 + (local.month - 1) // 3 + 1]
        body = p['pdf']['text']
        front = {
            'id': p['key'],
            'created_time': utc_text(utc),
            'time_unknown': True,
            'from_name': p['name'],
            'anthology': vkey,
            'anthology_text': ' '.join(body),
            'anthology_links': links(body, p['pdf'].get('x1', []), 600),
        }
        if p['pdf']['header'] != p['name']:
            front['anthology_header'] = p['pdf']['header']
        bundle = os.path.join(repo, 'content', f'vol_{vol}', p['key'])
        os.makedirs(bundle, exist_ok=True)
        with open(os.path.join(bundle, '_index.md'), 'w', encoding='utf-8') as f:
            json.dump(front, f, ensure_ascii=False, indent=1)
            f.write('\n')
        entries[p['key']] = p['entry']
    data = {
        'volume': volume,
        'title': f'The Tender For Law Anthology, Volume {volume}',
        'source': 'https://app.box.com/s/47vmhgo8olstohisc2ju',
        'printed': '2014-06-14',
        'entries': entries,
        'recovered': recovered,
    }
    os.makedirs(os.path.join(repo, 'data', 'anthology'), exist_ok=True)
    with open(os.path.join(repo, 'data', 'anthology', f'{vkey}.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    n_rec = sum(len(v) for v in recovered.values())
    print(f'{len(entries)} site entries with pictures, {len(new_posts)} new posts, {n_rec} recovered comments; '
          f'left out (no header, date or comments) on pages {skipped}')


if __name__ == '__main__':
    main(*sys.argv[1:5])
