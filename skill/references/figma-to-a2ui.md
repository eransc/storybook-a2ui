# Figma screen → A2UI pattern (automatic)

Turns a real design frame into a pattern (`patterns.md`) without hand-writing it. Three steps; the first
is the only one that talks to Figma, and it is **read-only**.

```
Figma frame ──1 extract──► <name>.tree.json ──2 from-figma──► patterns/<name>.json ──3 patterns──► Storybook
 (use_figma, read-only)     (layout, texts, props)   (+ figma-map.json)           (validate + story)
```

## 0. `figma-map.json` — once per project, in `<a2ui dir>/`

Maps the design file's component names to catalog components. Everything design-system-specific lives
here; the converter itself is generic.

```json
{
  "skip": ["<app chrome component, e.g. a global sidebar>"],
  "tableContainer": "Card",
  "table": { "as": "Table", "cellType": { "from": "<cell variant prop>", "map": { "<value>": "avatar" } } },
  "icons": { "as": "Icon", "prop": "name", "names": { "<Figma icon name>": "<catalog icon name>" } },
  "textStyles": { "<text style name>": "h1", "<another>": "caption" },
  "components": {
    "<Component set>": { "container": true },
    "<Card-like set>": { "container": "Card" },
    "<Button set>": {
      "as": "Button",
      "props": {
        "variant": {
          "from": "<variant prop>",
          "map": { "<value>": "primary" },
          "default": "default"
        }
      }
    },
    "<Badge set>": {
      "as": "Badge",
      "props": { "color": { "from": "Color", "map": { "Success": "success" } } }
    },
    "<Input set>": { "as": "TextField" },
    "<Label set>": { "as": "Text", "variant": "h5", "restVariant": "caption" },
    "<Breadcrumb set>": { "as": "Text", "variant": "caption", "join": " › " },
    "<Vertical tabs set>": {
      "as": "Buttons",
      "props": { "variant": { "const": "borderless" } }
    },
    "<Table cell set>": {
      "byProp": { "Style": { "<value>": { "as": "Toggle", "label": "" } } },
      "default": { "as": "Text" }
    },
    "<Page header set>": {
      "as": "PageHeader",
      "fill": {
        "title": { "text": 0 },
        "text": { "textNamed": "Supporting text" },
        "breadcrumbs": { "textsOf": "<Breadcrumb set>" },
        "actions": { "instancesOf": ["<Button set>"] }
      }
    },
    "<Unsupported set>": { "unsupported": "why — goes into notExpressible" }
  }
}
```

- `as` = a catalog component; `props` values are constants, `{ "const": x }`, or `{ "from": "<Figma variant
prop>", "map": {…}, "default": … }`. Texts inside the instance become `text` / `label` / `value`.
- `container: true` = descend and keep the layout; `container: "Card"` = wrap the contents in that component.
- **`fill`** (for extension components such as a page header) fills props from inside the instance, so a DS
  header is used _with the design's content_ instead of being decomposed. Per prop: `{ "text": i }` (i-th text),
  `{ "textNamed": "<layer>" }`, `{ "textsOf": "<set or layer>" }` (ALL texts under every match — e.g. each
  menu item's label; works on atomic instances too), `{ "instancesOf": [sets] }`
  (converted → child ids, for slot props), `{ "childOf": "<layer>" }` (one child id), or `const`/`from`.
  Texts go into `exampleData` and are bound with `{path}`. A spec that finds nothing is noted, never silent.
  Map the header as a **component**, not
  `container: true` — the converter warns when a Figma set has a same-named Storybook component.
- **`table`**: column-built tables become ONE catalog `Table` with `columns` + `rows` data (the recipe's Table
  contract). A table is detected by **structure**: a horizontal frame of vertical cell lists of equal length
  (cells may sit inside single-child wrappers), whose first cells are headers — a layer name or variant value
  containing "head"/"title", or `"header": { "from": "<variant prop>", "value": "<value>" }` in `table`.
  Column `type` comes from the first body cell — `cellType` (from/map on its variant prop, value a type or
  `{ "type": "actions", "actions": ["Edit"] }`) or else its `components` entry (`Toggle` → toggle,
  `CheckBox` → checkbox (a selection column), `Avatar` → avatar, `Badge` → badge, `Button` → actions).
  Without `table`, tables become Rows + a template.
- **`icons`**: small unnamed-set instances are icons. Listed ones become `as` with the catalog's icon name;
  `"default"` catches the rest; unlisted icons are dropped and noted.
- A component set with **no entry** is decomposed into layout and noted — add an entry when it matters.
- Find the names by extracting once with an empty map and reading the tree's `c.s` values. Key entries by the
  **component set** name (`c.s`, else `c.n`) — the coverage gate counts those, not layer names.

## 1. Extract (Figma MCP, read-only)

Run `SKILL_DIR/scripts/figma/extract-tree.js` with the Figma MCP `use_figma` tool, after replacing
`__NODE_ID__`, `__ATOMIC__` (JSON array: `figma-map.json` component keys that are **not** containers) and
`__SKIP__` (the map's `skip`). Save the returned JSON as `<a2ui dir>/figma/<name>.tree.json`
**before converting** — extraction is the expensive step. `get_metadata` alone is not enough (no auto-layout,
texts or variant props). Output is capped at ~20 KB: mapped (atomic) components stop at their boundary (they
keep their texts `c.tx`, text layer names `c.tn`, the sets their texts sit in `c.tp`, and nested component
counts `c.ns` for the coverage gate), and identical repeated subtrees (table cells, rows) are stored once in
`d` as `{ "$": i }` — the scripts expand them. A real 11-row table is ~3 KB. Only if a frame is still too big,
extract a sub-frame.

## 2. Convert

```bash
node SKILL_DIR/scripts/a2ui.mjs from-figma --tree $S/figma/<name>.tree.json --map $S/figma-map.json \
  --schema $S/catalog.schema.ts --name <kebab-name> --out $S/patterns
```

Rules (generic): auto-layout → `Row`/`Column`; FILL / grow widths → `weight` ratios (wrapped in a weighted
Column when the component's schema has no `weight`); top-aligned rows stay `align: start`; wrapping rows of
equal items → a grid with data pre-split into `rows[].items`; ≥3 same-shaped siblings → one template over an
array, laid out in the parent's direction (Row in a horizontal frame); a row of equal-length vertical columns with header cells → the catalog Table (`table`) or a header row + row template; every text →
`exampleData` + `{path}`; a row's text-like first child labels the fields in that row (bound to the same
data; when the field's own label is hidden in Figma — boolean prop `Label` = false — it gets `label: ""` and
the row label as `accessibility.label`); an incomplete last grid row keeps 1/cols per item (spacer); plain same-direction
wrappers are merged. Anything unmapped is **reported** in `notExpressible`, never guessed.

## 3. Finish and validate

Write `whenToUse` (the converter leaves a TODO the linter rejects), then run `patterns` (patterns.md). Size
guardrails become calibration warnings for real pages. Compare the generated story with the frame.

## Known limits

Toggle/checkbox on-off state inside mapped cells is not extracted (tables assume `true`); images are skipped
and icons too unless listed in `icons`; icon-only table actions can't be named from the tree (set `actions`); content that appears on only some repeated items can't be hidden per item (A2UI v0.9);
avatar initials are guessed from nearby text; frames without auto-layout become columns. **Spacing is not
carried**: Figma gaps/padding are extracted but A2UI v0.9 has no gap prop — spacing comes from the catalog.
**Detached instances** (plain frames that keep a component's name) render as loose layout; the converter
notes them — re-link them in Figma.
