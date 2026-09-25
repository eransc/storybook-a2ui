#!/usr/bin/env node
// storybook-a2ui CLI
//   describe --schema <catalog.schema.ts>                      print the catalog for authoring
//   check    --schema <catalog.schema.ts> --runs <dir|file...> [--guardrails g.json] [--report out.md]
//   stories  --runs <dir> --out <dir> [--playground ./A2uiPlayground]
//   coverage --schema <catalog.schema.ts> (--storybook <url> | --index <index.json>) --runs <dir> [--report COVERAGE.md]
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { loadCatalog } from "./lib/load-catalog.mjs";
import { describeCatalog } from "./lib/describe.mjs";
import { checkRun } from "./lib/check.mjs";
import { writeStories } from "./lib/stories.mjs";
import { buildCoverage, renderCoverage } from "./lib/coverage.mjs";

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
  const report = renderCoverage(buildCoverage({ catalog, index, runs }), { catalogId: catalog.id, runCount: runs.length });
  if (args.report) writeFileSync(args.report, report + "\n");
  console.log(report);
}

const commands = {
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
    written.forEach((w) =>
      console.log(`wrote ${w.outFile} (${w.stories.join(", ")})`),
    );
  },
};

if (!commands[cmd]) {
  console.error("usage: a2ui.mjs <describe|check|stories|coverage> ...  (see header)");
  process.exit(2);
}
await commands[cmd]();
