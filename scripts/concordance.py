#!/usr/bin/env python3
"""Build the TTFL Dictionary concordance: every place each dictionary term appears in the archive.

Usage: python3 scripts/concordance.py <output dir>   (the deploy workflow passes public/concordance)

Reads data/dictionary.json and the posts, comments and articles under content/. A term is found as a whole word
or phrase in any case; an entry's optional "match" list gives the words to look for when the term itself is not
one (for example "Include, Including"), and an empty list leaves the entry out. Writes:

  index.json        {term id: number of occurrences}
  <id>/<n>.json     occurrences in date order, CHUNK per file:
                    [{"u": address, "l": label, "b": text before, "m": match, "a": text after}]

/concordance/ (layouts/_default/concordance.html) reads these files. Standard library only.
"""
import html
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
CHUNK = 500
CONTEXT = 90  # characters of context on each side of a match


def json_front_matter(path):
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text[text.index("{"):text.rindex("}") + 1])
    except ValueError:
        return None


def toml_value(front, key):
    m = re.search(rf'^{key}\s*=\s*"(.*)"\s*$', front, re.M)
    return m.group(1) if m else ""


def article_text(body):
    body = re.sub(r"\{\{[<%].*?[%>]\}\}", " ", body, flags=re.S)       # shortcodes
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<[^>]+>", " ", body)                                 # HTML tags
    body = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", body)               # Markdown links and images
    body = re.sub(r"[*_#>`]+", " ", body)
    return html.unescape(body)


def label_date(value):
    try:
        return datetime.fromisoformat(value[:10]).strftime("%-d %B %Y")
    except ValueError:
        return ""


def documents():
    """Yield (sort key, address, label, text) for every post, comment and article."""
    for vol in sorted(CONTENT.glob("vol_*")):
        index = json_front_matter(vol / "_index.md") or {}
        volume = index.get("Title") or index.get("title") or vol.name
        for post_dir in vol.iterdir():
            if not post_dir.is_dir():
                continue
            base = f"/{vol.name}/{post_dir.name}/".lower()
            for path in post_dir.glob("*.md"):
                m = json_front_matter(path)
                if not m or not m.get("message"):
                    continue
                when = m.get("created_time", "")
                address = base if path.name == "_index.md" else f"{base}#entry-{m.get('id', '')}"
                label = " · ".join(x for x in (volume, m.get("from_name") or "Post", label_date(when)) if x)
                yield when, address, label, m["message"]
    for path in sorted(CONTENT.glob("articles/*/*.md")):
        if path.name == "_index.md":
            continue
        parts = path.read_text(encoding="utf-8").split("+++", 2)
        if len(parts) < 3:
            continue
        front, body = parts[1], parts[2]
        address = f"/articles/{path.parent.name}/{path.stem}/".lower()
        label = " · ".join(x for x in ("Article", toml_value(front, "author"), toml_value(front, "title")) if x)
        # Undated articles sort after everything dated.
        yield toml_value(front, "date") or "9999", address, label, article_text(body)


def snippet(text, start, end):
    before = text[max(0, start - CONTEXT):start]
    after = text[end:end + CONTEXT]
    if start > CONTEXT:
        before = "…" + before.split(" ", 1)[-1] if " " in before else "…" + before
    if end + CONTEXT < len(text):
        after = after.rsplit(" ", 1)[0] + "…" if " " in after else after + "…"
    return before, text[start:end], after


def main(out_dir):
    entries = json.loads((ROOT / "data" / "dictionary.json").read_text(encoding="utf-8"))
    terms = []
    for e in entries:
        words = e.get("match", [e["term"]])
        if not words:
            continue
        alternatives = sorted((re.escape(w).replace(r"\ ", r"\s+") for w in words), key=len, reverse=True)
        pattern = re.compile(r"(?<!\w)(?:" + "|".join(alternatives) + r")(?!\w)", re.I)
        # Cheap test before the regular expression: the first word of each alternative, lower case.
        needles = {w.lower().split()[0] for w in words}
        terms.append((e["id"], pattern, needles))

    found = {term_id: [] for term_id, _, _ in terms}
    for when, address, label, text in documents():
        text = " ".join(text.split())
        low = text.lower()
        for term_id, pattern, needles in terms:
            if not any(n in low for n in needles):
                continue
            for m in pattern.finditer(text):
                b, match, a = snippet(text, m.start(), m.end())
                found[term_id].append((when, {"u": address, "l": label, "b": b, "m": match, "a": a}))

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    counts = {}
    for term_id, rows in found.items():
        rows.sort(key=lambda r: r[0])
        counts[term_id] = len(rows)
        folder = out / term_id
        folder.mkdir(exist_ok=True)
        for n in range(0, max(len(rows), 1), CHUNK):
            chunk = [r[1] for r in rows[n:n + CHUNK]]
            (folder / f"{n // CHUNK}.json").write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "index.json").write_text(json.dumps(counts, separators=(",", ":")), encoding="utf-8")
    print(f"Concordance: {sum(counts.values())} occurrences of {len(counts)} terms in {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
