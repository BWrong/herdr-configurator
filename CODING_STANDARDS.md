# Coding standards

Read at review, not while implementing. Only the judgement calls — anything a check could
enforce lives in `mods/configurator/vocabulary.test.js` or the tests beside it.

## Every path to a side effect passes a `checking()` return

`herdr-app check` runs `init()` for real, so a mod that writes, clones, moves or opens during
a check damages the person's home. The guard belongs at the method that starts the work, and a
helper is safe only because its callers are guarded — which is why a line-per-method scan
cannot police this. Trace the call path from `init`/`render`/event handlers, and check that
each one returns early:

- `exec(...)` — shells out; `herdr-app check` and `git clone` run for real.
- `writeTextFile(...)` — already refuses on a stale `expected` hash, but that does not stop it.
- `pickFolder`, `playSound`, `openOverlay`, `run(...)`, `setShared`.

Harness calls (`cx.notify()`) are exempt.

## The dialog's words come from `GLOSSARY.md`

`vocabulary.test.js` bans the drifted words in drawn strings, but it cannot read intent: a new
label, tooltip, button, error sentence or README sentence must use the glossary's term for the
thing. When the glossary lacks a word, add it there first.

## One folder, two copies, no shared state

The docked copy draws the tab bar, the overlay copy the dialog, told apart by
`props().overlay`. They are separate JS instances: the dialog must read what it needs itself,
and must not assume the docked copy ran anything.

## `tabbar.js` is a port, not a rewrite

It follows `~/.config/herdr-app/mods/tabs/main.js`. Keep the shape of the upstream code so a
diff stays readable, and keep this mod's additions (the Git panel button, the gear) to a
marked block. `scripts/tabs-diff.sh` measures the drift.
