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
import collections, glob, json, os, re, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import crop
from match import pdf_date, similarity

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


def split_item(pc, c, site_text):
    """An item that holds the start of one comment and the rest of the next (a page break swallowed the first one's
    end and the second one's start): where the second begins. Returns (segments before, segments after, lines
    before, lines after), or None when it can't be told. The second begins at its own name line when that is printed
    (the "tail"), otherwise at the page break whose following lines best match its text."""
    segs, lines, refs = pc['segments'], pc['lines'], pc.get('refs') or []
    if len(segs) < 2 or len(refs) != len(lines):
        return None
    at = lambda i: (refs[i]['page'], refs[i]['boxes'][0][1] - 2.8)  # a line's top, avatar included
    cut = None
    if c.get('tail'):
        idx = [i for i, l in enumerate(lines) if l != pc['date']]
        j = next((j for j in range(len(idx)) if ' '.join(lines[i] for i in idx[j:]) == c['tail']), None)
        if j:
            cut = at(idx[j])
    if cut is None:
        def after(p):
            return ' '.join(l for l, r in zip(lines, refs) if r['page'] >= p and l != pc['date'])
        breaks = [s[0] for s in segs[1:]]
        p = max(breaks, key=lambda p: similarity(after(p), site_text) if site_text else 0) if len(breaks) > 1 else breaks[0]
        cut = (p, 0)
    page, y = cut
    a, b = [], []
    for p, y0, y1 in segs:
        if (p, y1) <= (page, y):
            a.append([p, y0, y1])
        elif (p, y0) >= (page, y):
            b.append([p, y0, y1])
        else:
            a.append([p, y0, y])
            b.append([p, y, y1])
    if not a or not b:
        return None
    before = [l for l, r in zip(lines, refs) if (r['page'], r['boxes'][0][1]) < (page, y)]
    after_ = [l for l, r in zip(lines, refs) if (r['page'], r['boxes'][0][1]) >= (page, y) and l != pc['date']]
    return a, b, before, after_


def printed_name(text, names):
    """The printed name a comment's text starts with, from the names printed elsewhere in the volume."""
    return max((n for n in names if text == n or text.startswith(n + ' ')), key=len, default=None)


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
    names = {c['author'] for r in M['results'] for c in r['comments'] if c['author']}  # names printed in the volume
    message = lambda sid: json.loads(open(os.path.join(repo, M['site_comments'][sid]['path']), encoding='utf-8').read()).get('message') or ''
    # Members renamed between the export and the printout (data/anthology_aliases.json, from aliases.py).
    alias_path = os.path.join(repo, 'data', 'anthology_aliases.json')
    aliases = json.load(open(alias_path, encoding='utf-8')) if os.path.exists(alias_path) else {}
    who = lambda n: re.sub(r'[^a-z]', '', (aliases.get(n, n) or '').lower())
    exported = set()  # every name in the export: a member not in it has no comments on the site
    for f in glob.glob(os.path.join(repo, 'content', 'vol_*', '*', '*.md')):
        m = re.search(r'"from_name": "((?:[^"\\]|\\.)*)"', open(f, encoding='utf-8').read(2000))
        if m and '/anthology-' not in f:
            exported.add(who(json.loads(f'"{m[1]}"')))
    ends = lambda t: re.findall(r'[^\W\d_]+', (t or '').lower())[-4:]  # a text's last words

    def same_end(a, b):
        """Do two texts end alike (as far as the shorter shows)?"""
        a, b = ends(a), ends(b)
        n = min(len(a), len(b))
        return not n or a[-n:] == b[-n:]

    def picture(name, segments):
        img = trim(crop.crop(pages, segments))
        w, h = save(img, os.path.join(img_dir, name + '.webp'))
        e = {'image': f'anthology/{vkey}/{name}.webp', 'page': pdf_page(segments), 'w': w, 'h': h}
        if where(e['page'])[0] != volume:
            e['volume'], e['page'] = where(e['page'])
        return e
    crop_height = lambda segs: trim(crop.crop(pages, segs)).size[1]
    tops = []  # the first halves of two-comment items whose comment is still to be found (see below)
    # Members the export lacks altogether whose comments are printed (Kent Barrett, Joelle Spirit, Dory Alexander):
    # at least three unpaired items open with their name. An item opening with one of them is theirs, never another
    # member's site comment.
    lost = collections.Counter(who(c['author']) for r in M['results'] for c in r['comments']
                               if not c['site'] and c['author'])
    lost = {n for n, k in lost.items() if k >= 3 and n not in exported}
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
            site = c['site']
            opener = printed_name(next((l for l in pc['lines'] if l != pc['date']), ''), names)
            if site and k not in partial and opener and who(opener) in lost and who(opener) != who(M['site_comments'][site].get('from_name')):
                site = None  # paired with another member's comment by mistake: recovered as its own
            key = site or f'{post_key}-c{k + 1}'
            site_text = site and message(site)
            # An item that holds the start of another comment as well as this one (a page break swallowed that one's
            # end and this one's start) is cut in two where this one begins, so each comment has its own picture.
            # That is so when the matcher linked the other comment to it, and also when the name printed at its top
            # is another member's (renames included) and the part after the break ends as this comment does.
            split = None
            if len(partial.get(k, [])) == 1:
                split = split_item(pc, c, site_text or (c.get('tail') or ''))
            reverse = False  # the item is paired with its first comment; the second, after the break, is another's
            if not split and site and k not in partial and len(pc['segments']) > 1:
                top = printed_name(next((l for l in pc['lines'] if l != pc['date']), ''), names)
                mine = who(M['site_comments'][site].get('from_name'))
                if top and who(top) != mine:
                    split = split_item(pc, c, site_text)
                    if split and not same_end(site_text, ' '.join(split[3])):
                        split = None  # the part after the break isn't this comment's end
                elif top and c.get('tail') and c['author'] and who(c['author']) != mine:
                    # Its own comment, then another member's printed whole after the break (name, text and date).
                    split = split_item(pc, c, c['tail'])
                    reverse = bool(split)
            if split and reverse:
                segs_a, segs_b, lines_a, lines_b = split
                ce = picture(key, segs_a)
                ce['cut'] = 'end'  # its date is the other comment's: the break swallowed its end and date
                ce['name'] = top
                when = c['utc'] and c['utc'][:19]
                tops.append((post_key, c['author'], segs_b, lines_b, when, pc.get('x1', []), True))
                split = (segs_a, segs_b, lines_a, lines_a)  # this comment's text is the part before the break
            elif split:
                segs_a, segs_b, lines_a, lines_b = split
                cid = partial[k][0] if partial.get(k) else None
                # Its own name opens its lines; the item's author can be the second comment's (printed after the break).
                name_a = (printed_name(lines_a[0], names) if lines_a else None) or (c['author'] if cid else None)
                author = lambda sid: who(M['site_comments'][sid].get('from_name'))
                if cid and site and name_a and who(name_a) != author(cid) and who(name_a) == author(site):
                    # The matcher swapped them: the top is the date's comment's start, the bottom the other one's end.
                    site, cid = cid, site
                    key = site
                if not segs_a or crop_height(segs_a) < 20:
                    pass  # only a sliver (an avatar's edge) above the break: nothing of that comment to show
                elif cid and not (name_a and who(name_a) != author(cid)):
                    ea = picture(cid, segs_a)
                    ea['cut'] = 'end'  # its end (and date) fell into the page break
                    if name_a:
                        ea['name'] = name_a
                    if missing(repo, M['site_comments'][cid]['path']):
                        ea['missing'] = True
                        ea['text'] = ' '.join(lines_a)
                    entries[cid] = ea
                elif name_a:
                    # Another member's comment than the one linked (or none was): found once every item is paired.
                    when = c['utc'] or (site and M['site_comments'][site]['created_time'][:19])
                    tops.append((post_key, name_a, segs_a, lines_a, when, pc.get('x1', []), False))
                ce = picture(key, segs_b)
                own = c.get('tail') and printed_name(c['tail'], names)
                if own:
                    ce['name'] = own
                else:
                    ce['cut'] = 'start'  # its name and first words fell into the page break
            else:
                ce = picture(key, pc['segments'])
                # An unpaired item that begins with another (site) comment, cut by a page break: the name at its start
                # is that comment's, not the recovered one's, so give none (the picture shows both).
                if c['author'] and not (k in partial and not site and not c.get('tail')):
                    ce['name'] = c['author']
                if c.get('cut'):
                    ce['cut'] = 'date'  # only its date line printed: a page break swallowed its name and text
                for cid in partial.get(k, []):
                    # This picture also holds the start of another comment, whose end a page break swallowed.
                    entries[cid] = dict(ce, partial=True)
            if site:
                if missing(repo, M['site_comments'][site]['path']):
                    ce['missing'] = True
                    ce['text'] = ' '.join(split[3]) if split else c.get('tail', c['text'])
                entries[site] = ce
            else:
                text_lines = [l for l in pc['lines'] if l != pc['date']]
                x1s = [x for l, x in zip(pc['lines'], pc.get('x1', [])) if l != pc['date']]
                # An item that begins with another comment's start holds this one after its name line (the "tail"),
                # or after the page break when its name fell into it.
                if split:
                    j = len(text_lines) - len(split[3])
                else:
                    j = next((j for j in range(len(text_lines)) if c.get('tail') and ' '.join(text_lines[j:]) == c['tail']), 0)
                text_lines, x1s = text_lines[j:], x1s[j:]
                ce.update({'id': key, 'time': c['utc'] and utc_text(datetime.fromisoformat(c['utc'])),
                           'text': ' '.join(text_lines), 'links': links(text_lines, x1s, 590)})
                if c.get('approx') is not None:
                    ce['time_approx'] = True  # printed as "11 hrs": an estimate, placed between its neighbours
                recovered.setdefault(post_key, []).append(ce)
    # The first half of a two-comment item, by a member other than the comment it was linked to: that member's
    # latest comment on the post before the second one, still without a copy; or, for a member the export lacks
    # altogether, a recovered comment placed just before the second (its date fell into the page break).
    parse_t = lambda t: datetime.fromisoformat(t[:19])
    # A whole second comment printed after the break ("exact": its own date) is that member's comment at that minute.
    for n, (post_key, name, segs, lines, when, x1s, exact) in enumerate(tops):
        window = (timedelta(seconds=-60), timedelta(seconds=60)) if exact else (timedelta(0), timedelta(days=2))
        before = sorted((s['created_time'][:19], sid) for sid, s in M['site_comments'].items()
                        if s.get('post_id') == post_key and sid not in entries and who(s.get('from_name')) == who(name)
                        and when and window[0] <= parse_t(when) - parse_t(s['created_time']) <= window[1])
        if before:
            sid = before[-1][1]
            e = dict(picture(sid, segs), name=name, **({} if exact else {'cut': 'end'}))
            if missing(repo, M['site_comments'][sid]['path']):
                e['missing'], e['text'] = True, ' '.join(lines)
            entries[sid] = e
        elif who(name) not in exported and when:
            key = f'{post_key}-t{n + 1}'
            e = dict(picture(key, segs), name=name, id=key, text=' '.join(lines), links=links(lines, x1s[-len(lines):] if exact else x1s[:len(lines)], 590))
            if exact:
                e['time'] = utc_text(parse_t(when))
            else:
                e.update(cut='end', time_approx=True, time=utc_text(parse_t(when) - timedelta(seconds=1)))
            recovered.setdefault(post_key, []).append(e)
    # A recovered comment that is a site comment still without a copy: the same member (renames included), the same
    # post, within three minutes, and the same text or no letters in either (an emoticon prints as a picture; "0.00%"
    # was printed ".00000001 %").
    letters = lambda t: re.search(r'[^\W\d_]', t or '')
    for post_key, comments in recovered.items():
        for ce in list(comments):
            if not (ce.get('name') and ce.get('time')):
                continue
            body = ce['text'][len(ce['name']):].strip() if ce['text'].startswith(ce['name']) else ce['text']
            t = datetime.fromisoformat(ce['time'].replace('+0000', '+00:00'))
            near = [sid for sid, s in M['site_comments'].items()
                    if s.get('post_id') == post_key and sid not in entries and who(s.get('from_name')) == who(ce['name'])
                    and abs((datetime.fromisoformat(s['created_time'].replace('+0000', '+00:00')) - t).total_seconds()) <= 180
                    and ((not letters(body) and not letters(message(sid))) or similarity(body, message(sid)) >= 0.8)]
            if len(near) == 1:
                e = {k: v for k, v in ce.items() if k not in ('id', 'time', 'time_approx', 'text', 'links')}
                if missing(repo, M['site_comments'][near[0]]['path']):
                    e['missing'], e['text'] = True, body
                entries[near[0]] = e
                comments.remove(ce)
    recovered = {k: v for k, v in recovered.items() if v}
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
