"""Split an Anthology PDF (a printed Facebook group feed) into posts and comments with their positions.

Input: pdftotext -bbox-layout output. Output: JSON list of posts, each with header, text, comments, and the page
segments (page, y0, y1) each item occupies. Coordinates are PDF points; pages are 1008 x 612.
"""
import html, json, re, sys

MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
POST_DATE = re.compile(rf'^({MONTHS}) \d{{1,2}}(, \d{{4}})?( at \d{{1,2}}:\d\d[ap]m)?( ·.*)?$')
COMMENT_DATE = re.compile(rf'^({MONTHS}) \d{{1,2}}(, \d{{4}})? at \d{{1,2}}:\d\d[ap]m( ·.*)?$')
ACTIONS = re.compile(r'^(Un)?[Ll]ike · (Comment|Share)|^Comment · Share|^(Un)?[Ll]ike · Comment')
LIKES = re.compile(r'(likes? this\.?|others like this\.?)$')
MAIN_X0, MAIN_X1, TOP, BOTTOM = 270, 700, 82, 596


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


CONTENT_TOP, CONTENT_BOTTOM = 82, 556


def segments(start, end):
    """Page strips from start (page, y) to end (page, y), crossing page breaks."""
    (p0, y0), (p1, y1) = start, end
    if p0 == p1:
        return [[p0, y0, y1]]
    return [[p0, y0, CONTENT_BOTTOM]] + [[p, CONTENT_TOP, CONTENT_BOTTOM] for p in range(p0 + 1, p1)] + [[p1, CONTENT_TOP, y1]]


def parse(path):
    """Items tile the feed: a post runs from its header to its Like · Comment · Share line; each comment runs from
    the end of the item before it to its date line, so pictures and page breaks inside it are kept."""
    stream = [l for _, lines in read_pages(path) for l in lines]
    posts, post, comment, state, cursor = [], None, None, None, None
    i = 0
    while i < len(stream):
        l = stream[i]
        t = l['text']
        nxt = stream[i + 1] if i + 1 < len(stream) else None
        # Post header: the poster's name beside the avatar (x ~321), then the date on the next line at the same x.
        if (316 <= l['x0'] <= 330 and nxt and abs(nxt['x0'] - l['x0']) < 4 and POST_DATE.match(nxt['text'])
                and not COMMENT_DATE.match(t) and not t.startswith('Write a comment')):
            header, top = t, l
            # A long header wraps ("Scott Duncan shared Australians SAY NO's" / "photo."): join the line above.
            prev = stream[i - 1] if i else None
            if prev and prev['page'] == l['page'] and abs(prev['x0'] - l['x0']) < 4 and 0 < l['y0'] - prev['y1'] < 6:
                header, top = prev['text'] + ' ' + t, prev
                if post is not None and state == 'body' and post['text'] and post['text'][-1] == prev['text']:
                    post['text'].pop()
            post = {'header': header, 'date': nxt['text'], 'text': [], 'comments': [], 'likes': None,
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
        if state is None and 316 <= l['x0'] <= 330 and POST_DATE.match(t) and not COMMENT_DATE.match(t):
            post = {'header': '', 'date': t, 'text': [], 'comments': [], 'likes': None,
                    'start': (l['page'], max(CONTENT_TOP, l['y0'] - 24))}
            posts.append(post)
            state, comment = 'body', None
            i += 1
            continue
        if t.startswith('Write a comment'):
            state, comment = None, None
            i += 1
            continue
        if post is None or state is None:
            i += 1
            continue
        else:
            if comment is None and LIKES.search(t) and l['x0'] < 310:
                post['likes'] = t
                cursor = (l['page'], l['y1'] + 2)
            elif re.match(r'^View \d+ more comments?', t) or t.startswith('View previous comments'):
                cursor = (l['page'], l['y1'] + 2)
            else:
                if comment is None:
                    comment = {'lines': [], 'start': cursor, 'first': {'page': l['page'], 'boxes': l['boxes'], 'text': t}}
                comment['lines'].append(t)
                comment.setdefault('x1', []).append(round(l['x1'], 1))
                if COMMENT_DATE.match(t):
                    comment['date'] = t
                    comment['end'] = (l['page'], l['y1'] + 3)
                    comment['segments'] = segments(comment['start'], comment['end'])
                    cursor = comment['end']
                    post['comments'].append(comment)
                    comment = None
        i += 1
    return [p for p in posts if 'segments' in p]


if __name__ == '__main__':
    posts = parse(sys.argv[1])
    json.dump(posts, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
    n_comments = sum(len(p['comments']) for p in posts)
    print(f'{len(posts)} posts, {n_comments} comments')
