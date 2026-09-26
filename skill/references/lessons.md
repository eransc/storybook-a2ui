# Lessons from real runs

Read at step 1. Each line cost a re-render or a wrong claim on a real design system.

## Setup

- [ ] **Installing can kill the running Storybook** (some package managers swap `node_modules` under it). Check the port after install; restart with the project's own command.
- [ ] **Story globs resolved at startup** (e.g. `glob.sync` or a computed `stories` array in `main.*`) → new story files need a restart. Plain glob strings pick them up live.
- [ ] **Published Storybook / visual-test service**: playground stories ship with `build-storybook` and may get snapshotted. Generated stories set `chromatic.disableSnapshot`; still ask the user where the section should live.
- [ ] **Pre-existing browser errors**: before blaming A2UI, open one of the project's own stories — if the same error is there, it is their setup.
- [ ] **Story ids**: `stories` prints the real ids. Storybook splits letters from digits in export names (`A1` → `a-1`), so don't hand-build ids.

## Catalog
- [ ] **Page-level components missing from the catalog** (a real case: page header, section header, breadcrumbs, dropdown, file upload, icon all existed in Storybook; the catalog rebuilt headers from Row/Text and lost the DS spacing). Curate by category; run the coverage gate with design trees before the first run.

- [ ] **Read real props** (package metadata JSON if shipped, `.d.ts`, a story). Never guess.
- [ ] **Check the Storybook index before saying "the DS has no X"** — a component can exist under a nested title.
- [ ] **Declare `CATALOG_SOURCES`**, and mark anything built from tokens/CSS as `kind: 'tokens'`.
- [ ] **Grid vs flex layout primitives** — map A2UI justify/align per orientation when the DS stack is CSS grid.
- [ ] **`weight` must work**: every Row/Column child with `weight` grows by it; unweighted Row/Column children of a Row size to content. If two side-by-side columns split 50/50, `weight` is being ignored.
- [ ] **Text defaults**: truncation (`...`) and forced colors (dark text inside a colored button).
- [ ] **Built-in labels** on switches/toggles ("Off/On") — hide them and render the A2UI label.
- [ ] **Two zod copies** → TS2589; re-type shared schemas, `impl<Props>()` for extensions.
- [ ] **Data-driven variants** (status → color) need a semantic component; A2UI v0.9 can't map values.
- [ ] **Type-check with the exit code**, `--pretty false`; TS ≥ 6 needs `--ignoreConfig`.

## Runs and patterns

- [ ] **Divider inside a template** repeats per item (trailing line) — checker warns.
- [ ] **Real forms nest deeper** than demos — `maxDepth` default is 10.
- [ ] **Name `wanted` entries by component** (PascalCase first) so coverage can classify them.
- [ ] **Fix fidelity before sharing patterns** — a catalog bug in a pattern is copied into every page built from it.
- [ ] **Empty labels** (`label: ""`) have no accessible name — checker warns (`a11y:`).

## Reporting

- [ ] Lead with `COVERAGE.md` actions: add / extend / not-a-DS-component / possible DS gap / limitations.
- [ ] Say you authored the A2UI yourself — it is not the user's production model.
