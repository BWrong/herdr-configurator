// model.js: the pure half of the Configurator — which entries exist, what each one's
// Origin is, and which rows a typed filter keeps. No Herdr calls here, so `node --test`
// runs it as it is.

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

// Everything the detail pane shows for one row: where it lives, where it came from (the
// ledger row first, then a `source` hint the author left in mod.json), the files on disk
// and the Reference scan. Provenance is never blank: with nothing known it reads
// "Unknown origin".
export function detailOf(row, { folder = "", manifest = null, ledger = {}, files = [], layouts = [], keys = [] } = {}) {
  const recorded = isObject(ledger?.[row?.name]) ? ledger[row.name] : {};
  const hint = manifest?.source;
  const hintObject = isObject(hint) ? hint : {};
  const repo = firstString(
    recorded.repository,
    recorded.repo,
    typeof hint === "string" ? hint : hintObject.repository,
    hintObject.repo,
  );
  const commitRaw = firstString(recorded.commit, hintObject.commit);
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
    lastChecked: firstString(recorded.lastChecked),
    provenanceText: repo && commit ? `${repo} @ ${commit}` : (repo ?? commit ?? "Unknown origin"),
    files: files ?? [],
    scan,
    scanText: scanText(scan),
  };
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

// The entries with `name` recorded as a third-party mod at that repository, ref, commit and
// per-file hashes. Recording again replaces the row and keeps the first install time.
export function recordSource(entries, { name, repo, ref = "main", commit, files = {}, now = Date.now() } = {}) {
  const previous = isObject(entries?.[name]) ? entries[name] : {};
  const row = {
    kind: "mod",
    origin: "third_party",
    repo,
    ref,
    commit,
    checkedAt: now,
    installedAt: typeof previous.installedAt === "number" ? previous.installedAt : now,
    files,
  };
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
