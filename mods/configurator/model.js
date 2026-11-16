// model.js: the pure half of the Configurator — which entries exist, what each one's
// Origin is, which rows a typed filter keeps, and what a GitHub topic search means. No
// Herdr calls here, so `node --test` runs it as it is.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// The folder names in `ls -d */` output (one per line, trailing slash), blanks dropped.
export function folderNames(output) {
  return String(output ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

// The Origin of an entry: a ledger row means a third-party entry we installed; Herdr's own
// shipped files are listed in installed.json; a clone records cloned_from; anything else
// was dropped into mods/ by hand and has no provenance.
export function originOf(name, manifest, installed = {}, ledger = {}) {
  if (Object.hasOwn(ledger, name)) return "third_party";
  if (Object.hasOwn(installed, name)) return "shipped";
  if (isObject(manifest?.cloned_from)) return "cloned";
  return "third_party";
}

// Every entry as a row: folder name, its title and version from mod.json when it has them,
// its Origin, and whether a third-party entry has no provenance (no ledger row).
// `entries` is [{ name, modJson }], modJson being the raw file or null.
export function rowsOf(entries, { installed = {}, ledger = {} } = {}) {
  return (entries ?? [])
    .map(({ name, modJson }) => {
      let manifest = null;
      try {
        const parsed = JSON.parse(modJson);
        if (isObject(parsed)) manifest = parsed;
      } catch {}
      const origin = originOf(name, manifest, installed, ledger);
      return {
        name,
        title: typeof manifest?.title === "string" && manifest.title ? manifest.title : name,
        version: typeof manifest?.version === "string" ? manifest.version : null,
        origin,
        unknown: origin === "third_party" && !Object.hasOwn(ledger, name),
        checkState: origin === "third_party" ? checkStateOf(ledger?.[name]) : null,
      };
    })
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.name.localeCompare(b.name));
}

// The rows whose title or folder name contains the typed text, ignoring case and padding.
export function filterRows(rows, query) {
  const needle = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) => row.title.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
  );
}

// A line per file from `ls -l` / `ls -lR`: type, permissions, links, owner, group, bytes,
// date (BSD "Nov 16 15:00" or GNU "2026-11-16 15:00"), then the name.
const LS_LINE =
  /^([\-dlbcps])[rwxsStT\-]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(?:\w{3}\s+\d{1,2}\s+(?:\d{1,2}:\d{2}|\d{4})|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;

// The files an entry ships with and their byte sizes, from `ls -lR` output. Directory
// headers ("icons:") prefix nested names; directory entries themselves are skipped, as
// are `total` lines. Sorted by name.
export function fileSizesOf(output) {
  const files = [];
  let prefix = "";
  for (const raw of String(output ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || /^total\s+\d+$/.test(line.trim())) continue;
    const header = /^(.+):$/.exec(line.trim());
    if (header) {
      prefix = header[1].replace(/^\.\/*/, "").replace(/\/$/, "");
      continue;
    }
    const match = LS_LINE.exec(line);
    if (!match || match[1] === "d") continue;
    let name = match[3].replace(/ -> .*$/, "").replace(/^\.\//, "");
    files.push({ name: prefix ? `${prefix}/${name}` : name, size: Number(match[2]) });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

// The file chips the detail pane draws: the first `limit` files and how many more there are.
// The pane has a fixed height, so a folder with many files shows a `+n more` chip instead of
// pushing the actions below it out of view.
export function fileChipsOf(files, limit = 5) {
  const all = Array.isArray(files) ? files : [];
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

// Whether a parsed layout mounts `name` anywhere in its block tree: `content.mod`.
function mountsMod(node, name) {
  if (Array.isArray(node)) return node.some((child) => mountsMod(child, name));
  if (!isObject(node)) return false;
  if (node.mod === name) return true;
  return Object.values(node).some((child) => mountsMod(child, name));
}

// The names of the layout files whose block tree mounts `name` as a mod, sorted.
// `layoutFiles` is [{ name, text }]; a layout that will not parse references nothing.
export function layoutsReferencing(layoutFiles, name) {
  return (layoutFiles ?? [])
    .filter((file) => {
      try {
        return mountsMod(JSON.parse(file.text), name);
      } catch {
        return false;
      }
    })
    .map((file) => file.name)
    .sort((a, b) => a.localeCompare(b));
}

// The bindings in keys.json whose section belongs to the entry: `mod:<name>`.
export function keyBindingsOf(keys, name) {
  return (keys ?? [])
    .filter((binding) => binding?.section === `mod:${name}`)
    .map(({ keys, action }) => ({ keys, action }));
}

// An incoming keys.json as Herdr writes it: section → key → action, where an action is a
// command string or {command, args}. Rows are flat, in file order; values that are neither
// are dropped and counted, never guessed at.
export function keysFileOf(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return { bindings: [], problem: null };
  let value = null;
  try {
    value = JSON.parse(raw);
  } catch {
    return { bindings: [], problem: "keys.json is not valid JSON." };
  }
  if (!isObject(value)) return { bindings: [], problem: "keys.json is not an object." };
  const bindings = [];
  const problems = [];
  let unusable = 0;
  for (const [section, sectionBindings] of Object.entries(value)) {
    if (!isObject(sectionBindings)) {
      problems.push(`keys.json section "${section}" is not an object.`);
      continue;
    }
    for (const [keys, action] of Object.entries(sectionBindings)) {
      if (typeof action === "string" && action) bindings.push({ section, keys, action });
      else if (isObject(action) && typeof action.command === "string" && action.command)
        bindings.push({ section, keys, action });
      else unusable++;
    }
  }
  if (unusable)
    problems.push(`keys.json has ${unusable} binding${unusable === 1 ? "" : "s"} with unusable actions.`);
  return { bindings, problem: problems.length ? problems.join(" ") : null };
}

// A copy of `action` as words: the command string itself, or the object compactly.
const actionTextOf = (action) => (typeof action === "string" ? action : JSON.stringify(action ?? null));

// What a repository's bindings offer against the person's current ones: every key already
// bound in any section is a conflict that names the sections holding it; the rest are offered.
// Exact duplicates across the sources are offered once. Nothing is ever applied here.
export function keysOfferOf(documents, current = []) {
  const problems = [];
  const bindings = [];
  const seen = new Set();
  for (const document of documents ?? []) {
    const parsed = keysFileOf(document?.text);
    if (parsed.problem) problems.push(`${document?.source ?? "keys.json"}: ${parsed.problem}`);
    for (const binding of parsed.bindings) {
      const identity = JSON.stringify([binding.section, binding.keys, binding.action]);
      if (seen.has(identity)) continue;
      seen.add(identity);
      bindings.push(binding);
    }
  }
  const bound = (current ?? []).filter((entry) => typeof entry?.keys === "string");
  const offered = [];
  const conflicts = [];
  for (const binding of bindings) {
    const existing = bound
      .filter((entry) => entry.keys === binding.keys)
      .map(({ section, action }) => ({ section, action }));
    if (existing.length) conflicts.push({ ...binding, existing });
    else offered.push(binding);
  }
  return { offered, conflicts, problems };
}

// The offered bindings as a keys.json fragment, ready to paste; sections keep their first
// appearance order, two-space indent. With nothing offered there is nothing to copy.
export function keysFragmentText(bindings) {
  const sections = {};
  for (const binding of bindings ?? []) {
    if (typeof binding?.section !== "string" || typeof binding?.keys !== "string") continue;
    if (!isObject(sections[binding.section])) sections[binding.section] = {};
    sections[binding.section][binding.keys] = binding.action;
  }
  if (!Object.keys(sections).length) return "";
  return `${JSON.stringify(sections, null, 2)}\n`;
}

// One offered binding as the line a person can paste under its section.
export function keyBindingLine(binding) {
  return `${JSON.stringify(binding?.keys ?? "")}: ${JSON.stringify(binding?.action ?? null)}`;
}

// One conflict in words: the key and every section that already holds it.
export function keyConflictText(conflict) {
  const where = (conflict?.existing ?? [])
    .map((entry) => `${entry.section} (${actionTextOf(entry.action)})`)
    .join(", ");
  return `${conflict?.keys} is already bound in ${where}.`;
}

// The Reference scan's answer as one line: which layouts mount the entry, which key
// bindings belong to it, and "none" when neither does.
export function scanText({ layouts = [], keys = [] } = {}) {
  const layoutPart =
    layouts.length === 0
      ? "No layout references this entry"
      : `Referenced by ${layouts.length} layout${layouts.length === 1 ? "" : "s"}: ${layouts.join(", ")}`;
  if (keys.length === 0) return `${layoutPart}${layouts.length === 0 ? " and" : ";"} no key bindings.`;
  return `${layoutPart}; key bindings: ${keys.map((key) => `${key.keys} → ${key.action}`).join(", ")}`;
}

const firstString = (...values) => values.find((value) => typeof value === "string" && value) ?? null;

// "B" under a kilobyte, one decimal above it.
export function sizeText(bytes) {
  const value = Number(bytes) || 0;
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} kB`;
}

// --- Gallery: the GitHub topic's repositories, paged, cached, refreshed. ---

const GALLERY_PER_PAGE = 100;
// GitHub's search exposes the first 1000 results only; a page past that answers with an
// error instead of an empty list.
const GALLERY_MAX_PAGES = 10;

// The day a repository was last pushed, or "unknown" when GitHub gave no usable date.
export function pushedText(value) {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "unknown";
}

// A search response (parsed or its JSON text) as the gallery sees it: how many results the
// query has in total, and one row per repository with its stars, description and last push.
// Order is GitHub's own; nothing is sorted or deduplicated here.
export function galleryRowsOf(payload) {
  let value = payload;
  if (typeof payload === "string") {
    try {
      value = JSON.parse(payload);
    } catch {
      return { totalCount: 0, rows: [] };
    }
  }
  const items = Array.isArray(value?.items) ? value.items : [];
  return {
    totalCount: Number.isFinite(value?.total_count) ? value.total_count : 0,
    rows: items.filter(isObject).map((item) => ({
      repository: typeof item.full_name === "string" ? item.full_name : "",
      stars: Number(item.stargazers_count) || 0,
      description: typeof item.description === "string" ? item.description : "",
      pushedAt: pushedText(item.pushed_at),
    })),
  };
}

// The pages a query with `totalCount` results needs, 1-based, capped where GitHub stops.
export function galleryPagePlan(totalCount, perPage = GALLERY_PER_PAGE) {
  const count = Number(totalCount) || 0;
  const pages = Math.min(GALLERY_MAX_PAGES, Math.ceil(count / perPage));
  return Array.from({ length: pages }, (_unused, index) => index + 1);
}

// The cached gallery (`data/configurator/gallery.json`) as rows and the time they were
// fetched; an absent or unusable cache is an empty gallery, never an error.
export function galleryCacheOf(text) {
  try {
    const value = JSON.parse(text);
    return {
      fetchedAt: typeof value?.fetchedAt === "string" ? value.fetchedAt : null,
      rows: Array.isArray(value?.rows) ? value.rows : [],
    };
  } catch {
    return { fetchedAt: null, rows: [] };
  }
}

// The Gallery rows that still match the typed text, by repository or description.
export function galleryFiltered(rows, text) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => `${row.repository} ${row.description}`.toLowerCase().includes(needle));
}

// The cache file's text, kept as the shape galleryCacheOf reads back.
export function galleryCacheText(cache) {
  return `${JSON.stringify({ fetchedAt: cache?.fetchedAt ?? null, rows: cache?.rows ?? [] }, null, 2)}\n`;
}

// The responder's own error text: `message` verbatim when the body carries one, the body
// itself when it is not JSON, and the status only when there is nothing else to show.
export function errorTextOf(body, status = 0) {
  let value = body;
  if (typeof body === "string") {
    try {
      value = JSON.parse(body);
    } catch {
      const text = body.trim();
      return text || (status ? `HTTP ${status}` : "Request failed");
    }
  }
  const message = isObject(value) && typeof value.message === "string" ? value.message.trim() : "";
  if (message) return message;
  return status ? `HTTP ${status}` : "Request failed";
}

// What a refresh leaves the view with: rows and a fetch time on success, every previous row
// and the failure's text when it failed. Offline-first means the failure never empties the list.
export function refreshedGallery(cache, { rows, fetchedAt, error } = {}) {
  if (error) return { fetchedAt: cache?.fetchedAt ?? null, rows: cache?.rows ?? [], error };
  return { fetchedAt: fetchedAt ?? null, rows: rows ?? [], error: null };
}

// Everything the detail pane shows for one row: where it lives, the provenance the ledger
// records, the files on disk and the Reference scan. Provenance is never blank: an unknown
// third-party entry reads "Unknown origin", a known Origin that has none says so.
export function detailOf(row, { folder = "", ledger = {}, files = [], layouts = [], keys = [] } = {}) {
  const recorded = isObject(ledger?.[row?.name]) ? ledger[row.name] : {};
  const repo = firstString(recorded.repository, recorded.repo);
  const commitRaw = firstString(recorded.commit);
  const commit = commitRaw ? commitRaw.slice(0, 7) : null;
  const scan = {
    layouts: layoutsReferencing(layouts, row.name),
    keys: keyBindingsOf(keys, row.name),
  };
  return {
    name: row.name,
    title: row.title,
    version: row.version ?? null,
    origin: row.origin,
    unknown: Boolean(row.unknown),
    folder,
    repo,
    commit,
    lastChecked: checkedText(recorded.checkedAt),
    checkState: checkStateOf(recorded),
    checkError: firstString(recorded.checkedError),
    provenanceText:
      repo && commit
        ? `${repo} @ ${commit}`
        : (repo ??
          commit ??
          (uninstallNoteOf(row.origin) ?? (row.unknown ? "Unknown origin" : "No recorded provenance"))),
    files: files ?? [],
    scan,
    scanText: scanText(scan),
  };
}

// Uninstall: what the confirm panel says, where the folder goes, and the ledger row it
// takes with it. Nothing here touches the disk; main.js performs the move.

const pad2 = (value) => String(value).padStart(2, "0");

// The time a trash folder is named after: UTC to the second, filesystem-safe.
export function trashStamp(now = Date.now()) {
  const date = new Date(now);
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}-${pad2(date.getUTCMinutes())}-${pad2(date.getUTCSeconds())}Z`
  );
}

// The folder an uninstalled entry moves to: trash/<time>/<name>. Never deleted.
export function trashPath(name, { now = Date.now(), trash = "data/configurator/trash" } = {}) {
  return `${trash}/${trashStamp(now)}/${name}`;
}

// The Reference scan in the confirm panel's words: how many layouts name the entry and
// how many key sections are bound to it, with "none" when neither is.
export function confirmScanText(name, { layouts = [], keys = [] } = {}) {
  const layoutPart =
    layouts.length === 0
      ? "No layout references this entry."
      : `${layouts.length} layout${layouts.length === 1 ? " references" : "s reference"} this entry: ${layouts.join(", ")}.`;
  const keyPart =
    keys.length === 0
      ? "No key section is bound to this entry."
      : `1 key section is bound to this entry: mod:${name} (${keys.map((key) => `${key.keys} → ${key.action}`).join(", ")}).`;
  return `${layoutPart} ${keyPart}`;
}

// Why an Origin offers no uninstall, or null when it can be moved. Herdr rewrites its own
// files on every start, so removing a shipped entry would only hide it until then.
export function refusalOf(origin) {
  return origin === "shipped"
    ? "Herdr restores its own shipped entries on the next start; there is nothing to uninstall."
    : null;
}

// The explanation a cloned entry carries: it is a copy, not a failure.
export function uninstallNoteOf(origin) {
  return origin === "cloned" ? "This entry is a copy; it never follows upstream." : null;
}

// What the Update row says instead of showing nothing when an Origin has no update target.
export function updateNoteOf(origin, target) {
  if (target) return null;
  if (origin === "shipped")
    return "Herdr restores its own shipped files on the next start; there is nothing to update.";
  if (origin === "cloned") return "This entry is a copy; it never follows upstream.";
  return "No recorded repository and ref yet — use Record provenance.";
}

// Everything the confirm panel needs for one entry: the Reference scan's answer, the
// source → destination of the move, and the reason an Origin refuses it. Nothing moves
// until the person presses the panel's own button.
export function uninstallOf(detail, { now = Date.now(), mods = "mods", trash = "data/configurator/trash" } = {}) {
  const name = typeof detail?.name === "string" ? detail.name : "";
  const origin = detail?.origin ?? "third_party";
  const scan = { layouts: detail?.scan?.layouts ?? [], keys: detail?.scan?.keys ?? [] };
  const reason = refusalOf(origin);
  const allowed = reason === null;
  const source = allowed ? `${mods}/${name}` : null;
  const destination = allowed ? trashPath(name, { now, trash }) : null;
  const trashFolder = destination ? destination.replace(/\/[^/]+$/, "") : null;
  return {
    name,
    origin,
    allowed,
    reason,
    note: uninstallNoteOf(origin),
    scan,
    scanText: confirmScanText(name, scan),
    source,
    trashFolder,
    destination,
    moveText: allowed
      ? `Nothing is deleted: ${name} moves to ${destination}, and its ledger row is dropped.`
      : null,
  };
}

// The ledger without one entry, every other row untouched.
export function withoutEntry(entries, name) {
  const out = { ...(isObject(entries) ? entries : {}) };
  delete out[name];
  return out;
}

// Update: three hashes per file — the ledger's, the local copy's, upstream's — and the plan
// they produce. Nothing here touches the disk; main.js clones, moves and writes.

// The folder one update clones upstream into, under the Configurator's own state and left
// in place when the run fails, so it can be looked at.
const UPDATE_TEMP = "data/configurator/temp";

export function updateTempPath(name, { now = Date.now(), temp = UPDATE_TEMP } = {}) {
  return `${temp}/update-${name}-${trashStamp(now)}`;
}

const namesOf = (hashes) => (isObject(hashes) ? Object.keys(hashes).sort() : []);

// What one update comparison says: which local files differ from the ledger (`edited`), which
// upstream files the ledger has no hash for (`added`), which ledger files upstream no longer
// ships (`removed`), the ones whose contents changed (`replaced`), the ones written back
// even though upstream did not change them (`restored`), the unchanged ones, the upstream
// paths whose bytes differ from what is on disk (`writes`), the edited files an overwrite
// moves to the trash before being written over (`editedReplaced`), and the dropped files
// still on disk
// (`toTrash`). Any local difference makes the entry edited: nothing is written until the
// person confirms.
export function compareUpdate({ recorded = {}, local = {}, upstream = {} } = {}) {
  const ledger = isObject(recorded) ? recorded : {};
  const onDisk = isObject(local) ? local : {};
  const incoming = isObject(upstream) ? upstream : {};
  const upstreamNames = namesOf(incoming);
  const edited = namesOf(onDisk).filter((name) => onDisk[name] !== ledger[name]);
  for (const name of namesOf(ledger)) if (!Object.hasOwn(onDisk, name)) edited.push(name);
  edited.sort();
  const added = upstreamNames.filter((name) => !Object.hasOwn(ledger, name));
  const removed = namesOf(ledger).filter((name) => !Object.hasOwn(incoming, name));
  const replaced = upstreamNames.filter(
    (name) => Object.hasOwn(ledger, name) && ledger[name] !== incoming[name],
  );
  const unchanged = upstreamNames.filter((name) => ledger[name] === incoming[name]);
  const writes = upstreamNames.filter(
    (name) => !Object.hasOwn(onDisk, name) || onDisk[name] !== incoming[name],
  );
  const restored = writes.filter((name) => !added.includes(name) && !replaced.includes(name));
  const editedReplaced = edited.filter(
    (name) => Object.hasOwn(onDisk, name) && writes.includes(name) && Object.hasOwn(incoming, name),
  );
  const toTrash = removed.filter((name) => Object.hasOwn(onDisk, name));
  return {
    status: edited.length ? "edited" : "clean",
    edited,
    added,
    removed,
    replaced,
    restored,
    unchanged,
    writes,
    editedReplaced,
    toTrash,
  };
}

// What the update does with the files: the upstream paths to write and the ones to move into
// the trash first. An edited entry writes and trashes nothing until `overwrite` is set; then
// every edited file upstream still ships moves to the trash before it is replaced.
export function writePlan(comparison, { overwrite = false } = {}) {
  const compared = isObject(comparison) ? comparison : {};
  if (compared.status === "edited" && !overwrite) return { blocked: true, writes: [], trash: [] };
  const trash = [...(Array.isArray(compared.toTrash) ? compared.toTrash : [])];
  if (overwrite)
    for (const name of Array.isArray(compared.editedReplaced) ? compared.editedReplaced : [])
      if (!trash.includes(name)) trash.push(name);
  return { blocked: false, writes: [...(Array.isArray(compared.writes) ? compared.writes : [])], trash: trash.sort() };
}

// The one line the dialog reports an update with.
export function updateReportText({ name, commit, added = [], replaced = [], restored = [], removed = [] } = {}) {
  const short = typeof commit === "string" && commit ? ` @ ${commit.slice(0, 7)}` : "";
  const counts = [
    [added.length, "added"],
    [replaced.length, "replaced"],
    [restored.length, "restored"],
    [removed.length, "removed to the trash"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${count === 1 ? "file" : "files"} ${word}`);
  return `Updated ${name}${short}: ${counts.length ? counts.join(", ") : "nothing changed"}.`;
}

// The question an edited entry asks first, listing every file that differs from the ledger.
export function updatePromptText(name, edited = []) {
  const count = `${edited.length} file${edited.length === 1 ? "" : "s"}`;
  return `${name} has ${count} edited since install (${edited.join(", ")}). Move to Trash and overwrite, or cancel?`;
}

// The ledger row an update writes: the installed commit and hashes, the comparison time, and
// the install time it already had. Provenance and Origin stay as they were.
export function updatedRow(entries, { name, commit, files = {}, now = Date.now() } = {}) {
  const base = isObject(entries) ? entries : {};
  const previous = isObject(base[name]) ? base[name] : null;
  if (!previous || typeof commit !== "string" || !commit) return { ...base };
  const row = {
    ...previous,
    commit,
    files: isObject(files) ? files : {},
    checkedAt: now,
    checkedCommit: commit,
  };
  delete row.checkedError;
  return { ...base, [name]: row };
}

// What the update action needs from a ledger row: the recorded repository, ref and per-file
// hashes. A row without them has nothing to clone or compare.
export function updateTargetOf(recorded) {
  if (!isObject(recorded) || !isObject(recorded.files)) return null;
  const repo = firstString(recorded.repo, recorded.repository);
  const ref = firstString(recorded.ref);
  if (!repo || !ref) return null;
  return { repo, ref, commit: firstString(recorded.commit), files: recorded.files };
}

// Ledger: the Configurator's own record of provenance, kept in its state directory. Its
// entries map is what rowsOf, originOf and detailOf read; writes go through ledgerJson.

const LEDGER_VERSION = 1;

// A ledger file as read: its entries (empty when nothing readable is there) and the problem
// to report when the file is not a version 1 ledger. Nothing is ever written over a ledger
// that reports a problem.
export function parseLedger(raw) {
  const text = typeof raw === "string" ? raw : "";
  if (!text.trim()) return { entries: {}, problem: null };
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { entries: {}, problem: "ledger.json is not valid JSON." };
  }
  if (!isObject(parsed)) return { entries: {}, problem: "ledger.json is not an object." };
  if (parsed.version !== LEDGER_VERSION)
    return {
      entries: {},
      problem: `ledger.json has version ${JSON.stringify(parsed.version ?? null)}; only version ${LEDGER_VERSION} is read.`,
    };
  if (!isObject(parsed.entries)) return { entries: {}, problem: "ledger.json has no entries object." };
  const entries = {};
  const broken = [];
  for (const [name, row] of Object.entries(parsed.entries)) {
    if (isObject(row)) entries[name] = row;
    else broken.push(name);
  }
  if (broken.length)
    return {
      entries,
      problem: `ledger.json has ${broken.length} malformed ${broken.length === 1 ? "entry" : "entries"} (${broken.join(", ")}); fix it by hand.`,
    };
  return { entries, problem: null };
}

// The ledger file's text: version 1, entries sorted by name, two-space indent, final newline.
export function ledgerJson(entries) {
  const sorted = {};
  for (const name of Object.keys(isObject(entries) ? entries : {}).sort()) sorted[name] = entries[name];
  return `${JSON.stringify({ version: LEDGER_VERSION, entries: sorted }, null, 2)}\n`;
}

// `owner/repo` from what a person typed: a bare pair, a GitHub URL, or a clone URL. Anything
// else (no owner, a deeper path, another host) is not a repository to record.
export function normaliseRepo(text) {
  let value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  value = value
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
  return match ? `${match[1]}/${match[2]}` : null;
}

// One `sha256:<hex>` per file, keyed by the path relative to the entry, from `shasum -a 256`
// output (`<hex>  ./<path>`, or `<hex> *<path>` from GNU tools).
export function hashesOf(output) {
  const files = {};
  for (const line of String(output ?? "").split("\n")) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trimEnd());
    if (!match) continue;
    const name = match[2].replace(/^\.\//, "");
    if (name) files[name] = `sha256:${match[1]}`;
  }
  const sorted = {};
  for (const name of Object.keys(files).sort()) sorted[name] = files[name];
  return sorted;
}

// The commit a `GET /repos/{owner}/{repo}/commits/{ref}` response names, or the responder's
// own message, verbatim, when it names none.
export function commitOf(text) {
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!isObject(body)) return { error: "The response was not JSON." };
  if (typeof body.message === "string" && body.message) return { error: body.message };
  if (typeof body.sha === "string" && /^[0-9a-f]{40}$/i.test(body.sha)) return { commit: body.sha.toLowerCase() };
  return { error: "The response had no commit sha." };
}

const COMMIT_HEX = /^[0-9a-f]{40}$/i;

// The one lookup a check run makes for an entry: GitHub's commit endpoint for its recorded
// ref. `owner/repo` goes in the path as recorded; a ref with a slash or a space is encoded.
export function commitUrlOf(repo, ref) {
  return `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`;
}

// The entries a check asks upstream about: every third-party row whose ledger row records
// both a repository and a ref, one target each. Shipped, cloned, unknown-origin and untracked
// rows are not targets; neither is a ledger row that cannot name a ref.
export function checkTargets(rows, ledger) {
  const targets = [];
  for (const row of rows ?? []) {
    if (row?.origin !== "third_party") continue;
    const recorded = isObject(ledger?.[row.name]) ? ledger[row.name] : null;
    const repo = firstString(recorded?.repo, recorded?.repository);
    const ref = firstString(recorded?.ref);
    if (!repo || !ref) continue;
    targets.push({ name: row.name, repo, ref, url: commitUrlOf(repo, ref) });
  }
  return targets;
}

// What the ledger's last comparison says about an entry: `current` when upstream resolved to
// the same commit as what is installed, `moved` when it resolved to a different one, `failed`
// when the lookup brought an error instead, and `unchecked` when nothing was resolved yet. An
// error always wins: a failed lookup never reads as up to date. A short installed commit
// compares by prefix.
export function checkStateOf(recorded) {
  if (!isObject(recorded)) return "unchecked";
  if (typeof recorded.checkedError === "string" && recorded.checkedError.trim()) return "failed";
  const resolved = firstString(recorded.checkedCommit);
  const installed = firstString(recorded.commit);
  if (!resolved || !COMMIT_HEX.test(resolved) || !installed) return "unchecked";
  const current = resolved.toLowerCase();
  const known = installed.toLowerCase();
  return current.startsWith(known) ? "current" : "moved";
}

// When a check ran, in UTC, for the detail pane; nothing when no time was recorded.
export function checkedText(ms) {
  const value = typeof ms === "string" && ms.trim() ? Number(ms) : ms;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// What one check run writes into the ledger: for each result, `checkedAt` and either the
// resolved commit (`checkedCommit`) or the responder's own text (`checkedError`). The
// installed `commit` is never touched, and rows without a result keep their last comparison.
export function withCheckResults(entries, results = [], now = Date.now()) {
  const out = { ...(isObject(entries) ? entries : {}) };
  for (const result of results ?? []) {
    const name = result?.name;
    if (typeof name !== "string" || !isObject(out[name])) continue;
    const row = { ...out[name], checkedAt: now };
    if (typeof result.commit === "string" && COMMIT_HEX.test(result.commit)) {
      row.checkedCommit = result.commit.toLowerCase();
      delete row.checkedError;
    } else {
      delete row.checkedCommit;
      row.checkedError = firstString(result.error) ?? "The check resolved no commit.";
    }
    out[name] = row;
  }
  return out;
}

// The entries with `name` recorded at that repository, ref, commit and per-file hashes.
// Only the fields a reader uses are written: a check records its own time and commit, so a
// row that has never been checked carries neither a check time nor an install time.
export function recordSource(entries, { name, repo, ref = "main", commit, files = {} } = {}) {
  const row = { repo, ref, commit, files };
  return { ...(isObject(entries) ? entries : {}), [name]: row };
}

// Settings: the form a mod.schema.json describes, the person's drafts, and what a save
// writes. A schema's properties.settings is a tree of objects; its leaves become rows,
// grouped by the first path segment. Only what differs from the file is written.

const isLeaf = (spec) => spec.type === "object" || isObject(spec.properties);

export function getPath(obj, dotted) {
  return dotted.split(".").reduce((at, key) => (isObject(at) ? at[key] : undefined), obj);
}

// Sets a.b.c, making the objects on the way.
export function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let at = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(at[key])) at[key] = {};
    at = at[key];
  }
  at[keys.at(-1)] = value;
  return obj;
}

// Removes a.b.c, and any object it leaves empty.
export function deletePath(obj, dotted) {
  const keys = dotted.split(".");
  const trail = [obj];
  for (const key of keys.slice(0, -1)) {
    const next = trail.at(-1)[key];
    if (!isObject(next)) return obj;
    trail.push(next);
  }
  delete trail.at(-1)[keys.at(-1)];
  for (let i = trail.length - 1; i > 0; i--)
    if (!Object.keys(trail[i]).length) delete trail[i - 1][keys[i - 1]];
  return obj;
}

export function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// "max_width" → "Max width"
export function humanize(key) {
  const words = String(key).split(".").at(-1).replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// text, number, choice or boolean: the four controls the form draws.
function typeOfSpec(spec) {
  if (Array.isArray(spec.enum)) return "choice";
  if (spec.format === "duration" || spec.format === "size") return "text";
  const types = [spec.type].flat();
  if (types.includes("boolean")) return "boolean";
  if (types.includes("integer") || types.includes("number")) return "number";
  return "text";
}

function choicesOf(spec) {
  if (!Array.isArray(spec.enum)) return null;
  const labels = isObject(spec["x-labels"]) ? spec["x-labels"] : {};
  return spec.enum.map((value) => ({
    value,
    label: typeof labels[value] === "string" ? labels[value] : humanize(String(value)),
  }));
}

// Every row the schema describes, in schema order, under properties.settings.
export function settingsFields(schema) {
  const fields = [];
  const walk = (node, prefix) => {
    for (const [key, spec] of Object.entries(isObject(node?.properties) ? node.properties : {})) {
      if (!isObject(spec)) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (isLeaf(spec)) walk(spec, name);
      else
        fields.push({
          key: name,
          group: prefix.split(".")[0],
          title: typeof spec.title === "string" ? spec.title : humanize(key),
          description: typeof spec.description === "string" ? spec.description : "",
          type: typeOfSpec(spec),
          default: spec.default,
          choices: choicesOf(spec),
          min: typeof spec.minimum === "number" ? spec.minimum : null,
          max: typeof spec.maximum === "number" ? spec.maximum : null,
          pattern: typeof spec.pattern === "string" ? spec.pattern : null,
        });
    }
  };
  walk(isObject(schema?.properties?.settings) ? schema.properties.settings : null, "");
  return fields;
}

// Rows as the form draws them: one group per first path segment, top-level keys first.
export function settingsGroups(fields) {
  const groups = [];
  for (const field of fields ?? []) {
    let group = groups.find((g) => g.name === field.group);
    if (!group) groups.push((group = { name: field.group, fields: [] }));
    group.fields.push(field);
  }
  groups.sort((a, b) => (a.name === "" ? -1 : b.name === "" ? 1 : 0));
  return groups;
}

// What the person typed, as the field's value, or why it doesn't fit.
export function parseDraft(field, draft) {
  if (!field) return { error: "Unknown setting." };
  if (field.type === "boolean")
    return typeof draft === "boolean" ? { value: draft } : { error: "Should be on or off." };
  if (field.type === "choice") {
    const match = (field.choices ?? []).find((choice) => String(choice.value) === String(draft));
    return match ? { value: match.value } : { error: `Should be one of: ${(field.choices ?? []).map((c) => c.value).join(", ")}.` };
  }
  if (field.type === "number") {
    const value = typeof draft === "number" ? draft : Number(String(draft ?? "").trim());
    if (String(draft ?? "").trim() === "" || !Number.isFinite(value)) return { error: "Should be a number." };
    if (field.min !== null && value < field.min) return { error: `Should be at least ${field.min}.` };
    if (field.max !== null && value > field.max) return { error: `Should be at most ${field.max}.` };
    return { value };
  }
  if (typeof draft !== "string") return { error: "Should be text." };
  if (field.pattern) {
    try {
      if (!new RegExp(field.pattern).test(draft)) return { error: "Doesn't match the expected format." };
    } catch {}
  }
  return { value: draft };
}

// Every field's draft, starting at what the file says and falling back to the default.
export function draftOf(fields, settings = {}) {
  const out = {};
  for (const field of fields ?? []) {
    const saved = getPath(settings ?? {}, field.key);
    let value = saved === undefined ? field.default : saved;
    if (field.type === "boolean") out[field.key] = typeof value === "boolean" ? value : false;
    else {
      if (value === undefined || value === null) value = field.choices?.[0]?.value;
      out[field.key] = value === undefined || value === null ? "" : String(value);
    }
  }
  return out;
}

// The fields whose draft differs from the file, invalid ones included so they can be marked.
export function changedKeys(fields, drafts, settings = {}) {
  const keys = [];
  for (const field of fields ?? []) {
    if (!Object.hasOwn(drafts ?? {}, field.key)) continue;
    const parsed = parseDraft(field, drafts[field.key]);
    if (parsed.error) {
      keys.push(field.key);
      continue;
    }
    const saved = getPath(settings ?? {}, field.key);
    const effective = saved === undefined ? field.default : saved;
    if (!equal(parsed.value, effective)) keys.push(field.key);
  }
  return keys;
}

// What a save writes: only the valid changed keys, values equal to a default removed,
// and the invalid ones reported instead of written.
export function savePlan(fields, drafts, settings = {}) {
  const values = {};
  const remove = [];
  const problems = {};
  for (const field of fields ?? []) {
    if (!Object.hasOwn(drafts ?? {}, field.key)) continue;
    const parsed = parseDraft(field, drafts[field.key]);
    if (parsed.error) {
      problems[field.key] = parsed.error;
      continue;
    }
    const saved = getPath(settings ?? {}, field.key);
    const effective = saved === undefined ? field.default : saved;
    if (equal(parsed.value, effective)) continue;
    if (field.default !== undefined && equal(parsed.value, field.default)) remove.push(field.key);
    else values[field.key] = parsed.value;
  }
  return { values, remove, problems };
}

// The mod.json with the planned changes applied, every other key untouched.
export function mergeSettings(manifest, { values = {}, remove = [] } = {}) {
  const out = isObject(manifest) ? JSON.parse(JSON.stringify(manifest)) : {};
  const settings = isObject(out.settings) ? out.settings : {};
  for (const [key, value] of Object.entries(values)) setPath(settings, key, value);
  for (const key of remove) deletePath(settings, key);
  if (Object.keys(settings).length) out.settings = settings;
  else delete out.settings;
  return out;
}

// The copy the Configurator keeps outside the managed mod: its version and values.
export function keptShape(manifest) {
  return {
    version: typeof manifest?.version === "string" ? manifest.version : null,
    values: isObject(manifest?.settings) ? manifest.settings : {},
  };
}

// A better-config kept file to carry into our own folder, once: only when ours is missing
// and theirs holds values.
export function carryOver(legacyRaw, existingRaw) {
  if (existingRaw !== null && existingRaw !== undefined) return null;
  let legacy = null;
  try {
    legacy = JSON.parse(legacyRaw);
  } catch {
    return null;
  }
  if (!isObject(legacy?.values) || !Object.keys(legacy.values).length) return null;
  return { version: typeof legacy.version === "string" ? legacy.version : null, values: legacy.values };
}

// --- Installing from the gallery: which folder a fresh install takes, which folder a
// repository ships, and what the result line says. The clone, the copy and the check are
// main.js's job; this is the naming and the words.

// The folder name a fresh install takes: the mod's own name, `-copy` when mods/ already
// has it, then `-copy-2`, `-copy-3`, … for every further collision.
export function installFolderName(name, taken = []) {
  const used = new Set(taken ?? []);
  if (!used.has(name)) return name;
  if (!used.has(`${name}-copy`)) return `${name}-copy`;
  for (let index = 2; ; index++) {
    const candidate = `${name}-copy-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

// Which folder under the repository's mods/ is the mod: the one named after the repository,
// else the repository's only one. Several with none matching is ambiguous (null).
export function modFolderOf(repoName, folders = []) {
  const list = (folders ?? []).filter((folder) => typeof folder === "string" && folder);
  if (list.includes(repoName)) return repoName;
  return list.length === 1 ? list[0] : null;
}

// Why nothing was installed: no mod folder at all, or several and none named after the
// repository. The clone is kept either way; the text never claims a copy was made.
export function declinedInstallText(repo, folders = []) {
  const list = (folders ?? []).filter(Boolean);
  if (!list.length) return `${repo} ships no mod folder under mods/, so nothing was copied.`;
  return `${repo} ships ${list.length} mod folders (${list.join(", ")}) and none is named after the repository; nothing was copied.`;
}

// What a successful install reports: the mod, the folder it landed in and where it came
// from, with the short commit.
export function installedText({ name, folder, repo, commit } = {}) {
  const short = typeof commit === "string" ? commit.slice(0, 7) : "";
  return `Installed ${name} into mods/${folder} from ${repo}${short ? ` @ ${short}` : ""}.`;
}
