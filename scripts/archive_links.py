#!/usr/bin/env python3
"""Find archived copies of the outside links in the volumes (standard library only).

For every post's link and every web address written in a post or comment, this asks two archives whether they hold a
copy: the Wayback Machine (web.archive.org) and archive.today (archive.ph). It keeps the copy closest to the date of
the post or comment. The site shows an "Archived link" only for a copy an archive has confirmed
(partials/archive-links.html); an address with no confirmed copy shows nothing.

Run it from the site folder, on a computer where https://archive.ph opens normally in a browser:

    python3 scripts/archive_links.py

It asks slowly (one request every few seconds per archive), so a full run takes hours. It saves as it goes, so it can
be stopped with Ctrl+C and run again to carry on: answers already received are kept, and only addresses whose check
failed (a timeout, an error, a refusal or a CAPTCHA) are asked again. If an archive keeps refusing, the script stops
asking that archive for this run and says so. To check everything again from scratch, delete scripts/archive-checks.json.

Files written:
  scripts/archive-checks.json  every answer received (found or none), so a run can carry on where the last stopped
  data/archives.json           the confirmed copies the site shows, by post or comment ID (rebuilt from the above)

The record itself is never changed: content/ is only read.
"""

import email.utils
import http.client
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
CONTENT = SITE / 'content'
CHECKS = SITE / 'scripts' / 'archive-checks.json'
SITE_DATA = SITE / 'data' / 'archives.json'

USER_AGENT = 'TTFL-archive-check/1.0 (+https://rygoy.github.io/)'
TIMEOUT = 60             # seconds to wait for an answer
DELAY = {'wayback': 2, 'archive_today': 6}   # seconds between requests to each archive
RETRY_WAITS = (30, 120)  # after a failed request, wait this long and ask again
GIVE_UP_AFTER = 5        # failed checks in a row before an archive is left alone for this run

# --- Reading addresses from the record ---------------------------------------------------------------------------

TOKEN = re.compile(r'https?://\S+', re.I)
# A second address pasted straight after the first ("...watch?v=SXn2QVipK2ohttp://www.youtube..."). An address
# inside another one follows "=" or "/" (imgres?imgurl=http://..., web.archive.org/web/<time>/http://...).
GLUED = re.compile(r'(?<=[A-Za-z0-9])(?=https?://)', re.I)
NOT_IN_ADDRESS = re.compile(r'[<>"“”]')      # characters that never belong to a web address
SHORTENED = re.compile(r'\.\.\.|…')           # "..." or "…": the address may have been shortened for display
TRAILING = '.,;:!?\'#'                        # punctuation after an address, not part of it
BRACKETS = {')': '(', ']': '[', '}': '{'}
HOST = re.compile(r'^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]+)$')
# The same videos partials/youtube-embeds.html shows as thumbnails under a comment.
YOUTUBE_EMBED = re.compile(r'(?i)(?:youtube\.com/(?:\S*?[?&#/]v=|embed/|v/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})')

# Sites left out. Facebook: the Wayback Machine's copies of its pages are its log-in or security check page (saved
# with status 200, so they look like real copies). The archives: the address is already an archived copy.
FACEBOOK = ('facebook.com', 'fb.com', 'fb.me', 'fbcdn.net')
ARCHIVES = ('web.archive.org', 'wayback.archive.org', 'archive.today', 'archive.is', 'archive.ph', 'archive.li',
            'archive.md', 'archive.vn', 'archive.fo')


def host_of(address):
    try:
        return (urllib.parse.urlsplit(address).hostname or '').lower()
    except ValueError:
        return ''


def on_site(host, sites):
    return any(host == s or host.endswith('.' + s) for s in sites)


def tidy(piece):
    """An address as written in a message -> (address to show, [addresses to look up]) or (None, reason)."""
    piece = NOT_IN_ADDRESS.split(piece, 1)[0]
    if SHORTENED.search(piece):
        return None, 'shortened'
    address, tail = piece, ''
    while address:
        last = address[-1]
        if last in TRAILING or (last in BRACKETS and address.count(last) > address.count(BRACKETS[last])):
            tail = last + tail
            address = address[:-1]
        else:
            break
    if not HOST.match(host_of(address)):
        return None, 'unclear'
    # A full stop that touches an address is usually the end of the sentence, but can be part of it
    # (en.wikipedia.org/wiki/Q.E.D.). Look it up as written first: an address with a stray full stop has no copy
    # (the Wayback Machine's copies are of pages saved with status 200), so then it is looked up without the stop.
    if tail and set(tail) == {'.'}:
        return address, [address + tail, address]
    return address, [address]


def without_fragment(address):
    return address.split('#', 1)[0]


def entry_addresses(entry):
    """[(field, address, lookups)] for one post or comment, plus [(reason, address)] for those left out."""
    found, skipped, seen = [], [], set()

    def add(field, address, lookups):
        host = host_of(address)
        if on_site(host, FACEBOOK):
            skipped.append(('facebook', address))
        elif on_site(host, ARCHIVES):
            skipped.append(('already archived', address))
        else:
            lookups = list(dict.fromkeys(without_fragment(u) for u in lookups))
            if lookups[0] in seen:
                return
            seen.add(lookups[0])
            found.append((field, address, lookups))

    link = (entry.get('link') or '').strip()
    if TOKEN.fullmatch(link):
        if HOST.match(host_of(link)):
            add('link', link, [link])
        else:
            skipped.append(('unclear', link))

    is_comment = bool(entry.get('post_id'))
    for token in TOKEN.findall(entry.get('message') or ''):
        for piece in GLUED.split(token):
            if not piece:
                continue
            if is_comment and YOUTUBE_EMBED.search(piece):
                skipped.append(('video shown', piece))
                continue
            address, lookups = tidy(piece)
            if address is None:
                skipped.append((lookups, piece))
            else:
                add('message', address, lookups)
    return found, skipped


def read_record():
    """{entry id: {'date': datetime, 'file': path, 'addresses': [...]}} and the addresses left out."""
    entries, skipped = {}, []
    for path in sorted(CONTENT.glob('vol_*/*/*.md')):
        entry = json.loads(path.read_text(encoding='utf-8'))
        if 'id' not in entry or 'created_time' not in entry:
            continue
        addresses, left_out = entry_addresses(entry)
        rel = path.relative_to(SITE).as_posix()
        skipped += [(reason, address, rel) for reason, address in left_out]
        if addresses:
            date = datetime.strptime(entry['created_time'], '%Y-%m-%dT%H:%M:%S%z')
            entries[entry['id']] = {'date': date, 'file': rel, 'addresses': addresses}
    return entries, skipped


# --- Asking the archives -----------------------------------------------------------------------------------------

class Refused(Exception):
    """The archive did not answer the question (error, timeout, refusal or CAPTCHA). Ask again on a later run."""


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.headers.get('Content-Type', ''), response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get('Content-Type', ''), error.read().decode('utf-8', 'replace')
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, ValueError) as error:
        raise Refused(f'no answer ({error})') from error


def ask_wayback(address, stamp):
    """The Wayback Machine's copy of address closest to stamp (YYYYMMDDhhmmss), saved with status 200."""
    query = urllib.parse.urlencode({'url': address, 'output': 'json', 'fl': 'timestamp,original',
                                    'filter': 'statuscode:200', 'closest': stamp, 'sort': 'closest', 'limit': '1'})
    status, _, body = fetch('https://web.archive.org/cdx/search/cdx?' + query)
    if status == 403 and wayback_answers():
        # The Wayback Machine shows no copies of some sites ("excluded from the Wayback Machine", such as Dropbox)
        # and refuses to search them. It answers other searches, so the refusal is about this address.
        return {'status': 'none', 'note': 'excluded from the Wayback Machine'}
    if status != 200:
        raise Refused(f'HTTP {status}')
    try:
        rows = json.loads(body) if body.strip() else []
    except ValueError as error:
        raise Refused('unreadable answer') from error
    if len(rows) < 2:
        return {'status': 'none'}
    timestamp, original = rows[1][0], rows[1][1]
    if not re.fullmatch(r'\d{14}', timestamp):
        raise Refused('unreadable answer')
    return {'status': 'found', 'url': f'https://web.archive.org/web/{timestamp}/{original}', 'time': timestamp}


_control = {'time': 0.0, 'answers': False}


def wayback_answers():
    """Whether the Wayback Machine is answering searches from this computer: it finds its copies of example.com.
    Asked at most every ten minutes."""
    if time.monotonic() - _control['time'] > 600:
        time.sleep(DELAY['wayback'])
        try:
            status, _, body = fetch('https://web.archive.org/cdx/search/cdx?url=example.com&output=json&fl=timestamp&limit=1')
            _control['answers'] = status == 200 and len(json.loads(body)) > 1
        except (Refused, ValueError):
            _control['answers'] = False
        _control['time'] = time.monotonic()
    return _control['answers']


LINK_ENTRY = re.compile(r'<([^>]*)>((?:\s*;\s*[A-Za-z]+\s*=\s*"[^"]*")*)')
LINK_PARAM = re.compile(r'([A-Za-z]+)\s*=\s*"([^"]*)"')


def ask_archive_today(address):
    """Every archive.today copy of address, from its TimeMap (RFC 7089), as [[YYYYMMDDhhmmss, copy address]]."""
    # The address goes into the path as written; only characters that cannot appear in a URL are escaped.
    status, kind, body = fetch('https://archive.ph/timemap/' + urllib.parse.quote(address, safe="%/:=&?~+!$,;'@()*[]"))
    if status == 404:
        return {'status': 'none'}
    if status != 200:
        raise Refused(f'HTTP {status}')
    if 'link-format' not in kind and 'rel="original"' not in body:
        raise Refused('not a TimeMap (a CAPTCHA or error page?)')
    copies = []
    for target, params in LINK_ENTRY.findall(body):
        params = {k.lower(): v for k, v in LINK_PARAM.findall(params)}
        if 'memento' in params.get('rel', '').split() and 'datetime' in params:
            try:
                when = email.utils.parsedate_to_datetime(params['datetime']).astimezone(timezone.utc)
            except (TypeError, ValueError):
                continue
            if target.startswith('https://') or target.startswith('http://'):
                copies.append([when.strftime('%Y%m%d%H%M%S'), target])
    if not copies:
        if 'rel="original"' in body:
            return {'status': 'none'}
        raise Refused('unreadable TimeMap')
    return {'status': 'found', 'copies': sorted(copies)}


def stamp_of(date):
    return date.astimezone(timezone.utc).strftime('%Y%m%d%H%M%S')


def iso_date(stamp):
    return f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}'


def closest(copies, stamp):
    target = datetime.strptime(stamp, '%Y%m%d%H%M%S')
    return min(copies, key=lambda c: abs(datetime.strptime(c[0], '%Y%m%d%H%M%S') - target))


# --- Running the checks ------------------------------------------------------------------------------------------

def load_checks():
    if CHECKS.exists():
        checks = json.loads(CHECKS.read_text(encoding='utf-8'))
    else:
        checks = {}
    checks.setdefault('wayback', {})
    checks.setdefault('archive_today', {})
    return checks


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def copies_for(entries, checks):
    """The site data: for each entry, the addresses with at least one confirmed copy, and those copies.

    An address read in more than one way (with and without a final full stop) uses the first reading with a copy in
    either archive, and is shown as that reading. A later reading is used only once both archives have answered that
    the earlier ones have no copy."""
    shown = {}
    for entry_id, entry in entries.items():
        stamp = stamp_of(entry['date'])
        items = []
        for field, address, lookups in entry['addresses']:
            for lookup in lookups:
                wayback = checks['wayback'].get(f'{lookup} {stamp}')
                today = checks['archive_today'].get(lookup)
                item = {}
                if wayback and wayback['status'] == 'found':
                    item['wayback'] = {'url': wayback['url'], 'date': iso_date(wayback['time'])}
                if today and today['status'] == 'found':
                    when, url = closest(today['copies'], stamp)
                    item['archive_today'] = {'url': url, 'date': iso_date(when)}
                if item:
                    show = address if lookup == without_fragment(address) else lookup
                    items.append({'field': field, 'address': show, **item})
                    break
                if not (wayback and today):
                    break
        if items:
            shown[entry_id] = items
    return shown


def worker(archive, jobs, checks, lock, stop, progress):
    failures = 0
    for number, (key, ask) in enumerate(jobs, 1):
        if stop.is_set():
            return
        for wait in (0,) + RETRY_WAITS:
            if wait and stop.wait(wait):
                return
            try:
                answer = ask()
                break
            except Refused as error:
                answer = error
        if isinstance(answer, Refused):
            failures += 1
            progress(archive, number, len(jobs), f'no answer, will ask again next run ({answer})', key)
            if failures >= GIVE_UP_AFTER:
                progress(archive, number, len(jobs), f'{GIVE_UP_AFTER} failed checks in a row: '
                         'leaving this archive alone for this run. Run the script again later to carry on.', '')
                return
        else:
            failures = 0
            answer['checked'] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            with lock:
                checks[archive][key] = answer
            note = 'none' if answer['status'] == 'none' else 'found'
            progress(archive, number, len(jobs), note, key)
        if stop.wait(DELAY[archive]):
            return


def main():
    entries, skipped = read_record()
    checks = load_checks()

    wayback_jobs, today_jobs, queued = [], [], set()
    for entry in entries.values():
        stamp = stamp_of(entry['date'])
        for _, _, lookups in entry['addresses']:
            for lookup in lookups:
                key = f'{lookup} {stamp}'
                if key not in checks['wayback'] and key not in queued:
                    queued.add(key)
                    wayback_jobs.append((key, lambda a=lookup, s=stamp: ask_wayback(a, s)))
                if lookup not in checks['archive_today'] and lookup not in queued:
                    queued.add(lookup)
                    today_jobs.append((lookup, lambda a=lookup: ask_archive_today(a)))

    total = sum(len(e['addresses']) for e in entries.values())
    print(f'{total} addresses in {len(entries)} posts and comments; {len(skipped)} left out (listed at the end).')
    print(f'To ask: {len(wayback_jobs)} Wayback Machine, {len(today_jobs)} archive.today. Ctrl+C stops; '
          'run again to carry on.\n')

    lock, stop = threading.Lock(), threading.Event()
    printing = threading.Lock()

    def progress(archive, number, count, note, key):
        with printing:
            print(f'{archive:13} {number:>5}/{count:<5} {note:6} {key}', flush=True)

    threads = [threading.Thread(target=worker, args=(name, jobs, checks, lock, stop, progress), daemon=True)
               for name, jobs in (('wayback', wayback_jobs), ('archive_today', today_jobs)) if jobs]

    def save():
        with lock:
            write_json(CHECKS, checks)
            write_json(SITE_DATA, {'_about': 'Archived copies of outside links, by post or comment ID. Written by '
                                   'scripts/archive_links.py from scripts/archive-checks.json; do not edit by hand.',
                                   'entries': copies_for(entries, checks)})

    for thread in threads:
        thread.start()
    try:
        while any(thread.is_alive() for thread in threads):
            for thread in threads:
                thread.join(timeout=30)
            save()
    except KeyboardInterrupt:
        print('\nStopping; saving what has been checked so far...')
        stop.set()
        for thread in threads:
            thread.join(timeout=TIMEOUT + 5)
    save()

    shown = copies_for(entries, checks)
    items = [item for items in shown.values() for item in items]
    print(f'\nShown on the site: {len(items)} archived addresses in {len(shown)} posts and comments '
          f'({sum("wayback" in i for i in items)} Wayback Machine, '
          f'{sum("archive_today" in i for i in items)} archive.today).')
    unanswered = sum(1 for key, _ in wayback_jobs if key not in checks['wayback']) + \
        sum(1 for key, _ in today_jobs if key not in checks['archive_today'])
    if unanswered:
        print(f'{unanswered} checks still need an answer: run the script again later.')
    print('\nLeft out:')
    for reason, address, path in skipped:
        if reason not in ('facebook', 'video shown'):
            print(f'  {reason:16} {address}  ({path})')
    counts = {}
    for reason, _, _ in skipped:
        counts[reason] = counts.get(reason, 0) + 1
    print('  ' + ', '.join(f'{n} {reason}' for reason, n in sorted(counts.items())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
