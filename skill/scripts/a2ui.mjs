#!/usr/bin/env node
// storybook-a2ui CLI
//   describe --schema <catalog.schema.ts>                      print the catalog for authoring
//   check    --schema <catalog.schema.ts> --runs <dir|file...> [--guardrails g.json] [--report out.md]
//   stories  --runs <dir> --out <dir> [--playground ./A2uiPlayground]
//   from-figma --tree <x.tree.json> --map <figma-map.json> --name <kebab-name> [--schema <catalog.schema.ts>] [--storybook <url> | --index <index.json>] [--out <patterns dir>]
//            convert an extracted Figma frame (scripts/figma/extract-tree.js) into a pattern
//   patterns --schema <catalog.schema.ts> --dir <patterns dir> [--guardrails g.json] [--out <a2ui dir>] [--playground ./A2uiPlayground] [--schemaImport ./catalog.schema]
//            lint + validate patterns; with --out, generate "A2UI Patterns/<Name>" stories
//   coverage --schema <catalog.schema.ts> (--storybook <url> | --index <index.json>) --runs <dir> [--figma <trees dir>] [--map figma-map.json] [--report COVERAGE.md]
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, basename } from "node:path";
import { loadCatalog } from "./lib/load-catalog.mjs";
import { describeCatalog } from "./lib/describe.mjs";
import { checkRun } from "./lib/check.mjs";
import { writeStories } from "./lib/stories.mjs";
import { buildCoverage, renderCoverage, dsComponentsFromIndex } from "./lib/coverage.mjs";
import { loadPatterns, lintPattern, validatePattern, writePatternStories } from "./lib/patterns.mjs";
import { figmaToPattern } from "./lib/figma/index.mjs";
import { readTree } from "./lib/figma/tree.mjs";
import { figmaUsage } from "./lib/coverage-alerts.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) continue;
  const key = rest[i].slice(2);
  const vals = [];
  while (rest[i + 1] && !rest[i + 1].startsWith("--")) vals.push(rest[++i]);
  args[key] = vals.length > 1 ? vals : vals[0];
}
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const need = (k) => {
  if (!args[k]) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
  return args[k];
};

function runFiles(paths) {
  return list(paths).flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .map((f) => join(p, f))
      : [p],
  );
}

async function check() {
  const catalog = await loadCatalog(need("schema"));
  const guardrails =
    args.guardrails && existsSync(args.guardrails)
      ? JSON.parse(readFileSync(args.guardrails, "utf8"))
      : {};
  const totalUsage = {};
  const wanted = {};
  const lines = [
    "# A2UI run report",
    "",
    `Catalog: \`${catalog.id}\` · ${catalog.apis.size} components`,
    "",
  ];
  let failed = 0;
  for (const file of runFiles(need("runs"))) {
    const run = JSON.parse(readFileSync(file, "utf8"));
    const r = checkRun(run, catalog, guardrails);
    Object.entries(r.usage).forEach(
      ([k, n]) => (totalUsage[k] = (totalUsage[k] ?? 0) + n),
    );
    (run.wanted ?? []).forEach((w) => (wanted[w] = (wanted[w] ?? 0) + 1));
    if (r.errors.length) failed++;
    lines.push(
      `## ${r.errors.length ? "✗" : "✓"} ${basename(file)} — ${r.count} components, depth ${r.depth}`,
    );
    lines.push(
      `Prompt: ${run.prompt ?? "(none)"} · dataset: ${run.dataset ?? "?"}`,
    );
    r.errors.forEach((e) => lines.push(`- ERROR ${e}`));
    r.warnings.forEach((w) => lines.push(`- warn  ${w}`));
    lines.push("");
  }
  const unused = [...catalog.apis.keys()].filter((k) => !totalUsage[k]);
  lines.push("## Catalog usage", "");
  Object.entries(totalUsage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => lines.push(`- ${k}: ${n}`));
  lines.push("", `Never used: ${unused.join(", ") || "—"}`);
  lines.push(
    `Wanted but missing (agent-reported): ${
      Object.entries(wanted)
        .map(([k, n]) => `${k} ×${n}`)
        .join(", ") || "—"
    }`,
  );
  const report = lines.join("\n");
  if (args.report) writeFileSync(args.report, report + "\n");
  console.log(report);
  process.exit(failed ? 1 : 0);
}

async function coverage() {
  const catalog = await loadCatalog(need("schema"));
  let index;
  if (args.index) index = JSON.parse(readFileSync(args.index, "utf8"));
  else {
    const url = `${need("storybook").replace(/\/$/, "")}/index.json`;
    const res = await fetch(url).catch((e) => {
      console.error(`cannot reach ${url}: ${e.message} — is Storybook running? (or pass --index)`);
      process.exit(2);
    });
    index = await res.json();
  }
  const runs = runFiles(need("runs")).map((f) => JSON.parse(readFileSync(f, "utf8")));
  // --figma <dir of *.tree.json> [--map figma-map.json]: design usage makes the alerts much stronger.
  const figma = figmaUsage(args.figma);
  const map = args.map && existsSync(args.map) ? JSON.parse(readFileSync(args.map, "utf8")) : {};
  const mappedFigma = new Set([
    ...Object.keys(map.components ?? {}),
    ...(map.skip ?? []),
    ...Object.keys(map.icons?.names ?? {}),
  ]);
  const report = renderCoverage(buildCoverage({ catalog, index, runs, figma, mappedFigma }), { catalogId: catalog.id, runCount: runs.length });
  if (args.report) writeFileSync(args.report, report + "\n");
  console.log(report);
}

async function patterns() {
  const catalog = await loadCatalog(need("schema"));
  const guardrails = args.guardrails && existsSync(args.guardrails) ? JSON.parse(readFileSync(args.guardrails, "utf8")) : {};
  const list = loadPatterns(need("dir"));
  const good = [];
  for (const item of list) {
    const problems = lintPattern(item.pattern);
    const v = problems.some((x) => x.startsWith("missing")) ? { errors: [], warnings: [] } : validatePattern(item.pattern, catalog, guardrails);
    const errors = [...problems, ...v.errors];
    console.log(`${errors.length ? "✗" : "✓"} ${item.file}`);
    errors.forEach((e) => console.log(`  - ERROR ${e}`));
    v.warnings.forEach((w) => console.log(`  - warn  ${w}`));
    if (!errors.length) good.push(item);
  }
  if (args.out) {
    const written = writePatternStories(good, { outDir: args.out, playgroundImport: args.playground, schemaImport: args.schemaImport });
    written.forEach((f) => console.log(`wrote ${f}`));
    console.log('Storybook section: "A2UI Patterns" — compare each story with its source frame.');
  }
  process.exit(good.length === list.length ? 0 : 1);
}

async function fromFigma() {
  const extracted = readTree(need("tree"));
  const map = JSON.parse(readFileSync(need("map"), "utf8"));
  // With --schema, only components whose catalog schema declares `weight` get it (others are wrapped).
  let acceptsWeight;
  if (args.schema) {
    const catalog = await loadCatalog(args.schema);
    acceptsWeight = (name) => {
      let s = catalog.apis.get(name)?.schema;
      while (s && s._def?.typeName !== "ZodObject") s = s._def?.innerType ?? s._def?.schema;
      return !!s && "weight" in s._def.shape();
    };
  }
  // --storybook <url>: flag Figma components that exist in Storybook but are decomposed.
  let dsNames;
  if (args.storybook || args.index) {
    const idx = args.index
      ? JSON.parse(readFileSync(args.index, "utf8"))
      : await (await fetch(`${args.storybook.replace(/\/$/, "")}/index.json`)).json();
    dsNames = dsComponentsFromIndex(idx).map((c) => c.name);
  }
  const pattern = figmaToPattern(extracted, map, need("name"), acceptsWeight, dsNames);
  const json = JSON.stringify(pattern, null, 1) + "\n";
  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    const file = join(args.out, `${pattern.name}.json`);
    writeFileSync(file, json);
    console.log(`wrote ${file}`);
  } else console.log(json);
  console.log(`components: ${Object.entries(pattern.conversion.usage).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  pattern.notExpressible.forEach((n) => console.log(`  note: ${n}`));
  console.log('next: write "whenToUse", then run `patterns` to validate and render it');
}

const commands = {
  "from-figma": fromFigma,
  patterns,
  coverage,
  describe: async () =>
    console.log(describeCatalog(await loadCatalog(need("schema")))),
  check,
  stories: async () => {
    const written = writeStories({
      runsDir: need("runs"),
      outDir: need("out"),
      playgroundImport: args.playground,
    });
    written.forEach((w) => console.log(`wrote ${w.outFile}\n  story ids: ${w.ids.join(" ")}`));
  },
};

if (!commands[cmd]) {
  console.error("usage: a2ui.mjs <describe|check|stories|coverage|patterns|from-figma> ...  (see header)");
  process.exit(2);
}
await commands[cmd]();
