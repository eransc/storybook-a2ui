# Lessons from real runs (Carbon · Vibe · Optimove)

Read at step 1. Each line cost a re-render or a wrong claim once.

## Setup
- [ ] **Installing can kill the running Storybook** (pnpm swapped `node_modules` on Optimove). Check the port after install; restart with the project's command.
- [ ] **Story globs resolved at startup** (Carbon: `glob.sync` in `main.ts`) → new story files need a restart. Static globs (Vibe) pick them up live.
- [ ] **Published Storybook / Chromatic**: playground stories ship with `build-storybook` and get snapshotted. Stories set `chromatic.disableSnapshot`; still ask the user where the section should live.
- [ ] **Pre-existing browser errors**: before blaming A2UI, open one of the project's own stories (Optimove's `reading 'url'` error was theirs).

## Catalog
- [ ] **Read real props** (metadata JSON, `.d.ts`, a story). Never guess.
- [ ] **Check the Storybook index before saying "the DS has no X"** — Optimove's report called Icon missing; it exists.
- [ ] **Declare `CATALOG_SOURCES`**, and mark anything built from tokens as `kind: 'tokens'` (Optimove had no Card/layout/type components).
- [ ] **Grid vs flex layout** (Carbon Stack is CSS grid) — map justify/align per orientation.
- [ ] **Text defaults**: truncation (`$...`) and forced colors (dark text on a blue button) — Vibe.
- [ ] **Built-in labels** on switches (Vibe Toggle "Off/On").
- [ ] **Two zod copies** → TS2589; re-type shared schemas, `impl<Props>()` for extensions.
- [ ] **Data-driven variants** (status → color) need a semantic component; A2UI v0.9 can't map values.
- [ ] **Type-check with the exit code**, `--pretty false`; TS ≥ 6 needs `--ignoreConfig`.

## Runs
- [ ] **Divider inside a template** repeats per item (trailing line) — checker warns.
- [ ] **Real forms nest deeper** than demos — `maxDepth` default is 10.
- [ ] **Name `wanted` entries by component** (PascalCase first) so coverage can classify them.

## Reporting
- [ ] Lead with `COVERAGE.md` actions: add / extend / not-a-DS-component / possible DS gap / limitations.
- [ ] Say you authored the A2UI yourself — it is not the user's production model.
