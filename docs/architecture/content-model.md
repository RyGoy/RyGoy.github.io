# Content model

What the site holds, and how each kind of thing is stored. Almost everything is a file in `content/` (pages) or `data/` (lists the templates read).

## The archive: volumes, posts and comments

The Facebook group's export, as files:

```
content/vol_iii/                       a volume (one quarter of a year)
  _index.md                            its title ("Volume 3") and weight
  462493170453287_536381629731107/     a post, as a folder
    _index.md                          the post: JSON front matter (from_name, message, link, created_time, ...)
    462493170453287_536381629731107-536381789731091.md   a comment on it
```

- **Volumes:** I–XIV run from 2013 Q1 to 2016 Q2. XV–XIX hold only posts from a later export.
- **A later export** (`TTFL DB.db`, to March 2018) filled gaps: 152 posts and 3,219 comments were imported on 12 November 2026 (`"imported"` in their front matter). See [Recovered records](recovered-records.md).
- **The 2014 printout** recovered posts the export lacked entirely: folders named `anthology-v<N>-<page>`. See [Anthology](anthology.md).
- **Most Discussed** (`content/most-discussed/`) is a pretend volume: the 100 posts with the most comments.

## Writing

- **Articles:** `content/articles/<author>/*.md`, Markdown with TOML front matter. Each author's folder is a section.
- **Subject sections** (`accounting`, `agency`, `bills-of-exchange`, `insurance`, `title&property`): the Library's subjects, with their own articles, such as the accounting Start Here lesson. See [Library](library.md).
- **Library books:** `content/library/*.md`, each with `author`, `edition`, `pdf`, `source`, `cover` and, for books still in copyright, `coming_soon` and `[copyright]`. See [Library](library.md).
- **Commentary notes:** `content/commentary/*.md`, YAML front matter, written through the bot. See [Commentary](commentary.md).

## Lists in `data/`

| File | Holds | Used by |
|---|---|---|
| `data/dictionary.json` | Terms and their definitions | [Dictionary and concordance](dictionary-and-concordance.md) |
| `data/flashcards/*.yaml` | Flash card decks | [Flash cards](flash-cards.md) |
| `data/anthology/v<N>.json` | The printout's pictures and recovered comments | [Anthology](anthology.md) |
| `data/anthology_aliases.json` | Members renamed between the export and the printout | [Anthology](anthology.md) |
| `data/archives.json` | Archived copies of outside links | [Recovered records](recovered-records.md) |
| `data/photos.json` | Recovered pictures | [Recovered records](recovered-records.md) |
| `data/facebook_profiles.json` | Members' Facebook profile links | [Recovered records](recovered-records.md) |
| `data/carousel.json` | The home page carousel's posts and comments | [Design and themes](design-and-themes.md) |

## Connected

- [Templates](templates.md) turn all of this into pages.
- [Build and deploy](build-and-deploy.md): a full build covers about 130,000 pages.

Details: `CLAUDE.md`, "Content model".
