-- The flash card accounts' table (accounts.js), in the D1 database bound as DB. Create it once:
--   npx wrangler d1 execute ttfl-accounts --remote --file schema.sql
-- id is the player's Telegram user ID, which is also their private chat with the bot. progress is the browser's saved
-- state (static/js/flashcards.js), as JSON; rev counts its saves, so a save made against an older copy is refused.
-- updated and nudged are milliseconds since 1970: the last save, and the last reminder sent.
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  progress TEXT NOT NULL DEFAULT '{"v":1}',
  rev INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  remind INTEGER NOT NULL DEFAULT 0,
  nudged INTEGER
);
CREATE INDEX IF NOT EXISTS players_reminders ON players (remind, updated);
