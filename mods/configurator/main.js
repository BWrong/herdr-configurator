// Configurator: a 26 px strip at the bottom whose gear opens one dialog, and that dialog
// lists every entry under mods/ with its Origin, or — in its second view — the GitHub topic's
// installable mods. One folder, two copies: props().overlay is set only in the dialog copy.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, InputState, Input, Select, Popup, Checkbox } from "gpui-base";
import {
  appHome,
  home,
  exec,
  readTextFile,
  writeTextFile,
  checking,
  closeOverlay,
  props,
  run,
  theme,
  layouts,
  keys,
  notify,
} from "herdr";
import {
  folderNames,
  rowsOf,
  filterRows,
  fileSizesOf,
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
  checkTargets,
  checkStateOf,
  withCheckResults,
  galleryRowsOf,
  galleryPagePlan,
  galleryCacheOf,
  galleryCacheText,
  errorTextOf,
  refreshedGallery,
  installFolderName,
  modFolderOf,
  declinedInstallText,
  installedText,
  keysOfferOf,
  keysFragmentText,
  keyBindingLine,
  keyConflictText,
  uninstallOf,
  withoutEntry,
  refusalOf,
  trashPath,
  updateTargetOf,
  compareUpdate,
  writePlan,
  updateReportText,
  updatePromptText,
  updatedRow,
  updateTempPath,
} from "./model.js";

const GALLERY_TOPIC_URL = "https://api.github.com/search/repositories?q=topic:herdr-mod&per_page=100&page=";

const GEAR = "mods/configurator/icons/gear.svg";
const ORIGIN_WORDS = { shipped: "shipped", cloned: "cloned", third_party: "third party" };
// A row's check state as a dot colour and as the word the detail pane says.
const CHECK_DOTS = { moved: "accent", current: "border", failed: "ansi1" };
const CHECK_WORDS = { moved: "upstream moved", current: "up to date", failed: "check failed" };

const parseObject = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const asObject = (text) => parseObject(text) ?? {};

export default class Configurator extends View {
  init(_given, cx) {
    this.overlay = props()?.overlay ?? null;
    this.rows = [];
    this.entries = [];
    this.ledger = {};
    this.ledgerProblem = null;
    this.installed = {};
    this.sourceNote = "";
    this.layoutFiles = [];
    this.keys = [];
    this.selected = null;
    this.detail = null;
    this.filter = "";
    this.loaded = false;
    this.tab = "installed";
    this.gallery = { fetchedAt: null, rows: [] };
    this.galleryRaw = null;
    this.galleryError = null;
    this.refreshing = false;
    this.installing = null;
    this.installNote = null;
    this.checkingUpdates = false;
    this.checkNote = "";
    this.forms = {};
    this.openSelect = null;
    this.hoveredField = null;
    this.keyOffers = {};
    this.keyPanel = null;
    this.uninstall = null;
    this.uninstallError = "";
    this.uninstalling = false;
    this.updateJob = null;
    this.updateNote = null;
    this.updateError = null;
    this.updating = false;
    if (this.overlay) {
      this.input = InputState.new({ placeholder: "Filter entries…" });
      this.input.on("change", (_e, cx) => {
        this.filter = this.input.value();
        cx.notify();
      });
      this.input.focus();
      this.sourceRepo = InputState.new({ placeholder: "owner/repo or a GitHub URL" });
      this.sourceRef = InputState.new({ placeholder: "main" });
      this.handle = cx.focus_handle();
    }
    // A check loads and renders for real; it must read nothing.
    if (checking() || !this.overlay) return;
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  // Every folder under mods/, its mod.json, Herdr's shipped file list, the ledger (absent
  // until there is one to read), and the texts the Reference scan reads. The one write is
  // carryLegacy's kept copy; no file sizes are cached, they are read again on each selection.
  async load() {
    if (checking()) return;
    const entries = [];
    for (const name of await this.modsFolderNames()) {
      entries.push({
        name,
        modJson: await readTextFile(`${appHome()}/mods/${name}/mod.json`),
        schemaJson: await readTextFile(`${appHome()}/mods/${name}/mod.schema.json`),
      });
    }
    this.entries = entries;
    const read = parseLedger(await readTextFile(`${appHome()}/data/configurator/ledger.json`));
    this.ledger = read.entries;
    this.ledgerProblem = read.problem;
    this.installed = asObject(await readTextFile(`${appHome()}/installed.json`));
    this.rows = rowsOf(entries, { installed: this.installed, ledger: this.ledger });
    this.layoutFiles = [];
    for (const name of layouts()) {
      this.layoutFiles.push({ name, text: await readTextFile(`${appHome()}/layouts/${name}.json`) });
    }
    this.keys = keys();
    this.galleryRaw = await readTextFile(this.galleryPath());
    this.gallery = galleryCacheOf(this.galleryRaw);
    this.buildForms();
    await this.carryLegacy();
    this.loaded = true;
    if (!this.rows.some((row) => row.name === this.selected)) this.selected = this.rows[0]?.name ?? null;
    this.detail = await this.detailFor(this.selected);
  }

  // The detail of one entry: its files as they are on disk right now, plus the Reference scan.
  async detailFor(name) {
    const row = this.rows.find((r) => r.name === name);
    if (!row) return null;
    const entry = this.entries.find((e) => e.name === name);
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && ls -lR 2>/dev/null', "sh", `${appHome()}/mods/${name}`]);
    const localKeys = await readTextFile(`${appHome()}/mods/${name}/keys.json`);
    const detail = detailOf(row, {
      folder: `mods/${name}`,
      manifest: asObject(entry?.modJson),
      ledger: this.ledger,
      files: fileSizesOf(listing.stdout),
      layouts: this.layoutFiles,
      keys: this.keys,
    });
    detail.keysAvailable =
      detail.origin === "third_party" &&
      ((typeof localKeys === "string" && localKeys.trim() !== "") || Boolean(detail.repo));
    return detail;
  }

  galleryPath() {
    return `${appHome()}/data/configurator/gallery.json`;
  }

  // The folder names under mods/, which are the entries and the names an install must avoid.
  async modsFolderNames() {
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && ls -d */ 2>/dev/null', "sh", `${appHome()}/mods`]);
    return folderNames(listing.stdout);
  }

  // sha256 of every file under a folder, keyed by its path. gpui-shell writes these into
  // every mod folder when it loads one (see .gitignore), so they are not what arrived.
  async hashFolder(folder) {
    if (checking()) return {};
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && find . -type f -print0 | xargs -0 shasum -a 256', "sh", folder]);
    const files = hashesOf(listing.stdout);
    for (const generated of ["gpui-kit.d.ts", "jsconfig.json"]) delete files[generated];
    return files;
  }

  // The repository's default branch, one commit only, into a fresh folder under /tmp. The
  // folder is returned with the failure too, so a failed install can say where it kept it.
  async cloneIntoTemp(repo) {
    const tail = String(repo).split("/")[1]?.replace(/[^A-Za-z0-9_.-]/g, "") || "mod";
    const folder = `/tmp/configurator-install-${Date.now()}-${tail}`;
    try {
      await exec("git", ["clone", "--depth", "1", `https://github.com/${repo}`, folder]);
      const commit = String((await exec("git", ["-C", folder, "rev-parse", "HEAD"])).stdout ?? "").trim();
      const ref = String((await exec("git", ["-C", folder, "rev-parse", "--abbrev-ref", "HEAD"])).stdout ?? "").trim();
      return { folder, commit, ref };
    } catch (error) {
      return { folder, error: error?.message ?? String(error) };
    }
  }

  // One search page from GitHub, unauthenticated. A failed request carries the responder's
  // own text, or the error that kept it from answering at all.
  async fetchGalleryPage(page) {
    try {
      const response = await fetch(`${GALLERY_TOPIC_URL}${page}`, {
        headers: { accept: "application/vnd.github+json" },
      });
      const body = await response.text();
      return response.ok ? { ok: true, body } : { ok: false, error: errorTextOf(body, response.status) };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  // Every page of the topic search in one go, then one cache write. A check never runs
  // alongside a request or a write; a failure keeps the rows already shown.
  async refreshGallery(cx) {
    if (!this.overlay || checking() || this.refreshing) return;
    this.refreshing = true;
    this.galleryError = null;
    cx.notify();
    let attempt = { error: "Request failed" };
    try {
      const first = await this.fetchGalleryPage(1);
      if (!first.ok) attempt = { error: first.error };
      else {
        const { totalCount, rows } = galleryRowsOf(first.body);
        const all = rows.slice();
        let failure = null;
        for (const page of galleryPagePlan(totalCount).filter((number) => number > 1)) {
          if (checking()) {
            failure = "herdr-app check is running.";
            break;
          }
          const next = await this.fetchGalleryPage(page);
          if (!next.ok) {
            failure = next.error;
            break;
          }
          all.push(...galleryRowsOf(next.body).rows);
        }
        attempt = failure ? { error: failure } : { rows: all, fetchedAt: new Date().toISOString() };
      }
    } catch (e) {
      attempt = { error: e?.message ?? String(e) };
    }
    const next = refreshedGallery(this.gallery, attempt);
    this.gallery = { fetchedAt: next.fetchedAt, rows: next.rows };
    this.galleryError = next.error;
    if (!next.error && !checking()) {
      const text = galleryCacheText(this.gallery);
      if (text !== this.galleryRaw) {
        try {
          await exec("mkdir", ["-p", `${appHome()}/data/configurator`]);
          await writeTextFile(this.galleryPath(), text, this.galleryRaw);
          this.galleryRaw = text;
        } catch (e) {
          this.galleryError = `Couldn't save the gallery cache: ${e?.message ?? e}`;
        }
      }
    }
    this.refreshing = false;
    cx.notify();
  }

  // One settings form per entry: the schema's rows and the person's drafts. Drafts are kept
  // for the life of the dialog, so switching rows never loses typing.
  buildForms() {
    for (const entry of this.entries) {
      if (this.forms[entry.name]) continue;
      const manifest = parseObject(entry.modJson) ?? {};
      const schema = parseObject(entry.schemaJson);
      const fields = settingsFields(schema);
      const settings = parseObject(JSON.stringify(manifest.settings)) ?? {};
      const form = {
        name: entry.name,
        schema,
        manifest,
        fields,
        groups: settingsGroups(fields),
        settings,
        drafts: draftOf(fields, settings),
        inputs: {},
        problems: {},
        note: "",
      };
      for (const field of fields) {
        if (field.type !== "text" && field.type !== "number") continue;
        const state = InputState.new({ placeholder: String(field.default ?? "") });
        state.set_value(String(form.drafts[field.key] ?? ""));
        state.on("change", (_e, cx) => {
          form.drafts[field.key] = state.value();
          delete form.problems[field.key];
          form.note = "";
          cx.notify();
        });
        form.inputs[field.key] = state;
      }
      this.forms[entry.name] = form;
    }
  }

  // better-config kept its own values beside its mod. Carry them into our folder once, and
  // only when we have no kept file for that entry; their folder is left exactly as it is.
  async carryLegacy() {
    if (checking()) return;
    const source = `${home()}/.config/herdr-mods/better-config`;
    const folder = `${appHome()}/data/configurator/kept`;
    let names = [];
    try {
      const listing = await exec("/bin/sh", ["-c", 'cd "$1" 2>/dev/null && ls -1 *.json 2>/dev/null', "sh", source]);
      names = String(listing.stdout ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    } catch {
      return;
    }
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      const name = file.slice(0, -5);
      const path = `${folder}/${name}.json`;
      const legacyRaw = await readTextFile(`${source}/${file}`);
      const existingRaw = await readTextFile(path);
      const carried = carryOver(legacyRaw, existingRaw);
      if (!carried) continue;
      try {
        if (existingRaw === null) await exec("/bin/sh", ["-c", 'mkdir -p "$1"', "sh", folder]);
        await writeTextFile(path, `${JSON.stringify(carried, null, 2)}\n`, existingRaw);
      } catch {
        // A stale kept file or a missing folder: leave it for the next run.
      }
    }
  }

  // Keep the version and the changed values outside the managed mod, conditionally.
  async keep(form) {
    if (checking()) return null;
    const folder = `${appHome()}/data/configurator/kept`;
    const path = `${folder}/${form.name}.json`;
    const text = `${JSON.stringify(keptShape(form.manifest), null, 2)}\n`;
    let failure = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const expected = await readTextFile(path);
      try {
        if (expected === null) await exec("/bin/sh", ["-c", 'mkdir -p "$1"', "sh", folder]);
        await writeTextFile(path, text, expected);
        return null;
      } catch (error) {
        failure = error?.message ?? String(error);
      }
    }
    return failure;
  }

  // Only the changed keys, into the entry's mod.json, on top of what is there right now. A
  // write Herdr moved under us is re-read and retried, never clobbered.
  async writeSettings(form, plan) {
    if (checking()) return null;
    const path = `${appHome()}/mods/${form.name}/mod.json`;
    let raw = await readTextFile(path);
    let failure = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const manifest = parseObject(raw);
        if (!manifest) throw new Error("mod.json is not an object.");
        const next = mergeSettings(manifest, plan);
        await writeTextFile(path, `${JSON.stringify(next, null, 2)}\n`, raw);
        form.manifest = next;
        form.settings = next.settings ?? {};
        form.drafts = draftOf(form.fields, form.settings);
        form.problems = {};
        for (const field of form.fields) {
          const state = form.inputs[field.key];
          if (state) state.set_value(String(form.drafts[field.key] ?? ""));
        }
        const kept = await this.keep(form);
        return kept ? "Saved. The kept copy could not be written." : "Saved.";
      } catch (error) {
        failure = error;
        raw = await readTextFile(path);
      }
    }
    return `Couldn't save${failure?.message ? `: ${failure.message}` : "."}`;
  }

  // One ledger write, conditionally: the file is re-read and `merge` applied on every
  // attempt, so a ledger the person edited meanwhile keeps their changes. A ledger that
  // reports a problem is left alone rather than replaced.
  async writeLedger(merge) {
    if (checking()) return null;
    const folder = `${appHome()}/data/configurator`;
    const path = `${folder}/ledger.json`;
    let failure = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await readTextFile(path);
      const read = parseLedger(raw);
      if (read.problem) return read.problem;
      const entries = merge(read.entries);
      try {
        if (raw === null) await exec("/bin/sh", ["-c", 'mkdir -p "$1"', "sh", folder]);
        await writeTextFile(path, ledgerJson(entries), raw);
        this.ledger = entries;
        this.rows = rowsOf(this.entries, { installed: this.installed, ledger: this.ledger });
        return null;
      } catch (error) {
        failure = error?.message ?? String(error);
      }
    }
    return `Couldn't write the ledger${failure ? `: ${failure}` : "."}`;
  }

  // Record an unknown-origin entry's source: hash every file it ships, resolve the ref's
  // current commit (the one network call), then write the row. The ledger stays untouched.
  async record(name, repo, ref) {
    if (checking()) return { note: "" };
    const folder = `${appHome()}/mods/${name}`;
    let files = null;
    try {
      files = await this.hashFolder(folder);
    } catch (error) {
      return { note: `Couldn't hash the entry: ${error?.message ?? error}` };
    }
    if (!Object.keys(files).length) return { note: "This entry has no files to record." };
    let body = "";
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
        headers: { accept: "application/vnd.github+json" },
      });
      body = await response.text();
    } catch (error) {
      return { note: `Couldn't reach GitHub: ${error?.message ?? error}` };
    }
    const resolved = commitOf(body);
    if (resolved.error) return { note: resolved.error };
    const failure = await this.writeLedger((entries) =>
      recordSource(entries, { name, repo, ref, commit: resolved.commit, files }),
    );
    if (failure) return { note: failure };
    return { note: `Recorded ${repo} @ ${resolved.commit.slice(0, 7)}.` };
  }

  startRecording(row, cx) {
    if (checking() || !row?.unknown) return;
    if (this.ledgerProblem) {
      this.sourceNote = `Ledger: ${this.ledgerProblem}`;
      cx.notify();
      return;
    }
    const repo = normaliseRepo(this.sourceRepo.value());
    if (!repo) {
      this.sourceNote = "Enter owner/repo or a GitHub URL.";
      cx.notify();
      return;
    }
    const ref = String(this.sourceRef.value() ?? "").trim() || "main";
    this.sourceNote = "Recording…";
    cx.notify();
    cx.spawn(async (cx) => {
      const result = await this.record(row.name, repo, ref);
      this.sourceNote = result.note;
      if (this.selected === row.name) this.detail = await this.detailFor(row.name);
      cx.notify();
    });
  }

  // One commit lookup: the resolved sha, or the responder's own error text. Nothing else is
  // asked of GitHub, and a lookup that fails is a result, not a guess.
  async lookupCommit(target) {
    try {
      const response = await fetch(target.url, { headers: { accept: "application/vnd.github+json" } });
      const body = await response.text();
      if (!response.ok) return { name: target.name, error: errorTextOf(body, response.status) };
      const resolved = commitOf(body);
      return resolved.error
        ? { name: target.name, error: resolved.error }
        : { name: target.name, commit: resolved.commit };
    } catch (error) {
      return { name: target.name, error: error?.message ?? String(error) };
    }
  }

  // Check updates: one lookup per tracked entry, then one ledger write holding every result —
  // the commit when it resolved, the responder's text when it did not. No timer, no check on
  // open, and nothing at all while a check or a write is under way.
  async checkUpdates(cx) {
    if (!this.overlay || checking() || this.checkingUpdates) return;
    if (this.ledgerProblem) {
      this.checkNote = `Ledger: ${this.ledgerProblem}`;
      cx.notify();
      return;
    }
    const targets = checkTargets(this.rows, this.ledger);
    if (!targets.length) {
      this.checkNote = "No entry has a recorded repository and ref to check.";
      cx.notify();
      return;
    }
    this.checkingUpdates = true;
    this.checkNote = `Checking ${targets.length}…`;
    cx.notify();
    const results = [];
    for (const target of targets) {
      if (checking()) {
        this.checkingUpdates = false;
        cx.notify();
        return;
      }
      results.push(await this.lookupCommit(target));
    }
    const now = Date.now();
    const failure = await this.writeLedger((entries) => withCheckResults(entries, results, now));
    this.checkingUpdates = false;
    if (failure) {
      this.checkNote = failure;
      cx.notify();
      return;
    }
    const moved = results.filter((result) => checkStateOf(this.ledger[result.name]) === "moved").length;
    const current = results.filter((result) => checkStateOf(this.ledger[result.name]) === "current").length;
    const failed = results.length - moved - current;
    const firstError = results.find((result) => result.error);
    this.checkNote = `Checked ${results.length}${moved ? `, ${moved} upstream moved` : ""}${
      current ? `, ${current} up to date` : ""
    }${failed ? `, ${failed} failed: ${firstError?.error ?? "unknown error"}` : ", no failed lookups"}.`;
    this.detail = await this.detailFor(this.selected);
    cx.notify();
  }

  // Install one gallery repository: clone its default branch to /tmp, copy the repository's
  // mod folder into mods/ under a free name, hash what landed, record the ledger row, then
  // check the folder. Nothing is written before the clone and the copy are in place, and a
  // failure keeps the clone and reports the program's own text.
  async installFrom(repo) {
    const clone = await this.cloneIntoTemp(repo);
    if (clone.error) return { error: `git clone failed: ${clone.error}`, temp: clone.folder };
    const temp = clone.folder;
    let folders = [];
    try {
      const listing = await exec("/bin/sh", ["-c", 'cd "$1/mods" 2>/dev/null && ls -d */ 2>/dev/null', "sh", temp]);
      folders = folderNames(listing.stdout);
    } catch (error) {
      return { error: `Couldn't list the repository's mod folders: ${error?.message ?? error}`, temp };
    }
    const modFolder = modFolderOf(String(repo).split("/")[1], folders);
    if (!modFolder) return { error: declinedInstallText(repo, folders), temp };
    let taken = [];
    try {
      taken = await this.modsFolderNames();
    } catch (error) {
      return { error: `Couldn't list mods/: ${error?.message ?? error}`, temp };
    }
    const folder = installFolderName(modFolder, taken);
    const dest = `${appHome()}/mods/${folder}`;
    try {
      await exec("cp", ["-R", `${temp}/mods/${modFolder}`, dest]);
    } catch (error) {
      return { error: `Couldn't copy mods/${modFolder}: ${error?.message ?? error}`, temp };
    }
    let files = {};
    try {
      files = await this.hashFolder(dest);
    } catch (error) {
      return { error: `Couldn't hash the installed files: ${error?.message ?? error}`, temp };
    }
    const ledgerFailure = await this.writeLedger((entries) =>
      recordSource(entries, {
        name: folder,
        repo,
        ref: clone.ref || "main",
        commit: clone.commit,
        files,
      }),
    );
    if (ledgerFailure) return { error: ledgerFailure, temp };
    try {
      await exec("herdr-app", ["check", dest]);
    } catch (error) {
      return { error: `herdr-app check failed: ${error?.message ?? error}`, temp };
    }
    // The install stands even if the cleanup or the reload stumbles; say so separately.
    try {
      await exec("rm", ["-rf", temp]);
    } catch {}
    try {
      await this.load();
    } catch {}
    return { installed: { name: folder, folder, repo, ref: clone.ref || "main", commit: clone.commit } };
  }

  // The gallery row's Install action. One at a time, never during a check run, and the row
  // keeps the outcome — success says what landed where, failure the program's own error.
  async install(row, cx) {
    if (checking() || this.installing) return;
    const repo = row?.repository;
    if (typeof repo !== "string" || !repo.includes("/")) return;
    this.installing = repo;
    this.installNote = null;
    cx.notify();
    let result = null;
    try {
      result = await this.installFrom(repo);
    } catch (error) {
      result = { error: error?.message ?? String(error) };
    }
    this.installing = null;
    this.installNote = {
      repository: repo,
      error: Boolean(result?.error),
      text: result?.error
        ? `${result.error}${result.temp ? ` The clone is kept at ${result.temp}.` : ""}`
        : installedText(result.installed),
      keys: null,
      keysError: "",
    };
    if (!result?.error && result?.installed) {
      const gathered = await this.keyBindingsFor(result.installed.folder, {
        repo,
        ref: result.installed.ref,
      });
      this.installNote.keys = gathered.offer ?? null;
      this.installNote.keysError = gathered.error ?? "";
    }
    cx.notify();
  }

  // The bindings a third-party entry ships: its installed folder's keys.json first, then —
  // only when a repository is recorded — the repository's own keys.json at its ref. The
  // person's current bindings decide the split. Nothing runs under `herdr-app check`, and
  // no keys.json is ever written.
  async keyBindingsFor(name, { repo = null, ref = null } = {}) {
    if (checking()) return { offer: null };
    const documents = [];
    const local = await readTextFile(`${appHome()}/mods/${name}/keys.json`);
    if (typeof local === "string" && local.trim()) {
      documents.push({ source: "installed folder", text: local });
    }
    if (!documents.length && repo) {
      const refPath = String(ref || "HEAD")
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
      try {
        const response = await fetch(`https://raw.githubusercontent.com/${repo}/${refPath}/keys.json`);
        if (response.ok) {
          const body = await response.text();
          if (body.trim()) documents.push({ source: `${repo} keys.json`, text: body });
        } else if (response.status !== 404) {
          return { error: errorTextOf(await response.text(), response.status) };
        }
      } catch (error) {
        return { error: error?.message ?? String(error) };
      }
    }
    return { offer: keysOfferOf(documents, this.keys) };
  }

  // The selected entry's bindings, asked for. The popup opens at once and fills in when the
  // read (or the one upstream request) answers.
  openKeys(detail, cx) {
    if (checking() || !detail.keysAvailable || this.keyOffers[detail.name]?.loading) return;
    const recorded = this.ledger?.[detail.name];
    const ref = typeof recorded?.ref === "string" && recorded.ref ? recorded.ref : null;
    this.keyPanel = detail.name;
    this.keyOffers[detail.name] = { loading: true, offer: null, error: "" };
    cx.notify();
    cx.spawn(async (cx) => {
      const gathered = await this.keyBindingsFor(detail.name, { repo: detail.repo, ref });
      this.keyOffers[detail.name] = {
        loading: false,
        offer: gathered.offer ?? null,
        error: gathered.error ?? "",
      };
      cx.notify();
    });
  }

  closeKeys(cx) {
    this.keyPanel = null;
    cx.notify();
  }

  // The on-demand trigger for the selected entry. Entries that ship no bindings anywhere
  // (no folder file, no recorded repository) get nothing extra.
  keysTrigger(t, detail) {
    if (!detail.keysAvailable) return div();
    const content = this.keyPanel === detail.name;
    const trigger = div()
      .id(`configurator-keys-${detail.name}`)
      .flex_none()
      .px(10)
      .py(3)
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .text_size(12)
      .text_color(t.foreground)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.openKeys(detail, cx))
      .child("Key bindings");
    return Popup.new(`configurator-keys-popup-${detail.name}`, trigger)
      .anchor("top_right")
      .when(content, (el) => el.content(this.keyPanelView(t, detail)));
  }

  keyPanelView(t, detail) {
    const state = this.keyOffers[detail.name];
    const hasContent = Boolean(
      state?.offer?.offered?.length || state?.offer?.conflicts?.length || state?.offer?.problems?.length,
    );
    return v_flex()
      .id("configurator-keys-panel")
      .w(440)
      .p(12)
      .gap(6)
      .rounded(8)
      .border_1()
      .border_color(t.border)
      .bg(t.popover)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(
            div()
              .flex_1()
              .min_w(0)
              .text_size(13)
              .text_color(t.foreground)
              .child(`Key bindings for ${detail.title}`),
          )
          .child(
            div()
              .id("configurator-keys-close")
              .px(8)
              .py(2)
              .rounded(6)
              .border_1()
              .border_color(t.border)
              .text_size(11)
              .text_color(t.muted)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => this.closeKeys(cx))
              .child("Close"),
          ),
      )
      .when(!state || state.loading, (el) =>
        el.child(div().text_size(11).text_color(t.dim).child("Reading keys.json…")),
      )
      .when(Boolean(state?.error), (el) =>
        el.child(div().min_w(0).text_size(11).text_color(t.blocked).child(state.error)),
      )
      .when(!state?.loading && !state?.error && !hasContent, (el) =>
        el.child(div().text_size(11).text_color(t.dim).child("This entry ships no key bindings.")),
      )
      .when(hasContent, (el) => el.child(this.keyOfferBlock(t, state.offer, detail.name)));
  }

  // Offered bindings as monospace lines, each with the runtime clipboard's Copy action; conflicts
  // as the sentence that names what already holds the key. The fragment is shown for pasting.
  keyOfferBlock(t, offer, id) {
    const groups = [];
    for (const binding of offer?.offered ?? []) {
      let group = groups.find((candidate) => candidate.section === binding.section);
      if (!group) groups.push((group = { section: binding.section, bindings: [] }));
      group.bindings.push(binding);
    }
    return v_flex()
      .gap(5)
      .when(groups.length > 0, (el) =>
        el.child(div().text_size(11).text_color(t.muted).child("Offered (nothing bound there yet)")),
      )
      .children(
        groups.map((group) =>
          v_flex()
            .gap(3)
            .child(
              div()
                .font_family("JetBrains Mono")
                .text_size(10.5)
                .text_color(t.dim)
                .child(group.section),
            )
            .children(
              group.bindings.map((binding) =>
                h_flex()
                  .gap(6)
                  .items_center()
                  .child(
                    div()
                      .flex_1()
                      .min_w(0)
                      .font_family("JetBrains Mono")
                      .text_size(10.5)
                      .text_color(t.foreground)
                      .child(keyBindingLine(binding)),
                  )
                  .child(
                    div()
                      .id(`configurator-copy-${id}-${group.section}-${binding.keys}`)
                      .h(20)
                      .px(7)
                      .flex()
                      .items_center()
                      .rounded(5)
                      .border_1()
                      .border_color(t.border)
                      .text_size(10.5)
                      .text_color(t.foreground)
                      .cursor_pointer()
                      .hover((s) => s.bg(t.hover))
                      .on_click((_e, cx) => cx.write_to_clipboard(keyBindingLine(binding)))
                      .child("Copy"),
                  ),
              ),
            ),
        ),
      )
      .when(groups.length > 0, (el) =>
        el.child(
          h_flex()
            .gap(6)
            .items_center()
            .child(
              div()
                .flex_1()
                .min_w(0)
                .text_size(10.5)
                .text_color(t.dim)
                .child("Copy all offered as a keys.json fragment"),
            )
            .child(
              div()
                .id(`configurator-copy-all-${id}`)
                .h(20)
                .px(7)
                .flex()
                .items_center()
                .rounded(5)
                .border_1()
                .border_color(t.border)
                .text_size(10.5)
                .text_color(t.foreground)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .on_click((_e, cx) => cx.write_to_clipboard(keysFragmentText(offer.offered)))
                .child("Copy all"),
            ),
        ),
      )
      .when(Boolean(offer?.conflicts?.length), (el) =>
        el
          .child(div().text_size(11).text_color(t.muted).child("Conflicts, not offered"))
          .children(
            offer.conflicts.map((conflict) =>
              div()
                .min_w(0)
                .text_size(11)
                .line_height("15px")
                .text_color(t.blocked)
                .child(keyConflictText(conflict)),
            ),
          ),
      )
      .when(Boolean(offer?.problems?.length), (el) =>
        el.child(
          div()
            .min_w(0)
            .text_size(11)
            .line_height("15px")
            .text_color(t.dim)
            .child(offer.problems.join(" ")),
        ),
      );
  }

  save(form, cx) {
    if (checking()) return;
    const plan = savePlan(form.fields, form.drafts, form.settings);
    form.problems = plan.problems;
    if (Object.keys(plan.problems).length) {
      form.note = "Fix the marked fields first.";
      cx.notify();
      return;
    }
    if (!Object.keys(plan.values).length && !plan.remove.length) {
      form.note = "";
      cx.notify();
      return;
    }
    form.note = "Saving…";
    cx.notify();
    cx.spawn(async (cx) => {
      form.note = await this.writeSettings(form, plan);
      cx.notify();
    });
  }

  settingControl(t, form, field, draft, problem) {
    const id = `configurator-${form.name}-${field.key.replaceAll(".", "-")}`;
    if (field.type === "boolean") {
      const on = draft === true;
      return Checkbox.new(id)
        .checked(on)
        .accessibility_label(field.title)
        .on_change((checked, cx) => {
          form.drafts[field.key] = checked;
          delete form.problems[field.key];
          form.note = "";
          cx.notify();
        })
        .child(
          div()
            .w(18)
            .h(18)
            .rounded(4)
            .border_1()
            .border_color(on ? t.accent : t.border)
            .bg(on ? t.accent : t.background),
        );
    }
    if (field.type === "choice" && field.choices?.length) {
      const open = this.openSelect === id;
      const now =
        field.choices.find((choice) => String(choice.value) === String(draft)) ?? field.choices[0];
      const trigger = h_flex()
        .id(`${id}-trigger`)
        .h(28)
        .px(8)
        .gap(6)
        .items_center()
        .rounded(7)
        .border_1()
        .border_color(open ? t.accent : problem ? t.ansi1 : t.border)
        .bg(t.background)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          this.openSelect = open ? null : id;
          cx.notify();
        })
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(now.label))
        .child(div().text_size(10.5).text_color(t.dim).child("▾"));
      const menu = v_flex()
        .id(`${id}-menu`)
        .w(180)
        .p(4)
        .rounded(7)
        .border_1()
        .border_color(t.border)
        .bg(t.popover)
        .children(
          field.choices.map((choice, index) =>
            h_flex()
              .id(`${id}-option-${index}`)
              .h(28)
              .px(8)
              .rounded(5)
              .items_center()
              .gap(6)
              .cursor_pointer()
              .when(String(choice.value) === String(now.value), (el) => el.bg(t.selected))
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => {
                form.drafts[field.key] = String(choice.value);
                delete form.problems[field.key];
                form.note = "";
                this.openSelect = null;
                this.handle.focus();
                cx.notify();
              })
              .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(choice.label)),
          ),
        );
      return Select.new(id)
        .accessibility_label(field.title)
        .open(open)
        .track_focus(this.handle)
        .on_open_change((value, cx) => {
          this.openSelect = value ? id : null;
          cx.notify();
        })
        .child(Popup.new(`${id}-popup`, trigger).anchor("top_right").when(open, (el) => el.content(menu)));
    }
    const state = form.inputs[field.key];
    return div()
      .h(28)
      .px(7)
      .flex()
      .items_center()
      .rounded(7)
      .border_1()
      .border_color(problem ? t.ansi1 : t.border)
      .bg(t.background)
      .child(
        state
          ? Input.new(state).h(26).w_full().text_size(12).text_color(t.foreground)
          : div().text_size(12).text_color(t.dim).child(String(draft ?? "")),
      );
  }

  settingRow(t, form, field) {
    const id = `${form.name}:${field.key}`;
    const draft = form.drafts[field.key];
    const problem = form.problems[field.key] ?? parseDraft(field, draft).error ?? null;
    const changed = changedKeys([field], form.drafts, form.settings).length > 0;
    const hovered = this.hoveredField === id;
    return h_flex()
      .w_full()
      .px(14)
      .py(7)
      .gap(16)
      .items_start()
      .border_b(1)
      .border_color(t.border)
      .on_hover((isHovered, cx) => {
        const next = isHovered ? id : this.hoveredField === id ? null : this.hoveredField;
        if (next === this.hoveredField) return;
        this.hoveredField = next;
        cx.notify();
      })
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(div().text_size(13).text_color(t.foreground).child(field.title))
              .when(changed, (el) => el.child(div().w(5).h(5).rounded(3).bg(t.accent))),
          )
          .when(hovered && Boolean(field.description), (el) =>
            el.child(div().text_size(11).line_height("15px").text_color(t.dim).child(field.description)),
          )
          .when(Boolean(problem), (el) => el.child(div().text_size(11).text_color(t.ansi1).child(problem))),
      )
      .child(div().w(96).flex_none().child(this.settingControl(t, form, field, draft, problem)));
  }

  // Bottom right: the selected entry's settings, from its schema, in a scrolling body.
  settingsPane(t) {
    const base = v_flex().id("configurator-settings").flex_1().min_h(0).bg(t.background);
    if (!this.loaded) {
      return base.px(14).py(10).child(div().text_size(12).text_color(t.dim).child("Loading…"));
    }
    const form = this.forms[this.selected];
    if (!form) {
      return base.px(14).py(10).child(div().text_size(12).text_color(t.dim).child("Select an entry."));
    }
    if (!form.fields.length) {
      return base
        .px(14)
        .py(10)
        .child(div().text_size(12).text_color(t.dim).child("Nothing to configure for this entry."));
    }
    const changed = changedKeys(form.fields, form.drafts, form.settings);
    return base
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(14)
          .gap(10)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(div().text_size(11).font_semibold().text_color(t.dim).child("SETTINGS"))
          .child(div().flex_1())
          .when(Boolean(form.note), (el) =>
            el.child(div().text_size(11).text_color(t.dim).child(form.note)),
          )
          .child(
            div()
              .id(`configurator-save-${form.name}`)
              .flex_none()
              .px(10)
              .py(3)
              .rounded(6)
              .border_1()
              .border_color(changed.length ? t.accent : t.border)
              .bg(changed.length ? t.selected : t.background)
              .text_size(12)
              .text_color(changed.length ? t.foreground : t.dim)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => this.save(form, cx))
              .child("Save"),
          ),
      )
      .child(
        div()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_flex().id("configurator-settings-body").size_full().overflow_y_scroll().py(2).children(
              form.groups.map((group) =>
                v_flex()
                  .when(Boolean(group.name), (el) =>
                    el.child(
                      div()
                        .px(14)
                        .pt(10)
                        .pb(2)
                        .text_size(11)
                        .font_semibold()
                        .text_color(t.dim)
                        .child(group.name.replaceAll("_", " ").toUpperCase()),
                    ),
                  )
                  .children(group.fields.map((field) => this.settingRow(t, form, field))),
              ),
            ),
          )
          .child(Scrollbar.vertical("configurator-settings-body").mode("always").absolute().inset_0()),
      );
  }

  originWord(row) {
    return row.origin === "third_party" && row.unknown
      ? `${ORIGIN_WORDS.third_party} · unknown`
      : ORIGIN_WORDS[row.origin];
  }

  // The docked copy: the gear and the name, nothing else.
  strip(t) {
    return h_flex()
      .id("configurator-strip")
      .size_full()
      .items_center()
      .justify_end()
      .px(10)
      .border_t(1)
      .border_color(t.border)
      .bg(t.chrome)
      .child(
        h_flex()
          .id("configurator-open")
          .h_full()
          .gap(6)
          .px(8)
          .items_center()
          .cursor_pointer()
          .text_color(t.muted)
          .hover((s) => s.text_color(t.accent))
          .on_click(() => run("mod.open", { name: "configurator" }))
          .child(svg(GEAR).size(14))
          .child(div().text_size(12).child("Configurator")),
      );
  }

  seat(t, row) {
    const on = row.name === this.selected;
    return h_flex()
      .id(`configurator-${row.name}`)
      .h(32)
      .px(10)
      .gap(8)
      .items_center()
      .cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        this.selected = row.name;
        this.openSelect = null;
        this.hoveredField = null;
        this.sourceNote = "";
        this.sourceRepo.set_value("");
        this.sourceRef.set_value("");
        cx.notify();
        cx.spawn(async (cx) => {
          const detail = await this.detailFor(row.name);
          if (this.selected !== row.name) return;
          this.detail = detail;
          cx.notify();
        });
      })
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(row.title))
      .when(Boolean(CHECK_DOTS[row.checkState]), (el) =>
        el.child(div().w(5).h(5).rounded(3).bg(t[CHECK_DOTS[row.checkState]])),
      )
      .child(div().text_size(11).text_color(t.dim).child(this.originWord(row)))
      .when(Boolean(row.version), (el) =>
        el.child(div().text_size(11).text_color(t.dim).child(row.version)),
      );
  }

  // The selected entry at a glance, top right: what it is, where it lives, where it came
  // from, its files as they are on disk, and the Reference scan's answer.
  detailPane(t) {
    const detail = this.detail;
    const base = v_flex()
      .id("configurator-detail")
      .h(200)
      .flex_none()
      .px(14)
      .py(10)
      .gap(5)
      .border_b(1)
      .border_color(t.border)
      .bg(t.background);
    if (!detail) {
      return base.child(
        div().text_size(12).text_color(t.dim).child(this.loaded ? "Select an entry." : "Loading…"),
      );
    }
    return base
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(15).text_color(t.foreground).child(detail.title))
          .when(Boolean(detail.version), (el) =>
            el.child(div().text_size(11).text_color(t.dim).child(detail.version)),
          )
          .child(div().text_size(11).text_color(t.muted).child(this.originWord(detail))),
      )
      .child(div().font_family("JetBrains Mono").text_size(11).text_color(t.dim).child(detail.folder))
      .child(
        detail.unknown
          ? this.sourceRow(t, detail)
          : h_flex()
              .gap(10)
              .items_center()
              .child(
                div()
                  .text_size(12)
                  .text_color(detail.repo || detail.commit ? t.foreground : t.dim)
                  .child(detail.provenanceText),
              )
              .when(Boolean(detail.lastChecked), (el) =>
                el.child(
                  div()
                    .text_size(11)
                    .text_color(t.dim)
                    .child(
                      `checked ${detail.lastChecked}${
                        CHECK_WORDS[detail.checkState] ? ` · ${CHECK_WORDS[detail.checkState]}` : ""
                      }`,
                    ),
                ),
              ),
      )
      .when(Boolean(detail.checkError), (el) =>
        el.child(div().min_w(0).text_size(11).text_color(t.ansi1).child(detail.checkError)),
      )
      .child(
        h_flex()
          .flex_wrap()
          .gap(6)
          .when(detail.files.length === 0, (el) =>
            el.child(div().text_size(11).text_color(t.dim).child("No files on disk.")),
          )
          .children(
            detail.files.map((file) =>
              h_flex()
                .gap(4)
                .items_center()
                .px(5)
                .py(2)
                .rounded(4)
                .border_1()
                .border_color(t.border)
                .child(div().font_family("JetBrains Mono").text_size(11).text_color(t.foreground).child(file.name))
                .child(div().text_size(10.5).text_color(t.dim).child(sizeText(file.size))),
            ),
          ),
      )
      .when(Boolean(this.sourceNote), (el) =>
        el.child(div().text_size(11).text_color(t.dim).child(this.sourceNote)),
      )
      .when(Boolean(this.ledgerProblem), (el) =>
        el.child(div().text_size(11).text_color(t.ansi1).child(`Ledger: ${this.ledgerProblem}`)),
      )
      .child(div().flex_1())
      .child(this.updateRow(t, detail))
      .child(this.uninstallRow(t, detail));
  }

  // The Reference scan's line, and the Uninstall action. A shipped entry says why it has
  // none; every other Origin opens the confirm panel and moves nothing until it is pressed.
  uninstallRow(t, detail) {
    const plan = this.uninstall?.name === detail.name ? this.uninstall : null;
    const refusal = refusalOf(detail.origin);
    const trigger = refusal
      ? div().text_size(11).text_color(t.dim).child(refusal)
      : div()
          .id(`configurator-uninstall-${detail.name}`)
          .flex_none()
          .px(10)
          .py(3)
          .rounded(6)
          .border_1()
          .border_color(t.border)
          .bg(t.background)
          .text_size(12)
          .text_color(this.uninstalling ? t.dim : t.foreground)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.openUninstall(detail, cx))
          .child("Uninstall");
    return h_flex()
      .w_full()
      .gap(8)
      .items_center()
      .child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).child(detail.scanText))
      .child(this.keysTrigger(t, detail))
      .child(
        Popup.new(`configurator-uninstall-popup-${detail.name}`, trigger)
          .anchor("top_right")
          .when(Boolean(plan), (el) => el.content(this.confirmPanel(t, plan))),
      );
  }

  // The confirm panel lists the Reference scan, where the folder goes, and an explicit
  // Cancel. Nothing moves before Move to trash is pressed; a failed move keeps it open.
  confirmPanel(t, plan) {
    return v_flex()
      .id("configurator-uninstall-panel")
      .w(360)
      .p(12)
      .gap(6)
      .rounded(8)
      .border_1()
      .border_color(t.border)
      .bg(t.popover)
      .child(div().text_size(13).text_color(t.foreground).child(`Uninstall ${plan.name}?`))
      .child(div().line_height("15px").text_size(11).text_color(t.muted).child(plan.scanText))
      .when(Boolean(plan.note), (el) =>
        el.child(div().line_height("15px").text_size(11).text_color(t.dim).child(plan.note)),
      )
      .child(div().line_height("15px").text_size(11).text_color(t.dim).child(plan.moveText))
      .when(Boolean(this.uninstallError), (el) =>
        el.child(div().line_height("15px").text_size(11).text_color(t.blocked).child(this.uninstallError)),
      )
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .child(
            div()
              .id("configurator-uninstall-cancel")
              .px(10)
              .py(3)
              .rounded(6)
              .border_1()
              .border_color(t.border)
              .text_size(12)
              .text_color(t.foreground)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => this.cancelUninstall(cx))
              .child("Cancel"),
          )
          .child(
            div()
              .id("configurator-uninstall-confirm")
              .px(10)
              .py(3)
              .rounded(6)
              .bg(t.solid)
              .text_size(12)
              .text_color(t.solid_foreground)
              .cursor_pointer()
              .on_click((_e, cx) => this.confirmUninstall(plan, cx))
              .child(this.uninstalling ? "Moving…" : "Move to trash"),
          ),
      );
  }

  openUninstall(detail, cx) {
    if (checking() || this.uninstalling) return;
    this.uninstallError = "";
    this.uninstall = uninstallOf(detail, {
      now: Date.now(),
      mods: `${appHome()}/mods`,
      trash: `${appHome()}/data/configurator/trash`,
    });
    cx.notify();
  }

  cancelUninstall(cx) {
    if (this.uninstalling) return;
    this.uninstall = null;
    this.uninstallError = "";
    cx.notify();
  }

  confirmUninstall(plan, cx) {
    if (checking() || this.uninstalling) return;
    this.uninstalling = true;
    this.uninstallError = "";
    cx.notify();
    cx.spawn(async (cx) => {
      const outcome = await this.moveToTrash(plan);
      this.uninstalling = false;
      if (outcome.error) {
        this.uninstallError = outcome.error;
        notify({ title: "Uninstall failed", body: outcome.error, level: "error" });
      } else {
        this.uninstall = null;
        delete this.keyOffers[plan.name];
        if (this.keyPanel === plan.name) this.keyPanel = null;
        await this.load();
        notify({
          title: "Uninstalled",
          body: outcome.ledgerError
            ? `${plan.name} moved to ${plan.destination}, but ${outcome.ledgerError}`
            : `${plan.name} moved to ${plan.destination}.`,
          level: outcome.ledgerError ? "warning" : "success",
        });
      }
      cx.notify();
    });
  }

  // The move itself: make the time folder, mv the entry into it, and only then drop the
  // ledger row. A failed move leaves the entry and the ledger as they were.
  async moveToTrash(plan) {
    try {
      await exec("/bin/sh", ["-c", 'mkdir -p "$1"', "sh", plan.trashFolder]);
      await exec("/bin/sh", ["-c", 'mv "$1" "$2"', "sh", plan.source, plan.destination]);
    } catch (error) {
      return { error: error?.message ?? String(error), ledgerError: null };
    }
    return { error: null, ledgerError: await this.removeLedgerRow(plan.name) };
  }

  // Drop one ledger row through the same conditional writer as any other ledger change,
  // re-reading the file on every attempt. Only called after the folder actually moved.
  async removeLedgerRow(name) {
    return this.writeLedger((entries) => withoutEntry(entries, name));
  }

  // The hashes of one folder as the ledger stores them. gpui-shell writes gpui-kit.d.ts and
  // jsconfig.json into every mod folder when it loads one (see .gitignore), so they are not
  // what either side shipped.
  async hashesIn(folder) {
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && find . -type f -print0 | xargs -0 shasum -a 256', "sh", folder]);
    const files = hashesOf(listing.stdout);
    for (const generated of ["gpui-kit.d.ts", "jsconfig.json"]) delete files[generated];
    return files;
  }

  // The Update action, and its question. Only an entry with a recorded repository, ref and
  // hashes can be updated; the confirm panel appears only when a file differs from them.
  updateRow(t, detail) {
    const job = this.updateJob?.name === detail.name ? this.updateJob : null;
    const note = this.updateNote?.name === detail.name ? this.updateNote.text : "";
    const error = this.updateError?.name === detail.name ? this.updateError.text : "";
    const target = updateTargetOf(this.ledger[detail.name]);
    const trigger = div()
      .id(`configurator-update-${detail.name}`)
      .flex_none()
      .px(10)
      .py(3)
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .text_size(12)
      .text_color(this.updating ? t.dim : t.foreground)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.startUpdate(detail, cx))
      .child(this.updating ? "Updating…" : "Update");
    return h_flex()
      .w_full()
      .gap(8)
      .items_center()
      .child(div().flex_1().min_w(0).text_size(11).text_color(error ? t.blocked : t.dim).child(error || note))
      .when(Boolean(target), (el) =>
        el.child(
          Popup.new(`configurator-update-popup-${detail.name}`, trigger)
            .anchor("top_right")
            .when(Boolean(job), (popup) => popup.content(this.updatePanel(t, job))),
        ),
      );
  }

  // The question: which files differ, where they go, and the two answers. Nothing has been
  // written at this point; Cancel closes the panel and leaves the folder byte-identical.
  updatePanel(t, job) {
    return v_flex()
      .id("configurator-update-panel")
      .w(360)
      .p(12)
      .gap(6)
      .rounded(8)
      .border_1()
      .border_color(t.border)
      .bg(t.popover)
      .child(div().text_size(13).text_color(t.foreground).child(`Update ${job.name}?`))
      .child(
        div()
          .line_height("15px")
          .text_size(11)
          .text_color(t.muted)
          .child(updatePromptText(job.name, job.comparison.edited)),
      )
      .child(
        div()
          .line_height("15px")
          .text_size(11)
          .text_color(t.dim)
          .child(
            `Upstream ${job.target.repo} @ ${job.commit ? job.commit.slice(0, 7) : job.target.ref}. The edited files are moved to the trash before they are replaced.`,
          ),
      )
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .child(
            div()
              .id("configurator-update-cancel")
              .px(10)
              .py(3)
              .rounded(6)
              .border_1()
              .border_color(t.border)
              .text_size(12)
              .text_color(t.foreground)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => this.cancelUpdate(cx))
              .child("Cancel"),
          )
          .child(
            div()
              .id("configurator-update-confirm")
              .px(10)
              .py(3)
              .rounded(6)
              .bg(t.solid)
              .text_size(12)
              .text_color(t.solid_foreground)
              .cursor_pointer()
              .on_click((_e, cx) => this.confirmUpdate(job, cx))
              .child(this.updating ? "Updating…" : "Back up and overwrite"),
          ),
      );
  }

  startUpdate(detail, cx) {
    if (checking() || this.updating || !this.overlay) return;
    this.updateJob = null;
    this.updateNote = null;
    this.updateError = null;
    const target = updateTargetOf(this.ledger[detail.name]);
    if (this.ledgerProblem) {
      this.updateError = { name: detail.name, text: `Ledger: ${this.ledgerProblem}` };
      cx.notify();
      return;
    }
    if (!target) {
      this.updateError = { name: detail.name, text: "This entry has no recorded repository, ref and hashes." };
      cx.notify();
      return;
    }
    this.updating = true;
    this.updateNote = { name: detail.name, text: "Cloning…" };
    cx.notify();
    cx.spawn(async (cx) => {
      await this.runUpdate(detail.name, target, cx);
      cx.notify();
    });
  }

  // One shallow clone of the recorded ref into the Configurator's own temp folder, then the
  // three hashes of every file. A failure reports the program's own text and keeps the
  // clone where it is, with nothing in the entry's folder touched.
  async runUpdate(name, target, cx) {
    const now = Date.now();
    const folder = updateTempPath(name, { now, temp: `${appHome()}/data/configurator/temp` });
    const upstream = `${folder}/mods/${name}`;
    const fail = (error) => {
      this.updating = false;
      this.updateNote = null;
      this.updateError = { name, text: `${error} The clone is kept in ${folder}.` };
    };
    try {
      await exec("git", [
        "clone",
        "--depth",
        "1",
        "--branch",
        target.ref,
        `https://github.com/${target.repo}.git`,
        folder,
      ]);
    } catch (error) {
      return fail(error?.message ?? String(error));
    }
    let commit = "";
    let files = null;
    let local = null;
    try {
      const head = await exec("git", ["-C", folder, "rev-parse", "HEAD"]);
      commit = head.stdout.trim();
      if ((await readTextFile(`${upstream}/mod.json`)) === null)
        return fail(`The repository no longer ships mods/${name}.`);
      files = await this.hashesIn(upstream);
      local = await this.hashesIn(`${appHome()}/mods/${name}`);
    } catch (error) {
      return fail(error?.message ?? String(error));
    }
    const job = {
      name,
      target,
      commit,
      folder,
      now,
      files,
      comparison: compareUpdate({ recorded: target.files, local, upstream: files }),
    };
    if (writePlan(job.comparison).blocked) {
      this.updating = false;
      this.updateNote = null;
      this.updateJob = job;
      return;
    }
    await this.finishUpdate(job, false, cx);
  }

  cancelUpdate(cx) {
    if (this.updating) return;
    this.updateJob = null;
    this.updateNote = null;
    this.updateError = null;
    cx.notify();
  }

  confirmUpdate(job, cx) {
    if (checking() || this.updating) return;
    this.updating = true;
    this.updateError = null;
    this.updateNote = { name: job.name, text: "Updating…" };
    cx.notify();
    cx.spawn(async (cx) => {
      await this.finishUpdate(job, true, cx);
      cx.notify();
    });
  }

  // The write plan, in order: the files that leave the folder go to the trash, upstream's
  // files are copied in, the ledger row takes the new commit and hashes, and the mod is
  // checked afterwards. Nothing else in the entry, and nothing in its state folder, is read
  // or written.
  async finishUpdate(job, overwrite, cx) {
    const plan = writePlan(job.comparison, { overwrite });
    if (plan.blocked) return;
    const folder = `${appHome()}/mods/${job.name}`;
    const trashFolder = trashPath(job.name, { now: job.now, trash: `${appHome()}/data/configurator/trash` });
    try {
      if (plan.trash.length) await exec("/bin/sh", ["-c", 'mkdir -p "$1"', "sh", trashFolder]);
      for (const name of plan.trash)
        await exec("/bin/sh", [
          "-c",
          'mkdir -p "$(dirname "$2")" && mv "$1" "$2"',
          "sh",
          `${folder}/${name}`,
          `${trashFolder}/${name}`,
        ]);
      for (const name of plan.writes)
        await exec("/bin/sh", [
          "-c",
          'mkdir -p "$(dirname "$2")" && cp "$1" "$2"',
          "sh",
          `${job.folder}/mods/${job.name}/${name}`,
          `${folder}/${name}`,
        ]);
    } catch (error) {
      this.updating = false;
      this.updateJob = null;
      this.updateNote = null;
      this.updateError = { name: job.name, text: `${error?.message ?? error} The clone is kept in ${job.folder}.` };
      return;
    }
    const failure = await this.writeLedger((entries) =>
      updatedRow(entries, { name: job.name, commit: job.commit, files: job.files }),
    );
    let checkError = "";
    try {
      await exec("/bin/sh", ["-c", 'herdr-app check "$1"', "sh", folder]);
    } catch (error) {
      checkError = ` herdr-app check: ${error?.message ?? error}`;
    }
    const report = updateReportText({
      name: job.name,
      commit: job.commit,
      added: job.comparison.added,
      replaced: job.comparison.replaced,
      restored: job.comparison.restored,
      removed: job.comparison.toTrash,
    });
    this.updating = false;
    this.updateJob = null;
    this.updateError = null;
    this.updateNote = { name: job.name, text: `${failure ? `${failure} ` : ""}${report}${checkError}` };
    await this.load();
  }

  // Unknown origin: the repository and ref to record, and the action that records them.
  sourceRow(t, detail) {
    return h_flex()
      .gap(8)
      .items_center()
      .child(
        div()
          .flex_none()
          .max_w(200)
          .truncate()
          .text_size(11)
          .text_color(t.dim)
          .child(detail.repo ? `Hint ${detail.repo}` : "Unknown origin"),
      )
      .child(
        div()
          .h(24)
          .flex_1()
          .min_w(140)
          .px(6)
          .flex()
          .items_center()
          .rounded(6)
          .border_1()
          .border_color(t.border)
          .bg(t.background)
          .child(Input.new(this.sourceRepo).h(22).w_full().text_size(11).text_color(t.foreground)),
      )
      .child(
        div()
          .h(24)
          .w(84)
          .flex_none()
          .px(6)
          .flex()
          .items_center()
          .rounded(6)
          .border_1()
          .border_color(t.border)
          .bg(t.background)
          .child(Input.new(this.sourceRef).h(22).w_full().text_size(11).text_color(t.foreground)),
      )
      .child(
        div()
          .id("configurator-record-source")
          .flex_none()
          .px(10)
          .py(3)
          .rounded(6)
          .border_1()
          .border_color(t.accent)
          .bg(t.background)
          .text_size(12)
          .text_color(t.foreground)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.startRecording(this.rows.find((row) => row.name === this.detail?.name), cx))
          .child("Record source"),
      );
  }

  // The two views the left column switches between; the installed entries stay the default.
  tabs(t) {
    return h_flex()
      .flex_none()
      .gap(6)
      .px(10)
      .pt(10)
      .child(this.tabButton(t, "installed", "Installed"))
      .child(this.tabButton(t, "gallery", "Gallery"));
  }

  tabButton(t, tab, label) {
    const on = this.tab === tab;
    return div()
      .id(`configurator-tab-${tab}`)
      .h(28)
      .px(10)
      .flex()
      .items_center()
      .rounded(7)
      .border_1()
      .border_color(on ? t.accent : t.border)
      .bg(on ? t.selected : t.background)
      .cursor_pointer()
      .text_size(12)
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        this.tab = tab;
        cx.notify();
      })
      .child(label);
  }

  filterBox(t) {
    return div().p(10).flex_none().child(
      div()
        .h(30)
        .px(8)
        .flex()
        .items_center()
        .rounded(7)
        .border_1()
        .border_color(t.border)
        .bg(t.background)
        .child(Input.new(this.input).h(28).w_full().text_size(12.5).text_color(t.foreground)),
    );
  }

  // The installed entries: the filter's rows, one per entry, scrolling.
  entriesPane(t) {
    const rows = filterRows(this.rows, this.filter);
    return div()
      .relative()
      .flex_1()
      .min_h(0)
      .child(
        v_flex()
          .id("configurator-list")
          .size_full()
          .overflow_y_scroll()
          .py(2)
          .when(rows.length === 0, (el) =>
            el.child(
              div()
                .px(10)
                .py(8)
                .text_size(12)
                .text_color(t.dim)
                .child(this.loaded ? "No entries match." : "Loading…"),
            ),
          )
          .children(rows.map((row) => this.seat(t, row))),
      )
      .child(Scrollbar.vertical("configurator-list").mode("always").absolute().inset_0());
  }

  // The gallery: one row per repository from the topic, and the Refresh action with the
  // cache's fetch time under it. Opening this view never fetches; only Refresh does.
  galleryPane(t) {
    const rows = this.gallery.rows;
    return v_flex()
      .flex_1()
      .min_h(0)
      .child(
        div()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_flex()
              .id("configurator-gallery-list")
              .size_full()
              .overflow_y_scroll()
              .py(2)
              .when(rows.length === 0, (el) =>
                el.child(
                  div()
                    .px(10)
                    .py(8)
                    .text_size(12)
                    .text_color(t.dim)
                    .child(this.refreshing ? "Refreshing…" : "No gallery rows yet. Refresh to fetch them."),
                ),
              )
              .children(rows.map((row) => this.gallerySeat(t, row))),
          )
          .child(Scrollbar.vertical("configurator-gallery-list").mode("always").absolute().inset_0()),
      )
      .child(this.galleryFooter(t));
  }

  gallerySeat(t, row) {
    return v_flex()
      .id(`configurator-gallery-${row.repository}`)
      .gap(3)
      .px(10)
      .py(7)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(row.repository))
          .child(div().text_size(11).text_color(t.muted).child(`★ ${row.stars}`)),
      )
      .child(
        div()
          .min_w(0)
          .truncate()
          .text_size(11)
          .text_color(t.muted)
          .child(row.description || "No description."),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`Pushed ${row.pushedAt}`))
          .child(
            div()
              .id(`configurator-gallery-install-${row.repository}`)
              .h(22)
              .px(8)
              .flex()
              .items_center()
              .rounded(5)
              .border_1()
              .border_color(t.border)
              .text_size(11)
              .text_color(this.installing === row.repository ? t.dim : t.foreground)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => {
                if (checking() || this.installing) return;
                cx.spawn(async (cx) => {
                  await this.install(row, cx);
                });
              })
              .child(this.installing === row.repository ? "Installing…" : "Install"),
          ),
      )
      .when(this.installNote?.repository === row.repository, (el) =>
        el.child(
          v_flex()
            .gap(4)
            .child(
              div()
                .min_w(0)
                .text_size(11)
                .text_color(this.installNote.error ? t.blocked : t.dim)
                .child(this.installNote.text),
            )
            .when(Boolean(this.installNote.keysError), (inner) =>
              inner.child(div().min_w(0).text_size(11).text_color(t.blocked).child(this.installNote.keysError)),
            )
            .when(
              Boolean(
                this.installNote.keys?.offered?.length ||
                  this.installNote.keys?.conflicts?.length ||
                  this.installNote.keys?.problems?.length,
              ),
              (inner) =>
                inner.child(this.keyOfferBlock(t, this.installNote.keys, `install-${row.repository}`)),
            ),
        ),
      );
  }

  galleryFooter(t) {
    const cached = this.gallery.fetchedAt
      ? `Cached ${this.gallery.fetchedAt.slice(0, 16).replace("T", " ")}`
      : "Not fetched yet";
    return v_flex()
      .flex_none()
      .gap(6)
      .p(10)
      .border_t(1)
      .border_color(t.border)
      .bg(t.surface)
      .when(Boolean(this.galleryError), (el) =>
        el.child(div().min_w(0).text_size(11).text_color(t.blocked).child(this.galleryError)),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(
            div()
              .id("configurator-gallery-refresh")
              .h(31)
              .px(12)
              .flex()
              .items_center()
              .rounded(7)
              .border_1()
              .border_color(t.border)
              .bg(t.surface)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .text_size(12)
              .text_color(this.refreshing ? t.dim : t.foreground)
              .on_click((_e, cx) => {
                if (this.refreshing) return;
                cx.spawn(async (cx) => {
                  await this.refreshGallery(cx);
                });
              })
              .child(this.refreshing ? "Refreshing…" : "Refresh"),
          )
          .child(div().flex_1())
          .child(div().text_size(11).text_color(t.dim).child(cached)),
      );
  }

  // The sticky row under the installed list: the one action that talks to upstream, and
  // what the last run did, failures included. It never runs on its own.
  checkRow(t) {
    return v_flex()
      .flex_none()
      .gap(6)
      .p(10)
      .border_t(1)
      .border_color(t.border)
      .when(Boolean(this.checkNote), (el) =>
        el.child(div().min_w(0).text_size(11).text_color(t.dim).child(this.checkNote)),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(
            div()
              .id("configurator-check-updates")
              .h(31)
              .px(12)
              .flex()
              .items_center()
              .rounded(7)
              .border_1()
              .border_color(t.border)
              .bg(t.surface)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover))
              .text_size(12)
              .text_color(this.checkingUpdates ? t.dim : t.foreground)
              .on_click((_e, cx) => {
                if (this.checkingUpdates) return;
                cx.spawn(async (cx) => {
                  await this.checkUpdates(cx);
                });
              })
              .child(this.checkingUpdates ? "Checking…" : "Check updates"),
          ),
      );
  }

  // The dialog copy: the view switch, then the default installed list or the gallery.
  dialog(t) {
    return h_flex()
      .id("configurator-dialog")
      .size_full()
      .min_h(0)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        cx.stop_propagation();
        closeOverlay(this.overlay);
      })
      .child(
        v_flex()
          .w(320)
          .h_full()
          .min_h(0)
          .bg(t.surface)
          .child(this.tabs(t))
          .when(this.tab === "installed", (el) => el.child(this.filterBox(t)))
          .child(this.tab === "installed" ? this.entriesPane(t) : this.galleryPane(t))
          .when(this.tab === "installed", (el) => el.child(this.checkRow(t))),
      )
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .h_full()
          .min_h(0)
          .child(this.detailPane(t))
          .child(this.settingsPane(t)),
      );
  }

  render(_cx) {
    const t = theme();
    return this.overlay ? this.dialog(t) : this.strip(t);
  }
}
