#!/usr/bin/env python3
"""Writes docs/changelog.md: every merged pull request, newest day first, linked to the architecture notes it touches.

    python3 scripts/docs_changelog.py

Reads the pull requests with the GitHub CLI (`gh`, signed in). A pull request is linked to a note when its title has
one of the note's words or phrases, whole (NOTES below); add words there when a title isn't linked to the note it belongs to.
"""
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

REPO = "RyGoy/RyGoy.github.io"
OUT = Path(__file__).resolve().parent.parent / "docs" / "changelog.md"

# Note file (in docs/) -> (its title, words in a pull request's title that link it, lowercase).
NOTES = {
    "hosting.md": ("Hosting", ["cloudflare", "hosting", "outside service", "own machine"]),
    "architecture/build-and-deploy.md": ("Build and deploy", ["deploy", "deploys", "github pages", "workflow", "build", "hugo", "public/", "base url"]),
    "architecture/content-model.md": ("Content model", ["volume", "volumes", "import", "imported", "front matter", "article", "articles", "post", "posts", "comment", "comments"]),
    "architecture/templates.md": ("Templates", ["template", "partial", "layout", "navbar", "sidebar", "breadcrumb"]),
    "architecture/search-and-seo.md": ("Search and SEO", ["search", "pagefind", "seo", "sitemap", "indexnow", "robots", "canonical", "structured data", "preview", "open graph"]),
    "architecture/dictionary-and-concordance.md": ("Dictionary and concordance", ["dictionary", "concordance", "definition", "definitions", "terms", "wex"]),
    "architecture/library.md": ("Library", ["library", "book", "covers", "title & property", "title and property", "maxims", "copyright", "subject", "subjects", "pdf", "bible"]),
    "architecture/commentary.md": ("Commentary", ["commentary", "note", "notes", "question", "questions", "obsidian"]),
    "architecture/telegram-bot.md": ("Telegram bot", ["telegram", "bot"]),
    "architecture/flash-cards.md": ("Flash cards", ["flash card", "flash cards", "flashcards", "deck", "decks", "lemonade", "start here", "debit", "accounting game"]),
    "architecture/flash-card-accounts.md": ("Flash card accounts", ["account", "accounts", "sign in", "reminders"]),
    "architecture/anthology.md": ("Anthology", ["anthology", "printout", "printed", "aliases", "renamed"]),
    "architecture/recovered-records.md": ("Recovered records", ["archived", "archived links", "wayback", "photo", "photos", "recovered", "facebook profile", "profile links", "youtube"]),
    "architecture/design-and-themes.md": ("Design and themes", ["theme", "themes", "carousel", "shader", "dark", "sepia", "light", "saber", "blade", "ripple", "musical recap", "webamp", "goat", "goats", "live sign", "emblem", "emblems", "animation", "css", "colour", "colours", "color", "hero", "seal", "font", "favicon", "crucifix", "helmet", "jolly roger", "footer", "posters", "poster", "cobra", "tartan", "masthead", "shield", "penguin", "stonework", "ripples", "audio", "share button"]),
    "architecture/scripts.md": ("Scripts", ["script", "python"]),
}


def main():
    prs = json.loads(subprocess.run(
        ["gh", "pr", "list", "--repo", REPO, "--state", "merged", "--limit", "1000", "--json", "number,title,mergedAt"],
        check=True, capture_output=True, text=True).stdout)
    days = defaultdict(list)
    for pr in prs:
        days[pr["mergedAt"][:10]].append(pr)

    lines = [
        "# What we built",
        "",
        f"Every change merged into the site, newest first: {len(prs)} pull requests from {min(days)} to {max(days)}. "
        "Each links to its pull request on GitHub (the description says what changed and how it was tested) and to the "
        "notes about the parts it touches. Written by `scripts/docs_changelog.py`; run it again to bring this up to date.",
        "",
        "Back to [the map](README.md).",
    ]
    for day in sorted(days, reverse=True):
        lines += ["", f"## {day}", ""]
        for pr in sorted(days[day], key=lambda p: p["number"], reverse=True):
            title = pr["title"].replace("|", "\\|").replace("[", "\\[").replace("]", "\\]")
            lowered = pr["title"].lower()
            has = lambda word: re.search(rf"(?<!\w){re.escape(word)}(?!\w)", lowered)
            notes = [f"[{name}]({path})" for path, (name, words) in NOTES.items() if any(has(w) for w in words)]
            link = f"https://github.com/{REPO}/pull/{pr['number']}"
            lines.append(f"- [#{pr['number']}]({link}) {title}{' → ' + ', '.join(notes) if notes else ''}")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT} ({len(prs)} pull requests)")


if __name__ == "__main__":
    main()
