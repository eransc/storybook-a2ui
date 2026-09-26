// Map one Figma component instance to catalog components using figma-map.json "components".
// Returns: an id, null (skipped/unsupported — noted), or undefined (no mapping → caller decomposes it).
import { emit, newId, bindText, convertContainer, slug } from "./convert.mjs";
import { sameComponent } from "../coverage-alerts.mjs";
import { resolveFill } from "./fill.mjs";

export function entryFor(ctx, node) {
  const comps = ctx.map.components ?? {};
  let entry = comps[node.c.s] ?? comps[node.c.n] ?? comps[node.n];
  // "byProp": pick a sub-entry from a variant value, e.g. { "Style": { "Toggle only": {...} } }
  while (entry?.byProp) {
    const [prop, cases] = Object.entries(entry.byProp)[0];
    entry = cases[node.c.p?.[prop]] ?? entry.default;
  }
  return entry;
}

/** "from"/"map"/"const" prop spec → value. */
export function propValue(spec, node) {
  if (spec == null) return undefined;
  if (typeof spec !== "object") return spec;
  if ("const" in spec) return spec.const;
  const raw = node.c.p?.[spec.from];
  return spec.map ? (spec.map[raw] ?? spec.default) : raw;
}

const initials = (s) =>
  String(s ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export function mapInstance(ctx, node, scope) {
  const entry = entryFor(ctx, node);
  const label = node.c.s ?? node.c.n ?? node.n;
  // A Figma component with a same-named Storybook component should be exposed, not decomposed.
  const twin = (entry === undefined || entry.container !== undefined) && ctx.dsNames?.find((d) => sameComponent(label, d));
  if (twin) ctx.notes.add(`"${label}" is a Storybook component (${twin}) — expose ${twin} in the catalog and map it, instead of decomposing it`);
  if (entry === undefined) {
    ctx.notes.add(`"${label}" has no figma-map entry — decomposed into layout`);
    return undefined;
  }
  if (entry.skip) return null;
  if (entry.unsupported) {
    ctx.notes.add(`"${label}": ${entry.unsupported}`);
    return null;
  }
  if (entry.container !== undefined) {
    return convertContainer(
      ctx,
      node,
      scope,
      entry.container === true ? undefined : entry.container,
    );
  }
  const texts =
    node.c.tx ?? (node.k ?? []).filter((k) => k.t === "Text").map((k) => k.tx);
  const props = {};
  for (const [k, spec] of Object.entries(entry.props ?? {})) {
    const v = propValue(spec, node);
    if (v !== undefined) props[k] = v;
  }
  const base = slug(label);
  switch (entry.as) {
    case "Text": {
      if (!texts.length) return null;
      if (entry.join)
        return emit(ctx, newId(ctx, base), "Text", {
          text: bindText(scope, base, texts.join(entry.join)),
          variant: entry.variant ?? "caption",
        });
      const head = emit(ctx, newId(ctx, base), "Text", {
        text: bindText(scope, base, texts[0]),
        variant: entry.variant ?? "body",
      });
      if (texts.length === 1) return head;
      const rest = texts
        .slice(1)
        .map((t, i) =>
          emit(ctx, newId(ctx, `${base} hint`), "Text", {
            text: bindText(scope, `${base}_hint${i || ""}`, t),
            variant: entry.restVariant ?? "caption",
          }),
        );
      return emit(ctx, newId(ctx, `${base} group`), "Column", {
        children: [head, ...rest],
      });
    }
    case "Button": {
      const text = entry.label ?? texts[0] ?? label;
      const labelId = emit(ctx, newId(ctx, `${base} label`), "Text", {
        text: bindText(scope, `${base}_label`, text),
      });
      return emit(ctx, newId(ctx, base), "Button", {
        child: labelId,
        action: { event: { name: slug(text) } },
        ...props,
      });
    }
    case "Buttons": {
      const ids = texts.map((t) => {
        const l = emit(ctx, newId(ctx, `${base} label`), "Text", {
          text: bindText(scope, `${base}_label`, t),
        });
        return emit(ctx, newId(ctx, base), "Button", {
          child: l,
          action: { event: { name: slug(t) } },
          ...props,
        });
      });
      return ids.length
        ? emit(
            ctx,
            newId(ctx, `${base} list`),
            entry.direction === "row" ? "Row" : "Column",
            { children: ids },
          )
        : null;
    }
    case "Avatar":
      return emit(ctx, newId(ctx, base), "Avatar", {
        initials: bindText(
          scope,
          `${base}_initials`,
          initials(texts[0] ?? scope.nearText),
        ),
        ...props,
      });
    case "Badge":
      return texts.length
        ? emit(ctx, newId(ctx, base), "Badge", {
            text: bindText(scope, base, texts[0]),
            ...props,
          })
        : null;
    case "TextField":
    case "Toggle":
    case "CheckBox": {
      const isField = entry.as === "TextField";
      const own = isField ? undefined : texts[0];
      // The row's label, bound to the same data as the visible label Text (not a copied literal).
      const rowLabel = scope.rowLabelPath ?? scope.rowLabel;
      // Figma hides the component's own label (boolean prop "Label" / "Show label" = false) and the row
      // shows it instead: no visible label, the row label becomes the accessible name.
      const hidden = Object.entries(node.c.p ?? {}).some(
        ([k, v]) => /^(show )?label$/i.test(k) && (v === false || v === "False"),
      );
      const labelProps =
        entry.label !== undefined
          ? { label: entry.label }
          : own
            ? { label: bindText(scope, `${base}_label`, own) }
            : hidden && rowLabel
              ? { label: "", accessibility: { label: rowLabel } }
              : { label: rowLabel ?? label };
      const value = isField
        ? entry.value !== undefined
          ? entry.value
          : bindText(scope, `${base}_value`, texts[0] ?? "")
        : bindText(scope, `${base}_on`, entry.on ?? true);
      return emit(ctx, newId(ctx, base), entry.as, { ...labelProps, value, ...props });
    }
    default:
      // Any other catalog component (e.g. a DS extension): static props + "fill" from inside the instance.
      return emit(ctx, newId(ctx, base), entry.as, { ...props, ...resolveFill(ctx, node, scope, entry.fill, base) });
  }
}
