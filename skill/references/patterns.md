# Page patterns — the team's real layouts as examples

The catalog says which components exist; guardrails say what is forbidden; **patterns say what a good
page looks like here**. A pattern is one real page from the team's designs (usually a Figma frame),
turned into A2UI structure with all content moved into data.

**Evidence (a real product design system, 3 blind agents per arm, 2 new prompts):** with a 3-pattern library, 6/6 runs picked
the right pattern and 3/3 produced the same house-style skeleton (breadcrumb, icon header, sub-nav, one
primary action in the header, label-column form rows, toggle list, 3-column card grid). Without patterns
the same prompt gave 3 different layouts, or a consistent but generic one. On a _simple_ list page the
effect was small (the data already dictated a table) — patterns pay off on full, multi-region pages.

## File format — `<a2ui dir>/patterns/<name>.json`

```json
{
  "name": "record-edit-form",
  "whenToUse": "Create or edit ONE record. Breadcrumb, page header, sub-nav, back link, section header (title, description; Cancel + ONE primary Save on the right), then form ROWS: label + hint on the left, control on the right, divider between rows. Long on/off lists = bordered list of name + Toggle rows.",
  "source": { "figmaFile": "<fileKey>", "node": "<nodeId>", "frame": "<frame name>" },
  "components": [ { "id": "root", "component": "Column", "children": ["..."] } ],
  "exampleData": { "page": { "title": "<page title>" }, "fields": [ ... ] },
  "notExpressible": ["fixed 280px label column → weight 1:2", "..."]
}
```

- `whenToUse` is what the agent reads to choose — describe the **job** and the **regions**, not the pixels.
- `components` use **catalog names only** and bind every piece of content with `{"path": ...}`.
- `exampleData` holds the frame's real content, so the pattern renders as the original page.
- `notExpressible` lists what the catalog could not reproduce. These are catalog to-dos — feed them into
  `CATALOG_LIMITATIONS` or new extensions.

## Extracting a pattern from Figma (today: by the agent, via the Figma MCP)

1. `get_metadata` on the frame → region tree; `get_screenshot` → the look.
2. Skip app chrome the playground doesn't own (global sidebar, top bar) — note it in `notExpressible`.
3. Map regions: auto-layout frame → `Row`/`Column`; DS instance → its catalog component; text → `Text`
   with the closest variant; repeated siblings → **one template** over an array in `exampleData`.
4. Move ALL content into `exampleData` (titles, labels, rows). The components keep only structure.
5. Proportions → `weight` (a 280px label column next to a 512px field ≈ `1 : 2`).
6. Shape data for the layout: a 3-column grid is `rows[].cards[]` (Row does not wrap).
7. Run `patterns` (below) and compare the generated story with the screenshot. Fix the pattern until the structure
   matches; list the rest in `notExpressible`.

A Figma plugin ("Copy as A2UI") could do steps 3–4 mechanically; it is not built yet.

## Validate and show in Storybook

```bash
node SKILL_DIR/scripts/a2ui.mjs patterns --schema $S/catalog.schema.ts --dir $S/patterns --guardrails $S/guardrails.json --out $S
```
`patterns` lints each file (name, whenToUse, root, source, exampleData), validates it against the catalog and
guardrails like a run, and generates `A2UI.Pattern.<Name>.stories.tsx` → **A2UI Patterns / <Name>** in
Storybook, tagged `a2ui-pattern`. The docs page shows *when to use*, a link to the source frame and the
`notExpressible` list; the story renders the pattern with its example data. The stories import the JSON, so the
JSON stays the single source of truth for both the agent and people.

Compare each pattern story with its source frame. Fix the pattern (or the catalog) until the structure matches.

## Using patterns when authoring (step 5)

- Read every pattern's `whenToUse`, pick the closest **for this prompt**, or none.
- Keep its skeleton and conventions; adapt regions to the data; reshape data if the layout needs it.
- Deviate only where the task needs it, and say where in `wanted` or the report.
- Set `"pattern": "<name>"` in the run.

## Pitfalls seen in practice

- **Patterns copy catalog bugs into every page.** A catalog Row that ignored `weight` gave every
  pattern-based page a half-width side navigation. Fix fidelity _before_ handing patterns to agents.
- **Patterns copy accessibility gaps.** A toggle row with the name in a sibling `Text` and `label: ""`
  has no accessible name; the checker warns (`a11y:`). Bind the label or give the catalog a hidden-label prop.
- **Conditional content** (a badge shown on only some cards) is not expressible in A2UI v0.9 —
  use a separate data shape or a semantic component.
- **Private designs**: patterns carry real content from the team's Figma. Keep them in the team's repo,
  not in public examples.
