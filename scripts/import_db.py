#!/usr/bin/env python3
"""Add the posts that "TTFL DB.db" has and content/vol_*/ lacks, with their comments.

    python3 scripts/import_db.py "<path to TTFL DB.db>" [--dry-run]

"TTFL DB.db" is a later export of the group (one SQLite table, 462493170453287_group, January 2013 to March 2018:
id, ref, date, author, message, kind, likes, comments). A post's ref is its permalink; a comment's ref is its post's
id; a reply's (kind subcomment*) is its comment's id. Dates are UTC, as in the site's export.

Posts and comments are written as the site's own export writes them (CLAUDE.md, Content), with "imported" naming the
database. The database keeps less than that export: messages lose their line breaks, a link, photo or video post's
address is appended to its message as " [address]" (taken back out here into "link"), and there is no link title,
caption, description, user ID or last-update time, so those fields are left empty. Replies are not imported: the site
shows none. Posts go in the volume for their quarter (UTC); a post from the last day of an existing volume goes in it.
New volumes are created after the last one. Posts the site already has (by id) are left alone, as are their comments.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

GROUP = "462493170453287"
POST_KINDS = {"status", "link", "photo", "video", "music", "note", "event"}
TAIL_LINK = re.compile(r"\s*\[(https?://[^\s\]]+)\]$")
ROMAN = [(10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
SOURCE = "TTFL DB.db"


def roman(n):
    out = ""
    for value, numeral in ROMAN:
        while n >= value:
            out, n = out + numeral, n - value
    return out


def write(path, fields):
    """The export's layout: " {", three-space indents, " }", CRLF line endings, Unicode unescaped."""
    lines = [f"   {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in fields.items()]
    path.write_text(" {\n" + ",\n".join(lines) + "\n }\n", encoding="utf-8", newline="\r\n")


def utc(date):
    return date.replace(" ", "T") + "+0000"


def main(db_path, dry_run):
    content = Path(__file__).resolve().parent.parent / "content"
    volumes = {}  # volume dir -> (first, last) post date, UTC "YYYY-MM-DD"
    have = set()
    for index in content.glob("vol_*/*/_index.md"):
        if index.parent.name.startswith("anthology-"):
            continue
        have.add(index.parent.name)
        day = json.loads(index.read_text(encoding="utf-8"))["created_time"][:10]
        first, last = volumes.get(index.parent.parent.name, (day, day))
        volumes[index.parent.parent.name] = (min(first, day), max(last, day))
    quarter = lambda day: (int(day[:4]), (int(day[5:7]) - 1) // 3)
    # Each existing volume holds one quarter, its first post's (a few run a day or so into the next).
    by_quarter = {quarter(first): name for name, (first, last) in volumes.items()}
    last_volume = max(volumes, key=lambda n: volumes[n][1])
    last_day = volumes[last_volume][1]
    next_number = len(volumes) + 1

    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = db.execute(f'SELECT id, ref, date, author, message, kind FROM "{GROUP}_group"').fetchall()
    posts = sorted((r for r in rows if r[5] in POST_KINDS and r[0] not in have), key=lambda r: r[2])
    new_ids = {r[0] for r in posts}
    comments = [r for r in rows if r[5].startswith("comment") and r[1] in new_ids]

    placed, created = {}, []
    for post_id, _, date, *_ in posts:
        day = date[:10]
        volume = last_volume if day == last_day else by_quarter.get(quarter(day))
        if volume is None and day < last_day:
            sys.exit(f"{post_id} ({day}) falls in no volume")
        if volume is None:
            volume = f"vol_{roman(next_number)}"
            by_quarter[quarter(day)] = volume
            created.append((volume, next_number))
            next_number += 1
        placed[post_id] = volume

    print(f"{len(posts)} posts, {len(comments)} comments; new volumes: {', '.join(v for v, _ in created) or 'none'}")
    for volume in sorted(set(placed.values())):
        print(f"  {volume}: {sum(1 for v in placed.values() if v == volume)} posts")
    if dry_run:
        return

    for volume, number in created:
        (content / volume).mkdir()
        (content / volume / "_index.md").write_text(
            json.dumps({"Title": f"Volume {number}", "weight": number}, indent=3) + "\n", encoding="utf-8")
    for post_id, _, date, author, message, kind in posts:
        message, link = message or "", ""
        if kind != "status" and (m := TAIL_LINK.search(message)):
            message, link = message[: m.start()], m.group(1)
        folder = content / placed[post_id] / post_id
        folder.mkdir()
        write(folder / "_index.md", {
            "id": post_id, "created_time": utc(date), "from_name": author, "message": message, "link": link,
            "name": "", "caption": "", "description": "", "source": "", "type": kind, "place": "None",
            "imported": SOURCE,
        })
    for comment_id, post_id, date, author, message, _ in comments:
        write(content / placed[post_id] / post_id / f"{post_id}-{comment_id}.md", {
            "id": comment_id, "post_id": post_id, "from_name": author, "message": message or "",
            "created_time": utc(date), "imported": SOURCE,
        })


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    if len(args) != 1:
        sys.exit(__doc__)
    main(args[0], "--dry-run" in sys.argv)
