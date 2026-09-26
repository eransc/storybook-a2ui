// Column-built Figma table → the catalog's data-driven Table (figma-map "table": { "as": "Table", ... }).
// Contract (see references/catalog-recipe.md "Table"): { columns: [{ header, field, type, weight?, subField?,
// actions? }], rows: {path} } with type text | avatar | badge | toggle | checkbox | actions.
import { emit, newId, slug } from "./convert.mjs";
import { entryFor, propValue } from "./instances.mjs";

const TYPE_BY_AS = {
  Toggle: "toggle",
  CheckBox: "checkbox",
  Avatar: "avatar",
  Badge: "badge",
  Button: "actions",
  Buttons: "actions",
};
const textsOf = (n) =>
  n.c?.tx ?? (n.t === "Text" ? [n.tx] : (n.k ?? []).flatMap(textsOf));

/** Column type from the first body cell: map "cellType" spec (from/map on a variant prop) → else its figma-map entry. */
function cellType(ctx, cell) {
  const spec = ctx.map.table.cellType;
  const override = spec && cell.c ? propValue(spec, cell) : undefined;
  if (override)
    return typeof override === "string" ? { type: override } : override;
  const entry = cell.c ? entryFor(ctx, cell) : undefined;
  const type = TYPE_BY_AS[entry?.as] ?? "text";
  return type === "actions"
    ? { type, actions: [entry.label ?? "Open"] }
    : { type };
}

export function emitTable(ctx, node, scope, cols, weights) {
  const { as, rowsKey = "rows" } = ctx.map.table;
  const used = new Set();
  const columns = cols.map((c, i) => {
    const header = textsOf(c.k[0])[0] ?? "";
    const { type, actions } = cellType(ctx, c.k[1]);
    const unnamed =
      { actions: "actions", checkbox: "selected" }[type] ?? `col ${i}`;
    let field = slug(header || unnamed).replace(/-/g, "_");
    while (used.has(field)) field += "_";
    used.add(field);
    const hasSub =
      type !== "actions" &&
      c.k.slice(1).some((cell) => textsOf(cell).length > 1);
    return {
      header,
      field,
      type,
      weight: weights[i],
      ...(hasSub ? { subField: `${field}_sub` } : {}),
      ...(actions ? { actions } : {}),
    };
  });
  const rows = Array.from({ length: cols[0].k.length - 1 }, (_, r) => {
    const row = {};
    columns.forEach((col, i) => {
      const cell = cols[i].k[r + 1];
      let tx = textsOf(cell);
      // Avatar cells may list the avatar's initials fallback first ("JD", "Jane Doe", …) — skip it.
      if (
        col.type === "avatar" &&
        tx.length > 1 &&
        /^\p{Lu}{1,3}$/u.test(tx[0])
      )
        tx = tx.slice(1);
      if (col.type === "actions") return;
      if (col.type === "toggle") row[col.field] = true;
      else if (col.type === "checkbox") row[col.field] = false;
      else row[col.field] = tx[0] ?? "";
      if (col.subField) row[col.subField] = tx[1] ?? "";
    });
    return row;
  });
  let key = rowsKey;
  for (let i = 2; key in scope.obj; i++) key = `${rowsKey}_${i}`;
  scope.obj[key] = rows;
  ctx.notes.add(
    `"${node.n}": column-built table (${cols.length} columns × ${rows.length} rows) → ${as} (columns + rows data)`,
  );
  const table = emit(ctx, newId(ctx, "table"), as, {
    columns,
    rows: { path: scope.relative ? key : `${scope.prefix}/${key}` },
  });
  return ctx.map.tableContainer
    ? emit(ctx, newId(ctx, "table card"), ctx.map.tableContainer, {
        child: table,
      })
    : table;
}
