// Figma UI tree (from scripts/figma/extract-tree.js) → A2UI pattern. Design-system-agnostic:
// everything DS-specific comes from the project's figma-map.json (see references/figma-to-a2ui.md).
import { mapInstance } from "./instances.mjs";
import { detectTable, detectGrid, detectRepeats } from "./structures.mjs";

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "x";
const JUSTIFY = { CENTER: "center", MAX: "end", SPACE_BETWEEN: "spaceBetween" };
const ALIGN = { CENTER: "center", MAX: "end" };

export function createContext(map, acceptsWeight = () => true) {
  return { map, acceptsWeight, components: [], ids: new Set(), notes: new Set(), usage: {} };
}

/** Give a component a weight; if its catalog schema has no `weight`, wrap it in a weighted Column. */
export function applyWeight(ctx, id, weight) {
  const comp = ctx.components.find((c) => c.id === id);
  if (!comp || !weight) return id;
  if (ctx.acceptsWeight(comp.component)) {
    comp.weight = weight;
    return id;
  }
  return emit(ctx, newId(ctx, `${id} slot`), "Column", { children: [id], weight });
}

export function newId(ctx, base) {
  let id = slug(base);
  for (let i = 2; ctx.ids.has(id); i++) id = `${slug(base)}_${i}`;
  ctx.ids.add(id);
  return id;
}

export function emit(ctx, id, component, props = {}) {
  ctx.components.push({ id, component, ...props });
  ctx.usage[component] = (ctx.usage[component] ?? 0) + 1;
  return id;
}

/** A text slot: writes the value into the current data scope and returns its binding. */
export function bindText(scope, name, value) {
  let key = slug(name);
  for (let i = 2; key in scope.obj; i++) key = `${slug(name)}_${i}`;
  scope.obj[key] = value;
  return { path: scope.relative ? key : `${scope.prefix}/${key}` };
}

export function textVariant(ctx, node) {
  const byStyle = ctx.map.textStyles?.[node.ts];
  if (byStyle) return byStyle;
  const fs = node.fs ?? 14;
  return fs >= 28
    ? "h1"
    : fs >= 24
      ? "h2"
      : fs >= 20
        ? "h3"
        : fs >= 18
          ? "h4"
          : fs >= 16
            ? "body"
            : "caption";
}

const isDivider = (n) => /divider/i.test(n.n) && (n.h <= 2 || n.w <= 2) && !n.k;

/** Weights for the children of a Row from Figma FILL/grow widths (small integers, omitted if all equal). */
function rowWeights(kids) {
  const grow = kids.map((k) =>
    k.gr || (k.fill ?? "").includes("h") ? k.w || 1 : 0,
  );
  const growing = grow.filter(Boolean);
  if (!growing.length) return kids.map(() => undefined);
  const min = Math.min(...growing);
  const w = grow.map((g) => (g ? Math.max(1, Math.round(g / min)) : undefined));
  const vals = w.filter(Boolean);
  return vals.length > 1 && vals.every((v) => v === vals[0])
    ? w.map((v) => (v ? 1 : undefined))
    : w;
}

/** Convert one node; returns the A2UI component id, or null if it produced nothing. */
export function convert(ctx, node, scope) {
  if (!node) return null;
  if (node.icon) {
    // figma-map "icons": { "as": "Icon", "prop": "name", "names": { "<Figma icon>": "<catalog name>" }, "default"? }
    const icons = ctx.map.icons;
    const figmaName = node.c?.n ?? node.n;
    const name = icons?.names?.[figmaName] ?? icons?.default;
    if (icons?.as && name)
      return emit(ctx, newId(ctx, `icon ${figmaName}`), icons.as, { [icons.prop ?? "name"]: name });
    ctx.notes.add(`icon "${figmaName}" skipped — add it to figma-map.json "icons.names"`);
    return null;
  }
  if (node.t === "Text") {
    return emit(ctx, newId(ctx, node.n), "Text", {
      text: bindText(scope, node.n, node.tx),
      variant: textVariant(ctx, node),
    });
  }
  if (isDivider(node)) return emit(ctx, newId(ctx, "divider"), "Divider");
  if (node.c) {
    const mapped = mapInstance(ctx, node, scope);
    if (mapped !== undefined) return mapped; // handled (id, or null when unsupported/skipped)
  }
  if (!node.c && node.t !== "Instance") noteDetached(ctx, node);
  return convertContainer(ctx, node, scope);
}

/** A plain frame named like a component (Storybook or figma-map) is usually a detached instance. */
function noteDetached(ctx, node) {
  const known = [...(ctx.dsNames ?? []), ...Object.keys(ctx.map.components ?? {})];
  // Exact name only ("Input" ↔ Input): composite frames ("Avatar and text", "Input fields") are not detached.
  const key = (x) => String(x).split("/").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = known.find((k) => key(node.n) === key(k));
  if (hit)
    ctx.notes.add(
      `"${node.n}" is a plain frame named like the "${hit}" component — probably a detached instance; it renders as loose layout. Re-link it in Figma (or map the frame name) and re-extract`,
    );
}

const isLabelLike = (ctx, n) => {
  if (n.t === "Text") return true;
  const entry = n.c && (ctx.map.components?.[n.c.s] ?? ctx.map.components?.[n.c.n]);
  return entry?.as === "Text";
};
const firstText = (n) => (n.t === "Text" ? n.tx : (n.c?.tx?.[0] ?? (n.k ?? []).map(firstText).find(Boolean)));

/** The {path} of the first Text under a converted component (a label, or a label + hint group). */
function firstTextBinding(ctx, id) {
  const c = ctx.components.find((x) => x.id === id);
  if (!c) return undefined;
  if (c.component === "Text") return c.text?.path ? c.text : undefined;
  const kids = Array.isArray(c.children) ? c.children : c.child ? [c.child] : [];
  for (const k of kids) {
    const b = firstTextBinding(ctx, k);
    if (b) return b;
  }
  return undefined;
}

export function convertContainer(ctx, node, scope, wrapIn) {
  const kids = (node.k ?? []).filter(Boolean);
  if (!kids.length) return null;
  // Context for children: nearby text (avatar initials) and, in a Row, the row's label (form fields).
  const saved = { nearText: scope.nearText, rowLabel: scope.rowLabel, rowLabelPath: scope.rowLabelPath };
  scope.nearText = firstText(node) ?? scope.nearText;
  // A Row's label = its first child when that child is text-like (plain text or a component mapped
  // to Text, e.g. a "section label"); a row of two inputs keeps the parent row's label.
  const labelled = node.lm === "H" && kids.length > 1 && isLabelLike(ctx, kids[0]);
  if (labelled) {
    scope.rowLabel = firstText(kids[0]) ?? scope.rowLabel;
    scope.rowLabelPath = undefined; // set once the label is converted (convertChildren)
  }
  try {
    return convertChildren(ctx, node, kids, scope, wrapIn);
  } finally {
    scope.nearText = saved.nearText;
    scope.rowLabel = saved.rowLabel;
    scope.rowLabelPath = saved.rowLabelPath;
  }
}

function convertChildren(ctx, node, kids, scope, wrapIn) {
  if (node.lm === "N" && kids.length > 1)
    ctx.notes.add(`"${node.n}" has no auto-layout — rendered as a Column`);

  const special = detectTable(ctx, node, scope) ?? detectGrid(ctx, node, scope);
  if (special) return special;

  const childIds = [];
  const weights =
    node.lm === "H" ? rowWeights(kids) : kids.map(() => undefined);
  for (const run of detectRepeats(kids, node.lm)) {
    const ids = run.template
      ? [run.template(ctx, scope)]
      : [convert(ctx, run.node, scope)];
    // The row's label was just converted: fields in this row bind their label to the same data.
    if (node.lm === "H" && run.node === kids[0] && isLabelLike(ctx, kids[0]) && ids[0])
      scope.rowLabelPath = firstTextBinding(ctx, ids[0]);
    ids.forEach((id) => {
      if (!id) return;
      const w = run.node ? weights[kids.indexOf(run.node)] : undefined;
      childIds.push(w ? applyWeight(ctx, id, w) : id);
    });
  }
  const real = childIds.filter(Boolean);
  if (!real.length) return null;
  if (real.length === 1 && !wrapIn) return real[0]; // flatten pure wrappers
  const component = node.lm === "H" ? "Row" : "Column";
  const props = { children: real };
  if (JUSTIFY[node.pa]) props.justify = JUSTIFY[node.pa];
  // Figma centers/ends children that FILL the cross axis anyway; in A2UI that would shrink them.
  const crossFill = node.lm === "H" ? "v" : "h";
  const fillsCross = kids.filter((k) => (k.fill ?? "").includes(crossFill)).length >= Math.ceil(kids.length / 2);
  if (ALIGN[node.ca] && !fillsCross) props.align = ALIGN[node.ca];
  // Figma's default is top/start; catalogs differ (some Rows center by default) — say it explicitly.
  else if (node.lm === "H" && !node.ca && !fillsCross) props.align = "start";
  if (wrapIn && real.length === 1) return emit(ctx, newId(ctx, `${node.n} ${wrapIn}`), wrapIn, { child: real[0] });
  const layoutId = emit(ctx, newId(ctx, node.n), component, props);
  if (!wrapIn) return layoutId;
  return emit(ctx, newId(ctx, `${node.n} ${wrapIn}`), wrapIn, {
    child: layoutId,
  });
}

export { slug };
