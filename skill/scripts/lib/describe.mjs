// Render a zod-based A2UI catalog as compact text an agent can read before authoring.
const REF = /^REF:[^|]*\|?/;

function clean(desc) {
  const d = desc ? desc.replace(REF, "").trim() : "";
  return /^Represents a/.test(d) ? "" : d;
}

const shapeOf = (s) =>
  s?._def?.typeName === "ZodObject" ? s._def.shape() : null;
const isBinding = (s) => {
  const shape = shapeOf(s);
  return !!shape && Object.keys(shape).length === 1 && "path" in shape;
};
const isAction = (s) =>
  !!shapeOf(s) && ("event" in shapeOf(s) || "functionCall" in shapeOf(s));
const isTemplate = (s) => !!shapeOf(s) && "componentId" in shapeOf(s);

export function isOptional(schema) {
  return schema?.isOptional?.() ?? false;
}

/** Short human type for a zod (v3) schema. */
export function typeOf(schema) {
  const def = schema?._def;
  if (!def) return "unknown";
  switch (def.typeName) {
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable":
      return typeOf(def.innerType);
    case "ZodEffects":
      return typeOf(def.schema);
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodAny":
      return "any";
    case "ZodEnum":
      return def.values.map((v) => `'${v}'`).join(" | ");
    case "ZodLiteral":
      return JSON.stringify(def.value);
    case "ZodArray":
      return `${typeOf(def.type)}[]`;
    case "ZodRecord":
      return `record<${typeOf(def.valueType)}>`;
    case "ZodObject":
      return `{ ${Object.entries(def.shape())
        .map(([k, v]) => `${k}${isOptional(v) ? "?" : ""}: ${typeOf(v)}`)
        .join("; ")} }`;
    case "ZodUnion": {
      const opts = def.options;
      if (opts.some(isTemplate)) return "id[] | {path, componentId}";
      if (opts.every(isAction)) return "{event:{name, context?}}";
      if (opts.some(isBinding)) {
        // Dynamic value: a literal OR a data binding. Function calls omitted for brevity.
        const literals = opts
          .filter((o) => o._def.typeName !== "ZodObject")
          .map(typeOf);
        return `${literals.join(" | ") || "value"} | {path}`;
      }
      return opts.map(typeOf).join(" | ");
    }
    default:
      return def.typeName.replace("Zod", "").toLowerCase();
  }
}

/** Keys the framework adds to every component; noise for an author. */
const HIDDEN = new Set([
  "accessibility",
  "weight",
  "checks",
  "isValid",
  "validationErrors",
]);

function objectShape(schema) {
  let s = schema;
  while (s && s._def.typeName !== "ZodObject")
    s = s._def.innerType ?? s._def.schema;
  return s ? s._def.shape() : {};
}

export function describeCatalog({ id, apis }) {
  const lines = [
    `# A2UI catalog ${id}`,
    "",
    `${apis.size} components. Only these names are allowed.`,
    "",
  ];
  for (const api of apis.values()) {
    const desc = clean(api.schema.description);
    lines.push(`## ${api.name}${desc ? ` — ${desc}` : ""}`);
    for (const [key, prop] of Object.entries(objectShape(api.schema))) {
      if (HIDDEN.has(key)) continue;
      const rawDesc =
        prop.description ?? prop._def?.innerType?.description ?? "";
      const type =
        /ComponentId/.test(rawDesc) || key === "child" ? "id" : typeOf(prop);
      const pd = clean(rawDesc);
      lines.push(
        `- \`${key}\`${isOptional(prop) ? "?" : ""}: ${type}${pd ? ` — ${pd.slice(0, 180)}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
