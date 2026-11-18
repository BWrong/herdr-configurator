# Workshop

One dialog for every entry under `~/.config/herdr-app/mods/`: what it is, where it came
from, whether upstream has moved, and what it is set to. The window's tab bar holds the blocks icon
that opens it, next to Files / Changes. It replaces `better-config`, and the settings values
better-config kept are carried over once. A fresh install shows nothing until a layout names
it: point the tabs block's content at the mod, `"content": { "mod": "workshop" }`.

This mod has no settings of its own; it edits the settings of the entries it lists.

## What it does

- **Installed** lists every folder under `mods/` with its Origin (`shipped`, `cloned`, or
  `third_party`, the last with `· unknown` until it is linked), its version, and a dot once a
  check has run.
  The filter above the list matches a title or a folder name as you type.
- **Detail** shows the selected entry's title, folder, recorded `repo @ commit`, last check,
  files with sizes, and the Reference scan (which layouts name it and which key bindings
  belong to it). An unknown-origin entry can be linked to a repository and ref here.
- **Check updates** asks GitHub for one upstream commit per tracked third-party entry and
  nothing else. Failures show the responder's own error text; nothing polls or checks on open.
- **Update** clones the recorded ref, compares the recorded, local and upstream hashes, and
  asks before overwriting an edited file. Only upstream's files are written; files it no
  longer ships, and the files it replaces over an edit, move to the trash first. The clone is
  removed when the update succeeds, and a failed copy says how many paths already moved.
- **Uninstall** shows the Reference scan, then moves the folder to the trash. Nothing is
  deleted. Shipped entries cannot be uninstalled; Herdr restores them on the next start.
- **Gallery** lists repositories from GitHub's `herdr-mod` topic with stars, description and
  last push. Install clones shallow, copies the repository's `mods/<name>/`, records the
  commit and per-file hashes, and runs `herdr-app check`. Offered key bindings are text to
  copy; conflicts are listed, never applied.
- **Settings** builds a form from the entry's own `mod.schema.json` and writes only the keys
  the person changed, into that entry's `mod.json`.

## Where it keeps things

Everything lives under `~/.config/herdr-app/data/workshop/`, outside every managed mod,
so updating or uninstalling an entry never touches it:

| File | What it holds |
| --- | --- |
| `ledger.json` | Provenance per entry: repository, ref, commit, last check, and a `sha256:` hash per file. |
| `kept/<name>.json` | The entry's version and changed settings values, so an update does not lose them. |
| `gallery.json` | The last successful gallery fetch: rows and the time they were fetched. |
| `repos.json` | What each repository's tree was found to carry: its mod folders, read once when a row is selected. |
| `trash/<UTC time>/<name>/` | Folders moved by an uninstall, and files an update replaced. Recoverable by hand. |
| `temp/update-<name>-<UTC time>/` | The shallow clone an update compares against; left in place when the run fails. |

An install clones into `/tmp/workshop-install-<time>-<repo>` and removes it when the
install succeeds; a failed install keeps it and says where.

## Requirements

- Herdr 0.1.16, the version this mod was built and checked against.
- `git` and `shasum` on `PATH`; `herdr-app` for the post-install and post-update check.
- Network access to `api.github.com` and `raw.githubusercontent.com`. Without a token GitHub
  allows 60 core requests per hour; one Check updates spends one per tracked entry.

## Icons

`icons/blocks.svg` is the tab bar button's icon. `jsconfig.json` and `gpui-kit.d.ts` are written by
Herdr into every mod folder when it loads one, and are ignored by this repository.
