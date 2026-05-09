// extract-typography.js - Typography module for BootstrapDyn
// Extracts typography variables and replaces references across the entire CSS
import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES,
  isThemeRule,
  selectorToSlug,
  propToSlug,
} from "./core.js";
import { FILES } from "./constants.js";

// Standard CSS typography properties
const TYPO_CSS_PROPS = new Set([
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "line-height", "letter-spacing", "text-transform", "text-decoration",
  "text-align", "text-indent", "word-spacing", "white-space", "font",
]);

// Bootstrap custom property prefixes considered as typography
const TYPO_PREFIXES = [
  "--bs-font",
  "--bs-body-font",
  "--bs-heading",
  "--bs-headings",
  "--bs-display",
  "--bs-lead",
  "--bs-btn-font",
  "--bs-nav-link-font",
  "--bs-navbar-brand-font",
  "--bs-form-select-font",
  "--bs-input-font",
  "--bs-code-font",
  "--bs-kbd-font",
  "--bs-pre-font",
  "--bs-list-group-item-heading-font",
  "--bs-progress-bar-font",
  "--bs-modal-title-font",
  "--bs-tooltip-font",
  "--bs-popover-header-font",
  "--bs-toast-font",
  "--bs-badge-font",
  "--bs-alert-heading-font",
  "--bs-breadcrumb-font",
  "--bs-pagination-font",
  "--bs-dropdown-font",
  "--bs-table-cell-padding",
  "--bs-table-font",
];

// Keywords to detect typography properties in custom properties
const TYPO_KEYWORDS = [
  "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-transform",
  "text-decoration", "text-align", "font",
];

// Values that are not useful to theme as variables
const NON_THEMATIC_VALUES = new Set([
  "center", "left", "right", "justify",
  "uppercase", "lowercase", "capitalize",
  "nowrap", "pre", "pre-wrap", "pre-line",
  "italic", "normal", "bold", "none",
  "underline", "line-through", "overline",
  "baseline", "top", "middle", "bottom",
  "inherit", "initial", "revert", "unset",
]);

function isTypoProp(prop) {
  if (TYPO_CSS_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  if (TYPO_PREFIXES.some(pre => prop.startsWith(pre))) return true;
  return TYPO_KEYWORDS.some(kw => prop.includes(kw));
}

function makeTypoVarName(originalProp) {
  const core = originalProp.replace(/^--bs-/, "");
  return `--bs-typo-${core}`;
}

// Replace var(--bs-xxx) with var(--bs-typo-xxx) in any value string
function replaceTypoRefs(value, typoVarNames) {
  if (!value.includes("var(--bs-")) return value;
  let result = value;
  for (const [original, typo] of typoVarNames) {
    const regex = new RegExp(`var\\(${original.replace(/-/g, "\\-")}\\)`, "g");
    result = result.replace(regex, `var(${typo})`);
  }
  return result;
}

export async function processTypography(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map(); // prop -> value
  const darkVars = new Map();  // prop -> value

  // Extract typography properties from theme nodes, cloning them for the vars file
  const themeTypoBlocks = [];
  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    const declarations = [];
    node.each(decl => {
      if (isTypoProp(decl.prop)) {
        const prop = decl.prop;
        const value = decl.value.trim();
        declarations.push({ prop, value });
        if (isDark) {
          darkVars.set(prop, value);
        } else {
          lightVars.set(prop, value);
        }
        decl.remove();
      }
    });
    if (declarations.length > 0) {
      themeTypoBlocks.push({
        selector: node.selectors.join(", "),
        declarations,
      });
    }
    if (node.nodes.length === 0) {
      node.remove();
    }
  });

  // Map original names to new ones (--bs-typo-...)
  const allVars = new Map([...lightVars, ...darkVars]);
  const typoVarNames = new Map();
  for (const prop of allVars.keys()) {
    typoVarNames.set(prop, makeTypoVarName(prop));
  }

  const dynVars = new Map();
  const usedNames = new Set();
  let stats = {
    countThemeVars: 0,
    countRefReplaced: 0,
    countLiteralReplaced: 0,
    countSkipped: 0,
  };

  // Replace typography references across ALL CSS (var and literal values)
  root.walkDecls(decl => {
    const rawVal = decl.value.trim();

    // Skip special values and non-thematic literals
    if (
      SKIP_VALUES.has(rawVal) || 
      SKIP_VALUES.has(rawVal.toLowerCase()) ||
      NON_THEMATIC_VALUES.has(rawVal.toLowerCase())
    ) {
      stats.countSkipped++;
      return;
    }

    // Replace var(--bs-xxx) with var(--bs-typo-xxx) wherever they appear
    if (rawVal.includes("var(--bs-")) {
      const newVal = replaceTypoRefs(rawVal, typoVarNames);
      if (newVal !== rawVal) {
        decl.value = newVal;
        stats.countRefReplaced++;
      }
      // If the value is not just a var() and the property is also typography,
      // keep processing to capture the remaining literal (uncommon)
      if (!isTypoProp(decl.prop)) return;
      if (rawVal.startsWith("var(") && rawVal.endsWith(")")) return;
    }

    // If it's not a typography property, don't touch literals
    if (!isTypoProp(decl.prop)) return;

    // Literal value: convert to dynamic variable
    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;

    const selector = rule.selectors[0].trim();
    const baseName = `--bs-dyn-${selectorToSlug(selector)}-${propToSlug(decl.prop)}`;
    let varName = baseName;
    let i = 2;
    while (usedNames.has(varName)) varName = `${baseName}-${i++}`;
    usedNames.add(varName);

    dynVars.set(varName, rawVal);
    decl.value = `var(${varName})`;
    stats.countLiteralReplaced++;
  });

  // Build default-typography.css
  let typoCss = "/* Default typography variables */\n\n";

  if (lightVars.size > 0) {
    typoCss += ":root {\n";
    for (const [prop, value] of lightVars) {
      const newProp = typoVarNames.get(prop);
      const resolved = replaceTypoRefs(value, typoVarNames);
      typoCss += `  ${newProp}: ${resolved};\n`;
    }
    typoCss += "}\n";
    stats.countThemeVars += lightVars.size;
  }

  if (darkVars.size > 0) {
    typoCss += "\n[data-bs-theme=\"dark\"] {\n";
    for (const [prop, value] of darkVars) {
      const newProp = typoVarNames.get(prop);
      const resolved = replaceTypoRefs(value, typoVarNames);
      typoCss += `  ${newProp}: ${resolved};\n`;
    }
    typoCss += "}\n";
    stats.countThemeVars += darkVars.size;
  }

  // Add dynamic variables (literal values found outside theme nodes)
  if (dynVars.size > 0) {
    typoCss += "\n/* Derived typography variables (dynamic) */\n:root {\n";
    for (const [varName, value] of dynVars) {
      const resolved = replaceTypoRefs(value, typoVarNames);
      typoCss += `  ${varName}: ${resolved};\n`;
    }
    typoCss += "}\n";
  }

  const finalBootstrapCss = root.toResult({ map: false }).css;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post typography */\n\n${finalBootstrapCss}`
  );
  await fs.writeFile(
    path.join(outputDir, FILES.DEFAULT_TYPOGRAPHY),
    typoCss
  );

  return { stats };
}
