# storybook-a2ui

An agent skill that turns **Storybook into a playground for A2UI** (Google's Agent-to-UI protocol)
using **your own design-system components**.

Put data in, write a prompt, and see what UI an agent builds with your components, rendered as
real Storybook stories, one per dataset (empty / few / many…). Every run is validated against your
catalog and guardrails, and the report shows which components the agent used, misused, or wished it had.

Same prompt, same three datasets, two design systems. The agent chose an empty state, cards, and a table each time:

| | empty | few | many |
|---|---|---|---|
| **IBM Carbon** | ![](skill/examples/carbon/screenshots/a2ui-playground-flights--empty.png) | ![](skill/examples/carbon/screenshots/a2ui-playground-flights--few.png) | ![](skill/examples/carbon/screenshots/a2ui-playground-flights--many.png) |
| **monday.com Vibe** | ![](skill/examples/vibe/screenshots/a2ui-playground-flights--empty.png) | ![](skill/examples/vibe/screenshots/a2ui-playground-flights--few.png) | ![](skill/examples/vibe/screenshots/a2ui-playground-flights--many.png) |

## How it works

```
Storybook components ──► catalog.schema.ts (zod, A2UI names) + catalog.tsx (your components)
prompt + data/<scenario>/<dataset>.json ──► agent writes runs/<scenario>--<dataset>.json (A2UI v0.9)
                                          ──► a2ui.mjs check  (schema · refs · bindings · guardrails)
                                          ──► a2ui.mjs stories → A2UI.<Scenario>.stories.tsx
                                          ──► screenshot + REPORT.md (runs) + COVERAGE.md (your to-do list)
```

- Standard A2UI names (`Row`, `Column`, `Text`, `Card`, `Button`, `TextField`…) reuse the **official
  schemas** but render as your components, so any A2UI agent works unchanged.
- The agent running the skill (Claude Code, etc.) authors the A2UI, so no API key is needed.
- Renders through the official `@a2ui/react` v0.9 renderer.

## Install

```bash
git clone https://github.com/eransc/storybook-a2ui ~/Code/storybook-a2ui
ln -s ~/Code/storybook-a2ui/skill ~/.claude/skills/storybook-a2ui   # Claude Code
```

Then, in a repo with a React Storybook: _"use storybook-a2ui to show what an agent would build for
this flight data"_.

## Layout

```
skill/SKILL.md                 workflow the agent follows
skill/scripts/a2ui.mjs         describe | check | stories | coverage | patterns | from-figma
skill/scripts/figma/           extract-tree.js — read-only Figma extractor (runs via the Figma MCP)
skill/scripts/screenshot.mjs   render stories with the project's Playwright
skill/references/              A2UI authoring guide · catalog recipe · page patterns · figma-to-a2ui · lessons checklist
skill/templates/               A2uiPlayground.tsx · guardrails.json
skill/examples/carbon/         reference catalog + runs + screenshots (IBM Carbon, CSS-grid layout)
skill/examples/vibe/           reference catalog + runs + screenshots (monday.com Vibe, flexbox)
```

## Compatibility

**Skill version: v1.3.0**

| | Version | Notes |
|---|---|---|
| **A2UI protocol** | **v0.9** | messages carry `"version": "v0.9"`; the protocol is pre-1.0 and may change |
| `@a2ui/react` | **0.11.1** | official renderer, imported from `@a2ui/react/v0_9` |
| `@a2ui/web_core` | **0.11.0** | schemas, `Catalog`, `MessageProcessor` (`/v0_9`, `/v0_9/basic_catalog`) |
| Storybook | 9.1 · 10.3 · 10.5 tested | React renderer only (`@storybook/react-vite`) |
| React | 18.3 · 19.2 tested | |
| zod | 3.25 | comes with `@a2ui/*`; may be a second copy (see recipe §5) |
| TypeScript | 5.7 · 5.9 · 6.0 | TS ≥ 6 needs `--ignoreConfig` for the type-check step |
| Node | 24 | scripts use native `fetch` (Node ≥ 18) |
| Playwright | any `@playwright/test` on the machine | optional, for screenshots; uses installed Chrome |

Tested on: IBM **Carbon** (Storybook 10.3, React 19), monday.com **Vibe** (Storybook 10.5, React 19),
**Optimove** react-ui (Storybook 9.1, React 18).

When A2UI moves past v0.9, the install command in `SKILL.md` step 2 and the `/v0_9` imports in the
templates and examples are what change.

## Changelog

- **v1.3.0** — **Figma → A2UI converter**: `scripts/figma/extract-tree.js` (read-only, via the Figma MCP) +
  `a2ui.mjs from-figma` with a per-project `figma-map.json`: auto-layout → Row/Column, widths → weight, wrap
  grids, column-built tables, repeated items → templates, texts → data, unmapped parts reported. Pattern size
  guardrails become calibration warnings; `whenToUse` TODOs are rejected. Tested on 3 real product screens:
  every text carried on 2 of 3, 29/32 on the third.
  **Coverage alerts** (used in designs + in Storybook + missing from the catalog), a required coverage gate, and
  converter support for DS extensions: `fill` (page/section headers keep the design's content), `table` (one
  data-driven Table incl. a row-actions column; contract in the recipe) and `icons`.
  Verified on two unrelated kits (a product's Settings screens and monday.com Vibe): tables detected by
  structure (nested cells, header by variant), repeats keep the parent's direction, `fill` works on atomic
  instances, hidden field labels become `accessibility.label`, detached instances are flagged, the index
  parser handles package-barrel `componentPath`s, and repeated subtrees are compacted (a real table: 25 → 3 KB).
- **v1.2.0** — **page patterns**: the team's real pages (e.g. Figma frames) as A2UI structure + example data in
  `<a2ui dir>/patterns/`; `a2ui.mjs patterns` validates them and generates an **A2UI Patterns** section in
  Storybook (docs page: when to use, source link, what the catalog can't express yet); authoring follows the
  closest pattern. `weight` (flex-grow) is now a required catalog rule with a layout probe. Built-in `a11y`
  warning for empty labels; `stories` prints real Storybook ids; output folders are created as needed; all
  skill docs, scripts and templates are design-system-agnostic.
- **v1.1.0** — two guardrails: `limits` (e.g. one primary Button per section) and `requireBinding`
  (table rows must be bound; warns when data is copied into the UI as literals).
- **v1.0.0** — skill, `describe` / `check` / `stories` / `coverage`, Carbon + Vibe examples.

## Coverage report

`a2ui.mjs coverage` compares your **design system** (the Storybook index) with the **catalog** and the
agent's runs, and turns every gap into an action:

| Section | Tells you |
|---|---|
| Catalog → design system | which DS component backs each A2UI name; ⚠ entries built from tokens (not real DS components) |
| Not offered | DS components the agent never saw: **add** (agent asked for it) · excluded (with reason) · not reviewed |
| Wanted but missing | exists in DS → add it · capability gap in a catalog component · no component by that name (check synonyms) |
| Limitations | what A2UI can't express with this catalog (e.g. status → color) — manual work |

## Roadmap (v2 — "ship it", after someone asks)

- `a2ui` parameters in stories → `scaffold` command generates the catalog deterministically
- publish `catalog/<semver>.json` into `storybook-static` (catalogId carries the version); schema diff suggests the bump
- renderer exported from the DS npm package
- Storybook addon panel: catalog status (read-only) → Prompt / Data / Generate playground

## Distribution (planned)

Skills are shared as **GitHub repos**, not npm packages:

- `npx skills add eransc/storybook-a2ui` — the open skills CLI ([vercel-labs/skills](https://github.com/vercel-labs/skills)),
  installs into Claude Code, Cursor, Codex and others; GitHub is the registry.
- Claude Code plugin marketplace (`/plugin marketplace add eransc/storybook-a2ui`) — exact manifest layout to be confirmed
  against the Claude Code docs before publishing.
- Then list it in skill directories (skills.sh, awesome-claude-skills).

## License

MIT © Eran Schwartz
