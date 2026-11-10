"""Write the site's Anthology additions for one volume from matched.json.

- static/anthology/v<N>/<id>.webp: a cropped picture of each post and comment as printed.
- data/anthology/v<N>.json: for each site post or comment, its picture and page; the comments the site lacks (by
  post); and the volume's details.
- content/vol_*/anthology-v<N>-<page>-<n>/_index.md: the posts the site lacks.
Usage: build.py <repo> <volume number> <matched.json> <pages dir> [<last page>[:<first borrowed page>]] [<printed date>]
Pages after <last page> are the start of the next volume down (the printout runs newest first, so a post that
begins at the end of volume N ends at the start of volume N-1); their items are labelled with that volume and page.
The appended pages are that volume's pages from <first borrowed page> on (default 1; volume 8 borrows volume 7's
pages 2-6, since its own last page is volume 7's first). Pass "-" for no appended pages.
<printed date> (YYYY-MM-DD, default 2014-06-14) is the date in the page footers: volumes 1-2 were printed 2014-06-14,
volumes 3-9 2014-06-13 (three other print runs).
"""
import json, os, re, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import crop
from match import pdf_date

EASTERN = ZoneInfo('America/New_York')
URL = re.compile(r'https?://\S+')
COMPLETE = re.compile(r'(\.(s?html?|php|aspx?|pdf|jpe?g|png|gif)|youtu\.be/[\w-]{11}|[?&]v=[\w-]{11})$', re.I)
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
            while end == len(lines[j]) and j + 1 < len(lines):
                piece = lines[j + 1].split(' ', 1)[0]
                if not piece or URL.match(piece):
                    break
                # An address cut at "&", "=" or "?" goes on whatever its line's length. One that reaches the right
                # edge goes on unless it is already complete (a page's extension, an 11-character video id): then
                # the next line is the preview's title ("...robbery.html" / "Australian claims...").
                reaches = j < len(x1s) and x1s[j] > right
                if not (url.endswith(('&', '=', '?')) or
                        (reaches and (not COMPLETE.search(url) or piece[0] in '&#?'))):
                    break
                url, j, end = url + piece, j + 1, len(piece)
            if '...' in url or '\u2026' in url:
                continue
            url = url.rstrip('.,;:!?)]>\'"')
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


def main(repo, volume, matched_path, pages, last_page=None, printed='2014-06-14'):
    volume = int(volume)
    first_borrowed = 1
    if last_page and ':' in last_page:
        last_page, first_borrowed = last_page.split(':')
    last_page = int(last_page) if last_page and last_page != '-' else None
    first_borrowed = int(first_borrowed)

    def where(page):
        """(volume, page) for a page of the joined stream."""
        if last_page and page > last_page:
            return volume - 1, page - last_page + first_borrowed - 1
        return volume, page
    vkey = f'v{volume}'
    M = json.load(open(matched_path))
    img_dir = os.path.join(repo, 'static', 'anthology', vkey)
    entries, recovered, new_posts, skipped, dropped = {}, {}, [], [], []
    pdf_page = lambda segs: segs[0][0]
    for r in M['results']:
        pp = r['pdf']
        page = pdf_page(pp['segments'])
        if r['site_post']:
            post_key = r['site_post']
        else:
            # A post the site lacks: a page of its own in the volume for its quarter. One whose header fell into a
            # page break takes its date from its first comment; with neither, there is nothing to place it by.
            m = pdf_date(pp['date']) or next(
                (pdf_date(c['pdf']['date']) for c in r['comments'] if pdf_date(c['pdf'].get('date'))), None)
            if not m:
                skipped.append(page)
                continue
            local = datetime.strptime(m, '%B %d, %Y')
            # 2014 posts print their time too ("June 10 at 10:13pm"); a relative one ("11 hrs") is an estimate.
            t = re.match(r'(\w+ \d{1,2}, \d{4}) at (\d{1,2}:\d\d[ap]m)', pp['date'])
            exact = t and pp.get('approx') is None and datetime.strptime(f'{t[1]} {t[2]}', '%B %d, %Y %I:%M%p')
            n = sum(1 for p in new_posts if p['page'] == page)
            post_key = f'anthology-{vkey}-{page:04d}' + (f'-{n + 1}' if n else '')
        img = trim(crop.crop(pages, pp['segments']))
        w, h = save(img, os.path.join(img_dir, post_key + '.webp'))
        entry = {'image': f'anthology/{vkey}/{post_key}.webp', 'page': page, 'w': w, 'h': h}
        if where(page)[0] != volume:
            entry['volume'], entry['page'] = where(page)
        if r['name']:
            entry['name'] = r['name']
        if r['site_post']:
            if missing(repo, M['site_posts'][post_key]['path'], post=True):
                entry['missing'] = True
                entry['text'] = ' '.join(pp['text'])
            entries[post_key] = entry
        else:
            new_posts.append({'key': post_key, 'page': page, 'local': local, 'exact': exact, 'entry': entry, 'pdf': pp, 'name': r['name']})
        partial = {}  # item -> the comments whose start (or end) it holds; one item can hold several
        for cid, k in r.get('partial', []):
            partial.setdefault(k, []).append(cid)
        for k, c in enumerate(r['comments']):
            pc = c['pdf']
            if not c['site'] and k not in partial and not re.search(r'\w', c['text']):
                # Only the date line survived a page break: no name and no text, so nothing to recover.
                dropped.append(pdf_page(pc['segments']))
                continue
            key = c['site'] or f'{post_key}-c{k + 1}'
            img = trim(crop.crop(pages, pc['segments']))
            w, h = save(img, os.path.join(img_dir, key + '.webp'))
            ce = {'image': f'anthology/{vkey}/{key}.webp', 'page': pdf_page(pc['segments']), 'w': w, 'h': h}
            if where(ce['page'])[0] != volume:
                ce['volume'], ce['page'] = where(ce['page'])
            # An unpaired item that begins with another (site) comment, cut by a page break: the name at its start is
            # that comment's, not the recovered one's, so give none (the picture shows both).
            if c['author'] and not (k in partial and not c['site'] and not c.get('tail')):
                ce['name'] = c['author']
            if c.get('cut'):
                ce['partial'] = True  # only its date line printed: a page break swallowed its name and text
            for cid in partial.get(k, []):
                # This picture also holds the start of another comment, whose end a page break swallowed.
                entries[cid] = dict(ce, partial=True)
            if c['site']:
                if missing(repo, M['site_comments'][c['site']]['path']):
                    ce['missing'] = True
                    ce['text'] = c.get('tail', c['text'])  # the item may begin with another comment's start
                entries[c['site']] = ce
            else:
                text_lines = [l for l in pc['lines'] if l != pc['date']]
                x1s = [x for l, x in zip(pc['lines'], pc.get('x1', [])) if l != pc['date']]
                # An item that begins with another comment's start holds this one after its name line (the "tail").
                j = next((j for j in range(len(text_lines)) if c.get('tail') and ' '.join(text_lines[j:]) == c['tail']), 0)
                text_lines, x1s = text_lines[j:], x1s[j:]
                ce.update({'id': key, 'time': c['utc'] and utc_text(datetime.fromisoformat(c['utc'])),
                           'text': ' '.join(text_lines), 'links': links(text_lines, x1s, 590)})
                if c.get('approx') is not None:
                    ce['time_approx'] = True  # printed as "11 hrs": an estimate, placed between its neighbours
                recovered.setdefault(post_key, []).append(ce)
    # Pages for the posts the site lacks.
    for p in new_posts:
        local = p['local']
        utc = (p['exact'] or datetime(local.year, local.month, local.day)).replace(tzinfo=EASTERN).astimezone(timezone.utc)
        vol = ROMAN[(local.year - 2013) * 4 + (local.month - 1) // 3 + 1]
        body = p['pdf']['text']
        front = {
            'id': p['key'],
            'created_time': utc_text(utc),
            'time_unknown': not p['exact'],
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
        'printed': printed,
        'entries': entries,
        'recovered': recovered,
    }
    os.makedirs(os.path.join(repo, 'data', 'anthology'), exist_ok=True)
    with open(os.path.join(repo, 'data', 'anthology', f'{vkey}.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    n_rec = sum(len(v) for v in recovered.values())
    print(f'{len(entries)} site entries with pictures, {len(new_posts)} new posts, {n_rec} recovered comments; '
          f'left out (no header, date or comments) on pages {skipped}; '
          f'{len(dropped)} printed comments with only a date line left out, on pages {dropped}')


if __name__ == '__main__':
    main(*sys.argv[1:7])
