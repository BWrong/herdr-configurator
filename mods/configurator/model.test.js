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
  pushedText,
  galleryRowsOf,
  galleryPagePlan,
  galleryCacheOf,
  galleryCacheText,
  errorTextOf,
  refreshedGallery,
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

// --- Gallery: one GitHub topic search, paged, cached and refreshed offline-first. ---

const searchPayload = {
  total_count: 753,
  incomplete_results: false,
  items: [
    {
      full_name: "BWrong/better-changes",
      stargazers_count: 812,
      description: "Review and land changes without leaving the terminal",
      pushed_at: "2026-11-02T08:31:05Z",
    },
    {
      full_name: "someone/herdr-tabs",
      stargazers_count: 0,
      description: null,
      pushed_at: null,
    },
  ],
};

test("a search response becomes gallery rows with repository, stars, description and last push", () => {
  const gallery = galleryRowsOf(searchPayload);
  assert.equal(gallery.totalCount, 753);
  assert.deepEqual(gallery.rows, [
    {
      repository: "BWrong/better-changes",
      stars: 812,
      description: "Review and land changes without leaving the terminal",
      pushedAt: "2026-11-02",
    },
    { repository: "someone/herdr-tabs", stars: 0, description: "", pushedAt: "unknown" },
  ]);
});

test("gallery rows read a JSON string too, and a body without items yields none", () => {
  assert.equal(galleryRowsOf(JSON.stringify(searchPayload)).rows.length, 2);
  assert.deepEqual(galleryRowsOf("not json"), { totalCount: 0, rows: [] });
  assert.deepEqual(galleryRowsOf({ total_count: 4, items: "nope" }), { totalCount: 4, rows: [] });
});

test("pushedText keeps the date of a push and says unknown when there is none", () => {
  assert.equal(pushedText("2026-11-02T08:31:05Z"), "2026-11-02");
  assert.equal(pushedText(null), "unknown");
  assert.equal(pushedText("yesterday"), "unknown");
});

test("the paging plan covers every result, 100 per page, and stops where GitHub stops", () => {
  assert.deepEqual(galleryPagePlan(0), []);
  assert.deepEqual(galleryPagePlan(100), [1]);
  assert.deepEqual(galleryPagePlan(250), [1, 2, 3]);
  assert.deepEqual(galleryPagePlan(753), [1, 2, 3, 4, 5, 6, 7, 8]);
  // Search exposes the first 1000 results only; asking beyond it is an error, not a page.
  assert.deepEqual(galleryPagePlan(5000), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("the gallery cache keeps its fetch time and rows, and reads back as empty when unusable", () => {
  const cache = {
    fetchedAt: "2026-11-16T15:04:00.000Z",
    rows: [{ repository: "someone/herdr-tabs", stars: 3, description: "Tabs", pushedAt: "2026-10-01" }],
  };
  const text = galleryCacheText(cache);
  assert.deepEqual(galleryCacheOf(text), cache);
  assert.ok(JSON.parse(text).fetchedAt === "2026-11-16T15:04:00.000Z");
  assert.deepEqual(galleryCacheOf(null), { fetchedAt: null, rows: [] });
  assert.deepEqual(galleryCacheOf("{broken"), { fetchedAt: null, rows: [] });
});

test("errorTextOf shows the responder's own message verbatim, never a guess", () => {
  const rateLimited = '{"message":"API rate limit exceeded for 203.0.113.7.","documentation_url":"https://docs.github.com/rest"}';
  assert.equal(errorTextOf(rateLimited, 403), "API rate limit exceeded for 203.0.113.7.");
  assert.equal(
    errorTextOf({ message: "Validation Failed" }, 422),
    "Validation Failed",
  );
  assert.equal(errorTextOf("Bad Gateway", 502), "Bad Gateway");
  assert.equal(errorTextOf("", 500), "HTTP 500");
  assert.equal(errorTextOf(null, 0), "Request failed");
});

test("a failed refresh keeps the rows it had and carries the failure's text", () => {
  const cache = {
    fetchedAt: "2026-11-16T15:04:00.000Z",
    rows: [{ repository: "someone/herdr-tabs", stars: 3, description: "Tabs", pushedAt: "2026-10-01" }],
  };
  const failed = refreshedGallery(cache, { error: "API rate limit exceeded for 203.0.113.7." });
  assert.deepEqual(failed.rows, cache.rows);
  assert.equal(failed.fetchedAt, "2026-11-16T15:04:00.000Z");
  assert.equal(failed.error, "API rate limit exceeded for 203.0.113.7.");

  const fresh = [{ repository: "BWrong/better-changes", stars: 812, description: "Changes", pushedAt: "2026-11-02" }];
  const succeeded = refreshedGallery(cache, { rows: fresh, fetchedAt: "2026-11-16T16:20:00.000Z" });
  assert.deepEqual(succeeded.rows, fresh);
  assert.equal(succeeded.fetchedAt, "2026-11-16T16:20:00.000Z");
  assert.equal(succeeded.error, null);
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
