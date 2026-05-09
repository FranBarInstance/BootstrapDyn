import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const SPACING_PROPS = new Set([
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap",
]);

const SPACING_PREFIXES = [
  "--bs-spacer",
  "--bs-gutter",
  "--bs-grid-gutter",
  "--bs-btn-padding",
  "--bs-card-spacer",
  "--bs-modal",
  "--bs-offcanvas",
  "--bs-navbar",
  "--bs-nav-link-padding",
  "--bs-dropdown-padding",
  "--bs-list-group-item-padding",
  "--bs-alert-padding",
  "--bs-toast-padding",
  "--bs-popover",
  "--bs-tooltip",
  "--bs-accordion-btn-padding",
  "--bs-breadcrumb-margin-bottom",
  "--bs-pagination-padding",
];

const SPACING_KEYWORDS = ["padding", "margin", "spacer", "gutter", "gap"];

function isSpacingProp(prop) {
  if (SPACING_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  if (SPACING_PREFIXES.some(pre => prop.startsWith(pre))) return true;
  return SPACING_KEYWORDS.some(kw => prop.includes(kw));
}

function isSpacingLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  if (v === "0") return true;
  return /(^|\s)-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|ex)\b/.test(v) || /calc\(/.test(v);
}

export async function processSpacing(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isSpacingProp(decl.prop)) return;
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

  root.walkDecls(decl => {
    const rawVal = decl.value.trim();
    if (!isSpacingProp(decl.prop)) return;
    if (rawVal.startsWith("var(")) return;
    if (!isSpacingLiteral(rawVal)) {
      if (SKIP_VALUES.has(rawVal) || SKIP_VALUES.has(rawVal.toLowerCase())) stats.countSkipped++;
      return;
    }

    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;
    const selector = rule.selectors[0].trim();

    // Keep modal footer spacing exactly as upstream Bootstrap to avoid subtle
    // layout drift in action button alignment.
    if (
      (selector === ".modal-footer" && decl.prop === "padding") ||
      (selector === ".modal-footer > *" && decl.prop === "margin")
    ) {
      return;
    }

    const name = makeVarName(selector, decl.prop, usedNames);
    dynVars.set(name, rawVal);
    decl.value = `var(${name})`;
    stats.countLiteralReplaced++;
  });

  const spacingCss = buildModuleCss(
    "/* Default spacing variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post spacing */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_SPACING), spacingCss);

  return { stats };
}

