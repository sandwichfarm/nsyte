#!/usr/bin/env node
/**
 * Recursively create .gz and .br variants beside every html/css/js/json/svg/wasm file.
 * Skips anything already ending in .gz or .br.
 *
 * Usage:   node compress.js [targetDir]
 * Example: node compress.js ./public
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import zlib from "node:zlib";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const BROTLI_OPTS = {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }, // max compression
};

const TARGET_EXT = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".svg",
  ".txt",
  ".wasm",
]);

const root = path.resolve(process.argv[2] || "./dist");

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(res);
    else yield res;
  }
}

async function compressFile(file) {
  if (file.endsWith(".gz") || file.endsWith(".br")) return; // already done
  if (!TARGET_EXT.has(path.extname(file))) return; // skip binaries

  const src = await fs.readFile(file);

  // Write .gz
  await fs.writeFile(`${file}.gz`, await gzip(src, { level: 9 }));

  // Write .br
  await fs.writeFile(`${file}.br`, await brotli(src, BROTLI_OPTS));

  console.log("compressed", path.relative(root, file));
}

(async () => {
  try {
    for await (const file of walk(root)) {
      await compressFile(file);
    }
    console.log("✔ Done");
  } catch (err) {
    console.error("Compression failed:", err);
    process.exit(1);
  }
})();
