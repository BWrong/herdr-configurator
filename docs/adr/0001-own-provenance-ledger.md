# Own provenance ledger instead of trusting the managed files

Herdr records nothing about where a third-party mod came from, and its `version` field is
optional and often wrong, so updates need a source of truth we control. We keep our own
ledger (`data/workshop/`) mapping each entry to repository, ref, commit and per-file
hashes. We rejected writing a `source` field into the managed `mod.json` (we would be
editing another author's file, and an update overwrites it), and rejected querying the
herdr.dev gallery (it is rendered HTML with no machine interface, and GitHub topic search
returns repository-level data that cannot say which subfolder was installed).

## Consequences

A folder dropped into `mods/` by hand has no provenance and is shown as "unknown origin":
listed and configurable, but never update-checked until the person links it to a repository.
