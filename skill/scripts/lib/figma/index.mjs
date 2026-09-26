// figmaToPattern: extracted Figma tree + project figma-map.json → A2UI pattern (see references/figma-to-a2ui.md).
import { createContext, convert } from "./convert.mjs";

/** Rename a component id everywhere it is referenced. */
function renameId(components, from, to) {
  const fix = (v) => (v === from ? to : v);
  for (const c of components) {
    if (c.id === from) c.id = to;
    for (const k of ["child", "content", "trigger"]) if (c[k] !== undefined) c[k] = fix(c[k]);
    if (Array.isArray(c.children)) c.children = c.children.map(fix);
    else if (c.children?.componentId) c.children.componentId = fix(c.children.componentId);
    if (Array.isArray(c.tabs)) c.tabs.forEach((t) => (t.child = fix(t.child)));
  }
}

const refCount = (components, id) =>
  components.reduce(
    (n, c) =>
      n +
      (Array.isArray(c.children) ? c.children.filter((x) => x === id).length : 0) +
      (c.child === id ? 1 : 0) +
      (c.children?.componentId === id ? 1 : 0),
    0,
  );

/** Merge a plain Row/Column (children only) into a same-type parent: Figma nests many wrapper frames. */
function simplify(components) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const isPlain = (c) =>
    (c.component === "Row" || c.component === "Column") && Array.isArray(c.children) && Object.keys(c).length === 3;
  let changed = true;
  while (changed) {
    changed = false;
    for (const parent of components) {
      if (!Array.isArray(parent.children) || !byId.has(parent.id)) continue;
      parent.children = parent.children.flatMap((id) => {
        const child = byId.get(id);
        if (child && child.id !== "root" && isPlain(child) && child.component === parent.component && refCount(components, id) === 1) {
          changed = true;
          byId.delete(id);
          return child.children;
        }
        return [id];
      });
    }
    for (let i = components.length - 1; i >= 0; i--) if (!byId.has(components[i].id)) components.splice(i, 1);
  }
}

export function figmaToPattern({ tree, source }, map, name, acceptsWeight, dsNames) {
  const ctx = createContext(map, acceptsWeight);
  ctx.dsNames = dsNames;
  const exampleData = {};
  const rootId = convert(ctx, tree, { obj: exampleData, relative: false, prefix: "" });
  if (!rootId) throw new Error("nothing convertible in this frame");
  renameId(ctx.components, rootId, "root");
  simplify(ctx.components);
  return {
    name,
    whenToUse: "TODO: describe the job this page does and its regions, so an agent can choose it",
    source,
    components: ctx.components,
    exampleData,
    notExpressible: [...ctx.notes],
    conversion: { tool: "a2ui.mjs from-figma", usage: ctx.usage },
  };
}
