#!/usr/bin/env node
// Linux npm lays out Hugeicons as Grid2X2*.js; BB's esbuild looks up Grid2x2*.js.
import { readdirSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "@hugeicons",
  "core-free-icons",
  "dist",
  "esm",
);
let created = 0;
try {
  for (const name of readdirSync(dir)) {
    let alias = name;
    for (const [from, to] of [
      ["2X2", "2x2"],
      ["3X2", "3x2"],
      ["3X3", "3x3"],
      ["2X3", "2x3"],
      ["4X4", "4x4"],
    ]) {
      alias = alias.replaceAll(from, to);
    }
    if (alias === name) continue;
    try {
      symlinkSync(name, join(dir, alias));
      created += 1;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") continue;
      throw error;
    }
  }
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") process.exit(0);
  throw error;
}
if (created > 0) console.log(`hugeicons case aliases: ${created}`);
