// Configurator: a 26 px strip at the bottom whose gear opens one dialog, and that dialog
// lists every entry under mods/ with its Origin, or — in its second view — the GitHub topic's
// installable mods. One folder, two copies: props().overlay is set only in the dialog copy.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, InputState, Input } from "gpui-base";
import {
  appHome,
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
} from "herdr";
import {
  folderNames,
  rowsOf,
  filterRows,
  fileSizesOf,
  detailOf,
  sizeText,
  galleryRowsOf,
  galleryPagePlan,
  galleryCacheOf,
  galleryCacheText,
  errorTextOf,
  refreshedGallery,
} from "./model.js";

const GALLERY_TOPIC_URL = "https://api.github.com/search/repositories?q=topic:herdr-mod&per_page=100&page=";

const GEAR = "mods/configurator/icons/gear.svg";
const ORIGIN_WORDS = { shipped: "shipped", cloned: "cloned", third_party: "third party" };

const asObject = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

export default class Configurator extends View {
  init(_given, cx) {
    this.overlay = props()?.overlay ?? null;
    this.rows = [];
    this.entries = [];
    this.ledger = {};
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
    if (this.overlay) {
      this.input = InputState.new({ placeholder: "Filter entries…" });
      this.input.on("change", (_e, cx) => {
        this.filter = this.input.value();
        cx.notify();
      });
      this.input.focus();
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
      entries.push({ name, modJson: await readTextFile(`${appHome()}/mods/${name}/mod.json`) });
    }
    this.entries = entries;
    this.ledger = asObject(await readTextFile(`${appHome()}/data/configurator/ledger.json`));
    this.rows = rowsOf(entries, {
      installed: asObject(await readTextFile(`${appHome()}/installed.json`)),
      ledger: this.ledger,
    });
    this.layoutFiles = [];
    for (const name of layouts()) {
      this.layoutFiles.push({ name, text: await readTextFile(`${appHome()}/layouts/${name}.json`) });
    }
    this.keys = keys();
    this.galleryRaw = await readTextFile(this.galleryPath());
    this.gallery = galleryCacheOf(this.galleryRaw);
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

  galleryPath() {
    return `${appHome()}/data/configurator/gallery.json`;
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
        h_flex()
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
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(detail.scanText));
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
          // Where the Install action goes later; nothing installs from here yet.
          .child(
            div()
              .h(22)
              .px(8)
              .flex()
              .items_center()
              .rounded(5)
              .border_1()
              .border_color(t.border)
              .text_size(11)
              .text_color(t.dim)
              .child("Install"),
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
          .child(this.tab === "installed" ? this.entriesPane(t) : this.galleryPane(t)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .h_full()
          .min_h(0)
          .child(this.detailPane(t))
          .child(div().flex_1().min_h(0)),
      );
  }

  render(_cx) {
    const t = theme();
    return this.overlay ? this.dialog(t) : this.strip(t);
  }
}
