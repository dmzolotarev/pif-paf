import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("fresh migrations create the schema and reject stale mutation claims atomically", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const path of (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
      db.exec(await readFile(new URL(`../drizzle/${path}`, import.meta.url), "utf8"));
    }
    db.prepare("INSERT INTO games (id, title, access_code) VALUES (?, ?, ?)").run("default", "Test", "TEST");
    db.prepare("INSERT INTO game_mutations (game_id, revision) VALUES (?, ?)").run("default", 1);
    db.exec("BEGIN");
    let rejected = false;
    try {
      db.prepare("INSERT INTO game_mutations (game_id, revision) VALUES (?, ?)").run("default", 1);
      db.prepare("UPDATE games SET status = 'finished' WHERE id = ?").run("default");
    } catch (error) { assert.match(error.message, /UNIQUE/); rejected = true; }
    finally { db.exec("ROLLBACK"); }
    assert.equal(rejected, true);
    assert.equal(db.prepare("SELECT status FROM games").get().status, "draft");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM players").get().count, 0);
  } finally { db.close(); }
});
