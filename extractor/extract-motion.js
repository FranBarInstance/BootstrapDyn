import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const MOTION_PROPS = new Set([
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "animation",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
]);

const MOTION_PREFIXES = [
  "--bs-transition-",
  "--bs-animation-",
];

function isMotionProp(prop) {
  if (MOTION_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  return MOTION_PREFIXES.some(pre => prop.startsWith(pre));
}

function isMotionLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  if (v === "none" || v === "all") return false;

  // Target values with time units or common timing functions
  const hasTime = /\d*\.?\d+(s|ms)\b/.test(v);
  const hasTiming = /\b(ease|linear|cubic-bezier|steps)\b/.test(v);
  
  return hasTime || hasTiming;
}

export async function processMotion(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  // 1. Extract theme variables
  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isMotionProp(decl.prop)) return;
      const value = decl.value.trim();
      if (isDark) darkVars.set(decl.prop, value);
      else lightVars.set(decl.prop, value);
      decl.remove();
    });
    if (node.nodes.length === 0) node.remove();
  });

  const dynVars = new Map();
  const usedNames = new Set();
  const stats = { countThemeVars: 0, countLiteralReplaced: 0, countSkipped: 0 };

  // 2. Replace literals in any rule
  root.walkDecls(decl => {
    if (!isMotionProp(decl.prop)) return;

    const rawVal = decl.value.trim();
    if (rawVal.startsWith("var(")) return;
    if (!isMotionLiteral(rawVal)) {
      if (SKIP_VALUES.has(rawVal) || SKIP_VALUES.has(rawVal.toLowerCase())) stats.countSkipped++;
      return;
    }

    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;
    const selector = rule.selectors[0].trim();

    const name = makeVarName(selector, decl.prop, usedNames);
    dynVars.set(name, rawVal);
    decl.value = `var(${name})`;
    stats.countLiteralReplaced++;
  });

  const motionCss = buildModuleCss(
    "/* Default motion variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post motion */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_MOTION), motionCss);

  return { stats };
}
