import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const FORM_PROPS = new Set([
  "appearance",
]);

const FORM_PREFIXES = [
  "--bs-form-",
  "--bs-input-",
  "--bs-select-",
  "--bs-check-",
  "--bs-range-",
  "--bs-floating-",
];

const FORM_KEYWORDS = [
  "form-control",
  "form-select",
  "form-check",
  "form-range",
  "form-floating"
];

const FORM_CONTEXT_PROPS = new Set([
  "width",
  "height",
  "min-height",
  "max-height",
]);

function isFormProp(prop) {
  if (FORM_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  return FORM_PREFIXES.some(pre => prop.startsWith(pre));
}

function isFormContext(selector) {
  return FORM_KEYWORDS.some(kw => selector.includes(kw));
}

function isFormLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(") || v.includes("url(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  
  // Target heights, widths, and complex calc values common in forms
  return /(^|\s)-?\d*\.?\d+(px|rem|em|%)\b/.test(v) || /calc\(/.test(v);
}

export async function processForms(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  // 1. Extract theme variables
  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isFormProp(decl.prop)) return;
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

  // 2. Replace literals in form-related rules
  root.walkDecls(decl => {
    // Only target standard CSS properties for literal replacement.
    // Custom properties (--bs-*) should be handled by the extraction phase if they are in theme rules.
    if (decl.prop.startsWith("--")) return;

    const rawVal = decl.value.trim();
    
    // We target both specific form props AND any literal in a form context
    // but only for properties that actually make sense to tokenize in forms
    const inFormContext = isFormContext(decl.parent.selector || "");
    const isTarget = isFormProp(decl.prop) || (inFormContext && FORM_CONTEXT_PROPS.has(decl.prop));
    if (!isTarget) return;

    if (rawVal.startsWith("var(")) return;
    if (!isFormLiteral(rawVal)) {
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

  const formsCss = buildModuleCss(
    "/* Default form variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post forms */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_FORMS), formsCss);

  return { stats };
}
