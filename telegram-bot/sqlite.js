// A SQLite file with the calls of Cloudflare D1 that accounts.js uses (prepare, bind, first, all, run), over Node's
// built-in node:sqlite (Node 22.5 or newer). server.mjs keeps the accounts in one; the tests use one in memory.
// Opening a file makes the table (schema.sql) if it isn't there yet.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const statement = (sql, args) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    raw: db, // node:sqlite itself, for tests and maintenance
    prepare: (sql) => ({ ...statement(sql, []), bind: (...args) => statement(sql, args) }),
  };
}
