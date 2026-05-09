import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  isThemeRule, selectorToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_CSS_PATH = path.resolve(__dirname, "../bootstrap/dist/css/bootstrap.css");

const BREAKPOINT_PREFIX = "--bs-breakpoint-";
const BREAKPOINT_VARS = new Set([
  "--bs-breakpoint-xs",
  "--bs-breakpoint-sm",
  "--bs-breakpoint-md",
  "--bs-breakpoint-lg",
  "--bs-breakpoint-xl",
  "--bs-breakpoint-xxl",
]);

const CONTAINER_MAX_WIDTH_SELECTORS = new Set([
  ".container-sm, .container",
  ".container-md, .container-sm, .container",
  ".container-lg, .container-md, .container-sm, .container",
  ".container-xl, .container-lg, .container-md, .container-sm, .container",
  ".container-xxl, .container-xl, .container-lg, .container-md, .container-sm, .container",
]);

const KNOWN_BREAKPOINTS = new Map([
  ["576px", "--bs-breakpoint-sm"],
  ["768px", "--bs-breakpoint-md"],
  ["992px", "--bs-breakpoint-lg"],
  ["1200px", "--bs-breakpoint-xl"],
  ["1400px", "--bs-breakpoint-xxl"],
  ["575.98px", "--bs-breakpoint-sm"],
  ["767.98px", "--bs-breakpoint-md"],
  ["991.98px", "--bs-breakpoint-lg"],
  ["1199.98px", "--bs-breakpoint-xl"],
  ["1399.98px", "--bs-breakpoint-xxl"],
]);

function isBreakpointVar(prop) {
  return prop.startsWith(BREAKPOINT_PREFIX);
}

function isMediaQuery(node) {
  return node.type === "atrule" && node.name === "media";
}

function isContainerMaxWidthRule(rule) {
  if (rule.type !== "rule") return false;
  if (!rule.parent || !isMediaQuery(rule.parent)) return false;
  const sel = rule.selector ? rule.selector.trim() : rule.selectors ? rule.selectors.join(", ").trim() : "";
  return CONTAINER_MAX_WIDTH_SELECTORS.has(sel);
}

export async function processLayout(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  // 1. Extract breakpoint variables from the original source CSS.
  //    These are defined in :root in bootstrap.css but are removed from
  //    bootstrap-dyn.css by extract-base.js (because bootstrap-grid.css
  //    also has a :root rule with the same breakpoints).
  const sourceRaw = await fs.readFile(SOURCE_CSS_PATH, "utf8");
  const sourceRoot = postcss.parse(sourceRaw);
  sourceRoot.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isBreakpointVar(decl.prop)) return;
      if (isDark) darkVars.set(decl.prop, decl.value.trim());
      else lightVars.set(decl.prop, decl.value.trim());
    });
  });

  const dynVars = new Map();
  const usedNames = new Set();
  const stats = { countThemeVars: 0, countLiteralReplaced: 0 };

  // 2. Extract container max-width values from the original source CSS.
  //    These are inside @media rules that get removed by extract-base.js
  //    (because bootstrap-grid.css has the same @media + selector combos).
  sourceRoot.each(node => {
    if (!isMediaQuery(node)) return;
    node.each(child => {
      if (!isContainerMaxWidthRule(child)) return;
      child.each(decl => {
        if (decl.prop !== "max-width") return;
        const val = decl.value.trim();
        if (val.startsWith("var(")) return;

        const sel = child.selector || (child.selectors ? child.selectors.join(", ") : "");
        const name = makeVarName(sel, "max-width", usedNames);
        dynVars.set(name, val);
        stats.countLiteralReplaced++;
      });
    });
  });

  // 3. Tokenize media query breakpoints in the working CSS: replace
  //    threshold values with var() references to the breakpoint variables.
  //    NOTE: This is intentionally disabled because replacing literal
  //    breakpoints with var() references breaks responsive behavior.
  //    The breakpoint variables are available in default-layout.css for
  //    custom theming purposes.
  /*
  root.each(node => {
    if (!isMediaQuery(node) || !node.params) return;

    const params = node.params;
    const newParams = params.replace(/(min-width|max-width):\s*(\d+\.?\d*px)/g, (match, prop, value) => {
      const bpVar = KNOWN_BREAKPOINTS.get(value);
      if (!bpVar) return match;
      stats.countLiteralReplaced++;
      return `${prop}: var(${bpVar})`;
    });

    if (newParams !== params) {
      node.params = newParams;
    }
  });
  */

  const layoutCss = buildModuleCss(
    "/* Default layout (breakpoints and container) variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post layout */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_LAYOUT), layoutCss);

  return { stats };
}
