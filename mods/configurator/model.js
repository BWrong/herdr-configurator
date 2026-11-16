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
