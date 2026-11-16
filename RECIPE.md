# Configurator

One dialog for everything installed under `~/.config/herdr-app/mods/`: what it is, where it
came from, whether its upstream has moved, and what it is set to. A 26 px strip along the
bottom of the window holds the button that opens it. It replaces `better-config`, whose kept
settings values are carried over once; the old mod is left in place.

![Configurator](preview.png)

## What you see

**The docked strip.** 26 px tall, along the bottom edge, one row, right-aligned: a 14 px gear
and the word "Configurator" at 12 px, with 8 px padding inside the button, a 6 px gap, and
10 px padding at the window edge. The background is the theme's `chrome`, the text `muted`,
and a 1 px `border` line runs along the top edge. Hovering the button turns the gear and the
word `accent`. It is the mod docked (`place: "bottom"`, `size: 26`), nothing else is drawn
there.

**The dialog** (`mod.open` with `name: "configurator"`, or the strip's button). 960 × 680;
Herdr draws the frame, the shadow and the title, the mod draws two columns.

**Left column**, 320 px, `surface` background:

- Two tabs at the top, 10 px in: `Installed` (the default) and `Gallery`. Each is 28 px tall,
  rounded 7 px, 12 px text; the chosen one has an `accent` border and a `selected` background.
- Installed view: a filter box with 10 px padding, 30 px tall, rounded 7 px, the `background`
  colour, a `border` line, placeholder "Filter entries…", 12.5 px text.
  Under it the list, one row per entry, 32 px tall, 10 px left padding, 8 px gap: the title
  at 13 px, then the Origin word at 11 px in `dim` (`shipped`, `cloned`, `third_party` or
  `third_party · unknown`), then the version at 11 px `dim` when `mod.json` has one, and a
  5 × 5 px dot before the Origin word only when the entry has a check state: `accent` for
  upstream moved, `border` for up to date, `ansi1` for check failed. The selected row is
  `selected`, hover is `hover`, and a `Scrollbar` runs always. Empty: "No entries match." or
  "Loading…".
  Under the list, a sticky row with 10 px padding and a 1 px top border: a note at 11 px
  `dim`, and one `Check updates` button 31 px tall, rounded 7 px, 12 px, `surface` background,
  `border` line. While it runs it reads "Checking…".
- Gallery view: one row per repository, 10 px padding horizontally and 7 px vertically,
  separated by 1 px `border` lines. The repository name at 13 px on the left, `★ n` at 11 px
  in `muted` on the right; its description at 11 px `muted` (or "No description."); then
  "Pushed YYYY-MM-DD" at 11 px `dim` and an `Install` button 22 px tall, 11 px text.
  The footer holds the responder's error at 11 px `blocked`, a `Refresh` button 31 px tall
  and 12 px, and "Cached YYYY-MM-DD HH:MM" at 11 px `dim` (or "Not fetched yet").
  Empty: "No gallery rows yet. Refresh to fetch them." or "Refreshing…".

**Right column, top — the detail pane**, 200 px tall regardless of window size, 14 px
horizontal and 10 px vertical padding, 5 px gap, 1 px bottom border, `background` colour.
It shows, for the selected entry: its title at 15 px, version at 11 px `dim`, the Origin word
at 11 px `muted`; the folder as `mods/<name>` in JetBrains Mono at 11 px `dim`; the recorded
provenance as `owner/repo @ abc1234` at 12 px (or "No recorded provenance" in `dim`, or the
cloned entry's "This entry is a copy; it never follows upstream."; only an unknown origin
reads "Unknown origin"); for a checked entry `checked 2026-11-16 08:00 UTC · upstream moved`
(or `up to date` / `check failed`) at 11 px `dim`; a failed lookup's error text at 11 px
`ansi1`; the first five files as chips, each with its name in JetBrains Mono at 11 px and its
size at 10.5 px (`B`, or one decimal and `kB`), and past five a `+n more` chip, so a folder
with many files cannot push the actions out of the fixed height; and the
Reference scan at 11 px `dim` ("Referenced by 3 layouts: main, terminals, win98; key bindings:
mod:<name> …" or "No layout references this entry and no key bindings.").
Empty: "Select an entry." or "Loading…".

For an unknown-origin entry the provenance line is replaced by two inputs — repository,
placeholder "owner/repo or a GitHub URL", and ref, placeholder "main", 84 px wide — and a
`Record provenance` button. An entry with no files says "No files on disk."

Along the bottom of the detail pane, two rows:

- Update: on the left the last report or its error at 11 px (`blocked` when failed); on the
  right `Update`, or — when there is no recorded repository, ref and hashes to update from —
  a line saying why: Herdr restores shipped files, a copy never follows upstream, or use
  `Record provenance` to link an unknown origin.
- Uninstall: the Reference scan at 11 px `dim`; `Key bindings` at 12 px when the entry is
  third party and ships a `keys.json` or has a recorded repository; and `Uninstall` at 12 px,
  or, for a shipped entry, the line "Herdr restores its own shipped entries on the next start;
  there is nothing to uninstall."

**Right column, bottom — settings**, `background` colour. A 36 px header with 14 px padding:
"SETTINGS" at 11 px semibold `dim`, an optional note at 11 px `dim`, and `Save` at 12 px
(accent border and `selected` background when there are changed keys). Below it a scrolling
body: one group per first path segment of the schema, its name uppercased at 11 px semibold
`dim`; one row per field, 14 px horizontal and 7 px vertical padding, 16 px gap, separated by
1 px `border` lines. On the left the label at 13 px, an `accent` dot when the value differs
from the file, the schema's description at 11 px `dim` while hovered, and the validation
problem at 11 px `ansi1`. On the right a 96 px control: a text or number `Input` 26 px tall at
12 px; an enum `Select` trigger 28 px tall at 12.5 px opening a 180 px menu; a boolean
`Checkbox` 18 × 18 px. With no schema fields: one dim line, "Nothing to configure for this
entry." No entry: "Select an entry." Loading: "Loading…".

Colours are theme names, never hex: `background`, `surface`, `chrome`, `border`, `accent`,
`selected`, `hover`, `muted`, `dim`, `foreground`, `ansi1`, `popover`, `solid`,
`solid_foreground`, `blocked`. Every size is px.

## How it behaves

- **Strip click** — `run("mod.open", {name: "configurator"})`. Escape, or `closeOverlay`,
  closes the dialog; `mod.open` again toggles it.
- **Selecting a row** — the detail is read from disk for that entry and swapped in place;
  settings drafts are mirrored to `shared.json` (`configurator.drafts`) and re-applied when
  the form is built again, so closing and reopening the dialog keeps them.
- **Filter** — matches a row's title or folder name, ignoring case and padding.
- **Installed vs Gallery** — Installed needs no network. Opening Gallery reads only the cache
  at `data/configurator/gallery.json`; nothing is fetched until `Refresh`.
- **Refresh** — one GitHub topic search (`q=topic:herdr-mod`, `per_page=100`, every page up
  to GitHub's 1000-result cap) with `accept: application/vnd.github+json`, then one cache
  write. Success shows the repositories with stars, description and last push; failure keeps
  the rows already shown and prints the responder's own `message`, or the request's own error.
- **Check updates** — one `GET https://api.github.com/repos/{repo}/commits/{ref}` per
  third-party entry whose ledger row records a repository and a ref; nothing else. The one
  ledger write stores `checkedAt` and either `checkedCommit` or `checkedError`. The note
  counts how many moved, how many are up to date, and the first failure's text. No timer, no
  check on open.
- **Update** — only for an entry whose ledger row has repository, ref and hashes; every other
  Origin says why it has no update. A shallow
  `git clone --depth 1 --branch <ref>` into
  `data/configurator/temp/update-<name>-<UTC time>/`, compare the recorded, local and upstream
  hashes. If any local file differs from the ledger, a panel lists the edited files and asks:
  `Cancel`, or `Move to Trash and overwrite`. Then upstream's files are copied in (creating any
  directory they need), the files upstream no longer ships and the edited files being
  overwritten are moved to `data/configurator/trash/<UTC time>/<name>/` first, the ledger row
  takes the new commit and hashes, and `herdr-app check <folder>` runs. The clone is removed
  when all of that succeeded. The report says how many files were added, replaced, restored
  and removed to the trash; a failure during the copies says how many paths had already
  moved to the trash and where, and keeps the clone with its own text. The entry's
  `data/<name>/` state directory is never read or written.
- **Uninstall** — a panel first gives the Reference scan: every `layouts/*.json` naming the
  mod, and every `keys.json` section `mod:<name>`. `Cancel`, or `Move to trash`: the folder
  moves to `data/configurator/trash/<UTC time>/<name>/` and only then is its ledger row
  dropped. A notification says where it went. Nothing is deleted. A cloned entry also carries
  "This entry is a copy; it never follows upstream." A shipped entry cannot be uninstalled.
- **Record provenance** — for an unknown-origin entry: hash every file, resolve the ref's current
  commit with one `GET /repos/{repo}/commits/{ref}`, and write the ledger row. The note names
  the short commit or the responder's error. The folder itself is not touched.
- **Install** — on a gallery row: shallow `git clone --depth 1` of the default branch into
  `/tmp/configurator-install-<time>-<repo>`, then the repository's `mods/` folder named after
  the repository (or its only one) is copied with `cp -R` into `mods/`. A taken name becomes
  `<name>-copy`, then `<name>-copy-2` and up. The files are hashed, the ledger row written
  with the resolved commit and ref, `herdr-app check <dest>` runs, and the clone is removed.
  Success reads "Installed <name> into mods/<folder> from <repo> @ <short commit>." A
  repository with no mods folder, or several and none named after it, is declined and its
  clone kept with the reason.
- **Key bindings** — after an install, or for a selected third-party entry with a local
  `keys.json` or a recorded repository, the dialog reads that folder's `keys.json` first, or
  else `https://raw.githubusercontent.com/<repo>/<ref>/keys.json`. It splits the bindings
  against the person's current `keys.json`: non-conflicting ones are shown grouped by section
  ("Offered (nothing bound there yet)") with a `Copy` per line and `Copy all` as a `keys.json`
  fragment; conflicts are listed under "Conflicts, not offered" with what already holds the
  key. Nothing writes key bindings.
- **Settings** — a field's draft is parsed against its type, minimum, maximum and pattern.
  An invalid draft is marked and nothing is written. A save writes only the changed keys into
  the entry's `mod.json` `settings` block (a value equal to the default is removed instead),
  through a conditional write retried three times, plus `data/configurator/kept/<name>.json`
  retried twice; Herdr reloads the mod when the file is saved. Changing a draft never writes.
  A kept file's values and version are what a later update does not touch.
- **Legacy carry-over** — on dialog load, values better-config kept under
  `~/.config/herdr-mods/better-config/*.json` are copied once into
  `data/configurator/kept/<name>.json` where no kept file exists. The old mod is not modified
  or removed.
- **Writes** — every write is conditional: it names the text that was read and is retried
  when the file changed under it. A ledger that is not a version 1 object is reported
  ("Ledger: …") and never overwritten.
- Nothing animates; nothing moves except the list's scroll and the selected row's tint.

## Built from

- `mods/configurator/mod.json`:
  `{"$schema":"./mod.schema.json","version":"0.1.0","title":"Configurator",
  "place":"bottom","size":26,"overlay":{"kind":"dialog","width":960,"height":680}}`.
  One folder, two copies: the docked one draws the strip (`props().overlay` absent), the
  overlay one draws the dialog (`props().overlay` set). They share no module state; the
  dialog copy does its own reading.
- `main.js` (2184 lines): `class Configurator extends View`. `init` reads `props()`, creates
  the filter and provenance inputs in the overlay copy, and — unless `checking()` — spawns
  `load()`, which reads every entry's `mod.json` and `mod.schema.json`, the ledger,
  `installed.json`, every `layouts/*.json` and the gallery cache. `render` branches on
  `props().overlay`. Elements come from `gpui-kit` (`View`, `div`, `svg`) and `gpui-base`
  (`v_flex`, `h_flex`, `Scrollbar`, `InputState`, `Input`, `Select`, `Popup`, `Checkbox`).
- `model.js` (990 lines): the pure half. No Herdr calls, so `node --test` runs it: folder
  listing → rows, Origin, filter, file sizes, detail and Reference scan text, ledger
  parse/serialize with its version gate, sha256 comparison → update decision, write plan and
  report, key conflict split, gallery response → rows and pages, cache shape, install
  folder-name collision, uninstall and trash paths, settings fields/drafts/validation and
  kept copy. `node --test mods/configurator/*.test.js` runs 120 tests.
- `mod.schema.json` describes this mod's own `mod.json` only. It declares no `settings`
  property: the Configurator has none of its own. At runtime it reads each entry's
  `mods/<name>/mod.schema.json` for the settings form.
- `herdr` calls: `appHome`, `home`, `exec`, `readTextFile`, `writeTextFile`, `checking`,
  `closeOverlay`, `props`, `shared` / `setShared` (drafts only), `run` (`mod.open` only),
  `theme`, `layouts()`, `keys()`, `notify`.
- Network: `fetch` to `api.github.com/search/repositories` (the topic), `api.github.com/
  repos/{repo}/commits/{ref}` (checks, Record provenance), and `raw.githubusercontent.com` (an
  entry's `keys.json`). Unauthenticated: 60 requests/hour, 10 searches/minute.
- Programs: `git clone`, `git -C <folder> rev-parse HEAD` / `--abbrev-ref HEAD`, `herdr-app
  check <folder>`, `shasum -a 256` (via `find | xargs`), and `/bin/sh` for `ls -lR`, `ls -d
  */`, `mkdir -p`, `mv`, `cp`, `rm -rf`.
- Icons: one 14 px SVG, `mods/configurator/icons/gear.svg`, drawn with `svg(...)` so it
  follows the text colour.
- Art: none. The preview is `herdr-app shot`, cropped to the dialog.

## Watch out

- **No `setTimeout`, no DOM, no Node.** Slow work goes through `exec`, `fetch` or
  `cx.spawn`; top-level side effects must stay off the module, because a broken save keeps the
  old build running and runs the module's top level again.
- **`checking()`**: `init` runs for real during `herdr-app check`. Every read, hash, clone,
  network request and write sits behind `if (checking()) return;`. Without it, verifying the
  mod would rewrite the person's ledger and other files.
- **The first sight of the folder docks the strip** into the shown layout, in every layout.
  Removing it means deleting the docked block from a layout, or setting it `hidden`.
- **The ledger dies only with `data/configurator/`.** Uninstalling the Configurator leaves it
  behind on purpose: it holds provenance for entries that outlive the dialog.
- **Unknown origin is normal.** Anything hand-dropped into `mods/` has no provenance: it is
  listed, configurable and uninstallable, but never checked or updated until `Record provenance`
  links it to a repository.
- **Tracking needs both repository and ref.** A ledger row missing either is not a check or
  update target.
- **Rate limits**: 60 core requests/hour without a token. `Check updates` on 20 tracked
  entries spends 20; five presses drain the hour. The dialog shows the responder's own
  message rather than retrying.
- **V1 has no layouts of its own** — `layouts()` is only read to answer the Reference scan.
- **Sizes**: 960 × 680 is the dialog's size, not a minimum; a narrow window clips the left
  column first. The list has no row cap; the `Scrollbar` handles the rest.
- **`Key bindings` appears only when it has something to read**: a third-party entry with a
  local `keys.json` or a recorded repository. Shipped and cloned entries show no trigger.
- **No Open action.** Entries with a `place` open from their own dock; an entry with
  `place: "none"` is not opened by this dialog.
- **Install is repo-shaped**: it needs `mods/<name>/` in the repository and names the mod
  after the repository, or the repository must ship exactly one mod folder. Anything else is
  declined with its clone kept.
- **Every folder reloads on save**: editing `mod.json` by hand is safe, but the dialog's
  conditional writes are what keep its own settings and ledger writes from clobbering a
  concurrent edit.

## Done when

- `herdr-app check mods/configurator` exits 0, also from a fresh clone with no setup.
- `node --test mods/configurator/*.test.js` passes (120 tests).
- Copying the folder to `~/.config/herdr-app/mods/configurator` docks the 26 px strip at the
  bottom; clicking it, or `herdr-app do mod.open --name configurator`, opens the dialog; and
  `herdr-app shot` shows both.
- The dialog lists every folder under `mods/` with `shipped` / `cloned` / `third_party` told
  apart, `better-config` among them as third party with unknown origin.
- `Check updates` on a tracked entry lights its row dot when upstream is ahead and says
  `up to date` when not.
- `Uninstall` on a throwaway entry says which layouts reference it, then moves the folder to
  `data/configurator/trash/<time>/<name>/`.
- A settings save on `better-changes` writes only the changed keys into its `mod.json`
  `settings` and reloads the mod with the new value.
