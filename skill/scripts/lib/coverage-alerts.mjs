// Loud coverage alerts: design-system components the catalog should have offered.
// Evidence, strongest first: used in the team's designs (extracted Figma trees) > key page role > name only.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readTree } from "./figma/tree.mjs";

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");
const KEY_ROLE =
  /header|nav|breadcrumb|tab|dropdown|select|input|field|upload|table|modal|dialog|menu|search|icon|toast|tooltip|pagination/i;

/** Component-set usage counts across extracted Figma trees (<dir>/*.tree.json). */
export function figmaUsage(dir) {
  const usage = new Map();
  if (!dir || !existsSync(dir)) return usage;
  const walk = (n) => {
    if (!n) return;
    const name = n.c?.s ?? n.c?.n;
    if (name) usage.set(name, (usage.get(name) ?? 0) + 1);
    // Components nested inside an atomic (not expanded) instance — recorded by the extractor.
    for (const [nested, k] of Object.entries(n.c?.ns ?? {}))
      usage.set(nested, (usage.get(nested) ?? 0) + k);
    (n.k ?? []).forEach(walk);
  };
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".tree.json")))
    walk(readTree(join(dir, f)).tree);
  return usage;
}

/** Figma component-set name ↔ Storybook component name (tolerates "Page header"/"PageHeader", plurals, "Buttons/Button"). */
export function sameComponent(figmaName, dsName) {
  const a = norm(figmaName.split("/").pop());
  const b = norm(dsName);
  // Directional: the Figma name qualifies the DS name ("Input dropdown" → Input, Dropdown; "Page header"
  // → PageHeader), never the reverse ("Button" must not match ButtonGroup or LinkButton).
  // Suffix is the head noun ("Vertical tabs" → Tabs) so 3 chars suffice; prefixes need 4 ("Table header" ≠ Tabs).
  return (
    a === b ||
    (b.length >= 4 && a.startsWith(b)) ||
    (b.length >= 3 && a.endsWith(b))
  );
}

export function computeAlerts({
  ds,
  sources,
  dsNotInCatalog,
  excluded,
  usage,
  mappedFigma = new Set(),
}) {
  const alerts = [];
  const flagged = new Set();
  // 1. Used in designs, exists in Storybook, missing from the catalog.
  for (const c of dsNotInCatalog) {
    if (excluded[c.name]) continue;
    const hits = [...usage].filter(([f]) => sameComponent(f, c.name));
    const n = hits.reduce((a, [, k]) => a + k, 0);
    if (!n) continue;
    flagged.add(c.name);
    alerts.push({
      level: "high",
      component: c.name,
      text: `used ${n}× in your designs (Figma "${hits.map(([f]) => f).join('", "')}"), exists in Storybook, **missing from the catalog**`,
      action: `add ${c.name} to the catalog and map it in figma-map.json`,
    });
  }
  // 2. Used in designs, no Storybook component at all → DS gap (or compose it in the catalog, declared as tokens).
  const dsNames = ds.map((c) => c.name);
  for (const [f, n] of usage) {
    // "_Name" / ".Name" = private (unpublished) Figma components — building blocks, not DS components.
    if (n < 2 || mappedFigma.has(f) || /^[_.]/.test(f)) continue;
    if (dsNames.some((d) => sameComponent(f, d))) continue;
    alerts.push({
      level: "medium",
      component: f,
      text: `used ${n}× in your designs, **no Storybook component** by that name`,
      action:
        "design-system gap — compose it in the catalog (kind: tokens) or ask the DS team",
    });
  }
  // 3. Key page-role components never offered (no design evidence available).
  for (const c of dsNotInCatalog) {
    if (flagged.has(c.name) || excluded[c.name] || !KEY_ROLE.test(c.name))
      continue;
    alerts.push({
      level: "medium",
      component: c.name,
      text: "key page component in Storybook, never offered to the agent",
      action: "add it, or exclude it with a reason",
    });
  }
  // 4. Catalog entries rebuilt from tokens although the DS has a same-named component.
  for (const [name, s] of sources) {
    if (s.kind !== "tokens") continue;
    // A DS component excluded with a reason (unusable in A2UI) may be rebuilt from tokens — not an alert.
    const twin = dsNames.find((d) => sameComponent(name, d) && !excluded[d]);
    if (twin)
      alerts.push({
        level: "high",
        component: name,
        text: `rebuilt from tokens, but Storybook has **${twin}**`,
        action: `wrap ${twin} instead of re-creating it`,
      });
  }
  const rank = { high: 0, medium: 1 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function renderAlerts(alerts) {
  if (!alerts.length)
    return [
      "## 0. Alerts",
      "",
      "None — every design-system component the evidence points to is offered or excluded with a reason.",
      "",
    ];
  const L = [
    "## 0. Alerts — fix these first",
    "",
    "| Level | Component | Why | Action |",
    "|---|---|---|---|",
  ];
  alerts.forEach((a) =>
    L.push(
      `| ${a.level === "high" ? "🔴 high" : "🟠 medium"} | ${a.component} | ${a.text} | ${a.action} |`,
    ),
  );
  L.push("");
  return L;
}
