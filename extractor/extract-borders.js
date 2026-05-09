import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const BORDER_PROPS = new Set([
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-style", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
]);

const BORDER_PREFIXES = [
  "--bs-border-width",
  "--bs-border-style",
];

function isBorderProp(prop) {
  if (BORDER_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  return BORDER_PREFIXES.some(pre => prop.startsWith(pre));
}

function isBorderLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;

  // Lengths or border-style keywords
  const isLength = /(^|\s)-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|ex)\b/.test(v) || v === "0";
  const isStyle = /solid|dashed|dotted|double|groove|ridge|inset|outset|none/.test(v);

  return isLength || isStyle || /calc\(/.test(v);
}

export async function processBorders(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  // 1. Extract theme variables
  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isBorderProp(decl.prop)) return;
      const value = decl.value.trim();
      if (isDark) darkVars.set(decl.prop, value);
      else lightVars.set(decl.prop, value);
      decl.remove();
    });
    if (node.nodes.length === 0) node.remove();
  });

  // 2. Tokenize literals
  const dynVars = new Map();
  const usedNames = new Set();
  const stats = { countThemeVars: 0, countLiteralReplaced: 0, countSkipped: 0 };

  root.walkDecls(decl => {
    if (!isBorderProp(decl.prop)) return;
    const rawVal = decl.value.trim();

    // Skip if it's already a full var() reference
    if (rawVal.startsWith("var(") && rawVal.endsWith(")")) return;

    // If it's a shorthand like "var(--bs-border-width) solid var(--bs-border-color)"
    // we might want to tokenize the "solid" part.
    // For now, we only tokenize if the WHOLE value is considered a literal or contains literals.
    if (!isBorderLiteral(rawVal)) {
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

  const bordersCss = buildModuleCss(
    "/* Default border variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post borders */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_BORDERS), bordersCss);

  return { stats };
}
