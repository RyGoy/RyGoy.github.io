# Recovered records

The Facebook export lost a lot: photos, link previews, user IDs, and some posts. Besides the [Anthology](anthology.md), four things restore what they can. Each is labelled on the page as added by this site, and none of them changes the exported record.

| What | Where it comes from | Made by | Kept in | Shown by |
|---|---|---|---|---|
| **Imported posts and comments** | A later export, `TTFL DB.db` (to March 2018): 152 posts and 3,219 comments the first export lacked | `scripts/import_db.py` | `content/vol_*/` (`"imported"` in front matter) | The usual templates |
| **Archived links** | The Wayback Machine and archive.today, the copy closest to the post's date | `scripts/archive_links.py` (run by hand; takes hours) | `data/archives.json` (and `scripts/archive-checks.json`, its progress) | `partials/archive-links.html` |
| **Recovered pictures** | The group's Facebook page, the picture's own address, or the Wayback Machine | `scripts/import_photos.py <collection>` | `static/photos/`, `data/photos.json` | `partials/entry-photos.html` |
| **Facebook profile links** | Members' own posts, Facebook's page data, and matches reviewed by hand | Built outside the repository (`content-authors.csv`, `facebook-verify.csv`) | `data/facebook_profiles.json` | `partials/lpPosts.html` ("Facebook" after the name) |

Beside a profile link, **Notify admin of mistake** opens the bot's "Ask a question" on that post. See [Commentary](commentary.md).

**YouTube videos** in posts and comments show as thumbnails and load the player only when clicked (`partials/youtube-embeds.html`, `static/js/youtube-embed.js`).

## Connected

- [Anthology](anthology.md): the 2014 printout.
- [Content model](content-model.md): the data files above.
- [Scripts](scripts.md): the scripts above.
- [Hosting and outside services](../hosting.md): the Wayback Machine, archive.today and YouTube.

Details: `CLAUDE.md`, "Archived links", "Recovered pictures", "Facebook profile links", "YouTube videos in posts and comments", and "Content model" (imported posts).
