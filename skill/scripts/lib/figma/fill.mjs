// "fill": populate an extension component's props from inside the Figma instance.
// Every text value goes into the pattern's data model (bound with {path}); slot props get converted ids.
//
//   { "text": 0 }                         i-th text inside the instance (document order)
//   { "textNamed": "Supporting text" }    first text layer with that name
//   { "textsOf": "Breadcrumbs" }          all texts under every layer / component set with that name (array)
//   { "instancesOf": ["Buttons/Button"] } every descendant instance of those sets, converted → child ids (slot)
//   { "childOf": "Actions" }              the first descendant with that layer name, converted → one child id
//   { "from": "<variant prop>", "map": {…}, "default": … } / { "const": v }   same as "props"
import { convert, bindText } from "./convert.mjs";

const nameOf = (n) => n.c?.s ?? n.c?.n ?? n.n;

function find(node, pred) {
  for (const k of node.k ?? []) {
    if (pred(k)) return k;
    const hit = find(k, pred);
    if (hit) return hit;
  }
  return null;
}
function findAll(node, pred, out = []) {
  for (const k of node.k ?? []) {
    if (pred(k)) out.push(k);
    else findAll(k, pred, out);
  }
  return out;
}
/** Every text under a node with the layer + component-set names above it (works on atomic instances
 * too, via the extractor's c.tn / c.tp). */
function textEntries(node, path = [], out = []) {
  const here = [...path, node.n, node.c?.s ?? node.c?.n].filter(Boolean);
  if (node.t === "Text") out.push({ tx: node.tx, name: node.n, path: here });
  else if (node.c?.tx)
    node.c.tx.forEach((tx, i) =>
      out.push({ tx, name: node.c.tn?.[i] ?? "", path: [...here, node.c.tp?.[i]].filter(Boolean) }),
    );
  else (node.k ?? []).forEach((k) => textEntries(k, here, out));
  return out;
}

export function resolveFill(ctx, node, scope, fill, base) {
  const props = {};
  for (const [prop, spec] of Object.entries(fill ?? {})) {
    let value;
    const entries = textEntries(node);
    if ("text" in spec) value = entries[spec.text]?.tx;
    else if (spec.textNamed) value = entries.find((e) => e.name === spec.textNamed)?.tx;
    else if (spec.textsOf) {
      // ALL texts under every layer / component set with that name (e.g. each menu item's label).
      const hits = entries.filter((e) => e.path.includes(spec.textsOf)).map((e) => e.tx);
      value = hits.length ? hits : undefined;
    } else if (spec.instancesOf) {
      const sets = new Set([].concat(spec.instancesOf));
      const ids = findAll(node, (k) => sets.has(nameOf(k)))
        .map((k) => convert(ctx, k, scope))
        .filter(Boolean);
      if (ids.length) props[prop] = ids;
      continue;
    } else if (spec.childOf) {
      const hit = find(
        node,
        (k) => k.n === spec.childOf || nameOf(k) === spec.childOf,
      );
      const id = hit ? convert(ctx, hit, scope) : null;
      if (id) props[prop] = id;
      continue;
    } else if ("const" in spec) value = spec.const;
    else if (spec.from)
      value = spec.map
        ? (spec.map[node.c?.p?.[spec.from]] ?? spec.default)
        : node.c?.p?.[spec.from];
    if (value === undefined || value === null || value === "") {
      if (!("const" in spec))
        ctx.notes.add(`fill "${prop}" of "${node.c?.s ?? node.n}": ${JSON.stringify(spec)} found nothing`);
      continue;
    }
    props[prop] =
      typeof value === "string" || Array.isArray(value)
        ? bindText(scope, `${base}_${prop}`, value)
        : value;
  }
  return props;
}
