# Herdr runtime, as this mod uses it

Facts learned the hard way while building `mods/workshop/`. `~/.config/herdr-app/AGENTS.md`
(72 KB, rewritten by the app on every start) is the authority; this page is the short version
for the questions that come up in this repo.

## Where things live

- `~/.config/herdr-app/` — the app's home. `mods/<name>/`, `layouts/*.json`, `keys.json`,
  `settings.json`, `installed.json`, `data/<mod>/`, `shared.json`, `themes/`.
- `HERDR_APP_HOME` picks another home (`herdr-app --help`). The socket is per home —
  `HERDR_APP_HOME=/tmp/hh herdr-app status` answers `no Herdr window at /tmp/hh/herdr-app.sock`
  rather than reaching the running window — so a second home is a separate instance, launched
  with `HERDR_APP_HOME=/tmp/hh herdr-app`. Not tried end to end; it is the way to shoot and
  verify without touching the person's window.
- `installed.json` lists only Herdr's own shipped files (name → file → hash). Third-party
  entries have no provenance anywhere: that is why this mod keeps its ledger.

## Commands

- `herdr-app check <mod folder>` — loads one mod, renders once, exits non-zero with the exact
  error. `init()` really runs, so guard side effects with `checking()`. It does **not** add
  the folder to `mods/`, so any worktree's copy can be checked in place.
- `herdr-app shot [file.png]` — saves the window frame (3796×2820 retina here).
- `herdr-app status` — what the window shows, including open overlays.
- `herdr-app do <name> <json>` — e.g. `mod.open '{"name": "workshop"}'`,
  `overlay.close '{"id": "workshop"}'`, `layout.switch '{"name": "main-graph"}'`.
- `node --test mods/workshop/*.test.js` — the pure half; no Herdr needed.
  `npm test` runs it; CI runs only this, since `check` needs the macOS app.

## Mod shape

- `mod.json`: `$schema`, `version`, `title`, `place` (`left|right|top|bottom|none`), `size`,
  `focusable`, `overlay {kind: dialog|popup|window, width, height, frame}`, `settings`.
- `place: "none"` draws nothing on its own: a layout must name it. Here the tabs block does
  (`"content": {"mod": "workshop"}`), and one folder serves two copies — the docked one
  draws the tab bar, the overlay one the dialog, told apart by `props().overlay`.
- Saving any file in a mod folder reloads every copy in place.
- No DOM, no HTML/CSS, no Node, no `setTimeout`. Drawing via `gpui-kit` (`div`, `svg`) and
  `gpui-base` (`v_flex`, `h_flex`, `Scrollbar`, `InputState`, `Input`, `Select`, `Popup`,
  `Checkbox`). Escape hatch: ctrl-alt-shift-escape.
- No `mods()` API: listing entries means `exec` of `ls` plus reading each `mod.json`.
- `writeTextFile(path, text, expected)` refuses to write when the file no longer hashes to
  `expected` — every write here passes the value it read.
- Errors thrown inside a mod surface verbatim in the dialog; the dialog shows them as read.

## Layouts

- `layouts/*.json` are the window trees; a block's `content` names a mod or a tab/pane.
- `"titlebar": "none"` + `"traffic_lights": [12, 16]` on the root drops the blank title row, so
  content starts under the traffic lights (this is what `layouts/main.json` does, and why
  `main-graph.json` needed the same two keys on its outer node).
- The tab bar's right-hand group (`+`, Files, Changes, Git) is drawn by the `tabs` mod, not by
  the frame: there is no toolbar slot to inject into. `mods/workshop/tabbar.js` is a port
  of `mods/tabs/main.js`; `scripts/tabs-diff.sh` shows how far it has drifted.

## Gallery and GitHub

- `herdr.dev/gallery` is rendered HTML from repos with topic `herdr-mod` (753 repos at the
  time of writing) or `herdr-layout`. There is no JSON endpoint.
- `api.github.com/search/repositories?q=topic:herdr-mod` works, `per_page` max 100, paged
  through `total_count`. Unauthenticated: 60 requests/hour for core, 10/minute for search —
  which is why this mod checks updates on a button press, never on a timer.
- `git clone --depth 1 --branch <ref>` to a `/tmp` folder is how an install gets its files.
