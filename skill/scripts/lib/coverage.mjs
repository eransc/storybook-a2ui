// Catalog coverage: compare the design system (Storybook index) with the A2UI catalog
// and the agent's runs, and turn every gap into an action the user can take.
//
// Optional exports from catalog.schema.ts sharpen the report:
//   CATALOG_SOURCES     { [a2uiName]: { kind: 'ds' | 'tokens', component?: 'DsName', note?: string } }
//   CATALOG_EXCLUDED    { [DsComponent]: 'reason it is not offered to the agent' }
//   CATALOG_LIMITATIONS [ 'known thing the agent cannot express → what to do' ]

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const wordRe = (name) =>
  new RegExp(
    `(^|[^A-Za-z0-9])${name.replace(/[^A-Za-z0-9]/g, "")}([^A-Za-z0-9]|$)`,
    // Case-SENSITIVE: component names are PascalCase; "row selection" must not match Row.
    "",
  );

/**
 * Design-system components from a Storybook index.json. Prefer each story's
 * `componentPath` (the real component file); story titles nest arbitrarily
 * (Carbon: "Components/DataTable/Basic"), so the title is only a fallback.
 */
export function dsComponentsFromIndex(index, section = "A2UI Playground") {
  const stories = Object.values(index.entries ?? index.stories ?? {}).filter(
    (e) => (!e.type || e.type === "story") && !e.title.startsWith(section),
  );
  const segs = (title) => title.split("/").map((x) => norm(x));
  // Name from componentPath, accepted only when it also appears in the story title.
  // Rejects package barrels (Vibe: every story → @vibe/core/dist/src/index.js → "src").
  const fromPath = (e) => {
    if (!e.componentPath) return null;
    const parts = e.componentPath.split("/");
    const file = parts.pop().replace(/\.[^.]+$/, "");
    const name = file === "index" ? parts.pop() : file;
    if (!name) return null;
    const n = norm(name);
    // Loose on purpose: "Notification" ⊂ "Notifications", "DatePicker" ⊂ "preview__DatePicker".
    const inTitle = segs(e.title).some((t) => n.length >= 3 && (t.includes(n) || (t.length >= 3 && n.includes(t))));
    return inTitle ? name : null;
  };
  const named = stories.map((e) => ({ e, name: fromPath(e) }));
  // If most stories resolve by path, path-less leftovers are variants/docs
  // (Carbon: ".../Feature Flag"), not components — skip them.
  const pathRatio = named.filter((x) => x.name).length / Math.max(1, named.length);
  const byName = new Map();
  for (const { e, name: pathName } of named) {
    const name = pathName ?? (pathRatio < 0.8 ? e.title.split("/").pop().trim() : null);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, { name, title: e.title, hook: /^use[A-Z]/.test(name) });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which DS component backs each catalog entry: declared, else EXACT name match only.
 * No fuzzy guessing — a prefix guess claimed Text was backed by Textarea. A wrong
 * claim is worse than "not declared" (precision over recall).
 */
function catalogSources(catalog, ds) {
  const out = new Map();
  for (const name of catalog.apis.keys()) {
    const declared = catalog.sources?.[name];
    if (declared) {
      out.set(name, { ...declared, declared: true });
      continue;
    }
    const n = norm(name);
    const exact = ds.find((c) => norm(c.name) === n);
    if (exact) out.set(name, { kind: 'ds', component: exact.name, declared: false });
    else out.set(name, { kind: 'unknown', declared: false });
  }
  return out;
}

/** Classify one agent "wanted" entry against catalog and DS. */
function classifyWanted(w, catalogNames, dsNotInCatalog) {
  const longestFirst = (a, b) => b.length - a.length;
  const inCatalog = [...catalogNames].sort(longestFirst).find((n) => wordRe(n).test(w));
  if (inCatalog)
    return {
      verdict: `capability gap in catalog component ${inCatalog}`,
      action: `extend ${inCatalog} or add a semantic component`,
    };
  const inDs = [...dsNotInCatalog].sort((a, b) => b.name.length - a.name.length).find((c) => wordRe(c.name).test(w));
  if (inDs)
    return {
      verdict: `exists in DS (${inDs.title}), not in catalog`,
      action: `add ${inDs.name} to the catalog`,
      ds: inDs.name,
    };
  return {
    verdict: "no component with this name in this Storybook",
    action: "check for a synonym (e.g. Select ↔ Dropdown); if none, it is a DS gap",
  };
}

export function buildCoverage({ catalog, index, runs }) {
  const ds = dsComponentsFromIndex(index);
  const sources = catalogSources(catalog, ds);
  const backed = new Set(
    [...sources.values()]
      .filter((s) => s.kind === "ds")
      .flatMap((s) => [].concat(s.component ?? [])),
  );
  const excluded = catalog.excluded ?? {};

  const usage = {};
  const wanted = new Map();
  for (const run of runs) {
    for (const m of run.messages ?? [])
      for (const c of m.updateComponents?.components ?? [])
        usage[c.component] = (usage[c.component] ?? 0) + 1;
    for (const w of run.wanted ?? []) wanted.set(w, (wanted.get(w) ?? 0) + 1);
  }

  const dsNotInCatalog = ds.filter((c) => !c.hook && !backed.has(c.name));
  const wantedRows = [...wanted].map(([w, n]) => ({
    w,
    n,
    ...classifyWanted(w, [...catalog.apis.keys()], dsNotInCatalog),
  }));
  const wantedDs = new Map();
  for (const r of wantedRows)
    if (r.ds) wantedDs.set(r.ds, (wantedDs.get(r.ds) ?? 0) + r.n);

  return {
    ds,
    sources,
    backed,
    excluded,
    usage,
    dsNotInCatalog,
    wantedRows,
    wantedDs,
    limitations: catalog.limitations ?? [],
  };
}

export function renderCoverage(cov, { catalogId, runCount }) {
  const {
    ds,
    sources,
    excluded,
    usage,
    dsNotInCatalog,
    wantedRows,
    wantedDs,
    limitations,
  } = cov;
  const real = ds.filter((c) => !c.hook);
  const tokens = [...sources].filter(([, s]) => s.kind === "tokens");
  const unknown = [...sources].filter(([, s]) => s.kind === "unknown");
  const L = [];
  // With undeclared sources, "0 built from tokens" would be a false negative — say "?" instead.
  const undeclaredCount = [...sources.values()].filter((x) => !x.declared).length;
  L.push("# A2UI catalog coverage", "");
  L.push(`Catalog \`${catalogId}\` · ${runCount} runs`, "");
  L.push(
    `**${real.length} design-system components in Storybook · ${real.length - dsNotInCatalog.length} offered to the agent · ${dsNotInCatalog.length} not offered · ${undeclaredCount ? `? catalog entries NOT real DS components (${undeclaredCount} sources undeclared)` : `${tokens.length} catalog ${tokens.length === 1 ? "entry is NOT a real DS component" : "entries are NOT real DS components"}`}**`,
    "",
  );
  const undeclared = [...sources.values()].filter((s) => !s.declared).length;
  if (undeclared)
    L.push(
      `> ⚠ ${undeclared} of ${sources.size} catalog entries have no declared source, so these counts are **approximate**. Declare \`CATALOG_SOURCES\` in catalog.schema.ts for an exact report.`,
      "",
    );

  L.push(
    "## 1. Catalog → design system",
    "",
    "| A2UI name | Backed by | Used in runs |",
    "|---|---|---|",
  );
  const dsNames = new Set(ds.map((c) => c.name));
  const missingInSb = (s) => {
    const gone = [].concat(s.component ?? []).filter((c) => !dsNames.has(c));
    return gone.length ? ` — ⚠ ${gone.join(", ")} ${gone.length > 1 ? "have" : "has"} no story in this Storybook` : "";
  };
  for (const [name, s] of sources) {
    const by =
      s.kind === "ds"
        ? `DS \`${[].concat(s.component).join(", ")}\`${s.declared ? "" : " (matched by name)"}${missingInSb(s)}`
        : s.kind === "tokens"
          ? `⚠ built from tokens/CSS — no DS component${s.note ? ` (${s.note})` : ""}`
          : "❓ source not declared (add to CATALOG_SOURCES)";
    L.push(`| ${name} | ${by} | ${usage[name] ?? "— never"} |`);
  }

  L.push(
    "",
    "## 2. Design-system components the agent was NOT offered",
    "",
    "| Component | Agent wanted it | Status | Action |",
    "|---|---|---|---|",
  );
  const rank = (c) => (wantedDs.has(c.name) ? 0 : excluded[c.name] ? 1 : 2);
  const rows = [...dsNotInCatalog].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const row = (c) => {
    const n = wantedDs.get(c.name);
    const reason = excluded[c.name];
    const status = reason ? `excluded: ${reason}` : "not reviewed";
    const action = n ? "**add to catalog**" : reason ? "—" : "decide: add, or exclude with a reason";
    return `| ${c.name} | ${n ? `yes ×${n}` : ""} | ${status} | ${action} |`;
  };
  rows.filter((c) => rank(c) < 2).forEach((c) => L.push(row(c)));
  const notReviewed = rows.filter((c) => rank(c) === 2);
  if (notReviewed.length) {
    L.push("", `<details><summary>${notReviewed.length} more not reviewed (no reason given)</summary>`, "");
    L.push("| Component | Agent wanted it | Status | Action |", "|---|---|---|---|");
    notReviewed.forEach((c) => L.push(row(c)));
    L.push("", "</details>");
  }
  if (!dsNotInCatalog.length) L.push("| — | | every DS component is in the catalog | |");

  L.push(
    "",
    "## 3. What the agent wanted but could not use",
    "",
    "| Wanted | × | Verdict | Action |",
    "|---|---|---|---|",
  );
  for (const r of wantedRows.sort((a, b) => b.n - a.n))
    L.push(`| ${r.w} | ${r.n} | ${r.verdict} | ${r.action} |`);
  if (!wantedRows.length) L.push("| — | | nothing reported | |");

  L.push("", "## 4. Known limitations (manual work)", "");
  limitations.forEach((l) => L.push(`- ⚠ ${l}`));
  if (!limitations.length)
    L.push("- none declared (add CATALOG_LIMITATIONS to catalog.schema.ts)");

  const add = [...wantedDs.keys()];
  const dsGaps = wantedRows
    .filter((r) => r.verdict.startsWith("no component with this name"))
    .map((r) => r.w);
  const caps = wantedRows
    .filter((r) => r.verdict.startsWith("capability"))
    .map((r) => r.w);
  const review = dsNotInCatalog
    .filter((c) => !excluded[c.name] && !wantedDs.has(c.name))
    .map((c) => c.name);
  L.push("", "## Next actions", "");
  if (add.length)
    L.push(
      `- **Add to catalog** (exists in your DS, agent asked for it): ${add.join(", ")}`,
    );
  if (caps.length)
    L.push(
      `- **Extend a catalog component** (capability gap): ${caps.join("; ")}`,
    );
  if (tokens.length)
    L.push(
      `- **Not real DS components** (built from tokens — review for parity, or ask the DS team for them): ${tokens.map(([n]) => n).join(", ")}`,
    );
  if (dsGaps.length)
    L.push(
      `- **Possible DS gaps** (no component by that name — check synonyms first): ${dsGaps.join("; ")}`,
    );
  if (review.length)
    L.push(
      `- **Review** ${review.length} DS components never offered and never excluded (§2) — ${review.length > 8 ? "fine for a big DS; add a reason to CATALOG_EXCLUDED for the ones you rejected on purpose" : review.join(", ")}`,
    );
  if (unknown.length)
    L.push(
      `- **Declare sources** in CATALOG_SOURCES for: ${unknown.map(([n]) => n).join(", ")}`,
    );
  return L.join("\n");
}
