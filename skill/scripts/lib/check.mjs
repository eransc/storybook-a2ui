// Validate one A2UI v0.9 run (message stream) against a catalog + guardrails.
// Returns { errors, warnings, usage, depth, count } — no rendering, pure data checks.

import { checkLimits, checkRequireBinding } from "./guardrails.mjs";

const FRAMEWORK_KEYS = new Set(["id", "component"]);
const REF_KEYS = ["child", "content", "trigger"];

/** Minimal JSON Pointer get/set for the data model. */
function pointer(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
}
function getAt(obj, path) {
  return pointer(path).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setAt(root, path, value) {
  const keys = pointer(path);
  if (!keys.length) return value;
  let o = root ?? {};
  const top = o;
  keys.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
  o[keys.at(-1)] = value;
  return top;
}
const resolvePath = (path, scope) =>
  path.startsWith("/") ? path : `${scope}/${path}`;

/** All {path} bindings inside a prop value (skips child-list templates). */
function bindings(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => bindings(v, out));
  else if (value && typeof value === "object") {
    if (typeof value.path === "string" && Object.keys(value).length === 1)
      out.push(value.path);
    else if (!("componentId" in value))
      Object.values(value).forEach((v) => bindings(v, out));
  }
  return out;
}

export function checkRun(run, catalog, guardrails = {}) {
  const errors = [];
  const warnings = [];
  const msgs = run.messages ?? [];
  const components = new Map();
  let data = {};

  // 1. Envelope
  msgs.forEach((m, i) => {
    if (m.version !== "v0.9")
      errors.push(`message ${i}: version must be "v0.9"`);
  });
  const create = msgs.find((m) => m.createSurface)?.createSurface;
  if (!create) errors.push("no createSurface message");
  else if (create.catalogId !== catalog.id)
    errors.push(
      `createSurface.catalogId "${create.catalogId}" ≠ catalog "${catalog.id}"`,
    );
  for (const m of msgs) {
    for (const c of m.updateComponents?.components ?? []) {
      if (components.has(c.id))
        warnings.push(`component id "${c.id}" redefined`);
      components.set(c.id, c);
    }
    if (m.updateDataModel)
      data = setAt(
        data,
        m.updateDataModel.path ?? "/",
        m.updateDataModel.value,
      );
  }
  if (!components.has("root")) errors.push('no component with id "root"');

  // 2. Per-component schema (strict: unknown props and bad enum values fail)
  const usage = {};
  for (const c of components.values()) {
    const api = catalog.apis.get(c.component);
    if (!api) {
      errors.push(
        `"${c.id}": unknown component "${c.component}" (not in catalog)`,
      );
      continue;
    }
    usage[c.component] = (usage[c.component] ?? 0) + 1;
    const props = Object.fromEntries(
      Object.entries(c).filter(([k]) => !FRAMEWORK_KEYS.has(k)),
    );
    const r = api.schema.safeParse(props);
    if (!r.success) {
      for (const iss of r.error.issues) {
        const where =
          iss.path.join(".") || (iss.keys ? iss.keys.join(",") : "");
        errors.push(`"${c.id}" (${c.component}) ${where}: ${iss.message}`);
      }
    }
    for (const prop of guardrails.requireProps?.[c.component] ?? []) {
      if (c[prop] === undefined)
        errors.push(`guardrail: "${c.id}" (${c.component}) must set "${prop}"`);
    }
    // Built-in a11y: a control with an empty label has no accessible name.
    if (c.label === "")
      warnings.push(
        `a11y: "${c.id}" (${c.component}) has an empty label — screen readers announce it with no name; bind or write a real label`,
      );
    if (guardrails.banned?.includes(c.component))
      errors.push(`guardrail: "${c.id}" uses banned ${c.component}`);
  }

  // 3. Tree walk from root: refs, cycles, depth, bindings (with template scope)
  const reached = new Set();
  let maxDepth = 0;
  const walk = (id, scope, depth, stack) => {
    const c = components.get(id);
    if (!c)
      return errors.push(
        `reference to missing component "${id}" (from "${stack.at(-1)}")`,
      );
    if (stack.includes(id))
      return errors.push(`cycle: ${[...stack, id].join(" → ")}`);
    reached.add(id);
    maxDepth = Math.max(maxDepth, depth);
    // scope only changes inside a template, so scope !== "" means "repeated per item".
    if (c.component === "Divider" && scope !== "")
      warnings.push(
        `"${id}": Divider inside a repeated template — it repeats per item, so the last item gets a trailing divider (use item borders or a Table instead)`,
      );
    const parent = components.get(stack.at(-1));
    for (const [p, ch] of guardrails.forbidNesting ?? []) {
      if (parent?.component === p && c.component === ch)
        errors.push(
          `guardrail: ${ch} "${id}" directly inside ${p} "${parent.id}"`,
        );
    }
    for (const b of bindings(
      Object.fromEntries(Object.entries(c).filter(([k]) => k !== "children")),
    )) {
      if (scope === null) continue; // inside an empty template: cannot check
      if (getAt(data, resolvePath(b, scope)) === undefined)
        warnings.push(
          `"${id}": binding "${b}" resolves to nothing (${resolvePath(b, scope)})`,
        );
    }
    const next = [...stack, id];
    for (const k of REF_KEYS)
      if (typeof c[k] === "string") walk(c[k], scope, depth + 1, next);
    for (const t of c.tabs ?? [])
      if (typeof t.child === "string") walk(t.child, scope, depth + 1, next);
    if (Array.isArray(c.children))
      c.children.forEach((ch) => walk(ch, scope, depth + 1, next));
    else if (c.children?.componentId) {
      const listPath = resolvePath(c.children.path, scope ?? "");
      const list = scope === null ? undefined : getAt(data, listPath);
      if (scope !== null && !Array.isArray(list))
        warnings.push(
          `"${id}": template path ${listPath} is not an array in the data model`,
        );
      const min = guardrails.preferTable;
      if (min && Array.isArray(list) && list.length >= min.minItems)
        warnings.push(
          `guardrail: "${id}" repeats ${list.length} items — prefer ${min.component}`,
        );
      walk(
        c.children.componentId,
        Array.isArray(list) && list.length ? `${listPath}/0` : null,
        depth + 1,
        next,
      );
    }
  };
  if (components.has("root")) walk("root", "", 1, []);

  for (const id of components.keys())
    if (!reached.has(id))
      warnings.push(`orphan component "${id}" (unreachable from root)`);
  if (guardrails.maxDepth && maxDepth > guardrails.maxDepth)
    errors.push(
      `guardrail: tree depth ${maxDepth} > maxDepth ${guardrails.maxDepth}`,
    );
  if (guardrails.maxComponents && components.size > guardrails.maxComponents)
    errors.push(
      `guardrail: ${components.size} components > maxComponents ${guardrails.maxComponents}`,
    );

  // v1.1 guardrails (see guardrails.mjs)
  const binding = checkRequireBinding(components, data, guardrails.requireBinding);
  errors.push(...binding.errors, ...checkLimits(components, guardrails).errors);
  warnings.push(...binding.warnings);

  return { errors, warnings, usage, depth: maxDepth, count: components.size };
}
