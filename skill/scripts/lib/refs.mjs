// Child references of one component, for ANY prop: standard (child, children, content, trigger, tabs[].child)
// and extension slots (e.g. a header's `actions`). A prop is a slot when its value is a component id,
// a list of component ids, or a template { path, componentId }.
const SKIP = new Set(["id", "component", "action"]);

/** → { refs: [{ prop, id }], templates: [{ prop, path, componentId }], tabs: [id] } */
export function childRefs(c, components) {
  const refs = [];
  const templates = [];
  const isId = (v) => typeof v === "string" && components.has(v) && v !== c.id;
  for (const [prop, v] of Object.entries(c)) {
    if (SKIP.has(prop)) continue;
    if (isId(v)) refs.push({ prop, id: v });
    else if (Array.isArray(v) && v.length && v.every(isId))
      v.forEach((id) => refs.push({ prop, id }));
    else if (v && typeof v === "object" && typeof v.componentId === "string" && typeof v.path === "string")
      templates.push({ prop, path: v.path, componentId: v.componentId });
  }
  const tabs = (Array.isArray(c.tabs) ? c.tabs : []).map((t) => t?.child).filter(isId);
  return { refs, templates, tabs };
}
