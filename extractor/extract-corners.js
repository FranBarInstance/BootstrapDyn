import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const CORNER_PROPS = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
]);

const CORNER_PREFIXES = [
  "--bs-border-radius",
  "--bs-btn-border-radius",
  "--bs-dropdown-border-radius",
  "--bs-dropdown-inner-border-radius",
  "--bs-nav-tabs-border-radius",
  "--bs-nav-pills-border-radius",
  "--bs-navbar-toggler-border-radius",
  "--bs-card-border-radius",
  "--bs-card-inner-border-radius",
  "--bs-accordion-border-radius",
  "--bs-accordion-inner-border-radius",
  "--bs-pagination-border-radius",
  "--bs-badge-border-radius",
  "--bs-alert-border-radius",
  "--bs-progress-border-radius",
  "--bs-list-group-border-radius",
  "--bs-toast-border-radius",
  "--bs-modal-border-radius",
  "--bs-modal-inner-border-radius",
  "--bs-tooltip-border-radius",
  "--bs-popover-border-radius",
  "--bs-popover-inner-border-radius",
  "--bs-breadcrumb-border-radius",
];

function isCornerProp(prop) {
  if (CORNER_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  if (CORNER_PREFIXES.some(pre => prop.startsWith(pre))) return true;
  return prop.includes("radius");
}

function isCornerLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  if (v === "0") return true;
  return /(^|\s)-?\d*\.?\d+(px|rem|em|%)\b/.test(v) || /calc\(/.test(v);
}

function splitRadiusTokens(value) {
  const tokens = [];
  let depth = 0;
  let current = "";

  for (const char of value.trim()) {
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (/\s/.test(char) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

export async function processCorners(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isCornerProp(decl.prop)) return;
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
    if (!isCornerProp(decl.prop)) return;
    if (rawVal.startsWith("var(")) return;
    if (!isCornerLiteral(rawVal)) {
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

  // Decompose every border-radius shorthand into individual corner properties
  // so themes can control each corner independently. The original value is
  // preserved as fallback in each longhand, ensuring visual parity.
  root.walkRules(rule => {
    rule.walkDecls(decl => {
      if (decl.prop !== "border-radius") return;
      const val = decl.value.trim();
      if (!val.includes("var(")) return;

      const parts = splitRadiusTokens(val);
      const tl = parts[0] || val;
      const tr = parts[1] || parts[0] || val;
      const br = parts[2] || parts[0] || val;
      const bl = parts[3] || parts[1] || parts[0] || val;

      rule.append({ prop: "border-top-left-radius", value: `var(--bs-border-radius-top-left, ${tl})` });
      rule.append({ prop: "border-top-right-radius", value: `var(--bs-border-radius-top-right, ${tr})` });
      rule.append({ prop: "border-bottom-right-radius", value: `var(--bs-border-radius-bottom-right, ${br})` });
      rule.append({ prop: "border-bottom-left-radius", value: `var(--bs-border-radius-bottom-left, ${bl})` });
    });
  });

  const cornersCss = buildModuleCss(
    "/* Default corner variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post corners */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_CORNERS), cornersCss);

  return { stats };
}
