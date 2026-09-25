# Building the catalog for a design system (one-time setup)

Two files in `<a2ui dir>/` (reference implementation: `SKILL_DIR/examples/carbon/`):

| File                | Contains                                                              | Imported by                       |
| ------------------- | --------------------------------------------------------------------- | --------------------------------- |
| `catalog.schema.ts` | `CATALOG_ID`, `CATALOG_APIS` — zod schemas only, **no React, no CSS** | `catalog.tsx`, the checker (Node) |
| `catalog.tsx`       | `export const catalog = new Catalog(CATALOG_ID, [...impls])`          | `A2uiPlayground.tsx`              |

## 1. Curate — 8 to 15 components, not the whole Storybook

An agent catalog is a vocabulary, not an inventory. Read the Storybook index
(`curl <storybook>/index.json`) and pick:

- **Layout + primitives under the standard A2UI names** — `Row`, `Column`, `Text`,
  `Card`, `Button`, `TextField`, `CheckBox`, `Tabs`, `Divider`. Reuse the OFFICIAL schemas
  (`RowApi`, `ColumnApi`, … from `@a2ui/web_core/v0_9/basic_catalog`) and render them with
  the DS's own components. Agents already speak these names; output looks like the DS.
- **3–6 DS extensions** that carry meaning the basics can't: status (Tag/Badge),
  feedback (Notification/Alert), dense data (DataTable), etc. Define their schema with
  `z.object({...}).strict().describe('when to use it')` — the description is what the
  agent reads, so write _when to use_, not _what it is_.

Ask the user which components matter if the Storybook is large or unfamiliar.

Read real props before mapping. If the package ships component metadata, use it
(Vibe: `node_modules/@vibe/core/dist/metadata.json` + `dist/metadata/examples/*.md`);
otherwise read the component's `.d.ts` and one of its stories. Never guess prop names.

The DS may lack a standard name (Vibe has no Card): map it to the nearest surface
(bordered `Box`) rather than dropping it — agents expect the standard names.

## 2. Schema rules

- Text-like props: `CommonSchemas.DynamicString` (literal or `{path}`).
- Data arrays (table rows): `CommonSchemas.DynamicValue`.
- Children: `CommonSchemas.ComponentId` (one) / `CommonSchemas.ChildList` (many or template).
- Events: `CommonSchemas.Action.optional()`.
- Enums: `z.enum([...])` with the DS's real values. Always `.strict()`.

## 3. Implementation rules (`createComponentImplementation(Api, ({ props, buildChild }) => …)`)

- Props arrive **resolved** (bindings already replaced with values).
- Child lists — copy this exactly (template items arrive as `{id, basePath}`):
  ```tsx
  (props.children as ChildRef[]).map((ref, i) =>
    typeof ref === "string" ? (
      <Fragment key={ref + i}>{buildChild(ref)}</Fragment>
    ) : (
      <Fragment key={ref.id + ref.basePath}>
        {buildChild(ref.id, ref.basePath)}
      </Fragment>
    ),
  );
  ```
- Actions: `onClick={() => props.action?.()}`.
- Inputs need an id: `useId()`.

## 4. Layout and text gotchas (found on Carbon and Vibe — check yours)

- **Grid-based Stack components** (Carbon `Stack` is CSS grid, not flex). A2UI's
  `justify/align` are flex semantics. For a vertical grid map `justify → align-content`
  and `align → justify-items`; `justify-content: start` on a vertical grid shrinks the
  column to its content. Horizontal: `justify → justify-content`, `align → align-items`.
- Give Row/Column `width: 100%` so `spaceBetween` has room.
- **Intrinsic-width components** (tags, buttons) stretch inside a stretching column —
  wrap them in a plain `<div>`.
- Headings: use the DS's heading component/levels for `Text` `h1–h5`, a body style otherwise.
  Map levels the DS lacks (Vibe has h1–h3 only) to bold body sizes.
- **Text defaults that fight composition** (Vibe): `Heading`/`Text` truncate with an ellipsis
  by default (prices became `$...` inside a Row) → `ellipsis={false}`; `Text` forces a dark
  color, so a `Text` inside a primary `Button` turned dark-on-blue → body text `color="inherit"`.
- **Built-in labels** (Vibe `Toggle` renders "Off/On"): hide them (`areLabelsHidden`) and
  render the A2UI `label` yourself.

- **Data-driven variants** (Optimove: every status Badge came out gray). A2UI v0.9 cannot map a data value
  to an enum (`status: "failed"` → `color: "negative"`). Add a **semantic extension** that takes the value
  and picks the variant itself — `StatusBadge({ status })` — and list the plain one in `CATALOG_LIMITATIONS`.
- **Separators in repeated lists**: a `Divider` inside a template repeats per item, so the last item gets a
  trailing line (the checker warns). Give list items their own border, or use the DS table.

## 5. Two zod copies (common; breaks TypeScript, not runtime)

`@a2ui/*` often installs its own nested zod. Mixing its `CommonSchemas` into your `z.object`
or letting `createComponentImplementation` infer your extension props across copies gives
**TS2589 "type instantiation is excessively deep"**. Fix, as in the Carbon example:
- in `catalog.schema.ts`, re-type the shared schemas you use against your zod
  (`CommonSchemas as unknown as { DynamicString: z.ZodType<string | {path: string}> … }`);
- in `catalog.tsx`, wrap extensions in a small `impl<Props>(api, View)` helper with explicit
  props (already resolved). Official APIs (`RowApi` …) need no wrapper.

## 6. Type-check the catalog

Vite does not type-check. Run strict tsc on the A2UI files only and read the exit code
(don't grep colored output — use `--pretty false`):

```bash
npx tsc --pretty false --noEmit --skipLibCheck --strict --jsx react-jsx --module esnext \
  --moduleResolution bundler --target es2022 --esModuleInterop --resolveJsonModule \
  <a2ui dir>/catalog.schema.ts <a2ui dir>/catalog.tsx <a2ui dir>/A2uiPlayground.tsx; echo exit=$?
```
TypeScript ≥ 6 refuses file args when a tsconfig exists (TS5112): add `--ignoreConfig`.
Errors in the DS's own sources under `--strict` are not yours — count only `<a2ui dir>` ones.

## 7. Verify the catalog before authoring

```bash
node <skill>/scripts/a2ui.mjs describe --schema <a2ui dir>/catalog.schema.ts
```

Then hand-write one small run and render it (SKILL.md step 6) — if it does not look like
the design system, fix `catalog.tsx` before generating anything else.

## 8. Coverage metadata (required)

Export three more things from `catalog.schema.ts`. They are plain data; `a2ui.mjs coverage` reads them to
tell the user what to do next. Examples: `SKILL_DIR/examples/carbon/catalog.schema.ts`.

```ts
export const CATALOG_SOURCES = {
  Card:    { kind: 'ds', component: 'Tile' },                        // wraps a real DS component
  Text:    { kind: 'ds', component: ['Heading', 'Text'] },            // several
  Divider: { kind: 'tokens', note: '<hr> with a border token' },      // NOT a DS component — say so
};
export const CATALOG_EXCLUDED = { Modal: 'overlays are out of scope for the playground' };
export const CATALOG_LIMITATIONS = ['Tag color cannot come from data → add StatusTag(status)'];
```

- `component` must be the DS component name **as Storybook knows it** (the file behind its stories), or the
  report flags it as "has no story in this Storybook".
- Use `kind: 'tokens'` honestly whenever you built the thing yourself from CSS/tokens (Optimove had no Card,
  layout or type components). The report calls these out as "not real DS components" — the team must know.
- Only exclude with a real reason. Unreviewed components are listed as "decide: add or exclude".
