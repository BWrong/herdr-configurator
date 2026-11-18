// The pure half of the Workshop: folder listing → rows, Origin, filtering.
// Run with `node --test mods/workshop/*.test.js`; no Herdr, no dependencies.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  folderNames,
  rowsOf,
  filterRows,
  fileSizesOf,
  fileChipsOf,
  layoutsReferencing,
  keyBindingsOf,
  scanText,
  leftoverTextOf,
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
  sourceEvidenceOf,
  pushedText,
  galleryRowsOf,
  galleryFiltered,
  galleryPagePlan,
  galleryCacheOf,
  galleryCacheText,
  modsFromTree,
  reposCacheOf,
  reposCacheText,
  modsLineOf,
  errorTextOf,
  refreshedGallery,
  checkTargets,
  checkStateOf,
  checkedText,
  withCheckResults,
  installFolderName,
  modFoldersOf,
  declinedInstallText,
  installedText,
  keysFileOf,
  keysOfferOf,
  keysFragmentText,
  keyBindingLine,
  keyConflictText,
  trashStamp,
  trashPath,
  confirmScanText,
  uninstallOf,
  withoutEntry,
  updateTargetOf,
  compareUpdate,
  writePlan,
  updateReportText,
  updatePromptText,
  updateNoteOf,
  updatedRow,
  updateTempPath,
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
    { name: "catppuccin-status", modJson: '{"title":"Catppuccin Status","cloned_from":{"name":"workspace-status"}}' },
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

test("the detail ignores a source hint an entry's mod.json happens to carry", () => {
  const hinted = detailOf(rowsForDetail.find((row) => row.name === "better-config"), {
    folder: "mods/better-config",
    manifest: { source: "BWrong/hinted" },
  });
  assert.equal(hinted.repo, null);
  assert.equal(hinted.commit, null);
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

test("a shipped entry says no provenance is recorded, never unknown", () => {
  const detail = detailOf(rowsForDetail.find((row) => row.name === "help"), { folder: "mods/help" });
  assert.equal(detail.origin, "shipped");
  assert.equal(detail.provenanceText, "No recorded provenance");
  assert.deepEqual(detail.files, []);
});

test("a cloned entry's provenance line says it never follows upstream", () => {
  const detail = detailOf(rowsForDetail.find((row) => row.name === "catppuccin-status"), {
    folder: "mods/catppuccin-status",
  });
  assert.equal(detail.origin, "cloned");
  assert.equal(detail.provenanceText, "This entry is a copy; it never follows upstream.");
});

test("the detail pane's file chips cap at a limit and count the rest", () => {
  const files = ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js", "g.js"].map((name) => ({ name, size: 1 }));
  const chips = fileChipsOf(files);
  assert.deepEqual(chips.shown.map((file) => file.name), ["a.js", "b.js", "c.js", "d.js", "e.js"]);
  assert.equal(chips.more, 2);
  assert.deepEqual(fileChipsOf(files.slice(0, 3)), { shown: files.slice(0, 3), more: 0 });
  assert.deepEqual(fileChipsOf(null), { shown: [], more: 0 });
});

test("sizeText writes byte sizes in B, kB and MB", () => {
  assert.equal(sizeText(0), "0 B");
  assert.equal(sizeText(911), "911 B");
  assert.equal(sizeText(2048), "2.0 kB");
  assert.equal(sizeText(26628), "26.0 kB");
  assert.equal(sizeText(1048576), "1.0 MB");
  assert.equal(sizeText(1778493), "1.7 MB");
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

test("a refresh that fails on page 5 of 9 keeps the pages it read, and says why", () => {
  const cache = { fetchedAt: "2026-11-16T15:04:00.000Z", rows: [] };
  const partial = refreshedGallery(cache, {
    rows: [{ repository: "BWrong/better-tabs", stars: 12, description: "Tabs", pushedAt: "2026-11-01" }],
    fetchedAt: "2026-11-16T17:20:00.000Z",
    error: "fetching page 5 failed",
  });
  assert.equal(partial.rows.length, 1);
  assert.equal(partial.fetchedAt, "2026-11-16T17:20:00.000Z");
  assert.equal(partial.error, "fetching page 5 failed");
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
    `${digest("b")}  ./icons/blocks.svg`,
    `${digest("c")} *./mod.json`,
    "shasum: ./gone.js: No such file or directory",
    "",
  ].join("\n");
  assert.deepEqual(hashesOf(output), {
    "icons/blocks.svg": `sha256:${digest("b")}`,
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

test("recording a source writes only what a reader uses: repo, ref, commit and per-file hashes", () => {
  const files = { "main.js": `sha256:${digest("a")}` };
  const entries = recordSource({}, { name: "better-config", repo: "BWrong/better-config", ref: "main", commit: HEX, files, now: 1794000000000 });
  assert.deepEqual(entries, {
    "better-config": {
      repo: "BWrong/better-config",
      ref: "main",
      commit: HEX,
      files,
    },
  });
});

test("recording again updates the row in place", () => {
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
  assert.deepEqual(Object.keys(second["better-config"]), ["repo", "ref", "commit", "files"]);
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

// --- Uninstall: the Reference scan in the confirm panel, the trash plan, the ledger row. ---

const uninstallRows = rowsOf(
  [
    { name: "better-changes", modJson: '{"title":"Better Changes","version":"0.2.0"}' },
    { name: "catppuccin-status", modJson: '{"title":"Catppuccin Status","cloned_from":{"name":"workspace-status"}}' },
    { name: "help", modJson: '{"title":"Help"}' },
  ],
  { installed, ledger: { "better-changes": { repository: "BWrong/better-changes", commit: HEX } } },
);

const scanOf = (row) =>
  detailOf(row, {
    folder: `mods/${row.name}`,
    ledger: { "better-changes": { repository: "BWrong/better-changes", commit: HEX } },
    layouts: [
      { name: "main", text: '{"children":[{"content":{"mod":"better-changes"}}]}' },
      { name: "terminals", text: '{"children":[{"content":{"mod":"better-changes"}}]}' },
    ],
    keys: [
      { section: "mod:better-changes", keys: "cmd-shift-x", action: "better-changes:check" },
      { section: "mod:better-changes", keys: "alt-x", action: "better-changes:open" },
    ],
  });

test("trashStamp names a folder by the time, filesystem-safe and to the second", () => {
  assert.equal(trashStamp(Date.UTC(2026, 10, 16, 16, 26, 19)), "2026-11-16T16-26-19Z");
  assert.equal(trashStamp(Date.UTC(2026, 0, 2, 3, 4, 5)), "2026-01-02T03-04-05Z");
});

test("trashPath puts the entry's folder under the time inside the trash", () => {
  assert.equal(
    trashPath("better-changes", { now: Date.UTC(2026, 10, 16, 16, 26, 19), trash: "data/workshop/trash" }),
    "data/workshop/trash/2026-11-16T16-26-19Z/better-changes",
  );
});

test("the confirm panel counts the layouts and key sections that reference the entry", () => {
  assert.equal(
    confirmScanText("better-changes", {
      layouts: ["main", "terminals", "win98"],
      keys: [
        { keys: "cmd-shift-x", action: "better-changes:check" },
        { keys: "alt-x", action: "better-changes:open" },
      ],
    }),
    "3 layouts reference this entry: main, terminals, win98. " +
      "1 key section is bound to this entry: mod:better-changes " +
      "(cmd-shift-x → better-changes:check, alt-x → better-changes:open).",
  );
  assert.equal(
    confirmScanText("tabs", { layouts: ["main"], keys: [{ keys: "alt-x", action: "tabs:go" }] }),
    "1 layout references this entry: main. 1 key section is bound to this entry: mod:tabs (alt-x → tabs:go).",
  );
  assert.equal(
    confirmScanText("tabs", { layouts: [], keys: [] }),
    "No layout references this entry. No key section is bound to this entry.",
  );
});

test("a third-party entry's uninstall plan names the source, the trash destination and the panel text", () => {
  const plan = uninstallOf(scanOf(uninstallRows.find((row) => row.name === "better-changes")), {
    now: Date.UTC(2026, 10, 16, 16, 26, 19),
    mods: "mods",
    trash: "data/workshop/trash",
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.reason, null);
  assert.equal(plan.note, null);
  assert.equal(plan.source, "mods/better-changes");
  assert.equal(plan.trashFolder, "data/workshop/trash/2026-11-16T16-26-19Z");
  assert.equal(plan.destination, "data/workshop/trash/2026-11-16T16-26-19Z/better-changes");
  assert.equal(
    plan.scanText,
    "2 layouts reference this entry: main, terminals. " +
      "1 key section is bound to this entry: mod:better-changes " +
      "(cmd-shift-x → better-changes:check, alt-x → better-changes:open).",
  );
  assert.equal(
    plan.moveText,
    "Nothing is deleted: better-changes moves to data/workshop/trash/2026-11-16T16-26-19Z/better-changes, and its ledger row is dropped.",
  );
});

test("a shipped entry offers no uninstall and says Herdr restores it", () => {
  const detail = detailOf(uninstallRows.find((row) => row.name === "help"), { folder: "mods/help" });
  const plan = uninstallOf(detail);
  assert.equal(plan.allowed, false);
  assert.match(plan.reason, /Herdr restores/);
  assert.equal(plan.destination, null);
  assert.equal(plan.moveText, null);
});

test("a cloned entry is a copy that never follows upstream, and can still go", () => {
  const plan = uninstallOf(scanOf(uninstallRows.find((row) => row.name === "catppuccin-status")));
  assert.equal(plan.allowed, true);
  assert.equal(plan.reason, null);
  assert.equal(plan.note, "This entry is a copy; it never follows upstream.");
  assert.ok(plan.destination.endsWith("/catppuccin-status"));
});

// The Update row explains the same Origins in its own words; a tracked entry needs none.
test("an Origin with no update target says why instead of showing nothing", () => {
  assert.equal(
    updateNoteOf("shipped", null),
    "Herdr restores its own shipped files on the next start; there is nothing to update.",
  );
  assert.equal(updateNoteOf("cloned", null), "This entry is a copy; it never follows upstream.");
  assert.equal(
    updateNoteOf("third_party", null),
    "No recorded repository and ref yet — use Record provenance.",
  );
  assert.equal(updateNoteOf("third_party", { repo: "o/r", ref: "main", files: {} }), null);
});

test("an uninstall plan with no scan says none in both halves", () => {
  const row = rowsOf([{ name: "bare", modJson: null }], {})[0];
  const plan = uninstallOf(detailOf(row, { folder: "mods/bare" }));
  assert.equal(plan.scanText, "No layout references this entry. No key section is bound to this entry.");
});

test("withoutEntry drops only that entry's ledger row", () => {
  const entries = {
    "better-changes": { repo: "BWrong/better-changes", commit: HEX },
    "hand-made": { repo: "someone/hand-made", commit: HEX2 },
  };
  assert.deepEqual(withoutEntry(entries, "better-changes"), { "hand-made": entries["hand-made"] });
  assert.deepEqual(withoutEntry(entries, "never-recorded"), entries);
  assert.deepEqual(entries, {
    "better-changes": { repo: "BWrong/better-changes", commit: HEX },
    "hand-made": { repo: "someone/hand-made", commit: HEX2 },
  });
});

// --- Update checks: which entries to ask upstream about, what the answer means, and the
// ledger update each check run plans. One lookup per tracked entry, nothing else.

const movedLedger = {
  "better-changes": {
    kind: "mod",
    origin: "third_party",
    repo: "BWrong/better-changes",
    ref: "main",
    commit: HEX,
    checkedAt: 1794000000000,
    installedAt: 1794000000000,
    files: {},
  },
};

test("a check targets every tracked third-party entry at one commit URL, and nothing else", () => {
  const rows = rowsOf(
    [
      { name: "better-changes", modJson: '{"title":"Better Changes"}' },
      { name: "hand-made", modJson: '{"title":"Hand made"}' },
      { name: "help", modJson: '{"title":"Help"}' },
      { name: "catppuccin-status", modJson: '{"title":"Catppuccin","cloned_from":{"name":"workspace-status"}}' },
    ],
    { installed, ledger: movedLedger },
  );
  assert.deepEqual(checkTargets(rows, movedLedger), [
    {
      name: "better-changes",
      repo: "BWrong/better-changes",
      ref: "main",
      url: "https://api.github.com/repos/BWrong/better-changes/commits/main",
    },
  ]);
});

test("a check target encodes a ref that carries a slash or a space", () => {
  const entries = { "x": { repo: "o/r", ref: "feature/a b", commit: HEX } };
  const rows = rowsOf([{ name: "x", modJson: null }], { ledger: entries });
  assert.equal(checkTargets(rows, entries)[0].url, "https://api.github.com/repos/o/r/commits/feature%2Fa%20b");
});

test("no check is planned for a ledger row without a repository or a ref, or for no rows at all", () => {
  const rows = rowsOf([{ name: "x", modJson: null }, { name: "y", modJson: null }], {
    ledger: { x: { commit: HEX }, y: { repo: "o/r" } },
  });
  assert.deepEqual(checkTargets(rows, { x: { commit: HEX }, y: { repo: "o/r" } }), []);
  assert.deepEqual(checkTargets([], {}), []);
  assert.deepEqual(checkTargets(undefined, undefined), []);
  assert.deepEqual(checkTargets([], { x: { repo: "o/r", ref: "main" } }), []);
});

test("a check result equal to the ledger commit is up to date, anything else has moved", () => {
  assert.equal(checkStateOf({ commit: HEX, checkedCommit: HEX }), "current");
  assert.equal(checkStateOf({ commit: HEX, checkedCommit: HEX.toUpperCase() }), "current");
  assert.equal(checkStateOf({ commit: HEX, checkedCommit: HEX2 }), "moved");
  assert.equal(checkStateOf({ commit: "fedcba9876543", checkedCommit: HEX }), "moved");
});

test("an installed commit written short still compares by its prefix", () => {
  assert.equal(checkStateOf({ commit: HEX.slice(0, 7), checkedCommit: HEX }), "current");
});

test("an entry that was never checked has no state, and neither has one without a commit", () => {
  assert.equal(checkStateOf(undefined), "unchecked");
  assert.equal(checkStateOf({}), "unchecked");
  assert.equal(checkStateOf({ commit: HEX, checkedAt: 1794000000000 }), "unchecked");
  assert.equal(checkStateOf({ commit: HEX, checkedCommit: "abc" }), "unchecked");
  assert.equal(checkStateOf({ checkedCommit: HEX }), "unchecked");
});

test("a failed check is a state of its own and never reads as up to date", () => {
  const message = "API rate limit exceeded for 203.0.113.7.";
  assert.equal(checkStateOf({ commit: HEX, checkedError: message }), "failed");
  assert.equal(checkStateOf({ commit: HEX, checkedCommit: HEX, checkedError: message }), "failed");
});

test("rows carry a check state only for tracked third-party entries", () => {
  const rows = rowsOf(
    [
      { name: "better-changes", modJson: null },
      { name: "help", modJson: null },
    ],
    { installed, ledger: { "better-changes": { repo: "o/r", ref: "main", commit: HEX, checkedCommit: HEX } } },
  );
  const byName = Object.fromEntries(rows.map((row) => [row.name, row.checkState]));
  assert.deepEqual(byName, { "better-changes": "current", help: null });
});

test("checkedText writes a check time in UTC, and nothing when there is none", () => {
  assert.equal(checkedText(1794844800000), "2026-11-16 16:00 UTC");
  assert.equal(checkedText("1794844800000"), "2026-11-16 16:00 UTC");
  assert.equal(checkedText(undefined), null);
  assert.equal(checkedText(0), null);
  assert.equal(checkedText("not a time"), null);
});

test("a successful check records checkedAt and the resolved commit without touching commit", () => {
  const entries = withCheckResults(movedLedger, [{ name: "better-changes", commit: HEX2 }], 600);
  const row = entries["better-changes"];
  assert.equal(row.checkedAt, 600);
  assert.equal(row.checkedCommit, HEX2);
  assert.equal(row.commit, HEX);
  assert.equal(row.installedAt, 1794000000000);
  assert.equal(row.repo, "BWrong/better-changes");
  assert.equal(Object.hasOwn(row, "checkedError"), false);
});

test("a failed check records checkedAt and the responder's text instead of a commit", () => {
  const entries = withCheckResults(
    movedLedger,
    [{ name: "better-changes", error: "API rate limit exceeded for 203.0.113.7." }],
    600,
  );
  const row = entries["better-changes"];
  assert.equal(row.checkedAt, 600);
  assert.equal(row.checkedError, "API rate limit exceeded for 203.0.113.7.");
  assert.equal(Object.hasOwn(row, "checkedCommit"), false);
  assert.equal(row.commit, HEX);
});

test("a check run leaving a result out leaves its row exactly as it was", () => {
  const entries = {
    ...movedLedger,
    other: { repo: "o/r2", ref: "main", commit: HEX2, checkedCommit: HEX2, checkedAt: 100 },
  };
  const next = withCheckResults(entries, [{ name: "better-changes", commit: HEX2 }], 600);
  assert.deepEqual(next.other, entries.other);
  assert.deepEqual(entries["better-changes"], movedLedger["better-changes"]);
  assert.deepEqual(withCheckResults(entries, [], 600), entries);
});

test("a check result for a name the ledger does not hold adds no row", () => {
  assert.deepEqual(withCheckResults({}, [{ name: "ghost", commit: HEX2 }], 600), {});
});

test("a result without a usable commit becomes a failure, not a silent up-to-date", () => {
  const row = withCheckResults({ x: { repo: "o/r", ref: "main", commit: HEX } }, [{ name: "x" }], 600).x;
  assert.equal(Object.hasOwn(row, "checkedCommit"), false);
  assert.match(row.checkedError, /no commit/i);
});

test("the detail pane carries the check time, its state and the failure's own text", () => {
  const ledger = {
    "better-changes": {
      ...movedLedger["better-changes"],
      checkedAt: 1794844800000,
      checkedCommit: HEX2,
    },
  };
  const rows = rowsOf([{ name: "better-changes", modJson: null }], { ledger });
  const detail = detailOf(rows[0], { folder: "mods/better-changes", ledger });
  assert.equal(detail.lastChecked, "2026-11-16 16:00 UTC");
  assert.equal(detail.checkState, "moved");
  assert.equal(detail.checkError, null);
});

test("the detail pane of a failed check shows the responder's message, not a state", () => {
  const message = "API rate limit exceeded for 203.0.113.7.";
  const ledger = { x: { ...movedLedger["better-changes"], checkedAt: 1794844800000, checkedError: message } };
  const rows = rowsOf([{ name: "x", modJson: null }], { ledger });
  const detail = detailOf(rows[0], { folder: "mods/x", ledger });
  assert.equal(detail.checkState, "failed");
  assert.equal(detail.checkError, message);
  assert.equal(detail.lastChecked, "2026-11-16 16:00 UTC");
});

test("the detail pane of an entry never checked has no time and no state of consequence", () => {
  const ledger = { x: { repo: "o/r", ref: "main", commit: HEX } };
  const rows = rowsOf([{ name: "x", modJson: null }], { ledger });
  const detail = detailOf(rows[0], { folder: "mods/x", ledger });
  assert.equal(detail.lastChecked, null);
  assert.equal(detail.checkState, "unchecked");
  assert.equal(detail.checkError, null);
});

// --- Update: three hashes per file, the plan they produce, and the words the dialog uses.

const sha = (digit) => `sha256:${digest(digit)}`;

test("a clean entry compares the ledger, local and upstream hashes file by file", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "mod.json": sha("b") },
    local: { "main.js": sha("a"), "mod.json": sha("b") },
    upstream: { "main.js": sha("c"), "mod.json": sha("b") },
  });
  assert.equal(comparison.status, "clean");
  assert.deepEqual(comparison.edited, []);
  assert.deepEqual(comparison.added, []);
  assert.deepEqual(comparison.removed, []);
  assert.deepEqual(comparison.replaced, ["main.js"]);
  assert.deepEqual(comparison.restored, []);
  assert.deepEqual(comparison.unchanged, ["mod.json"]);
  assert.deepEqual(comparison.writes, ["main.js"]);
  assert.deepEqual(comparison.editedReplaced, []);
  assert.deepEqual(comparison.toTrash, []);
});

test("a file edited after install makes the whole entry edited and lists it for the trash", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "mod.json": sha("b") },
    local: { "main.js": sha("d"), "mod.json": sha("b") },
    upstream: { "main.js": sha("c"), "mod.json": sha("b") },
  });
  assert.equal(comparison.status, "edited");
  assert.deepEqual(comparison.edited, ["main.js"]);
  assert.deepEqual(comparison.writes, ["main.js"]);
  assert.deepEqual(comparison.editedReplaced, ["main.js"]);
  assert.deepEqual(comparison.replaced, ["main.js"]);
});

test("files upstream no longer ships are removed, and the ones still on disk are trashed", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "old.js": sha("b") },
    local: { "main.js": sha("a"), "old.js": sha("b") },
    upstream: { "main.js": sha("c") },
  });
  assert.equal(comparison.status, "clean");
  assert.deepEqual(comparison.removed, ["old.js"]);
  assert.deepEqual(comparison.toTrash, ["old.js"]);
  assert.deepEqual(comparison.writes, ["main.js"]);
  assert.deepEqual(comparison.replaced, ["main.js"]);
});

test("files upstream added are written, and a ledger file already gone needs no trash", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "gone.js": sha("b") },
    local: { "main.js": sha("a") },
    upstream: { "main.js": sha("a"), "icons/new.svg": sha("c") },
  });
  assert.deepEqual(comparison.added, ["icons/new.svg"]);
  assert.deepEqual(comparison.writes, ["icons/new.svg"]);
  assert.deepEqual(comparison.removed, ["gone.js"]);
  assert.deepEqual(comparison.toTrash, []);
});

test("a file deleted from disk counts as edited and is restored from upstream", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "mod.json": sha("b") },
    local: { "mod.json": sha("b") },
    upstream: { "main.js": sha("a"), "mod.json": sha("b") },
  });
  assert.equal(comparison.status, "edited");
  assert.deepEqual(comparison.edited, ["main.js"]);
  assert.deepEqual(comparison.writes, ["main.js"]);
  assert.deepEqual(comparison.restored, ["main.js"]);
  assert.deepEqual(comparison.replaced, []);
  assert.deepEqual(comparison.editedReplaced, []);
});

test("a file the person added by hand counts as edited and is never trashed or overwritten", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a") },
    local: { "main.js": sha("a"), "notes.txt": sha("d") },
    upstream: { "main.js": sha("a") },
  });
  assert.equal(comparison.status, "edited");
  assert.deepEqual(comparison.edited, ["notes.txt"]);
  assert.deepEqual(comparison.writes, []);
  assert.deepEqual(comparison.editedReplaced, []);
  assert.deepEqual(comparison.toTrash, []);
});

test("a file edited and dropped upstream is edited, removed and trashed, with no backup", () => {
  const comparison = compareUpdate({
    recorded: { "old.js": sha("a") },
    local: { "old.js": sha("d") },
    upstream: {},
  });
  assert.equal(comparison.status, "edited");
  assert.deepEqual(comparison.edited, ["old.js"]);
  assert.deepEqual(comparison.removed, ["old.js"]);
  assert.deepEqual(comparison.toTrash, ["old.js"]);
  assert.deepEqual(comparison.writes, []);
  assert.deepEqual(comparison.editedReplaced, []);
});

test("the comparison reads absent or unusable hashes as an empty side, never as an error", () => {
  const comparison = compareUpdate({});
  assert.equal(comparison.status, "clean");
  assert.deepEqual(comparison.writes, []);
  assert.deepEqual(compareUpdate(undefined).removed, []);
  assert.deepEqual(compareUpdate({ recorded: null, local: {}, upstream: null }), comparison);
});

test("a plan for an edited entry writes and trashes nothing until the person confirms", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a") },
    local: { "main.js": sha("d") },
    upstream: { "main.js": sha("c") },
  });
  assert.deepEqual(writePlan(comparison), { blocked: true, writes: [], trash: [] });
  assert.deepEqual(writePlan(comparison, { overwrite: false }), { blocked: true, writes: [], trash: [] });
});

test("a clean plan writes the upstream files and trashes the dropped ones", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "old.js": sha("b") },
    local: { "main.js": sha("a"), "old.js": sha("b") },
    upstream: { "main.js": sha("c"), "new.js": sha("d") },
  });
  assert.deepEqual(writePlan(comparison), {
    blocked: false,
    writes: ["main.js", "new.js"],
    trash: ["old.js"],
  });
});

test("an overwrite moves the edited file to the trash before writing over it, once per path", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a"), "old.js": sha("b") },
    local: { "main.js": sha("d"), "old.js": sha("e") },
    upstream: { "main.js": sha("c") },
  });
  assert.deepEqual(writePlan(comparison, { overwrite: true }), {
    blocked: false,
    writes: ["main.js"],
    trash: ["main.js", "old.js"],
  });
});

test("an overwrite leaves an edited file upstream does not ship in place", () => {
  const comparison = compareUpdate({
    recorded: { "main.js": sha("a") },
    local: { "main.js": sha("a"), "notes.txt": sha("d") },
    upstream: { "main.js": sha("a") },
  });
  assert.deepEqual(writePlan(comparison, { overwrite: true }), { blocked: false, writes: [], trash: [] });
});

test("the report counts added, replaced, restored and removed files in one line", () => {
  assert.equal(
    updateReportText({
      name: "better-changes",
      commit: HEX,
      added: ["new.js"],
      replaced: ["main.js", "mod.json"],
      restored: [],
      removed: ["old.js"],
    }),
    "Updated better-changes @ abcdef1: 1 file added, 2 files replaced, 1 file removed to the trash.",
  );
  assert.equal(
    updateReportText({ name: "x", commit: HEX, restored: ["main.js"] }),
    "Updated x @ abcdef1: 1 file restored.",
  );
  assert.equal(updateReportText({ name: "x", commit: HEX }), "Updated x @ abcdef1: nothing changed.");
  assert.equal(updateReportText({ name: "x" }), "Updated x: nothing changed.");
  assert.equal(
    updateReportText({ name: "x", commit: HEX, removed: ["a", "b"] }),
    "Updated x @ abcdef1: 2 files removed to the trash.",
  );
});

test("the prompt says which files changed and offers the two answers", () => {
  assert.equal(
    updatePromptText("better-changes", ["main.js", "mod.json"]),
    "better-changes has 2 files edited since install (main.js, mod.json). Move to Trash and overwrite, or cancel?",
  );
  assert.equal(
    updatePromptText("x", ["notes.txt"]),
    "x has 1 file edited since install (notes.txt). Move to Trash and overwrite, or cancel?",
  );
});

test("only an entry with a recorded repository, ref and hashes can be updated", () => {
  assert.deepEqual(updateTargetOf({ repo: "o/r", ref: "main", commit: HEX, files: { "a.js": sha("a") } }), {
    repo: "o/r",
    ref: "main",
    commit: HEX,
    files: { "a.js": sha("a") },
  });
  assert.equal(updateTargetOf({ repository: "o/r", ref: "main", files: {} }).repo, "o/r");
  assert.equal(updateTargetOf({ repo: "o/r", ref: "main", commit: HEX }), null);
  assert.equal(updateTargetOf({ repo: "o/r", commit: HEX, files: {} }), null);
  assert.equal(updateTargetOf({ ref: "main", files: {} }), null);
  assert.equal(updateTargetOf({ repo: "o/r", ref: "main", files: "nope" }), null);
  assert.equal(updateTargetOf(null), null);
  assert.equal(updateTargetOf({ repo: "o/r", ref: "main", files: {} }).commit, null);
});

test("an updated ledger row carries the new commit and hashes, and keeps its install time", () => {
  const entries = {
    x: {
      kind: "mod",
      origin: "third_party",
      repo: "o/r",
      ref: "main",
      commit: HEX,
      checkedAt: 100,
      checkedCommit: HEX,
      checkedError: "API rate limit exceeded for 203.0.113.7.",
      installedAt: 100,
      files: { "old.js": sha("a") },
    },
    other: { repo: "a/b" },
  };
  const frozen = JSON.parse(JSON.stringify(entries));
  const next = updatedRow(entries, { name: "x", commit: HEX2, files: { "main.js": sha("b") }, now: 600 });
  assert.deepEqual(next.x, {
    kind: "mod",
    origin: "third_party",
    repo: "o/r",
    ref: "main",
    commit: HEX2,
    checkedAt: 600,
    checkedCommit: HEX2,
    installedAt: 100,
    files: { "main.js": sha("b") },
  });
  assert.deepEqual(next.other, entries.other);
  assert.deepEqual(entries, frozen);
  assert.equal(checkStateOf(next.x), "current");
});

test("an update for a name the ledger does not hold adds no row, and needs a commit", () => {
  assert.deepEqual(updatedRow({}, { name: "ghost", commit: HEX2, files: {} }), {});
  const entries = { x: { repo: "o/r", ref: "main", commit: HEX } };
  assert.deepEqual(updatedRow(entries, { name: "x", files: {} }), entries);
  assert.deepEqual(updatedRow({ x: { repo: "o/r" } }, { name: "x", commit: "" }), { x: { repo: "o/r" } });
});

test("an update clones into its own temp folder under the Workshop's state", () => {
  assert.equal(
    updateTempPath("better-changes", { now: 1794844800000 }),
    "data/workshop/temp/update-better-changes-2026-11-16T16-00-00Z",
  );
  assert.equal(updateTempPath("x", { now: 1794844800000, temp: "/tmp/here" }), "/tmp/here/update-x-2026-11-16T16-00-00Z");
});

// --- Installing from the gallery: the folder a fresh install takes, which folder a
// repository ships, the ledger row it records, and what the result line says.

test("an install takes the mod folder's own name unless mods/ already has it", () => {
  assert.equal(installFolderName("better-changes", []), "better-changes");
  assert.equal(installFolderName("better-changes", ["help", "other"]), "better-changes");
  assert.equal(installFolderName("better-changes", ["better-changes"]), "better-changes-copy");
  assert.equal(
    installFolderName("better-changes", ["better-changes", "better-changes-copy"]),
    "better-changes-copy-2",
  );
  assert.equal(
    installFolderName("better-changes", ["better-changes", "better-changes-copy", "better-changes-copy-2"]),
    "better-changes-copy-3",
  );
  assert.equal(installFolderName("better-changes", null), "better-changes");
});

test("the mod folders of a clone are found wherever they sit", () => {
  const found = modFoldersOf(
    "./mods/workshop/mod.json\n./herdr-app/mods/herdr-nvim/mod.json\n./herdr/mods/skillsgate/mod.json\n./examples/winprobe-mod/mod.json\n./README.md\n",
  );
  assert.deepEqual(found, [
    { name: "herdr-nvim", dir: "herdr-app/mods/herdr-nvim" },
    { name: "skillsgate", dir: "herdr/mods/skillsgate" },
    { name: "workshop", dir: "mods/workshop" },
  ]);
  assert.deepEqual(modFoldersOf("./better-changes/mods/better-changes/mod.json"), [
    { name: "better-changes", dir: "better-changes/mods/better-changes" },
  ]);
  assert.deepEqual(modFoldersOf([]), []);
  assert.deepEqual(modFoldersOf("  \n\n"), []);
  assert.deepEqual(modFoldersOf(undefined), []);
});

test("a repository with no mod folder is declined with an explanation", () => {
  const none = declinedInstallText("owner/empty", []);
  assert.match(none, /ships no mods\/<name>\/mod\.json anywhere/);
  assert.match(none, /nothing was copied/i);
  const several = declinedInstallText("owner/multi", ["one", "two"]);
  assert.match(several, /ships 2 mod folders \(one, two\)/);
  assert.match(several, /nothing was copied/);
});

test("a fresh install records the resolved commit and a hash per file in the ledger", () => {
  const output = `${digest("a")}  ./mod.json\n${digest("b")}  ./main.js\n`;
  const files = hashesOf(output);
  const entries = recordSource({}, {
    name: "better-changes-copy",
    repo: "BWrong/better-changes",
    ref: "main",
    commit: HEX,
    files,
    now: 1794000000000,
  });
  const row = entries["better-changes-copy"];
  assert.deepEqual(Object.keys(row), ["repo", "ref", "commit", "files"]);
  assert.equal(row.repo, "BWrong/better-changes");
  assert.equal(row.ref, "main");
  assert.equal(row.commit, HEX);
  assert.deepEqual(row.files, {
    "main.js": `sha256:${digest("b")}`,
    "mod.json": `sha256:${digest("a")}`,
  });
});

test("the install result says what landed where, with the short commit", () => {
  assert.equal(
    installedText({
      name: "better-changes",
      folder: "better-changes-copy",
      repo: "BWrong/better-changes",
      commit: HEX,
    }),
    "Installed better-changes into mods/better-changes-copy from BWrong/better-changes @ abcdef1.",
  );
});

// --- Key bindings a repository ships: parsing its keys.json, the split against the
// person's current bindings, and the text a copy action hands over.

test("keysFileOf reads a mod's keys.json into one row per binding", () => {
  const text = JSON.stringify({
    global: { "cmd-j": "mod.open:herdr-panel" },
    "mod:herdr-panel": { "cmd-shift-j": "herdr-panel:toggle" },
  });
  assert.deepEqual(keysFileOf(text), {
    bindings: [
      { section: "global", keys: "cmd-j", action: "mod.open:herdr-panel" },
      { section: "mod:herdr-panel", keys: "cmd-shift-j", action: "herdr-panel:toggle" },
    ],
    problem: null,
  });
});

test("keysFileOf keeps a command object action as it is", () => {
  const action = { command: "layout.resize", args: { id: "sidebar", px: 240 } };
  const parsed = keysFileOf(JSON.stringify({ global: { "ctrl-shift-r": action } }));
  assert.deepEqual(parsed.bindings, [{ section: "global", keys: "ctrl-shift-r", action }]);
});

test("keysFileOf treats an absent or empty file as shipping no bindings, not a failure", () => {
  assert.deepEqual(keysFileOf(""), { bindings: [], problem: null });
  assert.deepEqual(keysFileOf("   \n"), { bindings: [], problem: null });
  assert.deepEqual(keysFileOf(null), { bindings: [], problem: null });
});

test("keysFileOf reports a file it cannot read rather than guessing", () => {
  assert.equal(keysFileOf("not json").problem, "keys.json is not valid JSON.");
  assert.equal(keysFileOf("[1,2]").problem, "keys.json is not an object.");
  const mixed = keysFileOf('{"global":{"cmd-j":"x"},"broken":[1]}');
  assert.equal(mixed.bindings.length, 1);
  assert.equal(mixed.problem, 'keys.json section "broken" is not an object.');
});

test("keysFileOf drops unusable actions and says how many", () => {
  const parsed = keysFileOf('{"global":{"cmd-j":"ok","cmd-k":42,"cmd-l":{"args":{}}}}');
  assert.deepEqual(parsed.bindings, [{ section: "global", keys: "cmd-j", action: "ok" }]);
  assert.equal(parsed.problem, "keys.json has 2 bindings with unusable actions.");
});

test("a binding conflicts when its key is already bound in any section, and the note names it", () => {
  const current = [
    { section: "global", keys: "cmd-t", action: "tab.new" },
    { section: "terminal", keys: "cmd-c", action: "terminal.copy" },
    { section: "mod:editor", keys: "ctrl-s", action: "editor.save" },
  ];
  const text = JSON.stringify({
    global: { "cmd-t": "herdr-panel:tabs" },
    "mod:herdr-panel": { "ctrl-s": "herdr-panel:save" },
  });
  const offer = keysOfferOf([{ source: "installed folder", text }], current);
  const conflict = offer.conflicts.find((entry) => entry.keys === "cmd-t");
  assert.deepEqual(conflict.existing, [{ section: "global", action: "tab.new" }]);
  assert.equal(keyConflictText(conflict), "cmd-t is already bound in global (tab.new).");
  assert.equal(offer.offered.length, 0);
});

test("the split offers what nothing binds and lists what collides, with the section that holds it", () => {
  const current = [
    { section: "global", keys: "cmd-t", action: "tab.new" },
    { section: "terminal", keys: "cmd-c", action: "terminal.copy" },
    { section: "mod:editor", keys: "ctrl-s", action: "editor.save" },
  ];
  const text = JSON.stringify({
    global: { "cmd-shift-j": "herdr-panel:toggle", "cmd-t": "herdr-panel:tabs" },
    "mod:herdr-panel": { "ctrl-s": "herdr-panel:save", "cmd-j": "mod.open:herdr-panel" },
  });
  const offer = keysOfferOf([{ source: "installed folder", text }], current);
  assert.deepEqual(offer.problems, []);
  assert.deepEqual(offer.offered.map((binding) => [binding.section, binding.keys]), [
    ["global", "cmd-shift-j"],
    ["mod:herdr-panel", "cmd-j"],
  ]);
  assert.deepEqual(offer.conflicts.map((conflict) => [conflict.keys, conflict.existing]), [
    ["cmd-t", [{ section: "global", action: "tab.new" }]],
    ["ctrl-s", [{ section: "mod:editor", action: "editor.save" }]],
  ]);
});

test("the same key bound in several sections is one conflict noting each of them", () => {
  const current = [
    { section: "global", keys: "cmd-t", action: "tab.new" },
    { section: "terminal", keys: "cmd-t", action: "terminal.new" },
  ];
  const offer = keysOfferOf([{ source: "x", text: '{"mod:x":{"cmd-t":"x:new"}}' }], current);
  assert.equal(offer.conflicts.length, 1);
  assert.deepEqual(offer.conflicts[0].existing, [
    { section: "global", action: "tab.new" },
    { section: "terminal", action: "terminal.new" },
  ]);
  assert.equal(keyConflictText(offer.conflicts[0]), "cmd-t is already bound in global (tab.new), terminal (terminal.new).");
});

test("the same binding shipped twice by one repository is offered once", () => {
  const text = '{"global":{"cmd-j":"mod.open:herdr-panel"}}';
  const offer = keysOfferOf(
    [
      { source: "upstream", text },
      { source: "installed folder", text },
    ],
    [],
  );
  assert.deepEqual(offer.offered, [{ section: "global", keys: "cmd-j", action: "mod.open:herdr-panel" }]);
  assert.deepEqual(offer.problems, []);
});

test("the offered bindings copy as a keys.json fragment and each line stands alone", () => {
  const offered = [
    { section: "global", keys: "cmd-j", action: "mod.open:herdr-panel" },
    { section: "global", keys: "cmd-shift-r", action: { command: "layout.resize", args: { id: "sidebar", px: 240 } } },
    { section: "mod:herdr-panel", keys: "cmd-shift-j", action: "herdr-panel:toggle" },
  ];
  const fragment = keysFragmentText(offered);
  assert.deepEqual(JSON.parse(fragment), {
    global: { "cmd-j": "mod.open:herdr-panel", "cmd-shift-r": { command: "layout.resize", args: { id: "sidebar", px: 240 } } },
    "mod:herdr-panel": { "cmd-shift-j": "herdr-panel:toggle" },
  });
  assert.match(fragment, /^\{\n  "global": \{\n/);
  assert.equal(
    keyBindingLine(offered[1]),
    '"cmd-shift-r": {"command":"layout.resize","args":{"id":"sidebar","px":240}}',
  );
});

test("with every binding taken there is nothing to copy", () => {
  const current = [{ section: "global", keys: "cmd-j", action: "app.quit" }];
  const offer = keysOfferOf([{ source: "x", text: '{"mod:x":{"cmd-j":"x:open"}}' }], current);
  assert.deepEqual(offer.offered, []);
  assert.equal(keysFragmentText(offer.offered), "");
});

test("the pure half of the flow leaves the person's keys file untouched", () => {
  const folder = mkdtempSync(join(tmpdir(), "herdr-keys-"));
  const file = join(folder, "keys.json");
  const text = '{\n  "global": { "cmd-j": "app.quit" },\n  "mod:editor": { "ctrl-s": "editor.save" }\n}\n';
  writeFileSync(file, text);
  try {
    const current = keysFileOf(readFileSync(file, "utf8")).bindings;
    const offer = keysOfferOf(
      [{ source: "upstream", text: '{"global":{"cmd-j":"mod.open:herdr-panel","cmd-shift-j":"herdr-panel:toggle"}}' }],
      current,
    );
    assert.equal(offer.conflicts.length, 1);
    assert.equal(offer.offered.length, 1);
    assert.equal(keysFragmentText(offer.offered), '{\n  "global": {\n    "cmd-shift-j": "herdr-panel:toggle"\n  }\n}\n');
    assert.equal(readFileSync(file, "utf8"), text);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

const GALLERY_ROWS = [
  { repository: "herdrdev/tmux-prefix", stars: 12, description: "tmux style prefix", pushedAt: "2 days ago" },
  { repository: "munza/herdr-mods", stars: 4, description: "Better config and better files", pushedAt: "5 days ago" },
  { repository: "BWrong/herdr-workshop", stars: 1, description: "", pushedAt: "today" },
];

test("the gallery keeps every row when nothing is typed", () => {
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, ""), GALLERY_ROWS);
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, "   "), GALLERY_ROWS);
});

test("the gallery filter matches a repository however it is typed", () => {
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, "TMUX-PREFIX").map((row) => row.repository), [
    "herdrdev/tmux-prefix",
  ]);
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, "bwrong/herdr").map((row) => row.repository), [
    "BWrong/herdr-workshop",
  ]);
});

test("the gallery filter matches a description too and says so when nothing does", () => {
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, "better files").map((row) => row.repository), [
    "munza/herdr-mods",
  ]);
  assert.deepEqual(galleryFiltered(GALLERY_ROWS, "nothing here"), []);
});

test("the category keeps only the Origin it names", () => {
  const rows = [
    { name: "changes", title: "Changes", origin: "shipped" },
    { name: "catppuccin-changes", title: "catppuccin-changes", origin: "cloned" },
    { name: "better-changes", title: "Better Changes", origin: "third_party" },
  ];
  assert.deepEqual(filterRows(rows, "", "all"), rows);
  assert.deepEqual(filterRows(rows, "", "third_party").map((row) => row.name), ["better-changes"]);
  assert.deepEqual(filterRows(rows, "", "cloned").map((row) => row.name), ["catppuccin-changes"]);
  assert.deepEqual(filterRows(rows, "changes", "cloned").map((row) => row.name), ["catppuccin-changes"]);
  assert.deepEqual(filterRows(rows, "better", "shipped"), []);
});

test("a checkout's own remote and commit are provenance, and half of it is not", () => {
  const commit = "9f2c1b0d4e5a6f708192a3b4c5d6e7f80912a3b4";
  assert.deepEqual(
    sourceEvidenceOf({ remote: "git@github.com:BWrong/herdr-workshop.git", commit, ref: "main" }),
    { repo: "BWrong/herdr-workshop", ref: "main", commit },
  );
  assert.deepEqual(
    sourceEvidenceOf({ remote: "https://github.com/munza/herdr-mods", commit, ref: "HEAD" }),
    { repo: "munza/herdr-mods", ref: "main", commit },
  );
  assert.equal(sourceEvidenceOf({ remote: "https://github.com/munza/herdr-mods" }), null);
  assert.equal(sourceEvidenceOf({ remote: "", commit }), null);
  assert.equal(sourceEvidenceOf({ remote: "https://gitlab.com/munza/herdr-mods", commit }), null);
  assert.equal(sourceEvidenceOf({}), null);
  assert.equal(sourceEvidenceOf(), null);
});

test("a repository tree names the mod folders it carries", () => {
  const tree = {
    tree: [
      { path: "mods/workshop/main.js" },
      { path: "mods/workshop/mod.json" },
      { path: "mods/better-files/mod.json" },
      { path: "mods/better-files/model.js" },
      { path: "RECIPE.md" },
      { path: "mods/stray/main.js" },
    ],
  };
  assert.deepEqual(modsFromTree(tree), ["better-files", "workshop"]);
  assert.deepEqual(modsFromTree(JSON.stringify(tree)), ["better-files", "workshop"]);
  assert.deepEqual(modsFromTree({ tree: [] }), []);
  assert.deepEqual(modsFromTree("not json"), []);
  assert.deepEqual(modsFromTree(null), []);
});

test("the repository cache survives a round trip and drops what it cannot read", () => {
  const repos = { "BWrong/herdr-workshop": { fetchedAt: "2026-11-18T00:00:00Z", mods: ["workshop"] } };
  assert.deepEqual(reposCacheOf(reposCacheText(repos)), repos);
  assert.deepEqual(reposCacheOf("{}"), {});
  assert.deepEqual(reposCacheOf("not json"), {});
  assert.deepEqual(reposCacheOf(JSON.stringify({ repos: { x: { mods: [1, "real"] } } })), {
    x: { fetchedAt: null, mods: ["real"] },
  });
});

test("the mods line says how many, and nothing at all before the tree is read", () => {
  assert.equal(modsLineOf(undefined), "");
  assert.equal(modsLineOf(null), "");
  assert.equal(modsLineOf([]), "No mod folder in this repository.");
  assert.equal(modsLineOf(["workshop"]), "One mod: workshop");
  assert.equal(modsLineOf(["a", "b"]), "2 mods: a, b");
  assert.equal(modsLineOf(["a", "b", "c", "d", "e", "f"]), "6 mods: a, b, c, d +2 more");
});

test("a leftover pane is named after the move, and silence when there is none", () => {
  assert.equal(leftoverTextOf("agenttrail", []), "");
  const text = leftoverTextOf("agenttrail", ["main-graph"]);
  assert.match(text, /layouts\/main-graph\.json still points at agenttrail/);
  assert.match(text, /no mod folder/);
  assert.match(leftoverTextOf("x", ["main-graph", "main"]), /layouts\/main-graph\.json, layouts\/main\.json/);
});
