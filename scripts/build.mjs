#!/usr/bin/env node
/**
 * scripts/build.mjs — Full BootstrapDyn build pipeline
 *
 * Runs the extractor pipeline followed by the bundler in a single step.
 * Accepts the same arguments as extractor/main.js.
 *
 * Usage:
 *   node scripts/build.mjs [inputCssPath] [outputDir]
 *
 * Defaults:
 *   inputCssPath = bootstrap/dist/css/bootstrap.css
 *   outputDir    = dist/
 *
 * Steps:
 *   1. node extractor/main.js <inputCssPath> <outputDir>
 *   2. node scripts/bundle.mjs <outputDir> <outputDir>
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT_FILE =
  process.argv[2] ??
  path.resolve(__dirname, "..", "bootstrap", "dist", "css", "bootstrap.css");
const OUT_DIR = process.argv[3] ?? path.resolve(__dirname, "..", "dist");

function runStep(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n${label}`);
    const child = spawn(command, args, {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

(async () => {
  console.log("BootstrapDyn full build");
  console.log(`  Input:  ${INPUT_FILE}`);
  console.log(`  Output: ${OUT_DIR}`);

  try {
    await runStep(
      "node",
      ["extractor/main.js", INPUT_FILE, OUT_DIR],
      "Step 1/2: Extractor pipeline"
    );
    await runStep(
      "node",
      ["scripts/bundle.mjs", OUT_DIR, OUT_DIR],
      "Step 2/2: Bundler"
    );
    console.log("\nBuild complete.");
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
})();
