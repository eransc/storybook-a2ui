# Building the catalog for a design system (one-time setup)

Two files in `<a2ui dir>/` (worked references: `SKILL_DIR/examples/`):

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
  feedback (notification/alert), dense data (a table), etc. Define their schema with
  `z.object({...}).strict().describe('when to use it')` — the description is what the
  agent reads, so write _when to use_, not _what it is_.

Ask the user which components matter if the Storybook is large or unfamiliar.

Read real props before mapping. If the package ships component metadata, use it
(some packages ship a component metadata JSON and usage examples in `dist/`);
otherwise read the component's `.d.ts` and one of its stories. Never guess prop names.

The DS may lack a standard name (e.g. no Card): map it to the nearest surface
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
- **`weight` is required** (A2UI's flex-grow; every component may carry it inside a Row/Column).
  Route every implementation through one helper so all components honour it:
  ```tsx
  function withWeight(weight: unknown, node: React.ReactNode) {
    if (typeof weight !== 'number') return node;
    return <div style={{ display: 'flex', flexDirection: 'column', flex: `${weight} 1 0`, minWidth: 0 }}>{node}</div>;
  }
  const weighted: typeof createComponentImplementation = (api, View) =>
    createComponentImplementation(api, (args) => withWeight((args.props as { weight?: unknown }).weight, View(args)));
  // then: const Row = weighted(RowApi, ...), const Card = weighted(CardApi, ...), …
  ```
  And an **unweighted** Row/Column that is a direct child of a Row must size to its content, not `width: 100%`
  (two 100% siblings split 50/50). If the DS layout primitive is CSS grid and cannot grow per child, list
  "weight ignored" in `CATALOG_LIMITATIONS` instead.

## 4. Layout and text gotchas (seen on real design systems — check yours)

- **Grid-based stack components** (some DS stacks are CSS grid, not flex). A2UI's
  `justify/align` are flex semantics. For a vertical grid map `justify → align-content`
  and `align → justify-items`; `justify-content: start` on a vertical grid shrinks the
  column to its content. Horizontal: `justify → justify-content`, `align → align-items`.
- Give Row/Column `width: 100%` so `spaceBetween` has room.
- **Intrinsic-width components** (tags, buttons) stretch inside a stretching column —
  wrap them in a plain `<div>`.
- Headings: use the DS's heading component/levels for `Text` `h1–h5`, a body style otherwise.
  Map levels the DS lacks (e.g. only h1–h3) to bold body sizes.
- **Text defaults that fight composition**: heading/text components may truncate with an ellipsis
  by default (prices became `$...` inside a Row) → `ellipsis={false}`; `Text` forces a dark
  color, so a `Text` inside a primary `Button` turned dark-on-blue → body text `color="inherit"`.
- **Built-in labels** (a toggle that renders its own "Off/On"): hide them (via the component's prop) and
  render the A2UI `label` yourself.

- **Data-driven variants** (every status badge renders in one color). A2UI v0.9 cannot map a data value
  to an enum (`status: "failed"` → `color: "negative"`). Add a **semantic extension** that takes the value
  and picks the variant itself — `StatusBadge({ status })` — and list the plain one in `CATALOG_LIMITATIONS`.
- **Separators in repeated lists**: a `Divider` inside a template repeats per item, so the last item gets a
  trailing line (the checker warns). Give list items their own border, or use the DS table.

## 5. Two zod copies (common; breaks TypeScript, not runtime)

`@a2ui/*` often installs its own nested zod. Mixing its `CommonSchemas` into your `z.object`
or letting `createComponentImplementation` infer your extension props across copies gives
**TS2589 "type instantiation is excessively deep"**. Fix:
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
tell the user what to do next.

```ts
export const CATALOG_SOURCES = {
  Card:    { kind: 'ds', component: '<YourDsCard>' },                // wraps a real DS component
  Text:    { kind: 'ds', component: ['Heading', 'Text'] },            // several
  Divider: { kind: 'tokens', note: '<hr> with a border token' },      // NOT a DS component — say so
};
export const CATALOG_EXCLUDED = { Modal: 'overlays are out of scope for the playground' };
export const CATALOG_LIMITATIONS = ['Tag color cannot come from data → add StatusTag(status)'];
```

- `component` must be the DS component name **as Storybook knows it** (the file behind its stories), or the
  report flags it as "has no story in this Storybook".
- Use `kind: 'tokens'` honestly whenever you built the thing yourself from CSS/tokens (e.g. the DS has no Card,
  layout or type components). The report calls these out as "not real DS components" — the team must know.
- Only exclude with a real reason. Unreviewed components are listed as "decide: add or exclude".

### Layout probe (do this once per catalog)

Hand-write one run: `Row[ Column(no weight) > [Text "Side"], Column(weight 1) > [Text "Main"] ]` and render it.
Correct: "Side" is as narrow as its text, "Main" takes the rest. A 50/50 split means `weight` is broken.
