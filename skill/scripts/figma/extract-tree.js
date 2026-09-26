// Figma Plugin-API extractor — READ-ONLY. Walks one frame and returns a compact UI tree that
// `a2ui.mjs from-figma` converts to A2UI. Runs via the Figma MCP `use_figma` tool and is the same
// code a "Copy as A2UI" plugin would run. Substitute the three placeholders before running:
//   __NODE_ID__  frame id, e.g. "123:456"
//   __ATOMIC__   JSON array of component-set / component names from figma-map.json "components"
//                whose entry is atomic: the instance is emitted with its props + texts, not its insides
//   __SKIP__     JSON array of names from figma-map.json "skip" (app chrome etc.)
//
// Node shape (short keys — use_figma output is capped at ~20KB):
//   t type · n name · w/h size · lm layout (H|V|N) · pa/ca align (omitted when MIN) · g gap (omitted when 0)
//   wrap · gr layoutGrow · fill "h"/"v"/"hv" (layoutSizing FILL) · tx text · fs size · ts text style
//   c {s set, n component, p props, tx texts inside} · icon (small unnamed instance) · k children
const ROOT_ID = "__NODE_ID__";
const ATOMIC = new Set(__ATOMIC__);
const SKIP = new Set(__SKIP__);
const LEAF = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "ELLIPSE",
  "STAR",
  "POLYGON",
  "LINE",
  "RECTANGLE",
]);
const L = { HORIZONTAL: "H", VERTICAL: "V" };

function texts(node, out = []) {
  if (node.visible === false) return out;
  if (node.type === "TEXT") out.push(node.characters);
  else if ("children" in node) node.children.forEach((c) => texts(c, out));
  return out;
}
// For atomic instances: each text's layer name (tn) and the component set of its nearest nested
// instance (tp), so figma-map "fill" can find texts by name/set without the children; and the nested
// component sets with counts (ns), so the coverage gate still sees what the atomic instance contains.
async function textMeta(node, set, tn, tp, ns) {
  if (node.visible === false) return;
  if (node.type === "TEXT") { tn.push(node.name); tp.push(set || ""); return; }
  let here = set;
  if (node.type === "INSTANCE") {
    const m = await node.getMainComponentAsync();
    if (m) here = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent.name : m.name;
    if (here) ns.push(here); // nested components, counted by the coverage gate
  }
  if ("children" in node) for (const c of node.children) await textMeta(c, here, tn, tp, ns);
}

async function walk(node, depth) {
  if (node.visible === false) return null;
  const out = {
    t: node.type[0] + node.type.slice(1).toLowerCase(),
    n: node.name,
  };
  if ("width" in node) {
    out.w = Math.round(node.width);
    out.h = Math.round(node.height);
  }
  if ("layoutMode" in node && L[node.layoutMode]) {
    out.lm = L[node.layoutMode];
    if (node.primaryAxisAlignItems !== "MIN")
      out.pa = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems !== "MIN")
      out.ca = node.counterAxisAlignItems;
    if (node.itemSpacing) out.g = node.itemSpacing;
    if (node.layoutWrap === "WRAP") out.wrap = true;
  } else if ("children" in node && node.children?.length) out.lm = "N";
  if (node.layoutGrow) out.gr = node.layoutGrow;
  const fill =
    (node.layoutSizingHorizontal === "FILL" ? "h" : "") +
    (node.layoutSizingVertical === "FILL" ? "v" : "");
  if (fill) out.fill = fill;
  if (node.type === "TEXT") {
    out.tx = node.characters;
    if (typeof node.fontSize === "number") out.fs = node.fontSize;
    if (typeof node.textStyleId === "string" && node.textStyleId) {
      const style = await figma.getStyleByIdAsync(node.textStyleId);
      if (style) out.ts = style.name;
    }
    return out;
  }
  if (node.type === "INSTANCE") {
    const main = await node.getMainComponentAsync();
    const set =
      main && main.parent && main.parent.type === "COMPONENT_SET"
        ? main.parent.name
        : null;
    const name = main ? main.name : null;
    if (SKIP.has(set) || SKIP.has(name) || SKIP.has(node.name)) return null;
    if (!set && out.w <= 32 && out.h <= 32)
      return { t: "Icon", n: name || node.name, icon: true };
    const p = {};
    for (const [k, v] of Object.entries(node.componentProperties || {})) {
      if (v.type !== "INSTANCE_SWAP") p[k.replace(/#[^#]*$/, "")] = v.value;
    }
    out.c = { s: set, n: set ? undefined : name, p };
    if (ATOMIC.has(set) || ATOMIC.has(name)) {
      out.c.tx = texts(node);
      const meta = { tn: [], tp: [], ns: [] };
      if ("children" in node) for (const c of node.children) await textMeta(c, "", meta.tn, meta.tp, meta.ns);
      const counts = {};
      meta.ns.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
      if (meta.ns.length) out.c.ns = counts;
      if (meta.tn.some((n) => n !== "Text")) out.c.tn = meta.tn;
      if (meta.tp.some(Boolean)) out.c.tp = meta.tp;
      return out;
    }
  } else if (SKIP.has(node.name)) return null;
  if (LEAF.has(node.type) || depth > 40 || !("children" in node)) return out;
  const kids = [];
  for (const child of node.children) {
    const k = await walk(child, depth + 1);
    if (k) kids.push(k);
  }
  if (kids.length) out.k = kids;
  return out;
}

// Repeated identical subtrees (table cells, list rows) are stored once in "d" and referenced as
// { "$": i } — keeps real tables under the output cap. lib/figma/tree.mjs expands them.
function compact(tree) {
  const keyOf = new Map();
  const count = new Map();
  const key = (n) => {
    const k = JSON.stringify(n);
    keyOf.set(n, k);
    count.set(k, (count.get(k) || 0) + 1);
    (n.k || []).forEach(key);
  };
  key(tree);
  const d = [];
  const index = new Map();
  const put = (n) => {
    const k = keyOf.get(n);
    if (n !== tree && k.length >= 120 && count.get(k) >= 2) {
      if (!index.has(k)) {
        index.set(k, -1);
        const copy = { ...n, ...(n.k ? { k: n.k.map(put) } : {}) };
        index.set(k, d.length);
        d.push(copy);
      }
      return { $: index.get(k) };
    }
    return n.k ? { ...n, k: n.k.map(put) } : n;
  };
  const out = put(tree);
  return d.length ? { tree: out, d } : { tree: out };
}

const root = await figma.getNodeByIdAsync(ROOT_ID);
if (!root) throw new Error(`node ${ROOT_ID} not found`);
return {
  source: { figmaFile: figma.fileKey, node: ROOT_ID, frame: root.name },
  ...compact(await walk(root, 0)),
};
