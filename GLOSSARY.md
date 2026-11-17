# Configurator

A Herdr mod that lists what is installed under `~/.config/herdr-app/mods/`, checks it against
its upstream repository, updates it, uninstalls it, and edits its settings. This glossary
fixes the words the code and the dialogs use.

## Language

**Entry**:
One installed thing the Configurator lists — in v1, a folder under `mods/`.
_Avoid_: mod, package, item

**Origin**:
Which of three kinds an entry is: `shipped` (Herdr's own, replaced whole on every start),
`cloned` (a copy made with `mod.clone`, records `cloned_from`, never follows upstream), or
`third_party` (anything else — yours or someone else's).
_Avoid_: source, type

**Provenance**:
Where a third-party entry came from and what it looked like when it arrived: repository,
ref, commit, and the hash of every file. Without provenance an entry cannot be checked or
updated.
_Avoid_: origin data, metadata

**Ledger**:
The Configurator's own record of provenance for every entry, kept outside every managed
mod so that updating or uninstalling one never touches it.
_Avoid_: registry, database, state

**Docked copy** and **overlay copy**:
Two independent instances of this mod. A docked copy sits in a layout block and draws the tab
bar; an overlay copy draws the dialog. `props()` carries `overlay` only in the overlay copy.
_Avoid_: panel, window

**Tab bar button**:
The blocks icon in the window's tab bar, next to Files / Changes, that opens the dialog. It is what
a layout naming the mod as its tabs block draws.
_Avoid_: strip, toolbar, bar

**Reference scan**:
Reading `layouts/*.json` and `keys.json` to find every place that names an entry, so the
dialog can say what breaks if it goes.
_Avoid_: dependency check, usage scan

**Trash**:
`data/configurator/trash/<time>/` — where uninstalled files are moved instead of deleted, so
an uninstall can be undone by hand.
_Avoid_: backup

**Key conflict**:
A key an incoming `keys.json` wants that `keys.json` already binds. Reported as text to copy;
never resolved silently.
_Avoid_: collision, clash
