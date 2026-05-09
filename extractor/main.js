#!/usr/bin/env node
import { generateBaseCss } from "./extract-base.js";
import { processColors } from "./extract-colors.js";
import { processSpacing } from "./extract-spacing.js";
import { processCorners } from "./extract-corners.js";
import { processShadows } from "./extract-shadows.js";
import { processBorders } from "./extract-borders.js";
import { processForms } from "./extract-forms.js";
import { processMotion } from "./extract-motion.js";
import { processSizing } from "./extract-sizing.js";
import { processLayers } from "./extract-layers.js";
import { processLayout } from "./extract-layout.js";
import { processTypography } from "./extract-typography.js";
import { finalize } from "./extract-finalize.js";
import path from "path";
import { fileURLToPath } from "url";
import { FILES } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT_FILE = process.argv[2] ?? path.resolve(__dirname, "../bootstrap/dist/css/bootstrap.css");
const OUT_DIR = process.argv[3] ?? path.resolve(__dirname, "../dist");

(async () => {
  console.log(`🚀 Starting pipeline...`);
  console.log(`   Input:  ${INPUT_FILE}`);
  console.log(`   Output: ${OUT_DIR}`);

  await generateBaseCss(INPUT_FILE, OUT_DIR);
  console.log(`1️⃣ ${FILES.BOOTSTRAP_DYN} generated`);

  const { stats } = await processColors(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`2️⃣ Colors processed → ${FILES.DEFAULT_COLOR}, ${FILES.CONTRAST_DYN}`);

  const spacingResult = await processSpacing(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`3️⃣ Spacing processed → ${FILES.DEFAULT_SPACING} (${spacingResult.stats.countThemeVars} theme vars, ${spacingResult.stats.countLiteralReplaced} literals)`);

  const cornersResult = await processCorners(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`4️⃣ Corners processed → ${FILES.DEFAULT_CORNERS} (${cornersResult.stats.countThemeVars} theme vars, ${cornersResult.stats.countLiteralReplaced} literals)`);

  const shadowsResult = await processShadows(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`5️⃣ Shadows processed → ${FILES.DEFAULT_SHADOWS} (${shadowsResult.stats.countThemeVars} theme vars, ${shadowsResult.stats.countLiteralReplaced} literals)`);

  const bordersResult = await processBorders(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`6️⃣ Borders processed → ${FILES.DEFAULT_BORDERS} (${bordersResult.stats.countThemeVars} theme vars, ${bordersResult.stats.countLiteralReplaced} literals)`);

  const formsResult = await processForms(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`7️⃣ Forms processed → ${FILES.DEFAULT_FORMS} (${formsResult.stats.countThemeVars} theme vars, ${formsResult.stats.countLiteralReplaced} literals)`);

  const motionResult = await processMotion(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`8️⃣ Motion processed → ${FILES.DEFAULT_MOTION} (${motionResult.stats.countThemeVars} theme vars, ${motionResult.stats.countLiteralReplaced} literals)`);

  const sizingResult = await processSizing(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`9️⃣ Sizing processed → ${FILES.DEFAULT_SIZING} (${sizingResult.stats.countThemeVars} theme vars, ${sizingResult.stats.countLiteralReplaced} literals)`);

  const layersResult = await processLayers(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`🔟 Layers processed → ${FILES.DEFAULT_LAYERS} (${layersResult.stats.countThemeVars} theme vars, ${layersResult.stats.countLiteralReplaced} literals)`);

  const layoutResult = await processLayout(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`1️⃣1️⃣ Layout processed → ${FILES.DEFAULT_LAYOUT} (${layoutResult.stats.countThemeVars} theme vars, ${layoutResult.stats.countLiteralReplaced} literals)`);

  const typoResult = await processTypography(path.join(OUT_DIR, FILES.BOOTSTRAP_DYN), OUT_DIR);
  console.log(`1️⃣2️⃣ Typography processed → ${FILES.DEFAULT_TYPOGRAPHY} (${typoResult.stats.countThemeVars} theme vars, ${typoResult.stats.countRefReplaced} refs, ${typoResult.stats.countLiteralReplaced} literals)`);

  const finalizeResult = await finalize(OUT_DIR);
  console.log(`1️⃣3️⃣ Finalize → ${finalizeResult.stats.markersRemoved} pipeline markers removed`);

  console.log(`✅ Final files in ${OUT_DIR}/`);
})();
