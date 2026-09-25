// Bundle a project's catalog.schema.ts with esbuild and import it in Node.
// The schema file must export CATALOG_ID and CATALOG_APIS (no React, no CSS).
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadCatalog(schemaPath) {
  const abs = resolve(schemaPath);
  const out = join(mkdtempSync(join(tmpdir(), "sb-a2ui-")), "catalog.mjs");
  execFileSync(
    "npx",
    [
      "-y",
      "esbuild@0.23",
      abs,
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: dirname(abs), stdio: ["ignore", "ignore", "inherit"] },
  );
  const mod = await import(pathToFileURL(out).href);
  if (!mod.CATALOG_ID || !Array.isArray(mod.CATALOG_APIS)) {
    throw new Error(`${schemaPath} must export CATALOG_ID and CATALOG_APIS`);
  }
  const apis = new Map(mod.CATALOG_APIS.map((api) => [api.name, api]));
  return {
    id: mod.CATALOG_ID,
    apis,
    // Optional coverage metadata (see lib/coverage.mjs).
    sources: mod.CATALOG_SOURCES ?? null,
    excluded: mod.CATALOG_EXCLUDED ?? {},
    limitations: mod.CATALOG_LIMITATIONS ?? [],
  };
}
