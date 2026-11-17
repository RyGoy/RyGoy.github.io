#!/usr/bin/env python3
"""Builds the generated parts of the beginners' guide (guide/, an Obsidian vault), and checks its quotes.

    python3 scripts/guide_build.py           # write guide/terms/ and guide/sources/, then check the quotes
    python3 scripts/guide_build.py check     # only check the quotes

The guide's lessons (guide/lens/*.md) are written by hand. This script writes the rest from the site's own files, so
running it again never touches a lesson:

  guide/terms/<id>.md     one note per term in data/dictionary.json: its definitions, with links to where they were
                          written, the lessons that teach it (their `terms:`), and Scott Duncan's clearest uses of it.
  guide/sources/<lesson>.md
                          for each lesson, Scott Duncan's posts, comments and articles that best match its `search:`
                          words, ranked, each with the question it answered: the candidates to quote from.

Then it checks every quote in the lessons: a blockquote in the form

    > "Words, exactly as written … more words from later in the same text."
    > — [Scott Duncan, Volume 3, 4 July 2013](https://thetenderforlaw.com/vol_iii/<post>/#entry-<comment>)

must be found, word for word (spacing and curly quotes aside; "…" marks a cut), in the post, comment or article that
its link names. A failed check exits with status 1 and names the lesson and the quote. Standard library only.
"""
import html
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
GUIDE = ROOT / "guide"
SITE = "https://thetenderforlaw.com"
SCOTT = "Scott Duncan"
# Whose words the lessons quote: Scott Duncan, and Chris Schulte, who wrote the archive's accounting. Term notes quote
# Scott Duncan only.
VOICES = [SCOTT, "Chris Schulte"]
TOP_SOURCES = 25  # candidates listed per lesson
TOP_USES = 3  # Scott's uses shown per term
EXCERPT = 700  # characters of a long text shown around its best match


def json_front_matter(path):
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text[text.index("{"):text.rindex("}") + 1])
    except ValueError:
        return None


def nice_date(value):
    try:
        return datetime.fromisoformat(value[:10]).strftime("%-d %B %Y")
    except ValueError:
        return ""


def article_text(body):
    body = re.sub(r"\{\{[<%].*?[%>]\}\}", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", body)
    body = re.sub(r"[*_#>`]+", " ", body)
    return html.unescape(body)


def load():
    """Every text on the site that can be quoted, by its address, and Scott Duncan's own, with their context."""
    texts = {}  # address -> text (everything, so a quote of anyone can be checked)
    scott = []  # the voices' texts: {author, address, label, date, kind, text, question}
    for vol in sorted(CONTENT.glob("vol_*")):
        index = json_front_matter(vol / "_index.md") or {}
        volume = index.get("Title") or index.get("title") or vol.name
        for post_dir in vol.iterdir():
            if not post_dir.is_dir():
                continue
            base = f"/{vol.name}/{post_dir.name}/".lower()
            post = json_front_matter(post_dir / "_index.md") or {}
            comments = []
            for path in post_dir.glob("*.md"):
                if path.name == "_index.md":
                    continue
                c = json_front_matter(path)
                if c and c.get("message"):
                    comments.append(c)
            comments.sort(key=lambda c: c.get("created_time", ""))
            if post.get("message"):
                texts[base] = post["message"]
                if post.get("from_name") in VOICES:
                    scott.append({"author": post["from_name"], "address": base, "label": f"{volume}, {nice_date(post.get('created_time', ''))}",
                                  "date": post.get("created_time", ""), "kind": "post", "text": post["message"],
                                  "question": ""})
            for i, c in enumerate(comments):
                address = f"{base}#entry-{c.get('id', '')}"
                texts[address] = c["message"]
                if c.get("from_name") not in VOICES:
                    continue
                # The question it answered: the last comment before it by someone else, else the post.
                before = next((p for p in reversed(comments[:i]) if p.get("from_name") != c["from_name"]), None)
                asked = (f"{before['from_name']}: {before['message']}" if before
                         else f"The post: {post.get('message', '')}")
                scott.append({"author": c["from_name"], "address": address,
                              "label": f"{volume}, {nice_date(c.get('created_time', ''))}",
                              "date": c.get("created_time", ""), "kind": "comment", "text": c["message"],
                              "question": asked})
    for path in sorted(CONTENT.glob("articles/*/*.md")):
        if path.name == "_index.md":
            continue
        parts = path.read_text(encoding="utf-8").split("+++", 2)
        if len(parts) < 3:
            continue
        address = f"/articles/{path.parent.name}/{path.stem}/".lower()
        text = article_text(parts[2])
        texts[address] = text
        author = re.search(r'^author\s*=\s*"(.*)"', parts[1], re.M)
        if author and author.group(1) in VOICES:
            title = re.search(r'^title\s*=\s*"(.*)"', parts[1], re.M)
            date = re.search(r'^date\s*=\s*"(.*)"', parts[1], re.M)
            scott.append({"author": author.group(1), "address": address,
                          "label": f"Article: {title.group(1) if title else path.stem}",
                          "date": date.group(1) if date else "", "kind": "article", "text": text, "question": ""})
    return texts, scott


def pattern(words):
    """One regex for a list of words or phrases, whole words, any case; a word ending in * matches its stem."""
    parts = []
    for w in words:
        stem = w.endswith("*")
        w = re.escape(w.rstrip("*")).replace(r"\ ", r"\s+")
        parts.append(rf"(?<![\w]){w}{r'\w*' if stem else ''}(?![\w])")
    return re.compile("|".join(parts), re.I)


def excerpt(text, regex):
    text = text.strip()
    if len(text) <= EXCERPT:
        return text
    hits = [m.start() for m in regex.finditer(text)]
    # The window with the most matches.
    best = max(hits, key=lambda h: sum(1 for x in hits if h <= x < h + EXCERPT)) if hits else 0
    start = max(0, best - 80)
    return ("…" if start else "") + text[start:start + EXCERPT].strip() + "…"


def one_line(text, limit=300):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def quote_block(text):
    return "\n".join("> " + line if line.strip() else ">" for line in text.splitlines())


def rank(entries, regex):
    """Entries that use the words, best first: more of the different words, then more uses, in a readable length."""
    scored = []
    for e in entries:
        found = sorted({re.sub(r"\s+", " ", m.group(0).lower()) for m in regex.finditer(e["text"])})
        if not found:
            continue
        uses = len(regex.findall(e["text"]))
        length = len(e["text"])
        fit = 1.0 if 150 <= length <= 3000 else 0.6 if length > 3000 else 0.3
        scored.append(dict(e, score=(len(found) * 3 + min(uses, 10)) * fit, found=found))
    return sorted(scored, key=lambda e: (-e["score"], e["date"]))


def rank_uses(entries, words):
    """For a term note: short passages that say what the word means ("X = …", "X means …", "X is …") first."""
    regex = pattern(words)
    defining = re.compile(rf"(?:{regex.pattern})(?:\s+\w+){{0,2}}\s*(?:=|\b(?:means|is|are|equals)\b)", re.I)
    scored = []
    for e in entries:
        uses = len(regex.findall(e["text"]))
        if not uses:
            continue
        length = len(e["text"])
        fit = 1.0 if 60 <= length <= 900 else 0.5 if length <= 2500 else 0.2
        scored.append(dict(e, score=((4 if defining.search(e["text"]) else 0) + min(uses, 3)) * fit))
    return sorted(scored, key=lambda e: (-e["score"], e["date"]))


def lessons():
    """The hand-written lessons: their file, title and front matter lists."""
    out = []
    for path in sorted((GUIDE / "lens").glob("*.md")):
        if path.name == "_index.md":  # the path's lesson plan, not a lesson
            continue
        text = path.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n", text, re.S)
        front = m.group(1) if m else ""
        def items(key):
            line = re.search(rf"^{key}:\s*\[(.*)\]\s*$", front, re.M)
            return [x.strip().strip('"') for x in line.group(1).split(",") if x.strip()] if line else []
        title = re.search(r"^title:\s*\"?(.*?)\"?\s*$", front, re.M)
        out.append({"path": path, "name": path.stem, "title": title.group(1) if title else path.stem,
                    "terms": items("terms"), "search": items("search"), "text": text})
    return out


def write_sources(scott, lesson_list):
    folder = GUIDE / "sources"
    folder.mkdir(exist_ok=True)
    for lesson in lesson_list:
        if not lesson["search"]:
            continue
        regex = pattern(lesson["search"])
        ranked = rank(scott, regex)
        lines = [
            "---", "generated: true", "---", "",
            f"# Sources for [{lesson['title']}](../lens/{lesson['name']}.md)", "",
            f"Generated by `scripts/guide_build.py`: do not edit. The {len(ranked)} posts, comments and "
            f"articles by {' and '.join(VOICES)} that use the lesson's search words ({', '.join(lesson['search'])}), the best {TOP_SOURCES} "
            "first. Each comes with the question it answered. Quote from these in the lesson, word for word, with the link.",
        ]
        for n, e in enumerate(ranked[:TOP_SOURCES], 1):
            lines += ["", f"## {n}. {e['author']}: [{e['label']}]({SITE}{e['address']}) · {e['kind']} · {len(e['text'])} characters",
                      "", f"Uses: {', '.join(e['found'])}"]
            if e["question"]:
                lines += ["", f"*Answering {one_line(e['question'])}*"]
            lines += ["", quote_block(excerpt(e["text"], regex))]
        (folder / f"{lesson['name']}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_terms(scott, lesson_list):
    folder = GUIDE / "terms"
    folder.mkdir(exist_ok=True)
    taught = defaultdict(list)
    for lesson in lesson_list:
        for term in lesson["terms"]:
            taught[term.lower()].append(lesson)
    entries = json.loads((ROOT / "data" / "dictionary.json").read_text(encoding="utf-8"))
    keep = set()
    for entry in entries:
        words = entry.get("match", [entry["term"]]) + entry.get("forms", [])
        uses = rank_uses([e for e in scott if e["author"] == SCOTT], words) if words else []
        lines = ["---", f"term: {json.dumps(entry['term'])}", "generated: true"]
        if entry.get("forms"):
            lines.append(f"aliases: [{', '.join(json.dumps(f.title()) for f in entry['forms'])}]")
        lines += ["---", "", f"# {entry['term']}", ""]
        lessons_here = taught.get(entry["term"].lower(), [])
        if lessons_here:
            lines.append("**Taught in:** " + ", ".join(f"[{l['title']}](../lens/{l['name']}.md)" for l in lessons_here))
            lines.append("")
        lines += ["## Definitions", ""]
        if not entry["definitions"]:
            lines.append("No definition yet.")
        for d in entry["definitions"]:
            source = f"[{d.get('where', '')}{', ' + d['date'] if d.get('date') else ''}]({SITE}{d['url']})" if d.get("url", "").startswith("/") \
                else f"[{d.get('where', 'source')}]({d.get('url', '')})" if d.get("url") else d.get("where", "")
            wex = " (Wex, Cornell's legal dictionary: not the archive's own words)" if d.get("kind") == "wex" else ""
            lines += [quote_block(d["text"].strip()), f"> — {source}{wex}", ""]
        lines += ["## In Scott Duncan's words", ""]
        if uses:
            lines.append(f"He uses it in {len(uses)} posts, comments and articles. Where he says what it means, or uses it most plainly:")
            regex = pattern(words)
            for e in uses[:TOP_USES]:
                lines += ["", quote_block(excerpt(e["text"], regex)), f"> — [{SCOTT}, {e['label']}]({SITE}{e['address']})"]
        else:
            lines.append("He doesn't use it in the archive.")
        if entry.get("match") != []:
            lines += ["", f"Every use, by anyone: [the concordance]({SITE}/concordance/?term={entry['id']})"]
        lines += ["",
                  "Back to [the guide](../README.md)."]
        (folder / f"{entry['id']}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        keep.add(f"{entry['id']}.md")
    for old in folder.glob("*.md"):
        if old.name not in keep:
            old.unlink()


QUOTE = re.compile(r'((?:^>.*\n)+?)^> — \[[^\]]*\]\((https?://[^)]+)\)', re.M)


def normal(text):
    text = html.unescape(text).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


def check(texts, lesson_list):
    failures = []
    count = 0
    for lesson in lesson_list:
        for block, url in QUOTE.findall(lesson["text"]):
            if not url.startswith(SITE):
                continue
            quoted = "\n".join(line[1:].strip() for line in block.splitlines())
            quoted = quoted.strip().strip('"“”')
            count += 1
            source = texts.get(url[len(SITE):].lower())
            if source is None:
                failures.append(f"{lesson['path'].name}: the link names no post, comment or article: {url}")
                continue
            haystack, at = normal(source), 0
            for piece in [p for p in (normal(x) for x in quoted.split("…")) if p]:
                found = haystack.find(piece, at)
                if found < 0:
                    failures.append(f"{lesson['path'].name}: not found in {url}: \"{piece[:80]}\"")
                    break
                at = found + len(piece)
    return count, failures


def main():
    only_check = sys.argv[1:] == ["check"]
    texts, scott = load()
    lesson_list = lessons()
    if not only_check:
        write_terms(scott, lesson_list)
        write_sources(scott, lesson_list)
        print(f"Wrote {len(list((GUIDE / 'terms').glob('*.md')))} term notes and sources for "
              f"{sum(1 for l in lesson_list if l['search'])} lessons, from {len(scott)} texts by {' and '.join(VOICES)}.")
    count, failures = check(texts, lesson_list)
    print(f"Checked {count} quotes in {len(lesson_list)} lessons: {len(failures)} not found.")
    for f in failures:
        print("  " + f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
