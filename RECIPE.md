# Workshop

One dialog for everything installed under `~/.config/herdr-app/mods/`: what it is, where it
came from, whether its upstream has moved, and what it is set to. A blocks icon in the window's tab
bar, next to Files / Changes, opens it. It replaces `better-config`, whose kept settings
values are carried over once; the old mod is left in place.

![Workshop](preview.png)

**Installing it does not draw anything yet.** The mod ships `"place": "none"`, so the copied folder
sits idle until a layout names it: set the tabs block's `"content": { "mod": "workshop" }` (or type
`workshop` into the layout's tabs slot in Herdr's own controls) and the blocks icon joins the tab
bar's right-hand group.

## What you see

**The tab bar button.** The tab bar's blocks icon, in the right-hand group after Files / Changes (and
  after a Git button on layouts that carry a `git-graph` panel):
a 26 px square, rounded 6 px, the theme's `muted` blocks icon at 14 px, like the panel buttons' icons, hover `hover` and `foreground`
like its neighbours, tooltip "Workshop". It is this mod docked (`place: "none"`): point
the layout's tabs block at it — `"content": { "mod": "workshop" }` — and the blocks icon appears
there; nothing else is drawn.

**The dialog** (`mod.open` with `name: "workshop"`, or the blocks icon). 960 × 680;
Herdr draws the frame and the shadow; the mod draws a header row and, under it, two columns: the
entry list on the left, the selected entry on the right.

**Left column**, 320 px, `surface` background:

- A filter box with 10 px padding, 30 px tall, rounded 7 px, the `background` colour, a
  `border` line, placeholder "Filter entries…", 12.5 px text; beside it, 96 px of the same
  shape, the category: `All`, `Shipped`, `Cloned` or `ThirdParty` at 11.5 px with a `▾`, and
  a 130 px `popover` menu of those four, anchored under it.
- Under it the list, one row per entry, 44 px tall, 6 px clear of either edge and 14 px
  clear on the right, rounded 6 px, 2 px between rows, and no separators or borders: the
  first line is the title at 13 px, with a 5 × 5 px dot at its right only when the entry has
  a check state (`accent` for upstream moved, `border` for up to date, `ansi1` for check
  failed); 1 px below it the Origin word at 11 px `dim` (`Shipped`, `Cloned` or `ThirdParty` for
  the keys `shipped`/`cloned`/`third_party`; the pane says when no repository is recorded, the row
  does not).
  The selected row is `selected`, its title semibold, and a 2 × 22 px `accent` bar marks its
  left edge; hover is `hover`; its own bar runs always (`overflow_y_scrollbar`). Empty:
  "No entries match." or "Loading…".
- Under the list, a sticky row with 10 px padding and a 1 px top border: a note at 11 px
  `dim`, and one `Check updates` button 24 px tall, rounded 6 px, 11.5 px, `background`
  colour, `border` line. While it runs it reads "Checking…".

**Right column, top — the detail pane**, as tall as its contents up to 300 px, 14 px
horizontal and 10 px vertical padding, 7 px gap, 1 px bottom border, `background` colour.
Its first line is the title at 13 px semibold, the version at 11 px `dim` and the Origin word
at 11 px `muted`, pushed right; then the folder as `mods/<name>` in JetBrains Mono at 11 px
`dim`. Under a 10.5 px semibold `dim` label `PROVENANCE`: the recorded provenance as
`owner/repo @ abc1234` at 12 px (or "No recorded provenance" in `dim`, or the cloned entry's
"This entry is a copy; it never follows upstream."; only an unknown origin reads "Unknown
origin"), and for a checked entry `checked 2026-11-16 08:00 UTC · upstream moved` (or
`up to date` / `check failed`) at 11 px `dim`, then a failed lookup's error text at 11 px
`ansi1`. Under a label `FILES`: one line, the first five files' names in JetBrains Mono at
11 px `muted` (`+n more` past five), and at the right the count and the total size at 11 px
`dim` ("38 files · 1.7 MB", one file reading "1 file"; `B`, one decimal and `kB`, one decimal
and `MB`).
Empty: "Select an entry." or "Loading…".


For an unknown-origin entry the provenance line is replaced by two inputs — repository,
placeholder "owner/repo or a GitHub URL", and ref, placeholder "main", 84 px wide — and a
`Record provenance` button. An entry with no files says "No files on disk."
The inputs appear only when the folder cannot prove itself: a hand-dropped entry that is
still a git checkout records itself on selection (its own `origin` remote and `HEAD`
commit, hashed as any other entry), so its provenance line reads `owner/repo @ abc1234`
without anyone typing.

Along the bottom of the detail pane, one row: on the left, at 11 px `dim` (`blocked` when a
report failed), one sentence — the last Update report or its error, else why Update is not
available (Herdr restores shipped files, a copy never follows upstream, use
`Record provenance` to link an unknown origin), else the Reference scan ("Referenced by 3
layouts: main, terminals, win98; key bindings: mod:<name> …" or "No layout references this
entry and no key bindings."); on the right, in order, `Key bindings` (third party, with a
`keys.json` or a recorded repository), `Uninstall` and `Update` — each 24 px tall, rounded
6 px, 11.5 px text, `background` with a `border` line. A button with nothing behind it stays
in place, `dim`, unclickable, and the sentence says why.

**Right column, bottom — settings**, `background` colour. A 36 px header on `surface`, 14 px
padding, a `border` line under it: "SETTINGS" at 10.5 px semibold `muted`, an optional note at
11 px `dim`, and a 24 px `Save` button (accent border, `selected` fill when there are changed
keys; `dim` and unclickable when there are none). Below it a scrolling body of cards, one per
first path segment of the schema: 8 px rounded, 1 px `border`, `raised` fill, 14 px in from
either side, 10 px apart — a 30 px card header holds the group's name uppercased at 10.5 px
semibold `dim` over a `border` line, and each field is a row 12 px horizontal and 9 px
vertical padding, 16 px gap, a `border` line above every row but the first. On the left the
label at 13 px, an `accent` dot when the value differs from the file, the schema's description
at 11 px `dim` under it whenever the schema has one, and the validation problem at 11 px
`ansi1`. On the right a
96 px control: a text or number `Input` 26 px tall at 12 px; an enum `Select` trigger 28 px
tall at 12.5 px opening a 180 px menu; a boolean `Checkbox` 18 × 18 px. With no schema fields
the header still shows and the body reads "This entry ships no settings." No entry: "Select
an entry." Loading: "Loading…".

Colours are theme names, never hex: `background`, `surface`, `chrome`, `border`, `accent`,
`selected`, `hover`, `muted`, `dim`, `foreground`, `ansi1`, `popover`, `solid`,
`solid_foreground`, `blocked`. Every size is px.

## How it behaves

- **Tab bar blocks icon** — `run("mod.open", {name: "workshop"})`. Escape, or `closeOverlay`,
  closes the dialog; `mod.open` again toggles it.
- **Selecting a row** — the detail is read from disk for that entry and swapped in place;
  settings drafts are mirrored to `shared.json` (`workshop.drafts`) and re-applied when
  the form is built again, so closing and reopening the dialog keeps them.
- **Filter** — matches a row's title or folder name, ignoring case and padding; the category
  keeps only the Origin it names, and the two narrow together.
- **A hidden selection** — when the filter or the category hide the selected row, the first
  row they leave becomes the selection, so the pane never describes a row nobody can see.
- **Arrow keys** — `up` and `down` move the selection through the filtered rows and wrap, the
  same as clicking a row; Escape or `✕` closes the dialog.
- **Check updates** — one `GET https://api.github.com/repos/{repo}/commits/{ref}` per
  third-party entry whose ledger row records a repository and a ref; nothing else. The one
  ledger write stores `checkedAt` and either `checkedCommit` or `checkedError`. The note
  counts how many moved, how many are up to date, and the first failure's text. No timer, no
  check on open.
- **Update** — only for an entry whose ledger row has repository, ref and hashes; every other
  Origin says why it has no update. A shallow
  `git clone --depth 1 --branch <ref>` into
  `data/workshop/temp/update-<name>-<UTC time>/`, compare the recorded, local and upstream
  hashes. If any local file differs from the ledger, a panel lists the edited files and asks:
  `Cancel`, or `Move to Trash and overwrite`. Then upstream's files are copied in (creating any
  directory they need), the files upstream no longer ships and the edited files being
  overwritten are moved to `data/workshop/trash/<UTC time>/<name>/` first, the ledger row
  takes the new commit and hashes, and `herdr-app check <folder>` runs. The clone is removed
  when all of that succeeded. The report says how many files were added, replaced, restored
  and removed to the trash; a failure during the copies says how many paths had already
  moved to the trash and where, and keeps the clone with its own text. The entry's
  `data/<name>/` state directory is never read or written.
- **Uninstall** — a panel first gives the Reference scan: every `layouts/*.json` naming the
  mod, and every `keys.json` section `mod:<name>`. `Cancel`, or `Move to trash`: the folder
  moves to `data/workshop/trash/<UTC time>/<name>/` and only then is its ledger row
  dropped. A notification says where it went and, when a layout still names the mod, that
  `layouts/<name>.json` keeps pointing at it — Herdr then reports `mod <name>: no mod folder`
  and shows another layout until that pane goes. Nothing is deleted. A cloned entry also carries
  "This entry is a copy; it never follows upstream." A shipped entry cannot be uninstalled.
- **Record provenance** — for an unknown-origin entry: hash every file, resolve the ref's current
  commit with one `GET /repos/{repo}/commits/{ref}`, and write the ledger row. The note names
  the short commit or the responder's error. The folder itself is not touched. Selecting an entry that is still a
  checkout skips the inputs and the network altogether: `git -C <folder> remote get-url origin`
  and `rev-parse HEAD` are read, `--abbrev-ref HEAD` names the ref (`main` when it is detached),
  and the row is written with that commit. Nothing is recorded from a repository name alone —
  without the commit, a file-by-file comparison has no base.
- **Key bindings** — for a selected third-party entry with a local `keys.json` or a recorded
  repository, the dialog reads that folder's `keys.json` first, or
  else `https://raw.githubusercontent.com/<repo>/<ref>/keys.json`. It splits the bindings
  against the person's current `keys.json`: non-conflicting ones are shown grouped by section
  ("Offered (nothing bound there yet)") with a `Copy` per line and `Copy all` as a `keys.json`
  fragment; conflicts are listed under "Conflicts, not offered" with what already holds the
  key. Nothing writes key bindings.
- **Settings** — a field's draft is parsed against its type, minimum, maximum and pattern.
  An invalid draft is marked and nothing is written. A save writes only the changed keys into
  the entry's `mod.json` `settings` block (a value equal to the default is removed instead),
  through a conditional write retried three times, plus `data/workshop/kept/<name>.json`
  retried twice; Herdr reloads the mod when the file is saved. Changing a draft never writes.
  A kept file's values and version are what a later update does not touch.
- **Legacy carry-over** — on dialog load, values better-config kept under
  `~/.config/herdr-mods/better-config/*.json` are copied once into
  `data/workshop/kept/<name>.json` where no kept file exists. The old mod is not modified
  or removed.
- **Writes** — every write is conditional: it names the text that was read and is retried
  when the file changed under it. A ledger that is not a version 1 object is reported
  ("Ledger: …") and never overwritten.
- Nothing animates; nothing moves except the list's scroll and the selected row's tint.

## Built from

- `mods/workshop/mod.json`:
  `{"$schema":"./mod.schema.json","version":"0.1.0","title":"Workshop",
  "place":"none","overlay":{"kind":"dialog","width":960,"height":680}}`.
  One folder, two copies: the docked one draws the tab bar (`props().overlay` absent), the
  overlay one draws the dialog (`props().overlay` set). They share no module state; the
  dialog copy does its own reading.
- `tabbar.js` (165 lines): the tab bar, a faithful port of the `tabs` mod — tab pills, scroll
  handle, wheel and swipe handling, close button, right-click menu, `+`, Files / Changes
  panel buttons from `shared("workspace.panels")`, `syncPanel` and the `panels` localStorage
  key, window buttons and macOS traffic-light padding. Its additions are two buttons in the
  right-hand group: the Git panel button (drawn only where the layout's `panel-body` stack has a
  `graph` child, so the blocks icon keeps working as the entry point on a `tabs-graph` layout) and the
  blocks icon, which runs `mod.open`.
- `main.js` (1974 lines): `class Workshop extends View`. `init` reads `props()`, creates
  the filter and provenance inputs in the overlay copy, and — unless `checking()` — spawns
  `load()`, which reads every entry's `mod.json` and `mod.schema.json`, the ledger,
  `installed.json` and every `layouts/*.json`. `render` branches on
  `props().overlay`. Elements come from `gpui-kit` (`View`, `div`, `svg`) and `gpui-base`
  (`v_flex`, `h_flex`, `InputState`, `Input`, `Select`, `Popup`, `Checkbox`).
- `model.js` (902 lines): the pure half. No Herdr calls, so `node --test` runs it: folder
  listing → rows, Origin, filter, file sizes, detail and Reference scan text, ledger
  parse/serialize with its version gate, sha256 comparison → update decision, write plan and
  report, key conflict split, uninstall and trash paths, settings fields/drafts/validation and
  kept copy. `node --test mods/workshop/*.test.js` runs 114 tests.
- `mod.schema.json` describes this mod's own `mod.json` only. It declares no `settings`
  property: the Workshop has none of its own. At runtime it reads each entry's
  `mods/<name>/mod.schema.json` for the settings form.
- `herdr` calls: `appHome`, `home`, `exec`, `readTextFile`, `writeTextFile`, `checking`,
  `closeOverlay`, `props`, `shared` / `setShared` (drafts only), `theme`, `layouts()`, `keys()`,
  `notify`; the tab bar adds `spaces()`, `panes()`, `window()`, `layout()`, `settings()`,
  `openOverlay`, `run` (`mod.open` for the blocks icon, plus the tab, panel and window commands).
- Network: `fetch` to `api.github.com/repos/{repo}/commits/{ref}` (checks, Record provenance)
  and `raw.githubusercontent.com` (an entry's `keys.json`). Unauthenticated: 60 requests/hour.
- Programs: `git -C <folder> rev-parse HEAD` / `--abbrev-ref HEAD`, `git clone --depth 1`
  (an update's upstream copy), `herdr-app check <folder>`, `shasum -a 256` (via `find |
  xargs`), and `/bin/sh` for `ls -lR`, `ls -d */`, `mkdir -p`, `mv`, `cp`, `rm -rf`.
- Icons: one 14 px SVG, `mods/workshop/icons/blocks.svg`, drawn with `svg(...)` so it
  follows the text colour.
- Art: none. The preview is `herdr-app shot`, cropped to the dialog so nothing behind it is
  in the picture.

## Watch out

- **No `setTimeout`, no DOM, no Node.** Slow work goes through `exec`, `fetch` or
  `cx.spawn`; top-level side effects must stay off the module, because a broken save keeps the
  old build running and runs the module's top level again.
- **`checking()`**: `init` runs for real during `herdr-app check`. Every read, hash, clone,
  network request and write sits behind `if (checking()) return;`. Without it, verifying the
  mod would rewrite the person's ledger and other files.
- **`place: "none"` draws nothing on install.** A fresh copy appears only where a layout names
  it: set the tabs block's content to `"content": { "mod": "workshop" }`. To take the blocks icon
  away, point that block back at `tabs`.
- **The ledger dies only with `data/workshop/`.** Uninstalling the Workshop leaves it
  behind on purpose: it holds provenance for entries that outlive the dialog.
- **Unknown origin is normal.** Anything hand-dropped into `mods/` has no provenance: it is
  listed, configurable and uninstallable, but never checked or updated until `Record provenance`
  links it to a repository — or until the folder's own git checkout proves it on selection.
- **Tracking needs both repository and ref.** A ledger row missing either is not a check or
  update target.
- **Rate limits**: 60 core requests/hour without a token. `Check updates` on 20 tracked
  entries spends 20; five presses drain the hour. The dialog shows the responder's own
  message rather than retrying.
- **V1 has no layouts of its own** — `layouts()` is only read to answer the Reference scan.
- **Sizes**: 960 × 680 is the dialog's size, not a minimum; a narrow window clips the left
  column first. The installed list has no row cap. The detail pane grows with its contents up
  to 300 px, so wrapped file chips cannot clip the action row.
- **`Key bindings` appears only when it has something to read**: a third-party entry with a
  local `keys.json` or a recorded repository. Shipped and cloned entries show no trigger.
- **No Open action.** Entries with a `place` open from their own dock; an entry with
  `place: "none"` is not opened by this dialog.
- **Every folder reloads on save**: editing `mod.json` by hand is safe, but the dialog's
  conditional writes are what keep its own settings and ledger writes from clobbering a
  concurrent edit.

## Done when

- `herdr-app check mods/workshop` exits 0, also from a fresh clone with no setup.
- `node --test mods/workshop/*.test.js` passes (114 tests).
- Copying the folder to `~/.config/herdr-app/mods/workshop` shows nothing until the
  layout's tabs block names it (`"content": { "mod": "workshop" }`); then its blocks icon sits
  next to Files / Changes, and clicking it, or `herdr-app do mod.open '{"name":
  "workshop"}'`, opens the dialog; and `herdr-app shot` shows both.
- The dialog lists every folder under `mods/` with `Shipped` / `Cloned` / `ThirdParty` told
  apart, `better-config` among them as third party with unknown origin.
- `Check updates` on a tracked entry lights its row dot when upstream is ahead and says
  `up to date` when not.
- `Uninstall` on a throwaway entry says which layouts reference it, then moves the folder to
  `data/workshop/trash/<time>/<name>/`.
- A settings save on `better-changes` writes only the changed keys into its `mod.json`
  `settings` and reloads the mod with the new value.
