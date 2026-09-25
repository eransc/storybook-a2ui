---
name: storybook-a2ui
description: Use Storybook as a playground for A2UI (Agent-to-UI) interfaces built from the project's OWN design-system components. Builds an A2UI v0.9 catalog from the Storybook components, turns a prompt + one or more datasets into A2UI message streams, validates them against the catalog and guardrails, and renders each result as a real Storybook story (one per dataset). Reports which components the agent used, misused, or wished it had. Use when the user wants to prototype agent-generated UI with their design system, try "what UI would an agent build for this data", build or harden an A2UI catalog, or define guardrails for agent-rendered UI — even if they don't say "A2UI" (e.g. "generative UI from my components", "agent UI playground in Storybook").
---

# storybook-a2ui

Prompt + data → A2UI JSON → rendered with **your** components in Storybook, one story per dataset,
plus a report (used / misused / missing components, guardrail hits).

**You (the agent running this skill) are the model that authors the A2UI.** No API key, no server.
Say so when reporting: results show what _an_ agent does with the catalog, not the user's production model.

Scripts live next to this file: `SKILL_DIR/scripts/`. Reference implementations: `SKILL_DIR/examples/carbon/` (grid layout, two zod copies) and `SKILL_DIR/examples/vibe/` (flexbox, no Card, metadata-driven).

```
setup (once per repo)          per scenario
─────────────────────          ─────────────────────────────────────────────
1 locate Storybook             4 datasets   data/<scenario>/<dataset>.json
2 install + catalog            5 author     runs/<scenario>--<dataset>.json
3 describe catalog             6 check → stories → render → report
```

## 1. Locate the Storybook

- React Storybook ≥ 8 with React 18/19 (check `.storybook/main.*`, `package.json`). Other renderers: stop and tell the user v1 is React-only.
- Pick an A2UI dir **inside a stories glob**, e.g. `src/a2ui/`. Check the glob actually matches `A2UI.*.stories.tsx`.
- Note if `main.*` resolves globs at startup (`glob.sync(...)`, a computed `stories` array): newly written story files then need a **Storybook restart** to appear.
- Find the running port (`lsof -i -P | grep LISTEN | grep node`) or how to start it.
- **Where will the playground stories end up?** Check for Chromatic (`chromatic` in package.json / CI) and whether
  `build-storybook` is published. Generated stories already set `chromatic.disableSnapshot`; ask the user **once, now**
  whether the `A2UI Playground` section may ship with their published Storybook or should live elsewhere.
- Read `SKILL_DIR/references/lessons.md` — the checklist of traps from earlier runs.

If `<a2ui dir>/catalog.schema.ts` already exists, skip to step 3.

## 2. Install and write the catalog (one-time)

```bash
<pm> add -D @a2ui/react@^0.11 @a2ui/web_core@^0.11     # zod 3 comes with them
```

- Installing can **restart or kill a running Storybook** (pnpm swaps `node_modules` under it). Check the port
  afterwards and restart it with the project's own command.
- Copy `SKILL_DIR/templates/A2uiPlayground.tsx` and `SKILL_DIR/templates/guardrails.json` into the A2UI dir.
- Write `catalog.schema.ts` + `catalog.tsx` following **`SKILL_DIR/references/catalog-recipe.md`** — read it fully first.
  Curate 8–15 components; confirm the list with the user when the Storybook is large.
- In `catalog.schema.ts` also export the **coverage metadata** (recipe §8) — required, not optional:
  `CATALOG_SOURCES` (which DS component backs each entry, or `tokens` if you built it from CSS),
  `CATALOG_EXCLUDED` (DS components you left out, with a reason), `CATALOG_LIMITATIONS` (what the agent can't express).
  Without it the coverage report is approximate and can mislabel components.
- Type-check the A2UI files (recipe §6), then prove it: hand-write ONE tiny run and do step 6 for it. If it does not look like the design system, fix `catalog.tsx` now.

## 3. Describe the catalog

```bash
node SKILL_DIR/scripts/a2ui.mjs describe --schema <a2ui dir>/catalog.schema.ts
```

Read the output — it is the only vocabulary you may use.

## 4. Datasets

`<a2ui dir>/data/<scenario>/<dataset>.json`. Use the user's data if given. Otherwise synthesize
**edge-case sets** — the value of the playground is seeing the UI change with the data:
`empty`, `few` (2–3), `many` (≥ 10), plus `long-text` or `partial` (missing fields) when relevant.

## 5. Author one run per dataset

Read **`SKILL_DIR/references/a2ui-authoring.md`**. For each dataset, look at the data and write
`<a2ui dir>/runs/<scenario>--<dataset>.json` (kebab-case names; `--` separates dataset).
Choose the UI a good agent would choose _for that data_. Record honest `wanted` gaps.

## 6. Check → stories → render → report

```bash
S=<a2ui dir>
node SKILL_DIR/scripts/a2ui.mjs check   --schema $S/catalog.schema.ts --runs $S/runs --guardrails $S/guardrails.json --report $S/runs/REPORT.md
node SKILL_DIR/scripts/a2ui.mjs stories --runs $S/runs --out $S
node SKILL_DIR/scripts/a2ui.mjs coverage --schema $S/catalog.schema.ts --storybook http://localhost:<port> --runs $S/runs --report $S/COVERAGE.md
node SKILL_DIR/scripts/screenshot.mjs --project <repo with playwright> --url http://localhost:<port> --out <tmp>/a2ui-shots a2ui-playground-<scenario>--<dataset> ...
```

- `check` exits 1 on errors. Fix the run (not the checker) and re-check; at most 3 rounds, then report what still fails.
- Story ids: `a2ui-playground-<scenario>--<dataset>`. `✗ … not indexed` → restart Storybook (see step 1).
- **Look at every screenshot** before claiming success. A validated run can still look wrong (catalog bug → fix `catalog.tsx`).
  `--project` can be ANY local repo with `@playwright/test` (it only borrows the library; uses installed Chrome).
  No Playwright anywhere? Give the user the story URLs instead and say the visual check was not done.
- Browser errors on a playground story? Open one of the project's **own** stories first — if the same error is there,
  it is their Storybook setup, not A2UI. Say which.

Report to the user:

1. Stories created (ids / URLs) and what UI each dataset produced.
2. From `REPORT.md`: errors fixed, warnings left, catalog usage.
3. From `COVERAGE.md` — **this is the user's to-do list, lead with it**: DS components to add (agent asked, DS has them),
   capability gaps, entries built from tokens (not real DS components), possible DS gaps, limitations.
   Never say "your DS doesn't have X" unless coverage says so — check the Storybook index, not your memory.
4. Guardrail suggestions from what you observed (e.g. "agent nested Cards → add `forbidNesting`").

## Guardrails (`guardrails.json`)

| Key                                  | Effect                                           |
| ------------------------------------ | ------------------------------------------------ |
| `maxDepth`, `maxComponents`          | error when exceeded                              |
| `forbidNesting: [[parent, child]]`   | error when `child` is a direct child of `parent` |
| `requireProps: {Component: [prop]}`  | error when missing (e.g. Button needs `action`)  |
| `preferTable: {component, minItems}` | warn when a template repeats ≥ minItems items    |
| `banned: [Component]`                | error on use                                     |

Propose new rules from real runs; do not invent rules the runs never needed.

## Limits (v1 — say them when relevant)

- React only. The renderer (`catalog.tsx`) is hand-written per design system from the recipe, not auto-generated.
- A2UI v0.9 via `@a2ui/react` 0.11 — the protocol is pre-1.0 and may change.
- The checker validates structure and data, not visuals; the screenshot step covers visuals.
