#!/usr/bin/env python3
"""Add recovered pictures to the posts and comments they belong to (standard library only).

The Facebook export kept photo posts as empty posts, and pictures in comments only as addresses, most of which no
longer open. The pictures were collected outside this folder, in a photo-collection folder with two parts:

  facebook/results.csv   pictures still on the group's Facebook pages (columns entry_id, volume, status, file, ...)
  outside/results.csv    pictures from other sites, from the address itself or the Wayback Machine's copy
                         (columns entry_id, volume, source, saved_path, mime, original_url, fetched_url, ...)

Run it from the site folder, after collecting more pictures (it rebuilds everything from the two files):

    python3 scripts/import_photos.py ../photo-collection

Files written:
  static/photos/<volume>/<post or comment ID>[-2, -3 …].<jpg|png|gif>   a copy of each picture (others there are
                        removed); a post with several pictures numbers the second and later ones
  data/photos.json      by post or comment ID: the picture's address, size and where it came from, which
                        partials/entry-photos.html shows under the post or comment

The record itself is never changed: content/ is only read.
"""

import csv
import datetime
import json
import os
import re
import shutil
import struct
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}


def size(path):
    """Width and height of a JPEG, PNG or GIF, read from its header."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7 or marker == 0xFF:
                i += 2 if marker != 0xFF else 1
                continue
            length = struct.unpack(">H", data[i + 2:i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + length
    raise ValueError(f"not a JPEG, PNG or GIF: {path}")


def kind(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    return None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    collection = sys.argv[1]
    found = []  # (volume, entry ID, source file, record)
    for row in csv.DictReader(open(os.path.join(collection, "facebook", "results.csv"), newline="")):
        if row["status"] == "saved":
            found.append((row["volume"], row["entry_id"], row["file"], {"source": "facebook"}))
    for row in csv.DictReader(open(os.path.join(collection, "outside", "results.csv"), newline="")):
        if row["source"] in ("original", "wayback"):
            record = {"source": row["source"], "url": row["original_url"]}
            if row["source"] == "wayback":
                record["copy"] = row["fetched_url"].replace("id_/", "/", 1)
                stamp = re.search(r"/web/(\d{8})", row["fetched_url"])
                if stamp:
                    record["date"] = datetime.datetime.strptime(stamp.group(1), "%Y%m%d").strftime("%Y-%m-%d")
            path = row["saved_path"]
            if not os.path.isabs(path):
                path = os.path.join(collection, "outside", path)
            found.append((row["volume"], row["entry_id"], path, record))

    entries, written = {}, set()
    for volume, entry, path, record in found:
        if not re.fullmatch(r"vol_[ivx]+", volume) or not re.fullmatch(r"[0-9_]+", entry):
            sys.exit(f"unexpected volume or ID: {volume} {entry}")
        with open(path, "rb") as f:
            ext = kind(f.read(8))
        if not ext:
            sys.exit(f"not a JPEG, PNG or GIF: {path}")
        n = len(entries.get(entry, []))
        rel = f"photos/{volume}/{entry}{f'-{n + 1}' if n else ''}.{ext}"
        os.makedirs(os.path.join(SITE, "static", "photos", volume), exist_ok=True)
        shutil.copyfile(path, os.path.join(SITE, "static", rel))
        written.add(rel)
        w, h = size(path)
        entries.setdefault(entry, []).append(dict(src=rel, w=w, h=h, **record))

    for root, _, files in os.walk(os.path.join(SITE, "static", "photos")):
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), os.path.join(SITE, "static")).replace(os.sep, "/")
            if rel not in written:
                os.remove(os.path.join(root, name))

    out = {
        "_about": "Recovered pictures, by post or comment ID. Written by scripts/import_photos.py; do not edit by hand.",
        "entries": dict(sorted(entries.items())),
    }
    with open(os.path.join(SITE, "data", "photos.json"), "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")
    by = {}
    for r in (r for v in entries.values() for r in v):
        by[r["source"]] = by.get(r["source"], 0) + 1
    print(f"{sum(by.values())} pictures on {len(entries)} posts and comments: "
          + ", ".join(f"{n} {s}" for s, n in sorted(by.items())))


if __name__ == "__main__":
    main()
