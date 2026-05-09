import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const LAYER_PROPS = new Set([
  "z-index",
]);

const LAYER_PREFIXES = [
  "--bs-dropdown-zindex",
  "--bs-toast-zindex",
  "--bs-modal-zindex",
  "--bs-backdrop-zindex",
  "--bs-tooltip-zindex",
  "--bs-popover-zindex",
  "--bs-offcanvas-zindex",
];

const LAYER_THEME_VARS = new Set(LAYER_PREFIXES);

function isLayerProp(prop) {
  if (LAYER_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  return LAYER_PREFIXES.some(pre => prop.startsWith(pre));
}

function isLayerValue(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (v === "auto" || v === "inherit" || v === "initial") return false;
  return /^-?\d+$/.test(v);
}

export async function processLayers(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  // 1. Extract theme variables from :root / [data-bs-theme=...] rules
  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isLayerProp(decl.prop)) return;
      const value = decl.value.trim();
      if (isDark) darkVars.set(decl.prop, value);
      else lightVars.set(decl.prop, value);
      decl.remove();
    });
    if (node.nodes.length === 0) node.remove();
  });

  // 2. Extract layer variables defined in component rules
  //    e.g. .dropdown-menu { --bs-dropdown-zindex: 1000; }
  //    Move them to lightVars and replace with var() references
  root.walkDecls(decl => {
    if (!LAYER_THEME_VARS.has(decl.prop)) return;
    const value = decl.value.trim();
    if (value.startsWith("var(")) return;
    if (!isLayerValue(value)) return;

    // Only extract if not already in lightVars from theme rules
    if (!lightVars.has(decl.prop)) {
      lightVars.set(decl.prop, value);
    }
    // Replace the literal value with a self-referencing var()
    // so component rules keep the variable name but consume the extracted value
    decl.value = `var(${decl.prop})`;
  });

  // 3. Remove component-rule declarations that are now self-referencing
  //    e.g. .dropdown-menu { --bs-dropdown-zindex: var(--bs-dropdown-zindex); }
  //    These are redundant since the value is now in default-layers.css
  root.each(node => {
    if (node.type !== "rule") return;
    const toRemove = [];
    node.each(decl => {
      if (!LAYER_THEME_VARS.has(decl.prop)) return;
      if (decl.value.trim() === `var(${decl.prop})`) {
        toRemove.push(decl);
      }
    });
    toRemove.forEach(d => d.remove());
    if (node.nodes.length === 0) node.remove();
  });

  const dynVars = new Map();
  const usedNames = new Set();
  const stats = { countThemeVars: 0, countLiteralReplaced: 0 };

  // 3. Replace remaining z-index literals with dynamic variables
  root.walkDecls(decl => {
    if (!isLayerProp(decl.prop)) return;

    const rawVal = decl.value.trim();
    if (rawVal.startsWith("var(")) return;
    if (!isLayerValue(rawVal)) return;

    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;
    const selector = rule.selectors[0].trim();

    const name = makeVarName(selector, decl.prop, usedNames);
    dynVars.set(name, rawVal);
    decl.value = `var(${name})`;
    stats.countLiteralReplaced++;
  });

  const layersCss = buildModuleCss(
    "/* Default layer (z-index) variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post layers */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_LAYERS), layersCss);

  return { stats };
}
