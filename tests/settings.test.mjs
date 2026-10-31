import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_SETTINGS, validateSettings, readSettings, validGroup } from "../lib/settings.ts";
import { crewRoles } from "../lib/roles.ts";
import { formatArticleQuote } from "../lib/article-quote.ts";

test("supports no groups, arbitrary groups and the example theme", async () => {
  assert.equal(validGroup("", DEFAULT_SETTINGS), true);
  assert.equal(validGroup("unexpected", DEFAULT_SETTINGS), false);
  const config = validateSettings({ ...DEFAULT_SETTINGS, groups: ["One", "Two", "Three", "Four"] });
  assert.equal(validGroup("Four", config), true);
  assert.equal(validGroup("", config), false);
  const example = JSON.parse(await readFile(new URL("../examples/nautical.json", import.meta.url), "utf8"));
  assert.equal(validateSettings(example).groups.length, 3);
  const a = readSettings(null); a.groups.push("local");
  assert.deepEqual(DEFAULT_SETTINGS.groups, []);
});

test("rejects invalid timezone, duplicate groups and inverted delays", () => {
  for (const value of [{ timezone: "not/a-zone" }, { groups: ["One", "one"] }, { publicationDelayMin: 61, publicationDelayMax: 60 }, { fogThreshold: 1 }, { groups: [null] }]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ...value }));
  }
});

test("roles can be added and removed, including an empty list", () => {
  assert.deepEqual(crewRoles([]), []);
  assert.deepEqual(crewRoles('[{"key":"custom","masculine":"Test","feminine":"Test"}]'), [{ key: "custom", masculine: "Test", feminine: "Test" }]);
  assert.throws(() => crewRoles([{ key: "bad key", masculine: "A", feminine: "A" }]));
});

test("quotes have exactly one pair of quotation marks", () => {
  assert.equal(formatArticleQuote("««Последние слова».»"), "«Последние слова».");
  assert.equal(formatArticleQuote("“Пиф-паф!”"), "«Пиф-паф!»");
});
