// Configurator: a 26 px strip at the bottom whose gear opens one dialog, and that dialog
// lists every entry under mods/ with its Origin. One folder, two copies: props().overlay is
// set only in the dialog copy.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, InputState, Input } from "gpui-base";
import { appHome, exec, readTextFile, checking, closeOverlay, props, run, theme } from "herdr";
import { folderNames, rowsOf, filterRows } from "./model.js";

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
    this.selected = null;
    this.filter = "";
    this.loaded = false;
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

  // Every folder under mods/, its mod.json, Herdr's shipped file list, and the ledger
  // (absent until there is one to read). Nothing is written here.
  async load() {
    const listing = await exec("/bin/sh", ["-c", 'cd "$1" && ls -d */ 2>/dev/null', "sh", `${appHome()}/mods`]);
    const entries = [];
    for (const name of folderNames(listing.stdout)) {
      entries.push({ name, modJson: await readTextFile(`${appHome()}/mods/${name}/mod.json`) });
    }
    this.rows = rowsOf(entries, {
      installed: asObject(await readTextFile(`${appHome()}/installed.json`)),
      ledger: asObject(await readTextFile(`${appHome()}/data/configurator/ledger.json`)),
    });
    this.loaded = true;
    if (!this.rows.some((row) => row.name === this.selected)) this.selected = this.rows[0]?.name ?? null;
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
      })
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(row.title))
      .child(div().text_size(11).text_color(t.dim).child(this.originWord(row)))
      .when(Boolean(row.version), (el) =>
        el.child(div().text_size(11).text_color(t.dim).child(row.version)),
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
      );
  }

  render(_cx) {
    const t = theme();
    return this.overlay ? this.dialog(t) : this.strip(t);
  }
}
