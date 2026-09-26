// v1.1 guardrails: `limits` (e.g. one primary Button per section) and `requireBinding`
// (data must be bound with {path}, not copied into the UI as literals).
//
//   "limits": [{ "component": "Button", "where": { "variant": "primary" }, "max": 1, "per": "section" }]
//   "sectionBoundaries": ["Card", "Tabs"]            // default; root and template items always count
//   "requireBinding": { "props": { "<TableComponent>": ["rows"] }, "flagCopiedData": true }
import { childRefs } from "./refs.mjs";

const isBinding = (v) =>
  !!v && typeof v === "object" && typeof v.path === "string";

/** Every primitive string in the data model (≥ 3 chars), for "copied data" detection. */
function dataStrings(data, out = new Set()) {
  if (typeof data === "string" && data.trim().length >= 3) out.add(data.trim());
  else if (Array.isArray(data)) data.forEach((v) => dataStrings(v, out));
  else if (data && typeof data === "object")
    Object.values(data).forEach((v) => dataStrings(v, out));
  return out;
}

/** Literal strings in a component's props (skips bindings, child refs, actions). */
function literalStrings(c) {
  const out = [];
  for (const [k, v] of Object.entries(c)) {
    if (
      [
        "id",
        "component",
        "child",
        "children",
        "action",
        "variant",
        "kind",
        "type",
      ].includes(k)
    )
      continue;
    if (typeof v === "string") out.push([k, v]);
  }
  return out;
}

export function checkRequireBinding(components, data, rule) {
  const errors = [];
  const warnings = [];
  if (!rule) return { errors, warnings };
  for (const c of components.values()) {
    for (const prop of rule.props?.[c.component] ?? []) {
      if (c[prop] !== undefined && !isBinding(c[prop]))
        errors.push(
          `guardrail: "${c.id}" (${c.component}).${prop} must be bound with {"path": ...}, not a literal`,
        );
    }
  }
  if (rule.flagCopiedData !== false) {
    const values = dataStrings(data);
    for (const c of components.values())
      for (const [prop, v] of literalStrings(c))
        if (values.has(v.trim()))
          warnings.push(
            `guardrail: "${c.id}".${prop} = "${v}" is copied from the data — bind it with {"path": ...} so it updates with the data`,
          );
  }
  return { errors, warnings };
}

const matches = (c, lim) =>
  c.component === lim.component &&
  Object.entries(lim.where ?? {}).every(([k, v]) => c[k] === v);

/**
 * Count limited components per section. A section starts at: the root, any
 * `sectionBoundaries` component (default Card, Tabs), each Tabs panel, and each
 * repeated template item (every repetition is its own section).
 */
export function checkLimits(components, guardrails) {
  const errors = [];
  const limits = guardrails.limits ?? [];
  if (!limits.length || !components.has("root")) return { errors };
  const boundaries = new Set(guardrails.sectionBoundaries ?? ["Card", "Tabs"]);
  const counts = new Map(); // `${limitIndex}|${sectionId}` -> ids
  const seen = new Set();

  const visit = (id, section) => {
    const c = components.get(id);
    if (!c || seen.has(`${id}|${section}`)) return;
    seen.add(`${id}|${section}`);
    const here = boundaries.has(c.component) ? id : section;
    limits.forEach((lim, i) => {
      if (lim.per !== "surface" && matches(c, lim)) {
        const key = `${i}|${here}`;
        counts.set(key, [...(counts.get(key) ?? []), id]);
      }
    });
    const { refs, templates, tabs } = childRefs(c, components);
    refs.forEach((r) => visit(r.id, here));
    tabs.forEach((t) => visit(t, t)); // each panel
    templates.forEach((t) => visit(t.componentId, t.componentId)); // each item
  };
  visit("root", "root");

  limits.forEach((lim, i) => {
    const label = `${lim.component}${lim.where ? ` ${JSON.stringify(lim.where)}` : ""}`;
    if (lim.per === "surface") {
      const all = [...components.values()]
        .filter((c) => matches(c, lim))
        .map((c) => c.id);
      if (all.length > lim.max)
        errors.push(
          `guardrail: ${all.length} × ${label} on the surface (max ${lim.max}): ${all.join(", ")}`,
        );
      return;
    }
    for (const [key, ids] of counts) {
      if (!key.startsWith(`${i}|`) || ids.length <= lim.max) continue;
      errors.push(
        `guardrail: ${ids.length} × ${label} in section "${key.split("|")[1]}" (max ${lim.max}): ${ids.join(", ")}`,
      );
    }
  });
  return { errors };
}
