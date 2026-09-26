// Structure detectors: column-major tables, wrap grids, repeated siblings → A2UI templates.
import {
  convert,
  emit,
  newId,
  bindText,
  createContext,
  slug,
  applyWeight,
} from "./convert.mjs";
import { emitTable } from "./table.mjs";

/** Layout skeleton for "same kind of item" checks: ignores text content, sizes and atomic leaves. */
export function skeleton(n, depth = 0) {
  if (!n) return "";
  if (n.t === "Text") return "T";
  if (n.icon) return "I";
  if (n.c?.tx) return ""; // atomic instance (badge, avatar…) — may be optional per item
  if (depth > 6 || !n.k) return n.c ? `C:${n.c.s ?? n.c.n}` : n.t;
  return `${n.c ? `C:${n.c.s ?? n.c.n}` : n.lm}(${n.k
    .map((k) => skeleton(k, depth + 1))
    .filter(Boolean)
    .join(",")})`;
}
const count = (n) => 1 + (n.k ?? []).reduce((a, k) => a + count(k), 0);

/** Convert items as one template: real ids from the richest item, data objects from every item. */
function asTemplate(ctx, items, scope, arrayName) {
  const richest = items.reduce((a, b) => (count(b) > count(a) ? b : a));
  const itemScope = { obj: {}, relative: true, nearText: undefined };
  const templateId = convert(ctx, richest, itemScope);
  const keys = Object.keys(itemScope.obj);
  const data = items.map((item) => {
    const s = { obj: {}, relative: true };
    convert(createContext(ctx.map, ctx.acceptsWeight), item, s); // scratch pass: same key naming, data only
    return s.obj;
  });
  const missing = keys.filter((k) => data.some((d) => !(k in d)));
  if (missing.length)
    ctx.notes.add(
      `"${richest.n}": ${missing.join(", ")} present in only some items — A2UI v0.9 can't hide it per item`,
    );
  let key = slug(arrayName);
  for (let i = 2; key in scope.obj; i++) key = `${slug(arrayName)}_${i}`;
  scope.obj[key] = data;
  return { templateId, path: scope.relative ? key : `${scope.prefix}/${key}` };
}

/** Consecutive runs of ≥3 same-skeleton siblings become one template; others pass through. */
export function detectRepeats(kids, direction = "V") {
  const runs = [];
  for (let i = 0; i < kids.length; ) {
    let j = i + 1;
    const sig = skeleton(kids[i]);
    while (j < kids.length && sig && skeleton(kids[j]) === sig) j++;
    if (j - i >= 3) {
      const items = kids.slice(i, j);
      runs.push({
        node: undefined,
        template: (ctx, scope) => {
          const t = asTemplate(ctx, items, scope, `${items[0].n} items`);
          // Follow the parent's direction: repeats in a horizontal frame stay side by side.
          const isRow = direction === "H";
          const fills = isRow && items.every((it) => (it.fill ?? "").includes("h"));
          const itemId = fills ? applyWeight(ctx, t.templateId, 1) : t.templateId;
          return emit(ctx, newId(ctx, `${items[0].n} list`), isRow ? "Row" : "Column", {
            children: { path: t.path, componentId: itemId },
          });
        },
      });
    } else for (let k = i; k < j; k++) runs.push({ node: kids[k] });
    i = j;
  }
  return runs;
}

/** Wrapping horizontal frame of equal-width items → rows[] of N items (Row does not wrap). */
export function detectGrid(ctx, node, scope) {
  const kids = node.k ?? [];
  if (node.lm !== "H" || !node.wrap || kids.length < 2) return null;
  const w = kids[0].w;
  if (!kids.every((k) => Math.abs(k.w - w) <= 2)) return null;
  const gap = node.g ?? 0;
  const cols = Math.max(1, Math.floor((node.w + gap) / (w + gap)));
  // Items that all fit on one line are a Row, not a grid.
  if (cols < 2 || kids.length <= cols) return null;
  const rows = [];
  for (let i = 0; i < kids.length; i += cols)
    rows.push(kids.slice(i, i + cols));
  const rowScope = { obj: {}, relative: true };
  const item = asTemplate(ctx, kids, rowScope, "items");
  const itemId = applyWeight(ctx, item.templateId, 1);
  const perItem = rowScope.obj.items;
  let key = "rows";
  for (let i = 2; key in scope.obj; i++) key = `rows_${i}`;
  let at = 0;
  const data = rows.map((r) => ({ items: r.map(() => perItem[at++]) }));
  const abs = (k) => (scope.relative ? k : `${scope.prefix}/${k}`);
  ctx.notes.add(
    `"${node.n}": ${cols}-column wrap grid → data pre-split into ${key}[].items (Row does not wrap)`,
  );
  // Full rows: one Row template over rows[].items, every item weight 1.
  const fullRows = (rowsData) => {
    scope.obj[key] = rowsData;
    const rowId = emit(ctx, newId(ctx, `${node.n} row`), "Row", {
      children: { path: "items", componentId: itemId },
    });
    return emit(ctx, newId(ctx, `${node.n} grid`), "Column", {
      children: { path: abs(key), componentId: rowId },
    });
  };
  const last = data.at(-1).items.length;
  if (last === cols) return fullRows(data);
  // An incomplete last row would stretch its items: emit it apart — items share `last` parts of `cols`,
  // an empty spacer takes the rest, so every card keeps 1/cols of the width.
  const lastKey = `${key}_last`;
  scope.obj[lastKey] = data.at(-1).items;
  const lastItems = applyWeight(ctx, emit(ctx, newId(ctx, `${node.n} last row`), "Row", {
    children: { path: abs(lastKey), componentId: itemId },
  }), last);
  const spacer = applyWeight(ctx, emit(ctx, newId(ctx, `${node.n} spacer`), "Column", { children: [] }), cols - last);
  const lastRow = emit(ctx, newId(ctx, `${node.n} last`), "Row", { children: [lastItems, spacer] });
  if (data.length === 1) return lastRow;
  const full = fullRows(data.slice(0, -1));
  return emit(ctx, newId(ctx, `${node.n} grid wrap`), "Column", { children: [full, lastRow] });
}

const textsOf = (n) =>
  n.c?.tx ?? (n.t === "Text" ? [n.tx] : (n.k ?? []).flatMap(textsOf));

/** Horizontal frame of equal-length vertical columns whose first cell is a header → rows. */
/** A column's cell list: descend through single-child wrappers to the vertical frame holding the cells. */
function cellsOf(col) {
  let n = col;
  while (n && (n.k?.length ?? 0) === 1) n = n.k[0];
  return n && n.lm === "V" && (n.k?.length ?? 0) >= 2 ? n.k : null;
}

/** Header cell: figma-map "table.header" ({from, value}), a header-ish variant value, or layer name. */
function isHeaderCell(ctx, cell) {
  const spec = ctx.map.table?.header;
  if (spec?.from) return cell.c?.p?.[spec.from] === spec.value;
  const HEAD = /head|title/i;
  return HEAD.test(cell.n) || Object.values(cell.c?.p ?? {}).some((v) => typeof v === "string" && HEAD.test(v));
}

export function detectTable(ctx, node, scope) {
  if (node.lm !== "H" || (node.k?.length ?? 0) < 2) return null;
  // Column-built table: a row of vertical cell lists of equal length (cells may sit inside wrappers).
  const lists = node.k.map(cellsOf);
  if (lists.some((l) => !l) || lists.some((l) => l.length !== lists[0].length)) return null;
  // Header row: most columns start with a header cell (a selection column's first cell may not look like one).
  const heads = lists.filter((l) => isHeaderCell(ctx, l[0])).length;
  if (heads < Math.ceil(lists.length / 2)) return null;
  const cols = node.k.map((c, i) => ({ ...c, k: lists[i] }));
  const minW = Math.min(...cols.map((c) => c.w));
  const weights = cols.map((c) => Math.max(1, Math.round(c.w / minW)));
  if (ctx.map.table?.as) return emitTable(ctx, node, scope, cols, weights);
  const headIds = cols.map((c, i) => {
    const t = textsOf(c.k[0])[0] ?? "";
    const id = emit(ctx, newId(ctx, `head ${t || i}`), "Text", {
      text: bindText(scope, `column_${i}`, t),
      variant: "caption",
    });
    return applyWeight(ctx, id, weights[i]);
  });
  const rowCount = cols[0].k.length - 1;
  const rowNodes = Array.from({ length: rowCount }, (_, r) => ({
    t: "Frame",
    n: "row",
    lm: "H",
    ca: "CENTER",
    k: cols.map((c) => c.k[r + 1]),
  }));
  const rowsScope = { obj: {}, relative: true };
  const tpl = asTemplate(ctx, rowNodes, rowsScope, "rows");
  const rowComp = ctx.components.find((c) => c.id === tpl.templateId);
  if (Array.isArray(rowComp.children))
    rowComp.children = rowComp.children.map((id, i) =>
      applyWeight(ctx, id, weights[i]),
    );
  let key = "rows";
  for (let i = 2; key in scope.obj; i++) key = `rows_${i}`;
  scope.obj[key] = rowsScope.obj.rows;
  const headRow = emit(ctx, newId(ctx, "table head"), "Row", {
    children: headIds,
  });
  const body = emit(ctx, newId(ctx, "table rows"), "Column", {
    children: {
      path: scope.relative ? key : `${scope.prefix}/${key}`,
      componentId: tpl.templateId,
    },
  });
  const table = emit(ctx, newId(ctx, "table"), "Column", {
    children: [headRow, body],
  });
  ctx.notes.add(
    `"${node.n}": column-built table (${cols.length} columns × ${rowCount} rows) → header Row + row template`,
  );
  return ctx.map.tableContainer
    ? emit(ctx, newId(ctx, "table card"), ctx.map.tableContainer, {
        child: table,
      })
    : table;
}
