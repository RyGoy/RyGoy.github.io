# Anthology

In June 2014 a member printed the group's feed from Facebook into nine PDFs, "The Tender For Law Anthology". The printout keeps names, pictures and comments the Facebook export lost. The site uses it to show a printed copy beside each post and comment it covers, and to restore what the export dropped.

## What it adds

- **A printed copy** under each post and comment the printout covers ("Printed copy · Anthology Volume N, page P"). It is a cropped picture in `static/anthology/v<N>/<id>.webp`.
- **What the export lost, shown in place:** a missing name or message appears as the printed picture.
- **Recovered comments** are merged into their post's comments by time.
- **Recovered posts** the export lacks entirely become posts of their own (`content/vol_*/anthology-v<N>-<page>/`).
- **Renamed members:** names that come only from the printout are shown in blue. A member renamed between the export and the printout shows both names (`data/anthology_aliases.json`).

## The coverage

- **Dates:** the printout covers 8 January 2013 to 13 June 2014. Nothing later was printed.
- **Accounts missing from it:** some members never appear, probably blocked by the account that printed it.
- **Page breaks** sometimes cut a comment in two, or swallow a strip of text. The pipeline handles most of these.

## How it was built

All nine volumes are done. Python scripts in `scripts/anthology/` (with Pillow and poppler's `pdftotext`/`pdftoppm`):

1. **`parse.py`** splits each page's feed into posts and comments.
2. **`match.py`** matches them to the site's posts and comments by time, name and text.
3. **`build.py`** crops the pictures and writes `data/anthology/v<N>.json` and any recovered posts.
4. **`aliases.py`** learns renamed members.
5. **`verify.py`** and **`audit.py`** check the result.

The PDFs themselves (1.5 GB) are not hosted here.

## Files

| | |
|---|---|
| Pictures | `static/anthology/v<N>/` |
| Per volume: entries, recovered comments | `data/anthology/v<N>.json` |
| Renames | `data/anthology_aliases.json` |
| Templates | `partials/anthology-*.html` |

## Connected

- [Recovered records](recovered-records.md): the other ways the record was restored.
- [Content model](content-model.md): recovered posts in the volumes.
- [Scripts](scripts.md): the pipeline.

Details: `CLAUDE.md`, "The Tender For Law Anthology" (volume by volume, and every printout quirk).
