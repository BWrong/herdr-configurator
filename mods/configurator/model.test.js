// The pure half of the Configurator: folder listing → rows, Origin, filtering.
// Run with `node --test mods/configurator/*.test.js`; no Herdr, no dependencies.
import test from "node:test";
import assert from "node:assert/strict";
import {
  folderNames,
  rowsOf,
  filterRows,
  fileSizesOf,
  layoutsReferencing,
  keyBindingsOf,
  scanText,
  detailOf,
  sizeText,
  settingsFields,
  settingsGroups,
  parseDraft,
  draftOf,
  changedKeys,
  savePlan,
  mergeSettings,
  keptShape,
  carryOver,
  parseLedger,
  ledgerJson,
  normaliseRepo,
  hashesOf,
  commitOf,
  recordSource,
} from "./model.js";

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

test("fileSizesOf reads a file's name and byte size from ls -l output", () => {
  const output = [
    "total 64",
    "-rw-r--r--@ 1 bwrong  staff  1234 Nov 16 15:00 main.js",
    "-rw-r--r--@ 1 bwrong  staff   911 Nov 16 15:00 model.js",
    "drwxr-xr-x@ 4 bwrong  staff   128 Nov 16 15:00 icons",
    "",
  ].join("\n");
  assert.deepEqual(fileSizesOf(output), [
    { name: "main.js", size: 1234 },
    { name: "model.js", size: 911 },
  ]);
});

test("fileSizesOf prefixes nested files from an ls -lR header and keeps their own names", () => {
  const output = [
    ".:",
    "total 8",
    "-rw-r--r-- 1 bwrong  staff  184 Nov 16 15:00 mod.json",
    "icons:",
    "total 16",
    "-rw-r--r-- 1 bwrong  staff  248 Nov 16 15:00 check.svg",
  ].join("\n");
  assert.deepEqual(fileSizesOf(output), [
    { name: "icons/check.svg", size: 248 },
    { name: "mod.json", size: 184 },
  ]);
});

test("fileSizesOf copes with GNU dates, names with spaces and a symlink target", () => {
  const output = [
    "-rw-r--r-- 1 bwrong staff 1234 2026-11-16 15:00 my long name.txt",
    "lrwxrwxrwx 1 bwrong staff   11 2026-11-16 15:00 data -> ../shared.json",
  ].join("\n");
  assert.deepEqual(fileSizesOf(output), [
    { name: "data", size: 11 },
    { name: "my long name.txt", size: 1234 },
  ]);
});

test("fileSizesOf reads an empty or unreadable listing as no files", () => {
  assert.deepEqual(fileSizesOf(""), []);
  assert.deepEqual(fileSizesOf(null), []);
});

test("layoutsReferencing names the layouts whose blocks mount the entry as a mod", () => {
  const layouts = [
    { name: "main", text: '{"children":[{"content":{"mod":"agents"}}]}' },
    { name: "terminals", text: '{"children":[{"content":{"mod":"agents"},"children":[{"content":{"mod":"spaces"}}]}]}' },
    { name: "win98", text: 'not json' },
    { name: "catppuccin", text: '{"theme":{"dark":"catppuccin-macchiato"},"children":[{"content":{"mod":"spaces"}}]}' },
  ];
  assert.deepEqual(layoutsReferencing(layouts, "spaces"), ["catppuccin", "terminals"]);
  assert.deepEqual(layoutsReferencing(layouts, "nowhere"), []);
});

test("keyBindingsOf keeps only the keys.json sections belonging to the entry", () => {
  const keys = [
    { section: "global", keys: "cmd-q", action: "app.quit" },
    { section: "mod:better-changes", keys: "cmd-shift-x", action: "better-changes:check" },
    { section: "mod:better-changes", keys: "alt-x", action: "better-changes:open" },
    { section: "mod:better-changes-extra", keys: "alt-y", action: "better-changes-extra:go" },
  ];
  assert.deepEqual(keyBindingsOf(keys, "better-changes"), [
    { keys: "cmd-shift-x", action: "better-changes:check" },
    { keys: "alt-x", action: "better-changes:open" },
  ]);
  assert.deepEqual(keyBindingsOf(keys, "tabs"), []);
});

test("scanText says which layouts and keys reference the entry, or says none", () => {
  const scan = {
    layouts: ["main", "terminals", "win98"],
    keys: [{ keys: "cmd-shift-x", action: "better-changes:check" }],
  };
  assert.equal(
    scanText(scan),
    "Referenced by 3 layouts: main, terminals, win98; key bindings: cmd-shift-x → better-changes:check",
  );
  assert.equal(scanText({ layouts: ["main"], keys: [] }), "Referenced by 1 layout: main; no key bindings.");
  assert.equal(
    scanText({ layouts: [], keys: [{ keys: "alt-x", action: "tabs:go" }] }),
    "No layout references this entry; key bindings: alt-x → tabs:go",
  );
  assert.equal(scanText({ layouts: [], keys: [] }), "No layout references this entry and no key bindings.");
});

const rowsForDetail = rowsOf(
  [
    { name: "better-changes", modJson: '{"title":"Better Changes","version":"0.2.0"}' },
    { name: "better-config", modJson: '{"title":"Better Config","version":"0.1.0"}' },
    { name: "hinted", modJson: '{"title":"Hinted","source":"BWrong/hinted"}' },
    { name: "help", modJson: '{"title":"Help"}' },
  ],
  { installed, ledger: { "better-changes": { repository: "BWrong/better-changes", ref: "main", commit: "abcdef1234567" } } },
);

test("the detail of a ledger entry carries its repository, short commit and files", () => {
  const detail = detailOf(rowsForDetail.find((row) => row.name === "better-changes"), {
    folder: "mods/better-changes",
    ledger: { "better-changes": { repository: "BWrong/better-changes", commit: "abcdef1234567" } },
    files: [
      { name: "main.js", size: 2048 },
      { name: "mod.json", size: 180 },
    ],
    layouts: [{ name: "main", text: '{"children":[{"content":{"mod":"better-changes"}}]}' }],
    keys: [{ section: "mod:better-changes", keys: "cmd-shift-x", action: "better-changes:check" }],
  });
  assert.equal(detail.title, "Better Changes");
  assert.equal(detail.folder, "mods/better-changes");
  assert.equal(detail.version, "0.2.0");
  assert.equal(detail.repo, "BWrong/better-changes");
  assert.equal(detail.commit, "abcdef1");
  assert.deepEqual(detail.files, [
    { name: "main.js", size: 2048 },
    { name: "mod.json", size: 180 },
  ]);
  assert.deepEqual(detail.scan, { layouts: ["main"], keys: [{ keys: "cmd-shift-x", action: "better-changes:check" }] });
  assert.equal(
    detail.scanText,
    "Referenced by 1 layout: main; key bindings: cmd-shift-x → better-changes:check",
  );
});

test("the detail falls back to a source hint in mod.json when the ledger has no row", () => {
  const hinted = detailOf(rowsForDetail.find((row) => row.name === "hinted"), {
    folder: "mods/hinted",
    manifest: { source: "BWrong/hinted" },
  });
  assert.equal(hinted.repo, "BWrong/hinted");
  assert.equal(hinted.commit, null);
  assert.equal(hinted.provenanceText, "BWrong/hinted");
});

test("the detail reads a source hint object's repo and commit too", () => {
  const hinted = detailOf(rowsForDetail.find((row) => row.name === "hinted"), {
    folder: "mods/hinted",
    manifest: { source: { repo: "BWrong/hinted", commit: "fedcba9876543" } },
  });
  assert.equal(hinted.repo, "BWrong/hinted");
  assert.equal(hinted.commit, "fedcba9");
});

test("an entry with no provenance reads as unknown, never blank", () => {
  const detail = detailOf(rowsForDetail.find((row) => row.name === "better-config"), {
    folder: "mods/better-config",
    files: [{ name: "main.js", size: 26628 }],
  });
  assert.equal(detail.repo, null);
  assert.equal(detail.commit, null);
  assert.equal(detail.provenanceText, "Unknown origin");
  assert.equal(detail.scanText, "No layout references this entry and no key bindings.");
});

test("a shipped entry also reads as unknown provenance until it is linked", () => {
  const detail = detailOf(rowsForDetail.find((row) => row.name === "help"), { folder: "mods/help" });
  assert.equal(detail.origin, "shipped");
  assert.equal(detail.provenanceText, "Unknown origin");
  assert.deepEqual(detail.files, []);
});

test("sizeText writes byte sizes in B and kB", () => {
  assert.equal(sizeText(0), "0 B");
  assert.equal(sizeText(911), "911 B");
  assert.equal(sizeText(2048), "2.0 kB");
  assert.equal(sizeText(26628), "26.0 kB");
});

// Settings: the schema's leaves, the drafts, and what a save writes.

const settingsSchema = {
  properties: {
    settings: {
      type: "object",
      properties: {
        refresh: {
          type: "object",
          properties: {
            status: {
              title: "Git refresh",
              description: "How often Git is read for changes.",
              type: ["string", "integer"],
              format: "duration",
              pattern: "^\\s*\\d+(\\.\\d+)?\\s*(ms|s|m|h)\\s*$",
              default: "10s",
            },
          },
        },
        limits: {
          type: "object",
          properties: {
            files: { title: "Files shown", type: "integer", minimum: 1, default: 1000 },
          },
        },
        default: {
          type: "object",
          properties: {
            view: {
              title: "File list",
              description: "How file lists start.",
              type: "string",
              enum: ["tree", "flat"],
              "x-labels": { tree: "Tree", flat: "Flat" },
              default: "tree",
            },
            diff: {
              title: "Diff",
              type: "string",
              enum: ["inline", "split"],
              "x-labels": { inline: "Inline", split: "Side by side" },
              default: "inline",
            },
          },
        },
        panel: {
          type: "object",
          properties: {
            toggle: { title: "Key closes the panel", type: "boolean", default: false },
          },
        },
      },
    },
  },
};

const topLevelSchema = {
  properties: {
    settings: {
      type: "object",
      properties: {
        mode: { title: "Mode", type: "string", enum: ["a", "b"], default: "a" },
        refresh: {
          type: "object",
          properties: { status: { type: "string", default: "10s" } },
        },
      },
    },
  },
};

test("settingsFields lists the schema's leaves in order with their type, default and description", () => {
  const fields = settingsFields(settingsSchema);
  assert.deepEqual(
    fields.map((f) => [f.key, f.group, f.type]),
    [
      ["refresh.status", "refresh", "text"],
      ["limits.files", "limits", "number"],
      ["default.view", "default", "choice"],
      ["default.diff", "default", "choice"],
      ["panel.toggle", "panel", "boolean"],
    ],
  );
  const view = fields.find((f) => f.key === "default.view");
  assert.equal(view.title, "File list");
  assert.equal(view.description, "How file lists start.");
  assert.equal(view.default, "tree");
  assert.deepEqual(view.choices, [
    { value: "tree", label: "Tree" },
    { value: "flat", label: "Flat" },
  ]);
  assert.equal(fields.find((f) => f.key === "limits.files").min, 1);
  assert.equal(fields.find((f) => f.key === "refresh.status").pattern, "^\\s*\\d+(\\.\\d+)?\\s*(ms|s|m|h)\\s*$");
});

test("settingsFields reads an absent or empty settings object as no fields", () => {
  assert.deepEqual(settingsFields(null), []);
  assert.deepEqual(settingsFields({}), []);
  assert.deepEqual(settingsFields({ properties: {} }), []);
  assert.deepEqual(settingsFields({ properties: { settings: { type: "object" } } }), []);
});

test("settingsGroups groups by the first path segment, top-level keys first", () => {
  const groups = settingsGroups(settingsFields(topLevelSchema));
  assert.deepEqual(
    groups.map((g) => [g.name, g.fields.map((f) => f.key)]),
    [
      ["", ["mode"]],
      ["refresh", ["refresh.status"]],
    ],
  );
});

test("parseDraft turns typed text into the field's value or says why it can't", () => {
  const [duration, files, view, toggle] = [
    settingsFields(settingsSchema).find((f) => f.key === "refresh.status"),
    settingsFields(settingsSchema).find((f) => f.key === "limits.files"),
    settingsFields(settingsSchema).find((f) => f.key === "default.view"),
    settingsFields(settingsSchema).find((f) => f.key === "panel.toggle"),
  ];
  assert.deepEqual(parseDraft(duration, "10s"), { value: "10s" });
  assert.match(parseDraft(duration, "10x").error, /format/i);
  assert.deepEqual(parseDraft(view, "flat"), { value: "flat" });
  assert.match(parseDraft(view, "grid").error, /one of/i);
  assert.deepEqual(parseDraft(files, "25"), { value: 25 });
  assert.match(parseDraft(files, "0").error, /at least 1/i);
  assert.match(parseDraft(files, "many").error, /number/i);
  assert.deepEqual(parseDraft(toggle, true), { value: true });
  assert.match(parseDraft(toggle, "true").error, /on or off/i);
});

test("draftOf starts every field at what the file says, else its default", () => {
  const fields = settingsFields(settingsSchema);
  assert.deepEqual(draftOf(fields, {}), {
    "refresh.status": "10s",
    "limits.files": "1000",
    "default.view": "tree",
    "default.diff": "inline",
    "panel.toggle": false,
  });
  assert.deepEqual(draftOf(fields, { limits: { files: 25 }, panel: { toggle: true } }), {
    "refresh.status": "10s",
    "limits.files": "25",
    "default.view": "tree",
    "default.diff": "inline",
    "panel.toggle": true,
  });
});

test("changedKeys names only the fields whose draft differs from the file, defaults included", () => {
  const fields = settingsFields(settingsSchema);
  const drafts = draftOf(fields, {});
  assert.deepEqual(changedKeys(fields, drafts, {}), []);
  assert.deepEqual(changedKeys(fields, { ...drafts, "default.view": "flat" }, {}), ["default.view"]);
  assert.deepEqual(changedKeys(fields, { ...drafts, "limits.files": "0" }, {}), ["limits.files"]);
  assert.deepEqual(changedKeys(fields, drafts, { default: { view: "flat" } }), ["default.view"]);
});

test("savePlan writes only changed keys, leaves defaults out and never writes an invalid one", () => {
  const fields = settingsFields(settingsSchema);
  const drafts = { ...draftOf(fields, {}), "default.view": "flat", "refresh.status": "10x" };
  const plan = savePlan(fields, drafts, {});
  assert.deepEqual(plan.values, { "default.view": "flat" });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(Object.keys(plan.problems), ["refresh.status"]);
  assert.match(plan.problems["refresh.status"], /format/i);

  const backToDefault = savePlan(fields, draftOf(fields, {}), { default: { view: "flat" } });
  assert.deepEqual(backToDefault.values, {});
  assert.deepEqual(backToDefault.remove, ["default.view"]);
  assert.deepEqual(backToDefault.problems, {});
});

test("mergeSettings updates only the changed keys and leaves every other key alone", () => {
  const manifest = {
    title: "Better Changes",
    version: "2.5.0",
    settings: { panel: { toggle: true }, limits: { files: 25 }, extra: 1 },
  };
  const merged = mergeSettings(manifest, {
    values: { default: { view: "flat" } },
    remove: ["panel.toggle"],
  });
  assert.equal(merged.title, "Better Changes");
  assert.equal(merged.version, "2.5.0");
  assert.deepEqual(merged.settings, { limits: { files: 25 }, extra: 1, default: { view: "flat" } });
  assert.deepEqual(manifest, {
    title: "Better Changes",
    version: "2.5.0",
    settings: { panel: { toggle: true }, limits: { files: 25 }, extra: 1 },
  });
});

test("mergeSettings drops an empty settings block", () => {
  const merged = mergeSettings({ title: "Bare", settings: { panel: { toggle: true } } }, {
    values: {},
    remove: ["panel.toggle"],
  });
  assert.deepEqual(merged, { title: "Bare" });
});

test("keptShape is the version and the values Herdr keeps outside the mod", () => {
  assert.deepEqual(keptShape({ version: "2.5.0", settings: { default: { view: "flat" } } }), {
    version: "2.5.0",
    values: { default: { view: "flat" } },
  });
  assert.deepEqual(keptShape({ title: "No settings" }), { version: null, values: {} });
});

test("carryOver copies better-config's non-empty values once, never over an existing kept file", () => {
  const legacy = '{"version":"2.5.0","values":{"limits":{"files":25}}}';
  assert.deepEqual(carryOver(legacy, null), {
    version: "2.5.0",
    values: { limits: { files: 25 } },
  });
  assert.equal(carryOver(legacy, '{"version":"2.5.0","values":{}}'), null);
  assert.equal(carryOver('{"version":"2.5.0","values":{}}', null), null);
  assert.equal(carryOver("not json", null), null);
});

// Ledger: parse with its version gate, serialise, and the pure steps of recording a source.

const HEX = "abcdef1234567890abcdef1234567890abcdef12";
const HEX2 = "0123456789abcdef0123456789abcdef01234567";
const digest = (digit) => digit.repeat(64);

const ledgerSample = {
  version: 1,
  entries: {
    "better-changes": {
      kind: "mod",
      origin: "third_party",
      repo: "BWrong/better-changes",
      ref: "main",
      commit: HEX,
      checkedAt: 1794000000000,
      installedAt: 1794000000000,
      files: { "main.js": `sha256:${digest("a")}`, "mod.json": `sha256:${digest("b")}` },
    },
  },
};

test("parseLedger reads a version 1 ledger's entries", () => {
  const read = parseLedger(JSON.stringify(ledgerSample));
  assert.equal(read.problem, null);
  assert.deepEqual(read.entries, ledgerSample.entries);
});

test("parseLedger treats an absent or blank ledger as empty and unproblematic", () => {
  assert.deepEqual(parseLedger(null), { entries: {}, problem: null });
  assert.deepEqual(parseLedger(undefined), { entries: {}, problem: null });
  assert.deepEqual(parseLedger("  \n"), { entries: {}, problem: null });
});

test("parseLedger reports malformed JSON and reads nothing from it", () => {
  const read = parseLedger('{"version":1,"entries":');
  assert.deepEqual(read.entries, {});
  assert.match(read.problem, /not valid JSON/i);
});

test("parseLedger reports a ledger whose version is not 1 and reads nothing from it", () => {
  const read = parseLedger('{"version":2,"entries":{"x":{"repo":"a/b"}}}');
  assert.deepEqual(read.entries, {});
  assert.match(read.problem, /version 2/i);
  assert.match(parseLedger("[]").problem, /not an object/i);
});

test("parseLedger reports an entries map that is missing or not an object", () => {
  assert.match(parseLedger('{"version":1}').problem, /entries/i);
  assert.match(parseLedger('{"version":1,"entries":[]}').problem, /entries/i);
});

test("parseLedger keeps the good rows and names the malformed ones it dropped", () => {
  const read = parseLedger('{"version":1,"entries":{"good":{"repo":"a/b"},"bad":"nope"}}');
  assert.deepEqual(read.entries, { good: { repo: "a/b" } });
  assert.match(read.problem, /bad/);
});

test("ledgerJson writes version 1, entries sorted by name, and a final newline", () => {
  const text = ledgerJson({ zeta: { repo: "a/b" }, alpha: { repo: "c/d" } });
  assert.ok(text.endsWith("\n"));
  assert.equal(JSON.parse(text).version, 1);
  assert.ok(text.indexOf('"alpha"') < text.indexOf('"zeta"'));
  assert.deepEqual(parseLedger(text).entries, { zeta: { repo: "a/b" }, alpha: { repo: "c/d" } });
});

test("ledgerJson round-trips a full entry unchanged", () => {
  assert.deepEqual(parseLedger(ledgerJson(ledgerSample.entries)).entries, ledgerSample.entries);
});

test("normaliseRepo accepts owner/repo and the usual GitHub spellings", () => {
  assert.equal(normaliseRepo("BWrong/better-changes"), "BWrong/better-changes");
  assert.equal(normaliseRepo("  BWrong/better-changes  "), "BWrong/better-changes");
  assert.equal(normaliseRepo("https://github.com/BWrong/better-changes"), "BWrong/better-changes");
  assert.equal(normaliseRepo("https://github.com/BWrong/better-changes.git"), "BWrong/better-changes");
  assert.equal(normaliseRepo("https://github.com/BWrong/better-changes/"), "BWrong/better-changes");
  assert.equal(normaliseRepo("github.com/BWrong/better-changes"), "BWrong/better-changes");
  assert.equal(normaliseRepo("git@github.com:BWrong/better-changes.git"), "BWrong/better-changes");
});

test("normaliseRepo rejects anything that is not one owner and one repository", () => {
  assert.equal(normaliseRepo(""), null);
  assert.equal(normaliseRepo(null), null);
  assert.equal(normaliseRepo("better-changes"), null);
  assert.equal(normaliseRepo("owner/repo/extra"), null);
  assert.equal(normaliseRepo("https://example.com/owner/repo"), null);
  assert.equal(normaliseRepo("not a repo"), null);
});

test("hashesOf reads shasum lines into sha256 hashes keyed by the entry's paths", () => {
  const output = [
    `${digest("a")}  ./main.js`,
    `${digest("b")}  ./icons/gear.svg`,
    `${digest("c")} *./mod.json`,
    "shasum: ./gone.js: No such file or directory",
    "",
  ].join("\n");
  assert.deepEqual(hashesOf(output), {
    "icons/gear.svg": `sha256:${digest("b")}`,
    "main.js": `sha256:${digest("a")}`,
    "mod.json": `sha256:${digest("c")}`,
  });
});

test("hashesOf keeps a file name with spaces and reads nothing from junk", () => {
  assert.deepEqual(hashesOf(`${digest("d")}  ./my long name.txt`), {
    "my long name.txt": `sha256:${digest("d")}`,
  });
  assert.deepEqual(hashesOf(""), {});
  assert.deepEqual(hashesOf(null), {});
});

test("commitOf reads the 40 hex sha from GitHub's commit response", () => {
  assert.deepEqual(commitOf(JSON.stringify({ sha: HEX })), { commit: HEX });
});

test("commitOf surfaces the responder's own message verbatim", () => {
  const message = "API rate limit exceeded for 1.2.3.4. (But here's the good news: Authenticated requests get a higher rate limit.)";
  assert.deepEqual(commitOf(JSON.stringify({ message })), { error: message });
});

test("commitOf refuses a response without a 40 hex commit", () => {
  assert.match(commitOf(JSON.stringify({ sha: "abc" })).error, /commit/i);
  assert.match(commitOf("not json").error, /JSON/i);
  assert.match(commitOf("[]").error, /JSON/i);
});

test("recording a source writes kind, origin, repo, ref, commit, per-file hashes and the times", () => {
  const files = { "main.js": `sha256:${digest("a")}` };
  const entries = recordSource({}, { name: "better-config", repo: "BWrong/better-config", ref: "main", commit: HEX, files, now: 1794000000000 });
  assert.deepEqual(entries, {
    "better-config": {
      kind: "mod",
      origin: "third_party",
      repo: "BWrong/better-config",
      ref: "main",
      commit: HEX,
      checkedAt: 1794000000000,
      installedAt: 1794000000000,
      files,
    },
  });
});

test("recording again updates the row in place and keeps its install time", () => {
  const first = recordSource(
    {},
    { name: "better-config", repo: "o/r", ref: "main", commit: HEX, files: { "main.js": "sha256:1" }, now: 100 },
  );
  const second = recordSource(first, {
    name: "better-config",
    repo: "o/r",
    ref: "v2",
    commit: HEX2,
    files: { "mod.json": "sha256:2" },
    now: 500,
  });
  assert.deepEqual(Object.keys(second), ["better-config"]);
  assert.equal(second["better-config"].installedAt, 100);
  assert.equal(second["better-config"].checkedAt, 500);
  assert.equal(second["better-config"].ref, "v2");
  assert.equal(second["better-config"].commit, HEX2);
  assert.deepEqual(second["better-config"].files, { "mod.json": "sha256:2" });
});

test("a recorded entry lists as third party with known provenance and feeds the detail pane", () => {
  const entries = recordSource({}, { name: "x", repo: "o/r", ref: "main", commit: HEX, files: {}, now: 5 });
  const rows = rowsOf([{ name: "x", modJson: '{"title":"X"}' }], { ledger: entries });
  assert.equal(rows[0].origin, "third_party");
  assert.equal(rows[0].unknown, false);
  const detail = detailOf(rows[0], { ledger: entries });
  assert.equal(detail.unknown, false);
  assert.equal(detail.provenanceText, `o/r @ ${HEX.slice(0, 7)}`);
});

test("an untouched third-party entry is still marked unknown in the detail pane", () => {
  const rows = rowsOf([{ name: "hand-made", modJson: '{"title":"Hand made"}' }], {});
  assert.equal(detailOf(rows[0], { folder: "mods/hand-made" }).unknown, true);
});
