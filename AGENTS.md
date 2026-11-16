# herdr-configurator

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`BWrong/herdr-configurator`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to default label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Herdr runtime

Commands, `mod.json` fields, the drawing API, layout shape, and the GitHub rate limits: see
`docs/agents/herdr-runtime.md`. For anything it does not cover, the authority is
`~/.config/herdr-app/AGENTS.md` (72 KB, rewritten by the app on every start).

### Checks

`npm test` (pure half, runs anywhere) and `npm run check` (`herdr-app check`, needs the macOS
app). CI runs `npm test` only.
