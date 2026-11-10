"""Match parsed Anthology posts and comments to the site's exported posts and comments.

The PDF shows times in US Eastern time (UTC-5, or UTC-4 under daylight saving): the printer's clock. Site
times are UTC. An edited comment shows the time of its last edit.
Usage: match.py <site repo> <parsed.json> <out.json> [<pages dir>]
"""
import bisect, glob, json, os, re, sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')
OFFSET = timedelta(hours=4)  # only for grouping posts by local date; within a day either way
# Every volume was printed by 14 June 2014, 07:56 Eastern: nothing written later is in the printout (a later comment
# can quote one that is: "747058865330048").
PRINTED_BY = datetime(2014, 6, 14, 12, 0)  # UTC
norm = lambda t: re.sub(r'[^a-z0-9]+', ' ', (t or '').lower()).strip()


# Address boilerplate: two links to different videos share all of these, so they don't count as shared words.
STOP_WORDS = {'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'it', 'is',
              'be', 'was', 'are', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'have', 'has',
              'not', 'no', 'so', 'if', 'as', 'do', 'can', 'may', 'who', 'what', 'all', 'me', 'just', 't', 'don', 're'}
URL_WORDS = {'http', 'https', 'www', 'com', 'org', 'net', 'ca', 'html', 'htm', 'php', 'youtube', 'youtu', 'be', 'watch',
             'v', 'feature', 'share', 'player', 'embedded', 'facebook', 'l', 'u', 'h', 's', 'photo', 'fbid', 'set'}
URL = re.compile(r'(https?://|www\.)\S+')


# Emoticons in the export (":D", ":-P", "O_o", "(y)", "<3") print as pictures, so they are not part of the printed text.
EMOTICON = re.compile(r"(?<![\w:/])(?:[:;=8]['o^-]?[()\[\]DPpOoSs3/\\|*$@]+|\([Yy]\)|<3|\^_*\^|[Oo][._][Oo]|-_-|xD|XD)(?![\w/])")


def no_emoticons(t):
    return EMOTICON.sub(' ', t or '')


def bare(t):
    """Normalised text without emoticons."""
    return norm(no_emoticons(t))


def wordless(t):
    """True when a text has no words: emoticons such as ":D" or ":-P" (which print as pictures) don't count."""
    return not bare(t)


def words(t):
    return set(norm(t).split()) - URL_WORDS - STOP_WORDS


def plain_words(t):
    """Words outside web addresses: a link prints as its preview's title, and an encoded redirect address is full of
    junk tokens, so these decide whether a text has words of its own."""
    return words(URL.sub(' ', t or ''))


def ids(t):
    """Video and photo IDs in a text, addresses included: long tokens of both letters and digits."""
    return {w for w in re.split(r'[^A-Za-z0-9_-]+', t or '') if len(w) >= 8 and re.search(r'\d', w) and re.search(r'[A-Za-z]', w)}


def similarity(a, b):
    """Share of the shorter text's words found in the other (robust to wrapping, link previews and truncation)."""
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / min(len(wa), len(wb))


def loose_similarity(a, b):
    """similarity(), or the same measured without addresses (the printout shortens them, the export keeps their
    encoded junk: "desktop_uri=%2Fwatch%3Fv%3D..."), without the numbers in them (dates in an address's path) or
    without emoticons, whichever is higher. Each reading needs enough words of its own."""
    best = max(similarity(a, b), similarity(no_emoticons(a), no_emoticons(b)))  # ":D" leaves a "d"
    pa, pb = plain_words(a), plain_words(b)
    if min(len(pa), len(pb)) >= 5:
        best = max(best, len(pa & pb) / min(len(pa), len(pb)))
    wa, wb = {w for w in words(a) if not w.isdigit()}, {w for w in words(b) if not w.isdigit()}
    if min(len(wa), len(wb)) >= 4:
        best = max(best, len(wa & wb) / min(len(wa), len(wb)))
    return best


def link_prefix(body, ctext):
    """Both are only an address, and the printed one (wrapped, cut short with "...") begins the site's."""
    if plain_words(body) or plain_words(ctext):
        return False
    printed = re.sub(r'\s+', '', body).rstrip('.\u2026')
    return len(printed) >= 20 and bool(re.match(r'https?://|www\.', printed)) and re.sub(r'\s+', '', ctext).startswith(printed)


PAGES = None  # rendered pages (pdftoppm -r 110), to read names by colour


def page_pixels(page, mode, cache={}):
    from PIL import Image
    if (page, mode) not in cache:
        if len(cache) > 4:
            cache.clear()
        cache[(page, mode)] = Image.open(f'{PAGES}/p-{page:04d}.png').convert(mode).load()
    return cache[(page, mode)]


def blue_words(first):
    """The leading words of a comment's first line printed in Facebook's link blue: the commenter's name."""
    if not PAGES or not first:
        return ''
    px, scale, out = page_pixels(first['page'], 'RGB'), 110 / 72, []
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


def has_avatar(first):
    """Is there a picture (the commenter's avatar) left of a comment's first line? A comment that quotes a stretch
    of another thread copies its names and date lines but not its avatars."""
    if not PAGES or not first or not first.get('boxes'):
        return True
    px, scale = page_pixels(first['page'], 'L'), 110 / 72
    x0, y0 = first['boxes'][0][0], first['boxes'][0][1]  # (the avatar is 3-31 points left of the text: x 284-312)
    ink = sum(px[x, y] < 235 for x in range(int((x0 - 31) * scale), int((x0 - 3) * scale))
              for y in range(int((y0 - 1) * scale), int((y0 + 14) * scale)))
    return ink >= 40


def merge_quotes(pcs):
    """Join a quoted stretch of comments to the comment that quotes it: an item with no avatar (and not cut by a
    page break, which can drop the avatar) continues the item before it, whose date is then the last item's."""
    out = []
    for pc in pcs:
        segs = pc['segments']
        if (out and len(segs) == 1 and pc.get('first') and pc['first']['page'] == segs[0][0]
                and not has_avatar(pc['first'])):
            prev = out[-1]
            prev['lines'] = prev['lines'] + pc['lines']
            prev['x1'] = prev.get('x1', []) + pc.get('x1', [])
            prev['date'], prev['end'] = pc['date'], pc['end']
            for k in ('approx', 'printed_date'):
                if k in pc:
                    prev[k] = pc[k]
                else:
                    prev.pop(k, None)
            if 'refs' in prev:
                prev['refs'] = prev['refs'] + pc.get('refs', [{'page': segs[0][0], 'boxes': [], 'text': l} for l in pc['lines']])
            last = prev['segments'][-1]
            if last[0] == segs[0][0] and abs(last[2] - segs[0][1]) < 1:
                prev['segments'] = prev['segments'][:-1] + [[last[0], last[1], segs[0][2]]]
            else:
                prev['segments'] = prev['segments'] + [segs[0]]
            continue
        out.append(pc)
    return out


def header_name(header):
    """The poster in a post header: "Kent Barrett shared his photo." -> "Kent Barrett"."""
    return re.split(r' (?:shared|uploaded|via|added|asked|made|changed|updated|created|posted|is with|was with)\b', header)[0].strip()


def similar_names(a, b):
    """Some renames only respell a word ("Steeve Contributing Beneficiary" / "Steve Lemieux")."""
    return any(len(x) >= 4 and len(y) >= 4 and SequenceMatcher(None, x, y).ratio() >= 0.85 for x in a for y in b)


def load_site(repo):
    posts, comments = {}, defaultdict(list)
    for path in glob.glob(os.path.join(repo, 'content/vol_*/*/*.md')):
        try:
            d = json.loads(open(path, encoding='utf-8').read())
        except Exception:
            continue
        if 'id' not in d or 'created_time' not in d or d['id'].startswith('anthology-'):
            continue  # (posts recovered from the Anthology, by any volume's build, are not the export's)
        d['path'] = os.path.relpath(path, repo)
        d['utc'] = datetime.strptime(d['created_time'][:19], '%Y-%m-%dT%H:%M:%S')
        if d.get('post_id'):
            comments[d['post_id']].append(d)
        else:
            posts[d['id']] = d
    return posts, comments


PRINT_YEAR = 2014  # Facebook leaves the year out of dates in the year of printing ("April 5 at 4:42am")


def pdf_date(text):
    """The printed date "Month D, YYYY" (the year of printing when it is left out), or None."""
    m = re.match(r'([A-Z][a-z]+ \d{1,2})(, \d{4})?(?= at |$| ·)', text or '')
    return m and m[1] + (m[2] or f', {PRINT_YEAR}')


def pdf_time(text, with_time=True):
    day = pdf_date(text)
    if not day:
        return None
    m = re.match(r'[A-Z][a-z]+ \d{1,2}(?:, \d{4})? at (\d{1,2}:\d\d[ap]m)', text or '')
    try:
        if m:
            local = datetime.strptime(f'{day} {m[1]}', '%B %d, %Y %I:%M%p').replace(tzinfo=EASTERN)
            return local.astimezone(timezone.utc).replace(tzinfo=None)
        return datetime.strptime(day, '%B %d, %Y')  # local date only
    except ValueError:
        return None


# A relative time ("11 hrs") was counted when the page was loaded, up to LOAD_HOURS before the printer's clock
# that parse.py counted it from: the true time is at most that long (and one unit) before the printed estimate.
# (Volume 9: matched comments are 0-5 hours earlier than the estimate.)
LOAD_HOURS = 6
EMPTY_SCORE = 0.701  # (distinct from other scores)


def window(info):
    """Allowed (site time - printed time) in seconds for a PDF comment."""
    if info.get('approx') is not None:
        return -(LOAD_HOURS + info['approx']) * 3600 - 60, 60
    if 'Edited' in (info['pdf'].get('date') or ''):
        return -7200, 60
    return -60, 60


ALIASES = set()  # (printed name, exported name) of renamed accounts, learned in main()


def same_person(info, site_name):
    """The printed comment is by the exported comment's author (by name, or as a known renamed account)."""
    if not site_name:
        return False
    a = info['author']
    return info['text'].startswith(site_name) or bool(a and (words(a) & words(site_name) or (a, site_name) in ALIASES))


def main(repo, parsed_path, out_path):
    posts, comments = load_site(repo)
    names = {d.get('from_name') for d in posts.values()} | {c.get('from_name') for cs in comments.values() for c in cs}
    parsed = json.load(open(parsed_path))
    for pp in parsed:
        pp['comments'] = merge_quotes(pp['comments'])
        if header_name(pp['header']):
            names.add(header_name(pp['header']))
        for part in re.split(r', | and ', re.sub(r'\s*(and \d+ others? )?likes? this\.?$', '', pp.get('likes') or '')):
            if part and part != 'You' and not part[0].isdigit() and len(part.split()) <= 5:
                names.add(part)
    # Commenters the export lacks or knows by another name ("Jason Moreland" is "CJ ML" there): the blue words that
    # start comments, when the same ones start two or more. A name tagged right after the commenter's is blue too
    # ("Pete Daoust Chris Evan"), so a run that begins with another name is left out.
    runs = Counter(blue_words(pc.get('first')) for pp in parsed for pc in pp['comments']
                   if pc.get('first') and pc['first']['boxes'] and pc['first']['boxes'][0][0] <= 320)
    runs = {n for n, c in runs.items() if c >= 2 and 2 <= len(n.split()) <= 5 and not n.endswith(',')
            and not re.search(r'https?:|www\.|\.com|/', n)}
    names |= {n for n in runs if not any(n.startswith(m + ' ') for m in names | runs if m)}
    names = sorted((n for n in names if n and len(n) > 2), key=len, reverse=True)
    by_minute = defaultdict(list)
    for cs in comments.values():
        for c in cs:
            by_minute[c['utc'].replace(second=0)].append(c)
    by_local_date = defaultdict(list)
    for p in posts.values():
        by_local_date[(p['utc'] - OFFSET).date()].append(p)
    dates = [pdf_time(pp['date']) for pp in parsed if pdf_time(pp['date'])]
    span = (min(dates) - timedelta(days=2), max(dates) + timedelta(days=2))
    local_day = lambda p: p['utc'].replace(tzinfo=timezone.utc).astimezone(EASTERN).date()
    results = []

    def poster_matches(p, pp):
        first = norm(pp['header']).split()[:6]
        return bool(words(p.get('from_name') or '') & set(first)) or similar_names(words(p.get('from_name') or ''), first)

    def ranked(pp):
        """Candidate site posts for a PDF post, best first, as (score, id)."""
        local = pdf_time(pp['date'])
        body = ' '.join(pp['text'])
        if not words(body) and header_name(pp['header']):
            # A shared photo prints only its picture; the header names what was shared ("X shared Tyranny Response
            # Team's photo."), which is the exported post's name.
            body = pp['header'][len(header_name(pp['header'])):]
        if local:
            cands = {p['id']: p for dd in (-1, 0, 1) for p in by_local_date.get((local + timedelta(days=dd)).date(), [])}
        else:
            # The header (name and date) fell into a page break: any post from the volume's months may be it.
            cands = {p['id']: p for p in posts.values() if span[0] <= p['utc'] <= span[1]}
        pdf_minutes = [t for t in (pdf_time(pc['date']) for pc in pp['comments'] if pc.get('approx') is None) if t]
        # Relative times ("11 hrs") agree with a site comment anywhere in their window.
        pdf_approx = [(t, pc['approx']) for pc in pp['comments'] if pc.get('approx') is not None for t in [pdf_time(pc['date'])] if t]
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
            same_name = not p.get('from_name') or not pp['header'] or poster_matches(p, pp)
            factor = 1 if same_name else 0.6
            site_text = ' '.join(filter(None, [p.get('message'), p.get('name'), p.get('description'), p.get('link')]))
            wa, wb = words(body), words(site_text)
            # The printout cuts long posts short ("... See More"), so measure against the shorter text, but give
            # short texts less weight so a few common words can't win.
            text = len(wa & wb) / min(len(wa), len(wb)) * min(1, min(len(wa), len(wb)) / 8) if wa and wb else 0
            if not pdf_minutes and same_name and len(wa) >= 2 and wa <= wb:
                text = max(text, 0.5)  # a short post ("Get it ? ...") whose words are all in the site post's
            # The same whole text (a short one: "TRUDAT!!!!!") on the same day is the same post.
            if norm(body) and norm(body) == norm(p.get('message')) and local and local_day(p) == local.date():
                text = max(text, 0.9)
            # The same video or photo ID (a long token of letters and digits) in both is as good as the same text.
            if ids(body) & ids(site_text):
                text = max(text, 0.9)
            if pdf_minutes or pdf_approx:
                if not wa and not wb:
                    text = 0.5  # a picture with no words, exported with no content (the export lost the picture)
                site_minutes = {c['utc'].replace(second=0) for c in comments.get(p['id'], [])}
                lo_hi = lambda t, a: (t - timedelta(hours=LOAD_HOURS + a, minutes=1), t + timedelta(minutes=1))
                agree = (sum(t in site_minutes for t in pdf_minutes) +
                         sum(any(lo_hi(t, a)[0] <= m <= lo_hi(t, a)[1] for m in site_minutes) for t, a in pdf_approx)
                         ) / (len(pdf_minutes) + len(pdf_approx))
                same_day = 0.1 if local and (p['utc'] - OFFSET).date() == local.date() else 0
                combined = 0.4 * text + 0.6 * agree + same_day
                if agree >= 0.5:
                    factor = 1  # most comments agree: a renamed account doesn't count against it
                # Near-identical text decides when the comments don't contradict it (few comments, or some agree).
                if text >= 0.8 and (len(pdf_minutes) + len(pdf_approx) <= 2 or agree >= 0.3):
                    combined = max(combined, 0.9 * text + same_day)
                return factor * combined
            if not local:
                return factor * text if text >= 0.8 else 0  # no header, no comments: only near-identical text
            # An uploaded file exports as an empty post: the same person at the same minute is all there is to go by.
            if (not norm(site_text) and same_name and pp['header'] and ' at ' in pp['date']
                    and p['utc'].replace(second=0) == local):
                return EMPTY_SCORE
            # A shared photo with no words of its own, dated by day only: the same person's empty post that day.
            if (not norm(site_text) and not plain_words(' '.join(pp['text'])) and same_name and pp['header']
                    and ' at ' not in pp['date'] and (p['utc'] - OFFSET).date() == local.date()):
                return 0.6
            return factor * (text + (0.1 if (p['utc'] - OFFSET).date() == local.date() else 0))
        return sorted(((post_score(p), p['id']) for p in cands.values()), reverse=True)

    # A site post is the printout of only one PDF post: assign best first, the rest try their next candidates.
    ranks = [ranked(pp) for pp in parsed]
    choice, taken = {}, set()
    # (0.45 less a rounding margin: 0.4 * 0.125 + 0.6 * 0.5 + 0.1 adds up to 0.44999999999999996.)
    for sc, k, pid in sorted(((sc, k, pid) for k, rk in enumerate(ranks) for sc, pid in rk[:5] if sc >= 0.45 - 1e-9), reverse=True):
        if k not in choice and pid not in taken:
            choice[k] = (pid, sc)
            taken.add(pid)
    # Empty posts by one person in one minute (several files uploaded at once), or pictures on one day, are told
    # apart only by their order: the feed runs by latest activity (before the printout), newest first.
    printed = max(dates) + timedelta(days=1)
    def activity(pid):
        p = posts[pid]
        updated = datetime.strptime(p['updated_time'][:19], '%Y-%m-%dT%H:%M:%S') if p.get('updated_time') else p['utc']
        if updated < printed:
            return updated
        return max([p['utc']] + [c['utc'] for c in comments.get(pid, []) if c['utc'] < printed])
    groups = defaultdict(list)
    for k, (pid, sc) in choice.items():
        if sc == EMPTY_SCORE:
            groups[('minute', posts[pid]['utc'].replace(second=0), posts[pid].get('from_name'))].append(k)
        elif sc == 0.6:
            groups[('day', (posts[pid]['utc'] - OFFSET).date(), posts[pid].get('from_name'))].append(k)
    for ks in groups.values():
        pids = sorted((choice[k][0] for k in ks), key=activity, reverse=True)
        for k, pid in zip(sorted(ks), pids):
            choice[k] = (pid, choice[k][1])
    # Photos, files and shared status updates export as posts with no content, so neither text nor (when the
    # printout shows no comments) comment times can match them. Pair what is left of these by poster and local date:
    # posts print newest first, so when one poster has several on a day, pair them in that order.
    def empty(p):
        content = ' '.join(filter(None, [p.get('message'), p.get('name'), p.get('description')]))
        return not plain_words(content) and not EMOTICON.search(p.get('message') or '')
    day_groups = defaultdict(lambda: ([], []))
    for k, pp in enumerate(parsed):
        local = pdf_time(pp['date'])
        if (k not in choice and local and header_name(pp['header'])
                and not any(pdf_time(pc['date']) for pc in pp['comments'])):
            day_groups[local.date()][0].append(k)
    for p in posts.values():
        if (p['id'] not in taken and empty(p) and p.get('from_name')
                and not any(c['utc'] < PRINTED_BY for c in comments.get(p['id'], []))):
            if local_day(p) in day_groups:
                day_groups[local_day(p)][1].append(p)
    for day, (ks, ps) in day_groups.items():
        by_name = defaultdict(lambda: ([], []))
        for p in ps:
            by_name[p['from_name']][1].append(p)
            for k in ks:
                if poster_matches(p, parsed[k]):
                    by_name[p['from_name']][0].append(k)
        for name, (nks, nps) in by_name.items():
            nks = sorted(set(k for k in nks if k not in choice))
            nps = sorted((p for p in nps if p['id'] not in taken), key=lambda p: activity(p['id']), reverse=True)
            if nks and len(nks) == len(nps):
                for k, p in zip(nks, nps):
                    choice[k] = (p['id'], 0.5)
                    taken.add(p['id'])

    def comment_author(pc):
        text = ' '.join(l for l in pc['lines'] if l != pc['date'])
        known = next((n for n in names if text.startswith(n + ' ') or text == n), None)
        blue = blue_words(pc.get('first'))
        # A name tagged right after the commenter's is blue too: a known name at the start wins.
        # A link is blue too: when the name line is lost, the first blue words can be an address.
        # (The words before the address are still the name: "Harry Nosed Wombat http://www.youtube.com ...".)
        if blue and re.search(r'https?:|www\.|\.com|/', blue):
            head = []
            for w in blue.split(' '):
                if re.search(r'https?:|www\.|\.com|/', w):
                    break
                head.append(w)
            blue = ' '.join(head) if 2 <= len(head) <= 5 else ''
        # A link preview's title is blue too: the group's own name, or a long title that is no known name.
        if blue and (blue == 'THE TENDER FOR LAW' or (len(blue.split()) > 5 and not known)):
            blue = ''
        # A preview's title on a line of its own above its site's bare domain ("Lawful Money" /
        # "www.investopedia.com"): the commenter's name line was lost in a page break.
        if (len(pc['lines']) > 1 and pc['lines'][0] == (blue or known)
                and re.fullmatch(r'(www\.)?[\w-]+(\.[\w-]+)+', pc['lines'][1].strip())):
            return text, None
        # A commenter's name starts the comment's column (x ~315). A first line further right is a link preview's
        # title: the name and the start of the text fell into a page break.
        if pc.get('first') and pc['first']['boxes'] and pc['first']['boxes'][0][0] > 320:
            return text, None
        author = known if known and (not blue or blue.startswith(known)) else (blue or known)
        # A name tagged at the start of the text is blue too ("Leigh OftheHouseof Collins Kent Barrett",
        # "Joelle Spirit Pete,"): drop a known name or a word ending in a comma from the end of the blue words.
        if author and author == blue:
            tag = next((n for n in names if author.endswith(' ' + n) and len(author.split()) - len(n.split()) >= 2), None)
            if tag:
                author = author[:-len(tag) - 1]
            elif len(author.split()) >= 3 and author.endswith(','):
                author = author.rsplit(' ', 1)[0]
        # A name with no avatar beside it is a mention (or an address) opening the rest of a comment whose own name
        # line fell into a page break ("Derek Moran, it gets annoying...").
        if author and not has_avatar(pc.get('first')):
            return text, None
        return text, author
    authors = {(k, j): comment_author(pc) for k, pp in enumerate(parsed) for j, pc in enumerate(pp['comments'])}
    # Renamed accounts ("Mackximus Minimus" printed, "Anibal Jose Baez" exported): a printed name and an exported
    # name with no word in common are the same person when at least two comments agree on minute and text.
    # (A quote of someone else's comment at the same minute must not count: the texts must be nearly the same
    # both ways, and a name the export itself uses is not a renamed one.)
    exported = {c.get('from_name') for cs in comments.values() for c in cs} | {p.get('from_name') for p in posts.values()}
    timeline = sorted((c['utc'], c['id'], c) for cs in comments.values() for c in cs)
    times = [x[0] for x in timeline]
    alias_votes = defaultdict(set)
    for (k, j), (text, author) in authors.items():
        pc = parsed[k]['comments'][j]
        t = pdf_time(pc['date'])
        if not author or not t or author in exported or re.match(r'\d+ (shares?|likes?|comments?)$', author):
            continue
        body = text[len(author):]
        if len(words(body)) < 4:
            continue
        if pc.get('approx') is not None:  # a relative time: anywhere in its window
            lo, hi = window({'approx': pc['approx'], 'pdf': pc})
            near = [x[2] for x in timeline[bisect.bisect_left(times, t + timedelta(seconds=lo)):bisect.bisect_right(times, t + timedelta(seconds=hi))]]
        else:
            near = by_minute.get(t, [])
        for c in near:
            site_name = c.get('from_name') or ''
            wb, wc = words(body), words(c.get('message') or '')
            if site_name and not words(site_name) & words(author) and len(wb & wc) >= 0.8 * max(len(wb), len(wc)):
                alias_votes[(author, site_name)].add(c['id'])
    ALIASES.clear()
    ALIASES.update(pair for pair, ids_ in alias_votes.items() if len(ids_) >= 2)
    print('renamed accounts:', sorted(ALIASES))
    name_set = set(names)

    for k, pp in enumerate(parsed):
        pid, score = choice.get(k, (None, ranks[k][0][0] if ranks[k] else 0))
        site_post = posts[pid] if pid else None
        result = {'pdf': pp, 'name': header_name(pp['header']), 'site_post': site_post and site_post['id'], 'post_score': round(score, 2), 'comments': []}
        site_comments = comments.get(site_post['id'], []) if site_post else []
        # Score every PDF comment against every site comment of the post, then pair them best first.
        infos = []
        for j, pc in enumerate(pp['comments']):
            text, author = authors[(k, j)]
            info = {'pdf': pc, 'author': author, 'author0': author, 'text': text, 'utc': pdf_time(pc['date']),
                    'approx': pc.get('approx')}
            # A page break that swallows one comment's end and the next one's name line leaves one item: the first
            # comment's start, then the second's name and text, then the second's date. The date is the second's,
            # so pair the item by its last name line (printed blue: a black one is quoted text) and what follows it.
            lines = [l for l in pc['lines'] if l != pc['date']]
            refs = [r for r in pc.get('refs', []) if r['text'] != pc['date']]
            if len(pc['segments']) > 1 and len(refs) == len(lines):
                for i in range(len(lines) - 1, 0, -1):
                    # (After the break, and with text after it: a name wrapped onto a line of its own at the end of
                    # a comment is a tag, "...thanks for the wakeup call" / "Tara Duncan".)
                    if refs[i]['page'] != pc['segments'][-1][0]:
                        continue
                    tail = next((n for n in names if lines[i].startswith(n + ' ')), None)
                    # (With an avatar beside it: a paragraph can open with a blue mention, "Pete Daoust apparently...".)
                    if tail and blue_words(refs[i]).startswith(tail) and has_avatar(refs[i]):
                        info.update(author=tail, text=' '.join(lines[i:]), whole=text)
                        break
            infos.append(info)
        body_of = lambda info: info['text'][len(info['author']):] if info['author'] else info['text']
        gap_of = lambda c, info: (c['utc'] - info['utc']).total_seconds()
        pairs = []
        for k, info in enumerate(infos):
            if not info['utc']:
                continue
            for c in site_comments:
                gap = (c['utc'].replace(second=0) - info['utc']).total_seconds()
                lo, hi = window(info)
                if not lo <= gap <= hi:
                    continue
                raw = c.get('message') or ''
                ctext = no_emoticons(raw)
                body = body_of(info)
                site_name = c.get('from_name') or ''
                if info['approx'] is not None:
                    gap = 60 * (gap < -60)  # within the window no time is closer than another
                    # A window of hours holds many comments by the same person: the texts must agree too.
                    b0, c0 = words(body), words(ctext)
                    jac = len(b0 & c0) / len(b0 | c0) if b0 | c0 else 0
                    short = min(len(b0), len(c0))
                    strong = (jac >= 0.5 and short >= 2) or (similarity(' '.join(b0), ' '.join(c0)) >= 0.6 and short >= 3)
                    same = same_person(info, site_name)
                    identical = bool(bare(raw)) and bare(body) == bare(raw)
                    # (The same video or photo ID in both is the same link.)
                    identical = identical or bool(ids(info['text']) & ids(raw))
                    if not ((same and (strong or not (b0 or c0))) or identical or (short >= 4 and similarity(' '.join(b0), ' '.join(c0)) >= 0.8)):
                        continue
                name_ok = same_person(info, site_name)
                nb, nc = bare(body), bare(raw)
                shorter, longer = sorted((nb, nc), key=len)
                if nb and nc and (nb == nc or (len(shorter.split()) >= max(3, 0.6 * len(longer.split()))
                                              and f' {shorter} ' in f' {longer} ')):
                    # The same text at the same minute, even when it is all short common words ("for me...ME...",
                    # "and?", "NO!") and the account was renamed ("Bobis Youruncle" / "August le Blanc").
                    sim = 1.0
                elif nb and nc:
                    sim = similarity(body, ctext)  # (the letter of an emoticon, ":D", is not a shared word)
                elif not nb and not nc:
                    # Both have no words: emoticons and stickers print as pictures. Only at the printed minute (an
                    # "Edited" item with no words left is more likely a comment whose text a page break swallowed)
                    # and with a name (an item with neither is what a page break left of a comment: see below).
                    if abs(gap) > 60 or not info['author']:
                        continue
                    sim = 0.5
                else:
                    sim = 0.0
                # Same person, same minute is not enough when both texts have words and share few of them.
                # (A link prints as its preview's title, so a mostly-link text doesn't count as having words.)
                pb, pc_ = plain_words(body), plain_words(ctext)
                has_words = len(pb) >= 3 and len(pc_) >= 3
                plain_sim = len(pb & pc_) / min(len(pb), len(pc_)) if pb and pc_ else 0
                wb, wc = words(body), words(ctext)
                both = len(wb & wc) / len(wb | wc) if wb | wc else 0
                # Without the name (accounts were renamed), half the words must agree, with at least three words on
                # each side ("overthinking" is not "What is this OVERthinking thing ?"), and on one page also two
                # shared words or a third of both texts ("I AM UBERPOPE!" is not "...a better pope than I am Gunga
                # Din."). (Across a page break the date can end another comment's tail: only its words are there.)
                crosses = len(info['pdf']['segments']) > 1
                # By someone else (both names printed and exported), on one page: the text must be the same both ways.
                if (info['author'] and site_name and not name_ok and not crosses and sim < 1.0
                        and len(wb & wc) < 0.8 * max(len(wb), len(wc))):
                    continue
                enough = ((sim >= 1.0 or not (nb or nc) or min(len(wb), len(wc)) >= 3)
                          and (len(wb & wc) >= 2 or both >= 0.3 or not (wb or wc) or ids(body) & ids(raw)
                               or any(u in body for u in re.findall(r'https?://\S{12,}', raw)) or crosses))
                # The name line was lost and the site's comment is only an address: the printout shows its preview.
                preview = (not info['author'] and nb and abs(gap) <= 60 and not plain_words(raw) and bool(URL.search(raw)))
                # Both are only an address, the printed one cut short ("http://www.youtube.com /watch?feature=...").
                same_link = abs(gap) <= 60 and link_prefix(body, raw)
                if (name_ok and (not has_words or max(sim, plain_sim) >= 0.3)) or (sim >= 0.5 and enough) or preview or same_link:
                    # Ties ("Are you blond ?" is all in "...English Blond...") go to the closer time, to the pair
                    # sharing more of both texts, and to the very same text (short replies of stop words: "I do?").
                    closeness = 1 - min(abs(gap), 60) / 60
                    exact = 0.3 if nb and nb == nc else 0
                    # An item across a page break may hold one comment's start and another's end: the date is the
                    # one whose end is printed after the break. A comment whose start is printed but not its end, or
                    # whose end comes before the break, is the other one.
                    ending = 0
                    cw = [t for t in norm(ctext).split() if t not in URL_WORDS]
                    if crosses and len(cw) >= 4:
                        strip = lambda t: ' '.join(w for w in norm(t).split() if w not in URL_WORDS)
                        pw = strip(info.get('whole', info['text']))
                        last = info['pdf']['segments'][-1][0]
                        after = strip(' '.join(r['text'] for r in info['pdf'].get('refs', []) if r['page'] == last))
                        end, start = ' '.join(cw[-4:]), ' '.join(cw[:4])
                        if end in after:
                            ending = 0.3
                        elif start in pw or end in pw:
                            ending = -0.3
                    if ending < 0:
                        exact = 0  # (its whole text printed before the break: the date after it is the next one's)
                    pairs.append((sim + (0.3 if name_ok else 0) + 0.2 * both + 0.1 * closeness + exact + ending, k, c['id']))
        pairs.sort(reverse=True)
        taken_pdf, used, site_of = set(), set(), {}
        for sc, k, cid in pairs:
            if k not in taken_pdf and cid not in used:
                taken_pdf.add(k); used.add(cid); site_of[k] = (cid, sc)
        free = lambda: [c for c in site_comments if c['id'] not in used]
        # Second pass: a few printed times differ by minutes without an "Edited" label. Pair what is left when the
        # text is the same (at least five words) and the times are within three hours.
        for k, info in enumerate(infos):
            if k in site_of:
                continue
            body = body_of(info)
            n = len(words(body))
            if n < 4:
                continue
            # Both texts need some length: "I" or "YOU" would otherwise match anything containing that word.
            best = max((c for c in free() if len(words(no_emoticons(c.get('message')))) >= 4),
                       key=lambda c: loose_similarity(body, no_emoticons(c.get('message'))), default=None)
            if not best:
                continue
            sim = loose_similarity(body, no_emoticons(best.get('message')))
            near = bool(info['utc']) and abs(gap_of(best, info)) <= 10800
            if info['approx'] is not None and info['utc']:
                lo, hi = window(info)
                near = lo - 10800 <= gap_of(best, info) <= hi + 10800
            if not info['utc'] and n >= 4 and sim >= 0.8:  # its date line fell into a page break
                near, n = True, max(n, 5)
            # Within one post the same words are the same comment: near in time, or nearly identical. A comment
            # quoting another one is nearly identical too: far apart in time, the names must agree.
            site_name = best.get('from_name') or ''
            other_name = bool(info['author'] and site_name) and not same_person(info, site_name)
            if other_name:
                # By someone else, the text must be the same both ways: a longer comment quoting it is not it.
                wb, wc = words(body), words(best.get('message') or '')
                if len(wb & wc) < 0.8 * max(len(wb), len(wc)):
                    continue
            if (near and n >= 5 and sim >= 0.8) or (sim >= 0.9 and not (other_name and not near)):
                used.add(best['id']); site_of[k] = (best['id'], 0.8)
        # A link prints as its address and preview; the export has only the address. The same video or photo ID is
        # the same comment: by the same commenter whatever the printed time says (some are hours off: "1:18am"
        # printed for a comment exported at 1:17pm), by anyone when it is the only one within three hours.
        for k, info in enumerate(infos):
            body = body_of(info)
            if k in site_of or not ids(body):
                continue
            cands = [c for c in free() if ids(body) & ids(c.get('message'))]
            mine = [c for c in cands if info['author'] and same_person(info, c.get('from_name') or '')]
            if mine:
                best = min(mine, key=lambda c: abs(gap_of(c, info)) if info['utc'] else 0)
            else:
                near = [c for c in cands if not info['utc'] or abs(gap_of(c, info)) <= 10800]
                best = near[0] if len(near) == 1 else None
            if best:
                used.add(best['id']); site_of[k] = (best['id'], 0.8)
        # The same text, word for word, is the same comment even when it is too short for the passes above or its
        # printed time is off without an "Edited" label: within ten minutes, or by the same person within twelve
        # hours (or at any earlier time when the printout says it was edited, or with its date line lost). By the
        # same person, the site's whole text printed (a link's preview may follow it) will do; with no date line,
        # most of the words (an address may print shortened).
        for k, info in enumerate(infos):
            raw_body = body_of(info)
            b = bare(raw_body)
            if k in site_of or not b:
                continue
            edited = 'Edited' in (info['pdf'].get('date') or '')
            fits = []
            for c in free():
                ct = bare(c.get('message'))
                if not ct:
                    continue
                same = bool(info['author']) and same_person(info, c.get('from_name') or '')
                if not (ct == b or (same and len(ct.split()) >= 3 and f' {ct} ' in f' {b} ')):
                    if (not info['utc'] and same and len(words(ct)) >= 4
                            and similarity(raw_body, no_emoticons(c.get('message'))) >= 0.6):
                        fits.append((0, c['id']))
                    continue
                if info['utc']:
                    gap = gap_of(c, info)
                    if abs(gap) <= 600 or (same and (abs(gap) <= 43200 or (edited and gap <= 60))):
                        fits.append((abs(gap), c['id']))
                elif same:
                    fits.append((0, c['id']))
            if fits and (info['utc'] or len(fits) == 1):
                cid = min(fits)[1]
                used.add(cid); site_of[k] = (cid, 0.7)
        # A comment that is only an address prints as its link preview (title, site, description), and its name line
        # can be lost at a page break or taken for the blue title. Pair it, at the same minute, with the item that
        # holds words of its address ("rubber-stamped-fraud") or its video or photo number.
        for k, info in enumerate(infos):
            if k in site_of or not info['utc']:
                continue
            item = set(norm(info['text']).split())
            best = None
            for c in free():
                msg = c.get('message') or ''
                if plain_words(msg) or not URL.search(msg):
                    continue
                if abs((c['utc'].replace(second=0) - info['utc']).total_seconds()) > 60:
                    continue
                shared = {w for w in words(msg) if not (w.isdigit() and len(w) < 8)} & item
                strong = any(len(w) >= 8 and re.search(r'\d', w) for w in shared)
                if (len(shared) >= 2 or strong) and (not best or len(shared) > best[0]):
                    best = (len(shared), c['id'])
            if best:
                used.add(best[1]); site_of[k] = (best[1], 0.6)
        # A page break swallowed one comment's end and the next one's start, and the printed item begins with a
        # whole short comment ("Derek Moran *groans*" / "me..." / the next comment's date): pair it with the comment
        # its date and last line belong to, and link the one it begins with.
        merged = []
        for k, info in enumerate(infos):
            if k in site_of or not info['utc'] or not info['author'] or len(info['pdf']['segments']) < 2:
                continue
            lines = [l for l in info['pdf']['lines'] if l != info['pdf']['date']]
            first = lines[0][len(info['author']):] if lines and lines[0].startswith(info['author']) else ''
            fb, tl = bare(first), bare(lines[-1]) if len(lines) > 1 else ''
            if not fb or not tl:
                continue
            heads = [c for c in free() if bare(c.get('message')) and same_person(info, c.get('from_name') or '')
                     and (bare(c.get('message')).startswith(fb) or fb.startswith(bare(c.get('message'))))
                     and 0 <= (info['utc'] - c['utc'].replace(second=0)).total_seconds() <= 172800]
            # The comment the date belongs to: its text ends the item, or the item ends with its name (a picture
            # comment), or both hold the same video.
            dated = [c for c in free() if abs((c['utc'].replace(second=0) - info['utc']).total_seconds()) <= 60
                     and ((bare(c.get('message')) and bare(c.get('message')).endswith(tl))
                          or (not bare(c.get('message')) and tl == norm(c.get('from_name')))
                          or ids(info['text']) & ids(c.get('message')))]
            if len(heads) == 1 and len(dated) == 1 and heads[0]['id'] != dated[0]['id']:
                used.update((heads[0]['id'], dated[0]['id']))
                site_of[k] = (dated[0]['id'], 0.6)
                merged.append((heads[0]['id'], k))
        # Comments print in the order they were written, so a relative time left unpaired lies between its
        # neighbours' times (printed exactly, or their paired site comments'). In a narrow gap, the same person with
        # a short or similar text is the same comment.
        site_by_id = {c['id']: c for c in site_comments}
        def known(j):
            if j in site_of:
                return site_by_id[site_of[j][0]]['utc']
            return infos[j]['utc'] if infos[j]['approx'] is None else None
        for k, info in enumerate(infos):
            if k in site_of or info['approx'] is None or not info['utc']:
                continue
            lo = next((t for j in range(k - 1, -1, -1) for t in [known(j)] if t), None)
            hi = next((t for j in range(k + 1, len(infos)) for t in [known(j)] if t), None)
            wlo, whi = window(info)
            lo = max(lo or datetime.min, info['utc'] + timedelta(seconds=wlo)) - timedelta(minutes=1)
            hi = min(hi or datetime.max, info['utc'] + timedelta(seconds=whi)) + timedelta(minutes=1)
            if hi - lo > timedelta(hours=3):
                continue
            body = body_of(info)
            cands = []
            for c in free():
                site_name = c.get('from_name') or ''
                if not lo <= c['utc'] <= hi or not site_name or not same_person(info, site_name):
                    continue
                b0, c0 = plain_words(body), plain_words(c.get('message') or '')
                ps = len(b0 & c0) / min(len(b0), len(c0)) if b0 and c0 else 0
                if len(b0) >= 3 and len(c0) >= 3 and ps < 0.3:
                    continue
                cands.append((ps, c['id']))
            cands.sort(reverse=True)
            if cands and (len(cands) == 1 or cands[0][0] > cands[1][0]):
                used.add(cands[0][1]); site_of[k] = (cands[0][1], 0.7)
        # A page break can swallow a comment's name and text and leave only its date line, or the end of one
        # comment and the start of the next, so the printed date belongs to the second comment and the name and
        # text to the first. Pair such an item with the one site comment left at its minute when nothing printed
        # contradicts it:
        # - only the date line is left (no name, no words), and no other item left unpaired has that minute: its
        #   picture is marked as cut;
        # - the break took the name line but left the text, so the first blue words are a link's title ("Update 11
        #   from Dean -", "OBEY_THE_LAW_001.mkv"), not a name;
        # - the item crosses the break and the site comment's last words end it, or the site comment is a link
        #   (fewer than three words of its own), or the item has no words; when all its text follows the break, its
        #   name and date are one comment's, so the names must agree;
        # - the item has no name, or one that is no known name across a break ("Fields": a link's title).
        cut = set()
        for k, info in enumerate(infos):
            if k in site_of or not info['utc'] or info['approx'] is not None:
                continue
            crosses = len(info['pdf']['segments']) > 1
            edited = 'Edited' in (info['pdf'].get('date') or '')
            near = [c for c in free() if -7200 * edited - 60 <= (c['utc'].replace(second=0) - info['utc']).total_seconds() <= 60]
            if len(near) > 1:
                # Comments print in the order they were written: the one between its paired neighbours.
                lo = next((site_by_id[site_of[j][0]]['utc'] for j in range(k - 1, -1, -1) if j in site_of), datetime.min)
                hi = next((site_by_id[site_of[j][0]]['utc'] for j in range(k + 1, len(infos)) if j in site_of), datetime.max)
                near = [c for c in near if lo <= c['utc'] <= hi] or near
            if len(near) > 1:  # (an edited one: the one within a minute of its printed time)
                near = [c for c in near if abs((c['utc'].replace(second=0) - info['utc']).total_seconds()) <= 60] or near
            if len(near) > 1:  # the one at the very minute
                near = [c for c in near if c['utc'].replace(second=0) == info['utc']]
            text = norm(info.get('whole', info['text']))
            # (An item that ends with a comment's last words: that one, whichever others share the minute.)
            tails = [c for c in near if len(bare(c.get('message')).split()) >= 3
                     and ' '.join(bare(c.get('message')).split()[-3:]) in text]
            if crosses and len(tails) == 1:
                near = tails
            if len(near) != 1:
                continue
            c = near[0]
            ctext = no_emoticons(c.get('message'))
            date_only = not info['author'] and wordless(info['text'])
            title = bool(info['author']) and bool(re.search(r'[._\d]|-$', info['author'])) and crosses
            # (Another item left at that minute that could be the same comment: one with no name, or by its author.)
            rivals = [j for j, other in enumerate(infos) if j != k and j not in site_of and other['utc'] == info['utc']
                      and (not other['author'] or same_person(other, c.get('from_name') or ''))]
            b0, c0 = plain_words(body_of(info)), plain_words(ctext)
            # (A link prints as its preview: a word of its address in the item, "afghan-translator", agrees.)
            contradicts = (len(b0) >= 3 and len(c0) >= 3 and len(b0 & c0) / min(len(b0), len(c0)) < 0.3
                           and not words(info['text']) & words(ctext))
            ok = False
            if date_only:
                ok = not rivals
            elif title:
                ok = True
            elif crosses and (c in tails or abs((c['utc'].replace(second=0) - info['utc']).total_seconds()) <= 60):
                # (An "Edited" date is the edit of a comment printed there: only one written at that minute is
                # another comment's date.)
                tail4 = ' '.join(bare(ctext).split()[-4:])
                after = info['pdf'].get('first', {}).get('page') == info['pdf']['segments'][-1][0] or 'whole' in info
                if after and info['author'] and not same_person(info, c.get('from_name') or ''):
                    ok = False
                elif c in tails or len(plain_words(ctext)) < 3 or (tail4 and tail4 in text):
                    ok = True
                elif (not info['author'] or info['author'] not in name_set) and not contradicts:
                    ok = True
            elif not info['author'] and c['utc'].replace(second=0) == info['utc'] and not contradicts:
                ok = True
            if ok:
                used.add(c['id']); site_of[k] = (c['id'], 0.4)
                if title:
                    info['author'] = None
                elif date_only and crosses:
                    cut.add(k)
        # An item across a page break paired by its text with a comment written at another time than its date line
        # says, while one comment left unpaired was written at that very minute: the break swallowed the end of the
        # first and the name and text of the second, whose date it is (when nothing printed contradicts that). The
        # item is the second one's copy and holds the first one's start.
        for k, info in enumerate(infos):
            if k not in site_of or not info['utc'] or info['approx'] is not None or len(info['pdf']['segments']) < 2:
                continue
            c1 = site_by_id[site_of[k][0]]
            lo, hi = window(info)
            near = [c for c in free() if c['utc'].replace(second=0) == info['utc']]
            if len(near) != 1:
                continue
            if lo <= (c1['utc'].replace(second=0) - info['utc']).total_seconds() <= hi:
                # Written at the printed minute too: still the date's comment, unless its end is not printed and
                # nothing of it follows the break, and the other one was written after it ("341. Fraudulent
                # concealment ..." cut at the break, then Pete Daoust's ":D" a minute later).
                last = info['pdf']['segments'][-1][0]
                after_words = words(' '.join(r['text'] for r in info['pdf'].get('refs', [])
                                             if r['page'] == last and r['text'] != info['pdf']['date']))
                end1 = ' '.join(bare(c1.get('message')).split()[-4:])
                if (not info['pdf'].get('refs') or (end1 and end1 in norm(info.get('whole', info['text'])))
                        or after_words & words(c1.get('message')) or near[0]['utc'] <= c1['utc']):
                    continue
            c2, text = near[0], norm(info.get('whole', info['text']))
            ctext = no_emoticons(c2.get('message'))
            tail4 = ' '.join(bare(ctext).split()[-4:])
            tail3 = ' '.join(bare(ctext).split()[-3:]) if len(bare(ctext).split()) >= 3 else None
            last = info['pdf']['segments'][-1][0]
            printed_after = norm(' '.join(r['text'] for r in info['pdf'].get('refs', []) if r['page'] == last))
            after = info['pdf'].get('first', {}).get('page') == last or 'whole' in info
            if after and info['author'] and not same_person(info, c2.get('from_name') or ''):
                continue
            if len(plain_words(ctext)) < 3 or (tail4 and tail4 in text) or (tail3 and tail3 in printed_after):
                used.add(c2['id']); site_of[k] = (c2['id'], 0.5)
                merged.append((c1['id'], k))
        # Comments print in the order they were written: two items paired with interchangeable comments (the same
        # person's ":D" twice, within the times the items allow) take them in that order.
        paired = sorted(site_of)
        for a in range(len(paired)):
            for b in range(a + 1, len(paired)):
                j, k = paired[a], paired[b]
                cj, ck = site_by_id[site_of[j][0]], site_by_id[site_of[k][0]]
                if (cj['utc'] > ck['utc'] and cj.get('from_name') == ck.get('from_name')
                        and bare(cj.get('message')) == bare(ck.get('message'))
                        and all(infos[x]['utc'] and window(infos[x])[0] <= (c['utc'].replace(second=0) - infos[x]['utc']).total_seconds() <= window(infos[x])[1]
                                for x, c in ((j, ck), (k, cj)))):
                    site_of[j], site_of[k] = site_of[k], site_of[j]
        # Only a name, no text or date ("Ian Andrews": a sticker whose date line was lost): the one comment by that
        # name with no words left unpaired.
        for k, info in enumerate(infos):
            if k in site_of or info['utc'] or not info['author'] or bare(body_of(info)):
                continue
            same = [c for c in free() if not bare(c.get('message')) and same_person(info, c.get('from_name') or '')]
            if len(same) == 1:
                used.add(same[0]['id']); site_of[k] = (same[0]['id'], 0.4)
        # An unpaired relative time is only an estimate: move it back by the typical delay of the page load (two
        # hours) and keep it between its neighbours, so a recovered comment sorts into its place.
        for k, info in enumerate(infos):
            if k in site_of or info['approx'] is None or not info['utc']:
                continue
            lo = next((t for j in range(k - 1, -1, -1) for t in [known(j)] if t), None)
            hi = next((t for j in range(k + 1, len(infos)) for t in [known(j)] if t), None)
            t = info['utc'] - timedelta(hours=2 * (info['approx'] >= 1))
            t = min(max(t, lo or t), hi or t)
            info['utc'] = t.replace(second=0, microsecond=0)
        for k, info in enumerate(infos):
            cid, sc = site_of.get(k, (None, 0))
            out = {'pdf': info['pdf'], 'author': info['author'], 'text': info.get('whole', info['text']),
                   'utc': info['utc'] and info['utc'].isoformat(), 'site': cid, 'score': round(sc, 2),
                   'approx': info['approx'], 'cut': k in cut}
            if 'whole' in info:
                out['tail'] = info['text']  # the part after the second comment's name
            result['comments'].append(out)
        # A page break can swallow the end of one comment and the start of the next, leaving one printed item that
        # holds the first one's beginning and the second one's end. Link the other one to that picture too.
        result['partial'] = merged
        own = lambda t: len([x for x in t.split() if x not in URL_WORDS]) >= 3
        for c in site_comments:
            if c['id'] in used or c['utc'] > PRINTED_BY:
                continue
            msg = c.get('message') or ''
            ct = bare(msg)
            w = ct.split()
            # Six words of its start or end, three of them not address boilerplate ("http www youtube com watch v"
            # starts every link); the same around its addresses (they print shortened: "elaws_statutes_90p10_e...").
            # (Emoticons that Facebook doesn't draw print as text: ";o)". Both readings count.)
            ends = []
            for ws in (w, norm(msg).split(), bare(URL.sub(' ', msg)).split(), norm(URL.sub(' ', msg)).split()):
                if len(ws) >= 6:
                    ends += [e for e in (' '.join(ws[:6]), ' '.join(ws[-6:])) if own(e) and e not in ends]
            urls = re.findall(r'(?:https?://|www\.)\S{8,}', msg)
            name = norm(c.get('from_name'))
            for k, info in enumerate(infos):
                if len(info['pdf']['segments']) < 2:
                    continue
                # (It was written before the item's date line: a later comment repeating the words is not it.)
                if info['utc'] and c['utc'] > info['utc'] + timedelta(hours=3 if info['approx'] is not None else 0, minutes=1):
                    continue
                whole = info.get('whole', info['text'])
                pdf_text = norm(whole)
                lines = [l for l in info['pdf']['lines'] if l != info['pdf']['date']]
                a0 = info['author0'] or ''
                first = bare(lines[0][len(a0):]) if a0 and lines and lines[0].startswith(a0) else ''
                same = bool(a0) and same_person(dict(info, author=a0), c.get('from_name') or '')
                # Its beginning or (when the item was paired with the comment it starts with) its end; an address
                # printed whole (it may wrap: "http://www.youtube.com" / "/watch?v=..."); a short comment's name and
                # whole text inside the item ("... Beverly Berta Braakschmack what name is still title?"); the item's
                # first line is its commenter's name and the start of its text ("Scott Duncan legally sanctioned
                # contract = CONDITIONAL CONSTRUCTED" / page break / ...), or all of its text right after that name
                # (its date and the next name line were lost).
                whole_short = bool(name and ct and f'{name} {ct}' in pdf_text
                                   and (len(w) >= 2 or (not pdf_text.startswith(f'{name} {ct}') and info['utc']
                                                        and abs(gap_of(c, info)) <= 120)))
                found = (any(e in pdf_text for e in ends) or any(u in whole.replace(' ', '') for u in urls) or whole_short
                         or (len(first.split()) >= 3 and ct.startswith(first) and same)
                         or (ct and k in site_of and same and f'{norm(whole[len(a0):])} '.startswith(ct + ' ')))
                if not found:
                    continue
                paired = result['comments'][k]
                last = info['pdf']['segments'][-1][0]
                after = norm(' '.join(r['text'] for r in info['pdf'].get('refs', []) if r['page'] == last))
                if (whole_short and info['utc'] and pdf_text.endswith(f'{name} {ct}') and f'{name} {ct}' in after
                        and abs((c['utc'].replace(second=0) - info['utc']).total_seconds()) <= 60):
                    # The item ends with this whole comment and its date, after the page break: it is this one's
                    # copy, and the cut comment it begins with (if paired) is the partial one.
                    if paired['site']:
                        result['partial'].append((paired['site'], k))
                    paired['site'] = c['id']
                else:
                    result['partial'].append((c['id'], k))
                used.add(c['id'])
                break
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
    n_part = sum(len(r['partial']) for r in results)
    print(f'posts matched {n_posts}/{len(results)}; comments matched {n_cm}/{n_c}; partial links {n_part}')


if __name__ == '__main__':
    if len(sys.argv) > 4:
        PAGES = sys.argv[4]
    main(*sys.argv[1:4])
