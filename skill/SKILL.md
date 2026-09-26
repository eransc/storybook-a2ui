---
name: storybook-a2ui
description: Use Storybook as a playground for A2UI (Agent-to-UI) layouts built from the project's OWN design-system components. Three jobs — (1) generate an A2UI v0.9 catalog from the Storybook components, (2) convert Figma screens into A2UI layout patterns saved in the Storybook project, (3) turn a prompt (+ optional data) into new layouts rendered as real Storybook stories, validated against the catalog and guardrails, with a report of used / misused / missing components. Use when the user wants generative or agent UI from their design system, "what would an agent build for this data", an A2UI catalog, page patterns from Figma, or guardrails for agent-rendered UI — even if they don't say "A2UI" (e.g. "generative UI from my components", "agent UI playground in Storybook", "turn this Figma page into a layout example").
---

# storybook-a2ui

Prompt + data → A2UI JSON → rendered with **your** components in Storybook, one story per dataset,
plus a report (used / misused / missing components, guardrail hits).

**You (the agent running this skill) are the model that authors the A2UI.** No API key, no server.
Say so when reporting: results show what _an_ agent does with the catalog, not the user's production model.

Scripts live next to this file: `SKILL_DIR/scripts/`. Optional worked references: `SKILL_DIR/examples/<design-system>/` — illustrations only; nothing in the workflow depends on them.

## Three jobs — route the request

| The user wants… | Do | Output (in `<a2ui dir>/`) |
|---|---|---|
| **A. A catalog from Storybook** ("set up A2UI", "what can an agent use") | steps 1 → 2 → 3 | `catalog.schema.ts`, `catalog.tsx`, `COVERAGE.md` |
| **B. Patterns from Figma** (a Figma link: "use this page as an example") | A first if no catalog, then step 3b | `figma-map.json`, `figma/*.tree.json`, `patterns/*.json` + **A2UI Patterns** stories |
| **C. New layouts from a prompt** ("build a users page", "show these flights") | A first if no catalog, then steps 4 → 5 → 6 | `runs/*.json` + **A2UI Playground** stories, `runs/REPORT.md` |

```
A catalog (once)            B patterns (per Figma page)      C prompt → layouts (per idea)
──────────────────          ───────────────────────────      ─────────────────────────────
1 locate Storybook          figma-map.json (once)            4 datasets (user's, or empty/few/many)
2 install + catalog         extract frame (read-only)        5 author runs — follow a pattern if one fits
  + coverage gate           from-figma → whenToUse           6 check → stories → screenshot → report
3 describe catalog          patterns → stories
```

For C, a prompt alone is enough: synthesize the datasets (step 4). If patterns exist, the layout follows the
closest one — that is what makes full pages look like the team's own.

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
  Curate **by category** (recipe §1): layout + primitives, page structure (headers, breadcrumbs, side nav),
  form controls, data display, feedback, icons. **Never rebuild from tokens a component the DS already has.**
  Confirm the list with the user when the Storybook is large.
- **Coverage gate (required before the first run):** run `coverage` with `--figma <dir> --map figma-map.json`
  when design trees exist (see `figma-to-a2ui.md`), and show the user every 🔴 alert: a component used in their
  designs that exists in Storybook but is missing from the catalog. Add it, or exclude it with a reason, before
  authoring — a catalog missing page-level components produces pages that can't match the designs.
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

## 3b. Page patterns (optional — strongly recommended for full, multi-region pages)

Patterns are the team's real pages (usually design-tool frames) as A2UI structure + example data, **saved in
this Storybook project so the agent knows how the team builds pages**. In testing they made full-page output
consistent and on-brand; on simple pages the effect is small. Read **`SKILL_DIR/references/patterns.md`**,
extract 2–5 patterns into `<a2ui dir>/patterns/<name>.json`, then:

```bash
node SKILL_DIR/scripts/a2ui.mjs patterns --schema $S/catalog.schema.ts --dir $S/patterns --guardrails $S/guardrails.json --out $S
```
**From Figma automatically:** follow **`SKILL_DIR/references/figma-to-a2ui.md`** — write `figma-map.json` once,
extract each frame (read-only, Figma MCP), then `a2ui.mjs from-figma`; write `whenToUse`, then run `patterns`.

This validates every pattern against the catalog and guardrails and generates one story per pattern under
**A2UI Patterns / <Name>** (docs page: when to use, source link, what the catalog can't express yet).
The stories import the JSON, so editing a pattern updates Storybook live. Compare each story with its source
frame **before** relying on it — a catalog bug in a pattern is copied into every page built from it.

## 4. Datasets

`<a2ui dir>/data/<scenario>/<dataset>.json`. Use the user's data if given. Otherwise synthesize
**edge-case sets** — the value of the playground is seeing the UI change with the data:
`empty`, `few` (2–3), `many` (≥ 10), plus `long-text` or `partial` (missing fields) when relevant.

## 5. Author one run per dataset

Read **`SKILL_DIR/references/a2ui-authoring.md`**. For each dataset, look at the data and write
`<a2ui dir>/runs/<scenario>--<dataset>.json` (kebab-case names; `--` separates dataset).
Choose the UI a good agent would choose _for that data_. Record honest `wanted` gaps.
If `<a2ui dir>/patterns/` exists: pick the closest pattern by its `whenToUse` (or none), keep its skeleton,
adapt it to the data, and set `"pattern": "<name>"` in the run.

## 6. Check → stories → render → report

```bash
S=<a2ui dir>
node SKILL_DIR/scripts/a2ui.mjs check   --schema $S/catalog.schema.ts --runs $S/runs --guardrails $S/guardrails.json --report $S/runs/REPORT.md
node SKILL_DIR/scripts/a2ui.mjs stories --runs $S/runs --out $S
node SKILL_DIR/scripts/a2ui.mjs coverage --schema $S/catalog.schema.ts --storybook http://localhost:<port> --runs $S/runs --report $S/COVERAGE.md
node SKILL_DIR/scripts/screenshot.mjs --project <repo with playwright> --url http://localhost:<port> --out <tmp>/a2ui-shots a2ui-playground-<scenario>--<dataset> ...
```

- `check` exits 1 on errors. Fix the run (not the checker) and re-check; at most 3 rounds, then report what still fails.
- Story ids: use the ones `stories` prints (Storybook turns digits into separate words: `A1` → `a-1`).
  `✗ … not indexed` from `screenshot.mjs` → check the id first, then restart Storybook (see step 1).
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
| `limits: [{component, where, max, per}]` | error when more than `max` match per `section` (or `surface`) — e.g. **one primary Button per section**. Sections: root, each `sectionBoundaries` component (default Card, Tabs), each Tabs panel, each repeated template item |
| `requireBinding: {props, flagCopiedData}` | error when a listed prop (e.g. a table component's `rows`) is a literal instead of `{path}`; warn when a literal string equals a value in the data (copied instead of bound) |

Propose new rules from real runs; do not invent rules the runs never needed.

## Limits (v1 — say them when relevant)

- React only. The renderer (`catalog.tsx`) is hand-written per design system from the recipe, not auto-generated.
- A2UI v0.9 via `@a2ui/react` 0.11 — the protocol is pre-1.0 and may change.
- The checker validates structure and data, not visuals; the screenshot step covers visuals.
