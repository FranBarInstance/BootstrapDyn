import fs from "fs/promises";
import path from "path";
import { FILES } from "./constants.js";

/**
 * Final cleanup step executed after all extraction modules.
 * Strips pipeline marker comments from bootstrap-dyn.css.
 * Extensible for other post-processing tasks.
 */
export async function finalize(outputDir = "./dist") {
  const dynPath = path.join(outputDir, FILES.BOOTSTRAP_DYN);
  const rawCss = await fs.readFile(dynPath, "utf8");

  // Remove pipeline marker comments accumulated by each extraction module.
  // Pattern: /* bootstrap-dyn.css - Post {module} */
  const markerPattern = /\/\*\s*bootstrap-dyn\.css\s*-\s*Post\s+\w+\s*\*\/\n*/g;
  const cleanedCss = rawCss.replace(markerPattern, "");

  // Collapse consecutive blank lines left by removed markers.
  const compactCss = cleanedCss.replace(/\n{3,}/g, "\n\n");

  await fs.writeFile(dynPath, compactCss);

  const markerCount = (rawCss.match(markerPattern) || []).length;
  return { stats: { markersRemoved: markerCount } };
}
