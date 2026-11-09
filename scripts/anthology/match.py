"""Match parsed Anthology posts and comments to the site's exported posts and comments.

The PDF shows times in US Eastern time (UTC-5, or UTC-4 under daylight saving): the printer's clock. Site
times are UTC. An edited comment shows the time of its last edit.
Usage: match.py <site repo> <parsed.json> <out.json>
"""
import glob, json, os, re, sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')
OFFSET = timedelta(hours=4)  # only for grouping posts by local date; within a day either way
norm = lambda t: re.sub(r'[^a-z0-9]+', ' ', (t or '').lower()).strip()


def words(t):
    return set(norm(t).split())


def similarity(a, b):
    """Share of the shorter text's words found in the other (robust to wrapping, link previews and truncation)."""
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / min(len(wa), len(wb))


PAGES = None  # rendered pages (pdftoppm -r 110), to read names by colour


def blue_words(first, cache={}):
    """The leading words of a comment's first line printed in Facebook's link blue: the commenter's name."""
    from PIL import Image
    if not PAGES or not first:
        return ''
    page, scale = first['page'], 110 / 72
    if page not in cache:
        cache.clear()
        cache[page] = Image.open(f'{PAGES}/p-{page:04d}.png').convert('RGB').load()
    px, out = cache[page], []
    for word, (x0, y0, x1, y1) in zip(first['text'].split(' '), first['boxes']):
        ink = blue = 0
        for x in range(int(x0 * scale), int(x1 * scale)):
            for y in range(int(y0 * scale), int(y1 * scale)):
                r, g, b = px[x, y]
                if r + g + b < 600:
                    ink += 1
                    blue += b - r > 40
        if not ink or blue / ink <= 0.5:
            break
        out.append(word)
    return ' '.join(out)


def header_name(header):
    """The poster in a post header: "Kent Barrett shared his photo." -> "Kent Barrett"."""
    return re.split(r' (?:shared|uploaded|via|added|made|changed|updated|created|posted|is with|was with)\b', header)[0].strip()


def load_site(repo):
    posts, comments = {}, defaultdict(list)
    for path in glob.glob(os.path.join(repo, 'content/vol_*/*/*.md')):
        try:
            d = json.loads(open(path, encoding='utf-8').read())
        except Exception:
            continue
        if 'id' not in d or 'created_time' not in d:
            continue
        d['path'] = os.path.relpath(path, repo)
        d['utc'] = datetime.strptime(d['created_time'][:19], '%Y-%m-%dT%H:%M:%S')
        if d.get('post_id'):
            comments[d['post_id']].append(d)
        else:
            posts[d['id']] = d
    return posts, comments


def pdf_time(text, with_time=True):
    m = re.match(r'(\w+ \d{1,2}, \d{4})(?: at (\d{1,2}:\d\d[ap]m))?', text)
    if not m:
        return None
    if m[2]:
        local = datetime.strptime(f'{m[1]} {m[2]}', '%B %d, %Y %I:%M%p').replace(tzinfo=EASTERN)
        return local.astimezone(timezone.utc).replace(tzinfo=None)
    return datetime.strptime(m[1], '%B %d, %Y')  # local date only


def main(repo, parsed_path, out_path):
    posts, comments = load_site(repo)
    names = {d.get('from_name') for d in posts.values()} | {c.get('from_name') for cs in comments.values() for c in cs}
    parsed_all = json.load(open(parsed_path))
    for pp in parsed_all:
        if header_name(pp['header']):
            names.add(header_name(pp['header']))
        for part in re.split(r', | and ', re.sub(r'\s*(and \d+ others? )?likes? this\.?$', '', pp.get('likes') or '')):
            if part and part != 'You' and not part[0].isdigit() and len(part.split()) <= 5:
                names.add(part)
    names = sorted((n for n in names if n and len(n) > 2), key=len, reverse=True)
    by_minute = defaultdict(list)
    for cs in comments.values():
        for c in cs:
            by_minute[c['utc'].replace(second=0)].append(c)
    by_local_date = defaultdict(list)
    for p in posts.values():
        by_local_date[(p['utc'] - OFFSET).date()].append(p)
    parsed = json.load(open(parsed_path))
    results = []
    for pp in parsed:
        local = pdf_time(pp['date'])
        body = ' '.join(pp['text'])
        cands = {p['id']: p for dd in (-1, 0, 1) for p in by_local_date.get((local + timedelta(days=dd)).date(), [])} if local else {}
        pdf_minutes = [t for t in (pdf_time(pc['date']) for pc in pp['comments']) if t]
        # Posts that hold comments at the same minutes are candidates too (pictures, files, deleted links).
        for t in pdf_minutes:
            for c in by_minute.get(t, []):
                if c['post_id'] in posts:
                    cands.setdefault(c['post_id'], posts[c['post_id']])

        def post_score(p):
            # A site post with a known author must be by the PDF's poster ("X", "X shared …", "X via Y").
            # Display names changed between the export and the printout ("Harry Wombat" / "Harry Nosed Wombat"),
            # so a candidate is ruled out only when its name shares no word with the start of the header.
            # Accounts were also renamed outright ("Bobis Youruncle" / "August le Blanc"): a name with no word in
            # common only lowers the score; the text and the comment times decide.
            same_name = not p.get('from_name') or bool(words(p['from_name']) & set(norm(pp['header']).split()[:6]))
            factor = 1 if same_name else 0.6
            site_text = ' '.join(filter(None, [p.get('message'), p.get('name'), p.get('description')]))
            wa, wb = words(body), words(site_text)
            # The printout cuts long posts short ("... See More"), so measure against the shorter text, but give
            # short texts less weight so a few common words can't win.
            text = len(wa & wb) / min(len(wa), len(wb)) * min(1, min(len(wa), len(wb)) / 8) if wa and wb else 0
            if pdf_minutes:
                site_minutes = {c['utc'].replace(second=0) for c in comments.get(p['id'], [])}
                agree = sum(t in site_minutes for t in pdf_minutes) / len(pdf_minutes)
                same_day = 0.1 if (p['utc'] - OFFSET).date() == local.date() else 0
                combined = 0.4 * text + 0.6 * agree + same_day
                # Near-identical text decides when the comments don't contradict it (few comments, or some agree).
                if text >= 0.8 and (len(pdf_minutes) <= 2 or agree >= 0.3):
                    combined = max(combined, 0.9 * text + same_day)
                return factor * combined
            return factor * (text + (0.1 if (p['utc'] - OFFSET).date() == local.date() else 0))
        best = max(cands.values(), key=post_score, default=None)
        score = post_score(best) if best else 0
        site_post = best if best and score >= 0.45 else None
        result = {'pdf': pp, 'name': header_name(pp['header']), 'site_post': site_post and site_post['id'], 'post_score': round(score, 2), 'comments': []}
        site_comments = comments.get(site_post['id'], []) if site_post else []
        # Score every PDF comment against every site comment of the post, then pair them best first.
        infos = []
        for pc in pp['comments']:
            text = ' '.join(l for l in pc['lines'] if l != pc['date'])
            known = next((n for n in names if text.startswith(n + ' ') or text == n), None)
            blue = blue_words(pc.get('first'))
            # A name tagged right after the commenter's is blue too: a known name at the start wins.
            author = known if known and (not blue or blue.startswith(known)) else (blue or known)
            infos.append({'pdf': pc, 'author': author, 'text': text, 'utc': pdf_time(pc['date'])})
        pairs = []
        for k, info in enumerate(infos):
            for c in site_comments:
                if not info['utc']:
                    continue
                gap = (c['utc'].replace(second=0) - info['utc']).total_seconds()
                edited = 'Edited' in info['pdf']['date']
                if not (abs(gap) <= 60 or (edited and -7200 <= gap <= 60)):
                    continue
                site_name = c.get('from_name') or ''
                name_ok = bool(site_name) and (info['text'].startswith(site_name) or
                                               bool(info['author'] and words(info['author']) & words(site_name)))
                body = info['text'][len(info['author']):] if info['author'] else info['text']
                ctext = c.get('message') or ''
                if norm(body) and norm(ctext):
                    sim = similarity(body, ctext)
                elif not norm(body) and not norm(ctext):
                    sim = 0.5  # both have no words: emoticons and stickers print as pictures
                else:
                    sim = 0.0
                if name_ok or sim >= 0.5:
                    pairs.append((sim + (0.3 if name_ok else 0), k, c['id']))
        pairs.sort(reverse=True)
        taken_pdf, used, site_of = set(), set(), {}
        for sc, k, cid in pairs:
            if k not in taken_pdf and cid not in used:
                taken_pdf.add(k); used.add(cid); site_of[k] = (cid, sc)
        # Second pass: a few printed times differ by minutes without an "Edited" label. Pair what is left when the
        # text is the same (at least five words) and the times are within three hours.
        for k, info in enumerate(infos):
            if k in site_of or not info['utc']:
                continue
            body = info['text'][len(info['author']):] if info['author'] else info['text']
            if len(words(body)) < 5:
                continue
            best = max((c for c in site_comments if c['id'] not in used and abs((c['utc'] - info['utc']).total_seconds()) <= 10800),
                       key=lambda c: similarity(body, c.get('message') or ''), default=None)
            if best and similarity(body, best.get('message') or '') >= 0.8:
                used.add(best['id']); site_of[k] = (best['id'], 0.8)
        for k, info in enumerate(infos):
            cid, sc = site_of.get(k, (None, 0))
            result['comments'].append({'pdf': info['pdf'], 'author': info['author'], 'text': info['text'],
                                       'utc': info['utc'] and info['utc'].isoformat(), 'site': cid, 'score': round(sc, 2)})
        result['site_unmatched_comments'] = [c['id'] for c in site_comments if c['id'] not in used]
        results.append(result)
    json.dump({'results': results,
               'site_posts': {pid: {k: posts[pid].get(k) for k in ('path', 'from_name', 'created_time')} for r in results for pid in [r['site_post']] if pid},
               'site_comments': {c['id']: {k: c.get(k) for k in ('path', 'from_name', 'created_time', 'post_id')}
                                 for r in results if r['site_post'] for c in comments[r['site_post']]}},
              open(out_path, 'w'), ensure_ascii=False)
    n_posts = sum(1 for r in results if r['site_post'])
    n_c = sum(len(r['comments']) for r in results)
    n_cm = sum(1 for r in results for c in r['comments'] if c['site'])
    print(f'posts matched {n_posts}/{len(results)}; comments matched {n_cm}/{n_c}')


if __name__ == '__main__':
    if len(sys.argv) > 4:
        PAGES = sys.argv[4]
    main(*sys.argv[1:4])
