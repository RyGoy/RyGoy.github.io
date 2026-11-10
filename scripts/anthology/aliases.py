"""Find the members renamed between the Facebook export and the printout, and write data/anthology_aliases.json
(printed name → export name). The site shows both names on their posts and comments.

A printed name is taken as a rename when it is printed on at least two of the site's posts and comments and at least 80%
of them are by one other export account; or, when it is nobody's name in the export, it is printed once and shares a
word with that account's name. The rest (a name printed on a picture that also holds another member's comment, for example) are
listed as rejected, for review. KNOWN lists renames printed only once with no word in common, checked by hand (same
text and time as the export's comment or post).
Usage: aliases.py <repo>
"""
import collections, glob, json, os, re, sys

repo = sys.argv[1]
norm = lambda s: re.sub(r'[^a-z]', '', (s or '').lower())
export = {}
for f in glob.glob(f'{repo}/content/vol_*/*/*.md'):
    try:
        d = json.loads(open(f, encoding='utf-8').read())
    except Exception:
        continue
    if not str(d.get('id', '')).startswith('anthology-'):
        export[d['id']] = d.get('from_name') or ''
export_names = {norm(n) for n in export.values() if n}

seen = collections.defaultdict(collections.Counter)  # printed name → export names it was printed for
for f in sorted(glob.glob(f'{repo}/data/anthology/v*.json')):
    for key, e in json.load(open(f, encoding='utf-8'))['entries'].items():
        if e.get('name') and export.get(key) and not e.get('partial'):
            seen[e['name']][export[key]] += 1

NAME = re.compile(r"^[^\W\d_][\w'’.-]*( [\w'’.-]+)*$")
shared_word = lambda a, b: {w for w in re.findall(r'\w{3,}', a.lower())} & {w for w in re.findall(r'\w{3,}', b.lower())}
KNOWN = {'Anone Brat': 'Pearl Basso', 'Boom Boom Mauri': 'Mauricio Moz', 'Julian Figiel': 'Carlos Rivera',
         'Shewolf Herrera': 'Nelida Torres-Santiago'}
aliases, rejected = dict(KNOWN), []
for printed, counts in seen.items():
    name, n = counts.most_common(1)[0]
    total = sum(counts.values())
    if norm(name) == norm(printed) or printed in KNOWN:
        continue  # mostly printed as it was exported
    if n >= 2 and n >= 0.8 * total:
        aliases[printed] = name  # also when the new name is in the export (J.P. Alexander's later posts as Jesse)
    elif norm(printed) in export_names:
        rejected.append((printed, dict(counts)))  # another member's name, on a picture that holds their comment
    elif n == total == 1 and NAME.match(printed) and shared_word(printed, name):
        aliases[printed] = name  # printed once, but plainly the same person ("Paul Gough" / "Paul Houseofgough")
    else:
        rejected.append((printed, dict(counts)))
# A name with another's printed name at its start is that name with a tagged name after it ("Mimi O'Collins Pete").
for printed in [p for p in aliases if any(p != q and p.startswith(q + ' ') for q in aliases)]:
    rejected.append((printed, dict(seen[printed])))
    del aliases[printed]

with open(f'{repo}/data/anthology_aliases.json', 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(aliases.items())), f, ensure_ascii=False, indent=1)
    f.write('\n')
print(f'{len(aliases)} renamed members')
for printed, name in sorted(aliases.items(), key=lambda a: -seen[a[0]][a[1]]):
    print(f'  {seen[printed][name]:5d}  {name!r} → {printed!r}')
print(f'{len(rejected)} rejected')
for printed, counts in sorted(rejected, key=lambda r: -sum(r[1].values())):
    print(f'  {printed!r}: {counts}')
