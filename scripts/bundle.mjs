#!/usr/bin/env node
/**
 * scripts/bundle.mjs — BootstrapDyn CSS bundler
 *
 * Concatenates CSS module files from an input directory into a single bundle,
 * generating both a normal and a minified version.
 *
 * File discovery uses the theme naming convention from .specify/theme-spec.md:
 * - Themeable modules are matched by canonical suffix (e.g., *-color.css).
 * - Fixed files (bootstrap-dyn.css, contrast-dyn.css) are matched by exact name.
 *
 * Usage:
 *   node scripts/bundle.mjs [inputDir] [outputDir] [--exclude suffix1,suffix2,...]
 *
 * Defaults:
 *   inputDir  = dist/
 *   outputDir = same as inputDir
 *
 * Options:
 *   --exclude  Comma-separated list of suffixes or filenames to omit.
 *              Example: --exclude contrast-dyn.css,-grid.css
 *
 * Outputs:
 *   <outputDir>/bootstrap-dyn-bundle.css
 *   <outputDir>/bootstrap-dyn-bundle.min.css
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Canonical load order by suffix (from .specify/theme-spec.md)
// ---------------------------------------------------------------------------
const CONCERN_SUFFIXES = [
  "-color.css",
  "-typography.css",
  "-spacing.css",
  "-corners.css",
  "-shadows.css",
  "-borders.css",
  "-forms.css",
  "-layers.css",
  "-layout.css",
  "-motion.css",
  "-sizing.css",
  "-grid.css",
];

const FIXED_FILES = [
  "bootstrap-dyn.css",
  "contrast-dyn.css",
];

const BUNDLE_NAME = "bootstrap-dyn-bundle.css";
const BUNDLE_MIN_NAME = "bootstrap-dyn-bundle.min.css";

// ---------------------------------------------------------------------------
// CLI argument resolution
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const positional = [];
  const exclude = [];
  let i = 2;
  while (i < argv.length) {
    if (argv[i] === "--exclude" && i + 1 < argv.length) {
      exclude.push(...argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean));
      i += 2;
    } else {
      positional.push(argv[i]);
      i++;
    }
  }

  const inputDir = path.resolve(
    positional[0] ?? path.join(__dirname, "..", "dist")
  );
  const outputDir = path.resolve(positional[1] ?? inputDir);

  return { inputDir, outputDir, exclude };
}

const { inputDir, outputDir, exclude } = parseArgs(process.argv);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a file in dir that ends with the given suffix.
 * Returns the filename (not full path) or null if not found.
 * If multiple files match, emits a warning and returns the first (sorted).
 */
function findBySuffix(dir, suffix) {
  const entries = fs.readdirSync(dir);
  const matches = entries
    .filter((f) => f.endsWith(suffix) && f !== suffix) // exclude bare suffix
    .sort();
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.warn(`  (warn) Multiple matches for suffix "${suffix}": ${matches.join(", ")}. Using "${matches[0]}".`);
  }
  return matches[0];
}

/** Minimal CSS minifier: strips comments and collapses whitespace. */
function minifyCss(css) {
  let out = css;
  // Remove comments (/* ... */)
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  // Collapse whitespace sequences into a single space
  out = out.replace(/\s+/g, " ");
  // Remove spaces around structural characters
  out = out.replace(/\s*([{}:;,])\s*/g, "$1");
  // Remove trailing semicolon before closing brace
  out = out.replace(/;}/g, "}");
  // Remove leading/trailing whitespace
  out = out.trim();
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("BootstrapDyn bundler");
console.log(`  Input:  ${inputDir}`);
console.log(`  Output: ${outputDir}`);
if (exclude.length > 0) {
  console.log(`  Exclude: ${exclude.join(", ")}`);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Error: input directory not found: ${inputDir}`);
  process.exit(1);
}

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

const bundled = [];
let totalFiles = 0;
let skippedByExclude = 0;

// Phase 1: Themeable modules (matched by suffix)
for (const suffix of CONCERN_SUFFIXES) {
  if (exclude.includes(suffix)) {
    console.log(`  (excluded) *${suffix}`);
    skippedByExclude++;
    continue;
  }
  const filename = findBySuffix(inputDir, suffix);
  if (!filename) {
    console.log(`  (skip) *${suffix} — not found`);
    continue;
  }
  const filePath = path.join(inputDir, filename);
  const css = fs.readFileSync(filePath, "utf-8");
  bundled.push(`/* ${filename} */\n${css}`);
  totalFiles++;
}

// Phase 2: Fixed files (matched by exact name)
for (const filename of FIXED_FILES) {
  if (exclude.includes(filename)) {
    console.log(`  (excluded) ${filename}`);
    skippedByExclude++;
    continue;
  }
  const filePath = path.join(inputDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  (skip) ${filename} — not found`);
    continue;
  }
  const css = fs.readFileSync(filePath, "utf-8");
  bundled.push(`/* ${filename} */\n${css}`);
  totalFiles++;
}

if (totalFiles === 0) {
  console.error("Error: no module files found in input directory (all were excluded or missing).");
  process.exit(1);
}

const bundleContent = bundled.join("\n\n");

// Write normal bundle
const bundlePath = path.join(outputDir, BUNDLE_NAME);
fs.writeFileSync(bundlePath, bundleContent, "utf-8");
const bundleSize = (Buffer.byteLength(bundleContent) / 1024).toFixed(1);
console.log(`  ${BUNDLE_NAME} (${bundleSize} KB)`);

// Write minified bundle
const minContent = minifyCss(bundleContent);
const minPath = path.join(outputDir, BUNDLE_MIN_NAME);
fs.writeFileSync(minPath, minContent, "utf-8");
const minSize = (Buffer.byteLength(minContent) / 1024).toFixed(1);
console.log(`  ${BUNDLE_MIN_NAME} (${minSize} KB)`);

console.log(`  ${totalFiles} files bundled${skippedByExclude > 0 ? ` (${skippedByExclude} excluded)` : ""}.`);
