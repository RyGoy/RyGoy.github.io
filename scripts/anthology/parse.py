"""Split an Anthology PDF (a printed Facebook group feed) into posts and comments with their positions.

Input: pdftotext -bbox-layout output. Output: JSON list of posts, each with header, text, comments, and the page
segments (page, y0, y1) each item occupies. Coordinates are PDF points; pages are 1008 x 612.
"""
import html, json, re, sys

MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
DAYS = 'Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday'
# Facebook prints times of the last week relative to when the page was loaded: "Yesterday at 4:24am",
# "Wednesday at 3:10pm", and within a day "11 hrs" or "12 hours ago" (minutes: "6 mins", "20 minutes ago").
RELATIVE = r'(\d{1,2}) (hours? ago|minutes? ago|seconds? ago|hrs?|mins?)|(?:about )?an? (hour|minute) ago|Just now|a few seconds ago'
POST_DATE = re.compile(rf'^(({MONTHS}) \d{{1,2}}(, \d{{4}})?( at \d{{1,2}}:\d\d[ap]m)?|({DAYS}) at \d{{1,2}}:\d\d[ap]m|{RELATIVE})( ·.*)?$')
COMMENT_DATE = re.compile(rf'^(({MONTHS}) \d{{1,2}}(, \d{{4}})? at \d{{1,2}}:\d\d[ap]m|({DAYS}) at \d{{1,2}}:\d\d[ap]m|{RELATIVE})( ·.*)?$')
PRINTED = None  # the printer's clock (local time), from the page footer "06/13/2014 09:02 AM"


def after_print(t):
    """A date with no year after the printing date: an event's date in a shared event card, or a date in text pasted
    from a later thread, not a post's or a comment's date (Facebook leaves the year off dates in the current year)."""
    m = re.match(rf'^({MONTHS}) (\d{{1,2}})(?![\d,])', t or '')
    if not m:
        return False
    month_day = (PRINTED.month, PRINTED.day) if PRINTED else (6, 14)
    return (MONTHS.split('|').index(m[1]) + 1, int(m[2])) > month_day


def is_post_date(t):
    return bool(POST_DATE.match(t)) and not after_print(t)


def is_comment_date(t):
    return bool(COMMENT_DATE.match(t)) and not after_print(t)


def canon_date(t):
    """A printed date as "Month D, YYYY[ at h:mmam][ · rest]", which the other scripts read, and the hours of
    uncertainty for a relative time ("11 hrs" was counted from when the page was loaded, at some time before it was
    printed). A date without a year is in the printing year."""
    from datetime import datetime, timedelta
    if not PRINTED:
        return t, None
    m = re.match(rf'^({MONTHS}) (\d{{1,2}})( at \d{{1,2}}:\d\d[ap]m)?(.*)$', t)
    if m and not re.match(r', \d{4}', m[4]):
        return f'{m[1]} {m[2]}, {PRINTED.year}{m[3] or ""}{m[4]}', None
    fmt = lambda d: f'{d:%B} {d.day}, {d.year} at {int(d.strftime("%I"))}:{d:%M}{d.strftime("%p").lower()}'
    m = re.match(rf'^({DAYS}) at (\d{{1,2}}:\d\d[ap]m)(.*)$', t)
    if m:
        back = 0 if m[1] == 'Today' else 1 if m[1] == 'Yesterday' else (PRINTED.weekday() - ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].index(m[1]) - 1) % 7 + 1
        d = datetime.strptime(f'{(PRINTED - timedelta(days=back)):%Y-%m-%d} {m[2].upper()}', '%Y-%m-%d %I:%M%p')
        return fmt(d) + m[3], None
    m = re.match(rf'^({RELATIVE})(.*)$', t)
    if m:
        n = int(m[2]) if m[2] else 1
        unit = (m[3] or m[4] or ('second' if m[1][0] in 'Ja' else '')).lower()
        span = timedelta(hours=1) if unit.startswith('h') else timedelta(minutes=1) if unit.startswith('m') else timedelta(0)
        ago = n * span
        return fmt(PRINTED - ago) + m[5], round(span.total_seconds() / 3600 + 0.0, 3)
    return t, None


ACTIONS = re.compile(r'^(Un)?[Ll]ike · (Comment|Share)|^Comment · Share|^(Un)?[Ll]ike · Comment')
LIKES = re.compile(r'(likes? this\.?|others like this\.?)$')
MAIN_X0, MAIN_X1, TOP, BOTTOM = 270, 700, 76, 596  # Facebook's menu bar ends above y 76


def read_pages(path):
    data = open(path, encoding='utf-8').read()
    for number, page in enumerate(re.split(r'<page ', data)[1:], 1):
        lines = []
        for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', page, re.S):
            x0, y0, x1, y1 = map(float, m.groups()[:4])
            wb = re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', m[5])
            words = [html.unescape(w[4]) for w in wb]
            boxes = [[float(w[0]), float(w[1]), float(w[2]), float(w[3])] for w in wb]
            if not (MAIN_X0 <= x0 < MAIN_X1 and TOP <= y0 < BOTTOM):
                continue
            lines.append({'page': number, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'text': ' '.join(words), 'boxes': boxes})
        # pdftotext splits a visual line into pieces (e.g. "· Like ·" and a like count); merge pieces on one baseline.
        lines.sort(key=lambda l: (round(l['y0']), l['x0']))
        merged = []
        for l in lines:
            if merged and abs(merged[-1]['y0'] - l['y0']) < 2 and l['x0'] > merged[-1]['x0']:
                merged[-1]['text'] += ' ' + l['text']
                merged[-1]['boxes'] = merged[-1]['boxes'] + l['boxes']
                merged[-1]['x1'] = max(merged[-1]['x1'], l['x1'])
            else:
                merged.append(dict(l))
        yield number, merged


CONTENT_TOP, CONTENT_BOTTOM = 76, 556


def segments(start, end):
    """Page strips from start (page, y) to end (page, y), crossing page breaks."""
    (p0, y0), (p1, y1) = start, end
    if p0 == p1:
        return [[p0, y0, y1]]
    return [[p0, y0, CONTENT_BOTTOM]] + [[p, CONTENT_TOP, CONTENT_BOTTOM] for p in range(p0 + 1, p1)] + [[p1, CONTENT_TOP, y1]]


def close_open(post, comment, until=None):
    """A comment whose date line fell into a page break: keep it, with no date, ending at its last line, or at the
    line that closes it (the next post or "Write a comment") so a picture below its last line is kept."""
    if post is not None and comment and comment.get('last'):
        comment['date'] = ''
        comment['end'] = comment['last']
        if until and tuple(until) > tuple(comment['last']):
            comment['end'] = tuple(until)
        comment['segments'] = segments(comment['start'], comment['end'])
        keep_refs(comment)
        post['comments'].append(comment)
        return comment['end']
    return None


def when(date):
    from datetime import datetime
    m = re.match(r'(\w+ \d{1,2}, \d{4})', date or '')
    return datetime.strptime(m[1], '%B %d, %Y') if m else None


def pasted_relative(stream, i):
    """A relative time ("6 minutes ago · Like") followed in its thread by an older date was pasted into a comment
    (a copied Facebook exchange), not printed as a comment's date: comments print oldest first."""
    from datetime import timedelta
    if re.match(rf'^({MONTHS}) ', stream[i]['text']) or not PRINTED:
        return False
    for l in stream[i + 1:i + 400]:
        if l['text'].startswith('Write a comment'):
            return False
        if 314.5 <= l['x0'] <= 316.5 and COMMENT_DATE.match(l['text']) and re.match(rf'^({MONTHS}) ', l['text']):
            # The next real date can't be much earlier than this one ("6 mins" then "June 11 at 6:39pm").
            d, est = when_time(canon_date(l['text'])[0]), when_time(canon_date(stream[i]['text'])[0])
            return bool(d and est) and d < est - timedelta(hours=8)
    return False


def when_time(date):
    from datetime import datetime
    m = re.match(r'(\w+ \d{1,2}, \d{4})(?: at (\d{1,2}:\d\d[ap]m))?', date or '')
    if not m:
        return None
    return datetime.strptime(f'{m[1]} {m[2] or "11:59pm"}', '%B %d, %Y %I:%M%p')


def printed_at(path):
    from datetime import datetime
    m = re.search(r'>(\d\d/\d\d/\d{4})</word>\s*<word[^>]*>(\d\d:\d\d)</word>\s*<word[^>]*>([AP]M)</word>', open(path, encoding='utf-8').read(2000000))
    return datetime.strptime(f'{m[1]} {m[2]} {m[3]}', '%m/%d/%Y %I:%M %p') if m else None


def keep_refs(comment):
    """Each line's words and boxes, kept only for a comment across a page break: a name line inside it (read by its
    colour) is where a second comment, whose start the break swallowed, begins."""
    if len(comment['segments']) < 2:
        comment.pop('refs', None)


def join_wrapped_likes(stream):
    """A long likes line wraps ("A, B, C and 7 others like" / "this.", "A, B and 8 others" / "like this."): join the
    pieces so the line reads as the likes line (x ~299), also where it ends a post whose action line was lost."""
    out = []
    for l in stream:
        prev = out[-1] if out else None
        if (prev and prev['page'] == l['page'] and 295 <= prev['x0'] < 305 and abs(prev['x0'] - l['x0']) < 4
                and -2 < l['y0'] - prev['y1'] < 6 and not LIKES.search(prev['text'])
                and (l['text'] in ('this.', 'this') or LIKES.search(l['text']))):
            out[-1] = dict(prev, text=prev['text'] + ' ' + l['text'], y1=l['y1'], x1=max(prev['x1'], l['x1']),
                           boxes=prev['boxes'] + l['boxes'])
            continue
        out.append(l)
    return out


def parse(path):
    """Items tile the feed: a post runs from its header to its Like · Comment · Share line; each comment runs from
    the end of the item before it to its date line, so pictures and page breaks inside it are kept."""
    stream = join_wrapped_likes([l for _, lines in read_pages(path) for l in lines])
    posts, post, comment, state, cursor = [], None, None, None, None
    i = 0
    while i < len(stream):
        l = stream[i]
        t = l['text']
        nxt = stream[i + 1] if i + 1 < len(stream) else None
        # Post header: the poster's name beside the avatar (x ~321), then the date on the next line at the same x.
        # A deactivated account's name prints in black (x ~331, "Happyface Sid"), and a page's or app's post has an
        # icon before the name ("[icon] Eye Amione via Arthur Cristian", x ~331), over a date at x ~321. A shared
        # post's box is indented further (x ~325) and can hold a name and a date too: not a header. Neither is an
        # event card's date (no year, after the printout).
        if (316 <= l['x0'] <= 340 and nxt and 316 <= nxt['x0'] <= 323.5
                and -4 < l['x0'] - nxt['x0'] < (14 if l['x0'] > 328 else 4)
                and is_post_date(nxt['text'])
                and not COMMENT_DATE.match(t) and not t.startswith('Write a comment')):
            header, top = t, l
            # A long header wraps ("Scott Duncan shared Australians SAY NO's" / "photo."): join the line above.
            prev = stream[i - 1] if i else None
            if prev and prev['page'] == l['page'] and abs(prev['x0'] - l['x0']) < 4 and 0 < l['y0'] - prev['y1'] < 6:
                header, top = prev['text'] + ' ' + t, prev
                if post is not None and state == 'body' and post['text'] and post['text'][-1] == prev['text']:
                    post['text'].pop()
            close_open(post, comment, (top['page'], top['y0'] - 8))
            date, approx = canon_date(nxt['text'])
            post = {'header': header, 'date': date, 'approx': approx, 'text': [], 'comments': [], 'likes': None,
                    'start': (top['page'], max(CONTENT_TOP, top['y0'] - 8))}
            posts.append(post)
            state, comment = 'body', None
            i += 2
            continue
        if post is not None and state == 'body':
            # The post ends at its Like · Comment · Share line. That line is sometimes lost at a page break, so its
            # likes line, its first comment (x ~315) or "Write a comment" also end it.
            if ACTIONS.match(t):
                end = (l['page'], l['y1'] + 3)
            elif (LIKES.search(t) and l['x0'] < 310) or 314.5 <= l['x0'] <= 316.5 or t.startswith('Write a comment'):
                end = (l['page'], l['y0'] - 2)
                i -= 1  # read this line again as part of the comments
            else:
                end = None
                post['text'].append(t)
                post.setdefault('x1', []).append(round(l['x1'], 1))
            if end:
                post['end'] = end
                post['segments'] = segments(post['start'], end)
                cursor = end
                state = 'after'
            i += 1
            continue
        # A post whose name line was lost at a page break: only its date line (x ~321) is left after the last post.
        # (Comment dates print at x ~315; 2014 post dates carry a time, so they look like comment dates.)
        if state is None and 318 <= l['x0'] <= 323.5 and is_post_date(t):
            date, approx = canon_date(t)
            post = {'header': '', 'date': date, 'approx': approx, 'text': [], 'comments': [], 'likes': None,
                    'start': (l['page'], max(CONTENT_TOP, l['y0'] - 24))}
            posts.append(post)
            state, comment = 'body', None
            i += 1
            continue
        if t.startswith('Write a comment'):
            close_open(post, comment, (l['page'], l['y0'] - 2))
            # A post whose header a page break swallowed starts below this box, not above it.
            cursor = (l['page'], min(CONTENT_BOTTOM, l['y1'] + 10))
            state, comment = None, None
            i += 1
            continue
        if post is None or state is None:
            # Content after "Write a comment" with no header: the post's name and date lines fell into a page break.
            # Start a post without them; its text and its comments' times still identify it.
            if cursor is not None and not t.startswith('Write a comment'):
                post = {'header': '', 'date': '', 'text': [], 'comments': [], 'likes': None, 'start': cursor}
                posts.append(post)
                state, comment = 'body', None
                # Only the name was lost: the date line comes first (at the body's x when the avatar is cut off).
                if 280 <= l['x0'] < 290 and is_post_date(t):
                    post['date'], post['approx'] = canon_date(t)
                    i += 1
                continue  # read this line again as the post's first line
            i += 1
            continue
        else:
            if comment is None and l['x0'] < 310 and (LIKES.search(t) or re.match(r'^\d+ shares?$', t)):
                # Left of the comments' column, above the first comment: the likes line (join_wrapped_likes() joined
                # it when it wrapped) and the share count under it ("2 shares").
                if not re.match(r'^\d+ shares?$', t):
                    post['likes'] = t
                cursor = (l['page'], l['y1'] + 2)
            elif re.match(r'^View (\d+ more|all \d+) comments?', t) or t.startswith('View previous comments'):
                cursor = (l['page'], l['y1'] + 2)
            else:
                if comment is None:
                    comment = {'lines': [], 'start': cursor, 'first': {'page': l['page'], 'boxes': l['boxes'], 'text': t}}
                comment['lines'].append(t)
                comment.setdefault('refs', []).append({'page': l['page'], 'boxes': l['boxes'], 'text': t})
                comment.setdefault('x1', []).append(round(l['x1'], 1))
                comment['last'] = (l['page'], l['y1'] + 3)
                if is_comment_date(t) and not pasted_relative(stream, i):
                    # The date line is kept as text the other scripts read (canonical form, with the year).
                    comment['printed_date'] = t
                    t, approx = canon_date(t)
                    comment['lines'][-1] = t
                    comment['refs'][-1]['text'] = t
                    if approx is not None:
                        comment['approx'] = approx
                    comment['date'] = t
                    comment['end'] = (l['page'], l['y1'] + 3)
                    comment['segments'] = segments(comment['start'], comment['end'])
                    keep_refs(comment)
                    cursor = comment['end']
                    post['comments'].append(comment)
                    comment = None
        i += 1
    for p in posts:
        unpaste(p)
    return [p for p in posts if 'segments' in p]


def unpaste(post):
    """Comments print in the order they were written, so a date out of that order belongs to text pasted into a
    comment (a copied exchange with its "May 24 at 3:13pm · Like" lines): join that item to the next one. The dates
    in order are the longest run that never goes back in time; an edited comment (it shows the time of its edit)
    and a relative time are left out of the reckoning."""
    import bisect
    from datetime import datetime
    def t(c):
        m = re.match(r'(\w+ \d{1,2}, \d{4}) at (\d{1,2}:\d\d[ap]m)', c.get('date') or '')
        if not m or c.get('approx') is not None or 'Edited' in c['date']:
            return None
        return datetime.strptime(f'{m[1]} {m[2]}', '%B %d, %Y %I:%M%p')
    cs = post['comments']
    timed = [(k, t(c)) for k, c in enumerate(cs) if t(c)]
    # Longest non-decreasing subsequence (patience sorting), keeping back-pointers.
    tails, tail_idx, back = [], [], {}
    for j, (k, tk) in enumerate(timed):
        pos = bisect.bisect_right(tails, tk)
        back[j] = tail_idx[pos - 1] if pos else None
        if pos == len(tails):
            tails.append(tk); tail_idx.append(j)
        else:
            tails[pos], tail_idx[pos] = tk, j
    keep, j = set(), tail_idx[-1] if tail_idx else None
    while j is not None:
        keep.add(timed[j][0]); j = back[j]
    pasted = [k for k, _ in timed if k not in keep]
    for k in sorted(pasted, reverse=True):
        if k + 1 >= len(cs):
            continue
        a, b = cs[k], cs[k + 1]
        lines = a['lines'][:-1] + [a.get('printed_date', a['lines'][-1])]
        joined = dict(b, lines=lines + b['lines'], x1=a.get('x1', []) + b.get('x1', []), start=a['start'],
                      first=a['first'], segments=segments(a['start'], b['end']))
        if 'refs' in a or 'refs' in b:
            refs = [dict(r) for r in a.get('refs', [])]
            if refs:
                refs[-1]['text'] = lines[-1]
            joined['refs'] = refs + b.get('refs', [])
        keep_refs(joined)
        cs[k:k + 2] = [joined]


if __name__ == '__main__':
    # Usage: parse.py <bbox.html> <parsed.json> [<last header page>]
    # Pages after <last header page> are the next volume's (the printout runs newest first: a post that begins at the
    # end of a volume ends at the start of the next one down, whose pages are appended to the stream), or the same
    # printed page as the next volume's first page. Posts whose header is printed there belong to that volume.
    PRINTED = printed_at(sys.argv[1])
    print('printed', PRINTED)
    posts = parse(sys.argv[1])
    if len(sys.argv) > 3:
        last = int(sys.argv[3])
        dropped = [p for p in posts if p['segments'][0][0] > last]
        posts = [p for p in posts if p['segments'][0][0] <= last]
        for p in dropped:
            print(f"left to the next volume: page {p['segments'][0][0]} {p['header'][:60]!r} {p['date']!r}, {len(p['comments'])} comments")
    json.dump(posts, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
    n_comments = sum(len(p['comments']) for p in posts)
    print(f'{len(posts)} posts, {n_comments} comments')
