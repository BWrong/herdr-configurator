// Configurator: a 26 px strip at the bottom whose gear opens one dialog, and that dialog
// lists every entry under mods/ with its Origin. One folder, two copies: props().overlay is
// set only in the dialog copy.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, InputState, Input, Select, Popup, Checkbox } from "gpui-base";
import { appHome, home, exec, readTextFile, writeTextFile, checking, closeOverlay, props, run, theme, layouts, keys } from "herdr";
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
} from "./model.js";

const GEAR = "mods/configurator/icons/gear.svg";
const ORIGIN_WORDS = { shipped: "shipped", cloned: "cloned", third_party: "third party" };

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
    this.forms = {};
    this.openSelect = null;
    this.hoveredField = null;
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
  // until there is one to read), and the texts the Reference scan reads. Nothing is written
  // here and no file sizes are cached: those are read again each time a row is selected.
  async load() {
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && ls -d */ 2>/dev/null', "sh", `${appHome()}/mods`]);
    const entries = [];
    for (const name of folderNames(listing.stdout)) {
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
    return detailOf(row, {
      folder: `mods/${name}`,
      manifest: asObject(entry?.modJson),
      ledger: this.ledger,
      files: fileSizesOf(listing.stdout),
      layouts: this.layoutFiles,
      keys: this.keys,
    });
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

  // One ledger row, written conditionally: the file is re-read and the row merged on every
  // attempt, so a ledger the person edited meanwhile keeps their changes. A ledger that
  // reports a problem is left alone rather than replaced.
  async writeLedger(pending) {
    const folder = `${appHome()}/data/configurator`;
    const path = `${folder}/ledger.json`;
    let failure = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await readTextFile(path);
      const read = parseLedger(raw);
      if (read.problem) return read.problem;
      const entries = recordSource(read.entries, pending);
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
    let listing = null;
    try {
      listing = await exec("/bin/sh", ["-c", 'cd "$1" && find . -type f -print0 | xargs -0 shasum -a 256', "sh", folder]);
    } catch (error) {
      return { note: `Couldn't hash the entry: ${error?.message ?? error}` };
    }
    const files = hashesOf(listing.stdout);
    // gpui-shell writes these into every mod folder when it loads one (see .gitignore), so
    // they are not what the entry arrived with.
    for (const generated of ["gpui-kit.d.ts", "jsconfig.json"]) delete files[generated];
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
    const failure = await this.writeLedger({ name, repo, ref, commit: resolved.commit, files });
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
                el.child(div().text_size(11).text_color(t.dim).child(`checked ${detail.lastChecked}`)),
              ),
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
      .child(div().text_size(11).text_color(t.dim).child(detail.scanText));
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

  // The dialog copy: the filter, then one row per entry.
  dialog(t) {
    const rows = filterRows(this.rows, this.filter);
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
          .child(
            div().p(10).flex_none().child(
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
            ),
          )
          .child(
            div()
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
              .child(Scrollbar.vertical("configurator-list").mode("always").absolute().inset_0()),
          ),
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
