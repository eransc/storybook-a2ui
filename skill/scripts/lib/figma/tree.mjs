// Read an extracted tree file (scripts/figma/extract-tree.js), expanding { "$": i } references
// to repeated subtrees stored once in "d".
import { readFileSync } from "node:fs";

export function expandTree(extracted) {
  const d = extracted.d ?? [];
  // Pure: returns new objects, the input stays compact.
  const expand = (n) => {
    if (n && typeof n.$ === "number") return expand(d[n.$]);
    return n?.k ? { ...n, k: n.k.map(expand) } : n;
  };
  return { ...extracted, tree: expand(extracted.tree), d: undefined };
}

export const readTree = (file) => expandTree(JSON.parse(readFileSync(file, "utf8")));
