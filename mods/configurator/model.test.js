// The pure half of the Configurator: folder listing → rows, Origin, filtering.
// Run with `node --test mods/configurator/*.test.js`; no Herdr, no dependencies.
import test from "node:test";
import assert from "node:assert/strict";
import { folderNames, rowsOf, filterRows } from "./model.js";

const installed = { help: { "main.js": "hash" } };
const ledger = { "better-changes": { repo: "BWrong/better-changes", commit: "abc" } };

test("folderNames reads one name per folder from a mods listing", () => {
  assert.deepEqual(folderNames("help/\nbetter-changes/\n\ntabs/\n"), ["help", "better-changes", "tabs"]);
  assert.deepEqual(folderNames(""), []);
});

test("an entry with no ledger row but in installed.json is shipped", () => {
  const rows = rowsOf([{ name: "help", modJson: '{"title":"Help"}' }], { installed });
  assert.equal(rows[0].origin, "shipped");
  assert.equal(rows[0].unknown, false);
  assert.equal(rows[0].title, "Help");
});

test("a mod.json with cloned_from is cloned", () => {
  const rows = rowsOf(
    [{ name: "catppuccin-status", modJson: '{"title":"Catppuccin Status","cloned_from":{"name":"workspace-status"}}' }],
    { installed },
  );
  assert.equal(rows[0].origin, "cloned");
  assert.equal(rows[0].unknown, false);
});

test("a hand-dropped folder is third party with unknown provenance", () => {
  const rows = rowsOf([{ name: "better-config", modJson: '{"title":"Better Config","version":"0.1.0"}' }], {
    installed,
    ledger,
  });
  assert.equal(rows[0].origin, "third_party");
  assert.equal(rows[0].unknown, true);
  assert.equal(rows[0].version, "0.1.0");
});

test("a ledger row makes its entry third party with known provenance, whatever the rest says", () => {
  const rows = rowsOf(
    [
      { name: "better-changes", modJson: '{"title":"Better Changes","cloned_from":{"name":"changes"}}' },
      { name: "help", modJson: '{"title":"Help"}' },
    ],
    { installed, ledger },
  );
  assert.deepEqual(rows.map((r) => [r.name, r.origin, r.unknown]).sort(), [
    ["better-changes", "third_party", false],
    ["help", "shipped", false],
  ]);
});

test("an unreadable or missing mod.json still lists the folder", () => {
  const rows = rowsOf([{ name: "broken", modJson: "not json" }, { name: "bare", modJson: null }], {
    installed,
    ledger,
  });
  assert.deepEqual(rows.map((r) => [r.name, r.title, r.version]), [
    ["bare", "bare", null],
    ["broken", "broken", null],
  ]);
  assert.ok(rows.every((r) => r.origin === "third_party" && r.unknown));
});

test("rows are sorted by title, then folder name", () => {
  const rows = rowsOf(
    [
      { name: "zebra", modJson: '{"title":"Alpha"}' },
      { name: "alpha", modJson: '{"title":"alpha"}' },
      { name: "beta", modJson: '{"title":"Beta"}' },
    ],
    {},
  );
  assert.deepEqual(rows.map((r) => r.name), ["alpha", "zebra", "beta"]);
});

test("the filter matches title and folder name, ignoring case and padding", () => {
  const rows = rowsOf(
    [
      { name: "better-config", modJson: '{"title":"Better Config"}' },
      { name: "tabs-graph", modJson: '{"title":"Tabs Graph"}' },
    ],
    {},
  );
  assert.deepEqual(filterRows(rows, "CONFIG").map((r) => r.name), ["better-config"]);
  assert.deepEqual(filterRows(rows, "graph").map((r) => r.name), ["tabs-graph"]);
  assert.deepEqual(filterRows(rows, "  ").map((r) => r.name), ["better-config", "tabs-graph"]);
  assert.deepEqual(filterRows(rows, "nothing"), []);
});
