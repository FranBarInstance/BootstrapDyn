// extract-colors.js - Processes input CSS (e.g. bootstrap-dyn.css)
// and generates default-color.css, bootstrap-dyn.css (with color variables) and contrast-dyn.css
import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, HEX_RE, RGBA_RE, isThemeRule,
  selectorToSlug, propToSlug, makeVarName,
  replaceKnownRgba, applyAlias, buildAliasMap
} from "./core.js";
import { FILES } from "./constants.js";

// Color-specific constants
const COLOR_PROPS = new Set([
  "color", "background", "background-color", "border-color",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "outline-color", "text-decoration-color", "column-rule-color",
  "fill", "stroke", "caret-color", "accent-color",
  "-webkit-tap-highlight-color",
]);

const NON_COLOR_PREFIXES = [
  "--bs-font", "--bs-gradient", "--bs-border-radius", "--bs-border-width",
  "--bs-border-style", "--bs-body-font", "--bs-body-line-height",
  "--bs-body-font-size", "--bs-body-font-weight", "--bs-link-decoration",
  "--bs-focus-ring",
  "--bs-spacer", "--bs-aspect-ratio", "--bs-zindex", "--bs-breakpoint",
  "--bs-navbar-padding", "--bs-navbar-brand-padding", "--bs-navbar-brand-margin",
  "--bs-navbar-brand-font", "--bs-navbar-nav-link-padding",
  "--bs-navbar-toggler-padding", "--bs-navbar-toggler-font",
  "--bs-navbar-toggler-border-radius", "--bs-navbar-toggler-focus",
  "--bs-form-range-thumb-transition",
  "--bs-btn-transition",
  "--bs-link-transition",
  "--bs-accordion-transition",
  "--bs-nav-link-transition",
  "--bs-navbar-toggler-transition",
  "--bs-modal-width", "--bs-modal-max-width",
  "--bs-btn-box-shadow", "--bs-btn-active-shadow", "--bs-btn-focus-shadow-rgb",
  "--bs-box-shadow", "--bs-box-shadow-sm", "--bs-box-shadow-lg", "--bs-box-shadow-inset",
  "--bs-dropdown-zindex", "--bs-toast-zindex", "--bs-modal-zindex",
  "--bs-backdrop-zindex", "--bs-tooltip-zindex", "--bs-popover-zindex",
  "--bs-offcanvas-zindex",
];

const KNOWN_RGB = {
  "13,110,253": "--bs-primary-rgb",
  "108,117,125": "--bs-secondary-rgb",
  "25,135,84": "--bs-success-rgb",
  "13,202,240": "--bs-info-rgb",
  "255,193,7": "--bs-warning-rgb",
  "220,53,69": "--bs-danger-rgb",
  "248,249,250": "--bs-light-rgb",
  "33,37,41": "--bs-dark-rgb",
  "0,0,0": "--bs-black-rgb",
  "255,255,255": "--bs-white-rgb",
};

function isColorProp(prop) {
  if (COLOR_PROPS.has(prop)) return true;
  if (prop.startsWith("--")) {
    for (const p of NON_COLOR_PREFIXES) if (prop.startsWith(p)) return false;
    return true;
  }
  return false;
}

function isColorValue(value) {
  if (!value) return false;
  const v = value.trim();
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  if (v.startsWith("var(")) return false;
  return HEX_RE.test(v) || /rgba?\s*\(/.test(v);
}

const semanticPairs = [
  { semantic: "--bs-primary",   bases: ["--bs-blue"] },
  { semantic: "--bs-danger",    bases: ["--bs-red"] },
  { semantic: "--bs-success",   bases: ["--bs-green"] },
  { semantic: "--bs-warning",   bases: ["--bs-yellow"] },
  { semantic: "--bs-info",      bases: ["--bs-cyan"] },
  { semantic: "--bs-secondary", bases: ["--bs-gray-600"] },
  { semantic: "--bs-light",     bases: ["--bs-gray-100"] },
  { semantic: "--bs-dark",      bases: ["--bs-gray-900"] },
];

function addContrastVars(themeNodes) {
  const darkSemantics  = ["primary", "secondary", "success", "info", "danger", "dark"];
  const lightSemantics = ["warning", "light"];
  themeNodes.forEach(node => {
    for (const name of darkSemantics) {
      node.append({ prop: `--bs-${name}-contrast`, value: "#fff" });
      node.append({ prop: `--bs-${name}-link-contrast`, value: `var(--bs-${name}-contrast)` });
    }
    for (const name of lightSemantics) {
      node.append({ prop: `--bs-${name}-contrast`, value: "#000" });
      node.append({ prop: `--bs-${name}-link-contrast`, value: "var(--bs-link-color)" });
    }
  });
}

function buildColorsVars(themeColorBlocks, groupMap) {
  const tempRoot = postcss.root();
  for (const block of themeColorBlocks) {
    const rule = postcss.rule({ selector: block.selector });
    for (const d of block.declarations) {
      rule.append({ prop: d.prop, value: d.value });
    }
    tempRoot.append(rule);
  }

  addContrastVars(tempRoot.nodes);
  let themeCss = tempRoot.toResult({ map: false }).css;

  if (groupMap.size > 0) {
    const meaningfulGroups = [...groupMap.entries()]
      .filter(([, vars]) => vars.some(v =>
        !SKIP_VALUES.has(v.value) && !SKIP_VALUES.has(v.value.toLowerCase())
      ));
    if (meaningfulGroups.length > 0) {
      let dynBlock = "\n\n/* === Derived colors (dynamic) === */\n:root {\n";
      for (const [group, vars] of meaningfulGroups) {
        const meaningful = vars.filter(v =>
          !SKIP_VALUES.has(v.value) && !SKIP_VALUES.has(v.value.toLowerCase())
        );
        if (meaningful.length === 0) continue;
        dynBlock += `\n  /* ${group} */\n`;
        for (const { name, value } of meaningful) {
          dynBlock += `  ${name}: ${value};\n`;
        }
      }
      dynBlock += "}\n";
      themeCss += dynBlock;
    }
  }

  return themeCss;
}

function generateContrastRules() {
  const semantica = ["primary", "secondary", "success", "info", "warning", "danger", "dark"];
  let rules = "/* === Contrast rules for backgrounds and outline buttons === */\n\n";
  rules += "/* Backgrounds */\n";
  for (const name of semantica) {
    rules += `.bg-${name} { color: var(--bs-${name}-contrast); }\n`;
  }
  rules += `.bg-light { color: var(--bs-light-contrast); }\n`;

  // Add text colors for contrast backgrounds
  rules += "\n/* === Text colors for contrast backgrounds === */\n";
  rules += "/* Ensure text in navbar, nav, etc. uses contrast colors */\n";

  const allColors = [...semantica, "light"];
  const textElements = [
    ".text-muted",
    ".text-body",
    ".card-title",
    ".card-text"
  ];

  for (const color of allColors) {
    rules += "\n";
    for (const element of textElements) {
      rules += `.bg-${color} ${element},\n`;
    }
    // Remove the last comma and newline, add closing brace
    rules = rules.slice(0, -2) + " {\n";
    rules += `  color: var(--bs-${color}-contrast) !important;\n`;
    rules += "}\n";
  }

  // Nav links: general rule applies to all .nav-link within .bg-*
  // .navbar-nav .nav-link overrides (higher specificity 0,3,1) apply inside navbars
  const darkBgColors = ["primary", "secondary", "success", "info", "danger", "dark"];
  rules += "\n/* === Nav link contrast === */\n";
  for (const color of allColors) {
    // General: applies to nav-links both inside and outside navbar
    rules += `.bg-${color} .nav-link {\n`;
    rules += `  color: var(--bs-${color}-link-contrast);\n`;
    rules += `}\n`;
    // Navbar-specific override (higher specificity, wins inside .navbar-nav)
    rules += `.bg-${color} .navbar-nav .nav-link {\n`;
    if (darkBgColors.includes(color)) {
      rules += `  color: color-mix(in srgb, var(--bs-${color}-contrast), transparent 45%);\n`;
    } else {
      rules += `  color: var(--bs-navbar-color);\n`;
    }
    rules += `}\n`;
    rules += `.bg-${color} .navbar-nav .nav-link.active,\n`;
    rules += `.bg-${color} .navbar-nav .nav-link.show {\n`;
    if (darkBgColors.includes(color)) {
      rules += `  color: var(--bs-${color}-contrast);\n`;
    } else {
      rules += `  color: var(--bs-navbar-active-color);\n`;
    }
    rules += `}\n`;
  }

  // Navbar brand (dark backgrounds only — light backgrounds use Bootstrap native)
  rules += "\n/* === Navbar brand contrast (dark backgrounds) === */\n";
  for (const color of darkBgColors) {
    rules += `.bg-${color} .navbar-brand {\n`;
    rules += `  color: var(--bs-${color}-contrast);\n`;
    rules += `}\n`;
  }

  // Add universal text reset for contrast backgrounds
  rules += "\n/* === Universal text reset for contrast backgrounds === */\n";
  rules += "/* Alternative approach: add text-reset class that works with contrast */\n";
  for (const color of allColors) {
    rules += `.bg-${color} .text-reset,\n`;
  }
  // Remove the last comma and newline, add closing brace
  rules = rules.slice(0, -2) + " {\n";
  rules += "  color: inherit !important;\n";
  rules += "}\n";

  rules += "\n/* Outline buttons: hover and active */\n";
  for (const name of semantica) {
    rules += `.btn-outline-${name}:hover,\n.btn-outline-${name}:active {\n`;
    rules += `  color: var(--bs-${name}-contrast);\n`;
    rules += "}\n";
  }
  rules += `\n/* Special case: outline-light */\n`;
  rules += `.btn-outline-light:hover,\n.btn-outline-light:active {\n`;
  rules += `  background-color: var(--bs-light);\n`;
  rules += `  border-color: var(--bs-light);\n`;
  rules += `  color: var(--bs-light-contrast);\n`;
  rules += "}\n";
  rules += `.btn-outline-light {\n`;
  rules += `  --bs-btn-color: currentColor;\n`;
  rules += `  --bs-btn-border-color: currentColor;\n`;
  rules += "}\n";

  rules += "\n/* navbar toggler icon */\n";
  rules += ".navbar .btn,\n";
  rules += ".navbar .navbar-toggler,\n";
  rules += ".navbar .navbar-toggler-icon {\n";
  rules += "  color: inherit;\n";
  rules += "}\n\n";
  rules += ".navbar-toggler-icon {\n";
  rules += "  background-image: none;\n";
  rules += "  background-color: currentColor;\n";
  rules += "  -webkit-mask-image: url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='black' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e\");\n";
  rules += "  mask-image: url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='black' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e\");\n";
  rules += "  -webkit-mask-repeat: no-repeat;\n";
  rules += "  mask-repeat: no-repeat;\n";
  rules += "  -webkit-mask-position: center;\n";
  rules += "  mask-position: center;\n";
  rules += "  -webkit-mask-size: 100% 100%;\n";
  rules += "  mask-size: 100% 100%;\n";
  rules += "}\n";
  return rules;
}

export async function processColors(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  // Semantic map (literal value → semantic variable)
  const semanticMap = new Map();
  root.each(node => {
    if (!isThemeRule(node)) return;
    node.walkDecls(d => {
      if (!d.prop.startsWith("--bs-")) return;
      const v = d.value.trim();
      if (v.startsWith("var(")) return;
      if (!HEX_RE.test(v) && !/rgba?\s*\(/.test(v) && !/^\d+,/.test(v)) return;
      const existing = semanticMap.get(v);
      if (!existing || d.prop.length < existing.length) semanticMap.set(v, d.prop);
    });
  });

  const themeNodesForAlias = [];
  root.each(node => {
    if (isThemeRule(node)) {
      themeNodesForAlias.push(node.clone());
    }
  });
  const aliasMap = buildAliasMap(themeNodesForAlias, isColorValue, semanticPairs);

  // Extract only color properties from theme nodes, leaving the rest in the tree
  const themeColorBlocks = [];
  root.each(node => {
    if (!isThemeRule(node)) return;
    const declarations = [];
    node.each(decl => {
      if (isColorProp(decl.prop)) {
        declarations.push({ prop: decl.prop, value: decl.value });
        decl.remove();
      }
    });
    if (declarations.length > 0) {
      const selector = node.selectors.join(', ');
      themeColorBlocks.push({ selector, declarations });
    }
    if (node.nodes.length === 0) {
      node.remove();
    }
  });

  const dynVars = new Map();
  const usedNames = new Set();
  const groupMap = new Map();
  let stats = { countSemantic: 0, countRgba: 0, countDyn: 0, countSkipped: 0, countAlias: 0 };

  root.walkDecls(decl => {
    const rawVal = decl.value.trim();
    if (rawVal.startsWith("var(")) {
      const newVal = applyAlias(rawVal, aliasMap);
      if (newVal !== rawVal) { decl.value = newVal; stats.countAlias++; }
      return;
    }
    if (!isColorProp(decl.prop)) return;

    if (SKIP_VALUES.has(rawVal) || SKIP_VALUES.has(rawVal.toLowerCase())) { stats.countSkipped++; return; }

    if (/rgba?\s*\(/.test(rawVal)) {
      const replaced = replaceKnownRgba(rawVal, KNOWN_RGB);
      if (replaced) { decl.value = replaced; stats.countRgba++; return; }
      const newVal = applyAlias(rawVal, aliasMap);
      if (newVal !== rawVal) { decl.value = newVal; stats.countAlias++; }
      return;
    }

    if (!isColorValue(rawVal)) return;

    const semanticVar = semanticMap.get(rawVal);
    if (semanticVar) { decl.value = `var(${semanticVar})`; stats.countSemantic++; return; }

    // --- Dynamic variables with color-mix ---------------------------------
    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;
    const primarySel = rule.selectors[0].trim();

    // 1) Tables (.table-{color})
    const tableMatch = primarySel.match(/^\.table-([a-z]+)$/);
    if (tableMatch) {
      const color = tableMatch[1];
      const knownColors = new Set(["primary","secondary","success","info","warning","danger","light","dark"]);
      if (knownColors.has(color)) {
        const baseVar = `--bs-${color}-bg-subtle`;
        let mixPercent = null;
        if (decl.prop.endsWith("border-color")) {
          mixPercent = 20;
        } else if (decl.prop.includes("striped-bg")) {
          mixPercent = 5;
        } else if (decl.prop.includes("active-bg")) {
          mixPercent = 10;
        } else if (decl.prop.includes("hover-bg")) {
          mixPercent = 7.5;
        }
        if (mixPercent !== null) {
          const newValue = `color-mix(in srgb, var(${baseVar}), black ${mixPercent}%)`;
          const varName = makeVarName(primarySel, decl.prop, usedNames);
          decl.value = `var(${varName})`;
          dynVars.set(varName, newValue);
          const groupKey = "table";
          if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
          groupMap.get(groupKey).push({ name: varName, value: newValue });
          stats.countDyn++;
          return;
        }
      }
    }

    // 2) Forms (focus, thumb)
    if (
      decl.prop === "--bs-form-control-focus-border-color" ||
      decl.prop === "--bs-form-select-focus-border-color" ||
      decl.prop === "--bs-form-check-input-focus-border-color"
    ) {
      const newValue = `color-mix(in srgb, var(--bs-primary), white 50%)`;
      const varName = makeVarName(primarySel, decl.prop, usedNames);
      decl.value = `var(${varName})`;
      dynVars.set(varName, newValue);
      const groupKey = "form";
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey).push({ name: varName, value: newValue });
      stats.countDyn++;
      return;
    }
    if (
      decl.prop === "--bs-form-range-webkit-slider-thumb-active-bg-color" ||
      decl.prop === "--bs-form-range-moz-range-thumb-active-bg-color"
    ) {
      const newValue = `color-mix(in srgb, var(--bs-primary), white 70%)`;
      const varName = makeVarName(primarySel, decl.prop, usedNames);
      decl.value = `var(${varName})`;
      dynVars.set(varName, newValue);
      const groupKey = "form";
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey).push({ name: varName, value: newValue });
      stats.countDyn++;
      return;
    }

    // 3) Buttons (.btn-{color})
    const btnMatch = primarySel.match(/^\.btn-([a-z]+)(?::[a-z]+)?$/);
    if (btnMatch) {
      const color = btnMatch[1];
      const knownColors = new Set(["primary","secondary","success","info","warning","danger","light","dark"]);
      if (knownColors.has(color)) {
        const baseVar = `--bs-${color}`;
        const isLight = color === "light";
        const isDark = color === "dark";
        let mixColor = "black";
        if (isDark) mixColor = "white";

        let mixPercent = null;
        if (decl.prop.endsWith("hover-bg")) {
          mixPercent = isLight ? 5 : (isDark ? 15 : 10);
        } else if (decl.prop.endsWith("hover-border-color")) {
          mixPercent = isLight ? 10 : (isDark ? 20 : 12);
        } else if (decl.prop.endsWith("active-bg")) {
          mixPercent = isLight ? 10 : (isDark ? 20 : 12);
        } else if (decl.prop.endsWith("active-border-color")) {
          mixPercent = isLight ? 15 : (isDark ? 25 : 15);
        }

        if (mixPercent !== null) {
          const newValue = `color-mix(in srgb, var(${baseVar}), ${mixColor} ${mixPercent}%)`;
          const varName = makeVarName(primarySel, decl.prop, usedNames);
          decl.value = `var(${varName})`;
          dynVars.set(varName, newValue);
          const groupKey = "btn";
          if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
          groupMap.get(groupKey).push({ name: varName, value: newValue });
          stats.countDyn++;
          return;
        }
      }
    }

    // 4) Other derived variables (literal value is stored)
    const varName = makeVarName(primarySel, decl.prop, usedNames);
    dynVars.set(varName, rawVal);
    const groupKey = selectorToSlug(primarySel).split("-")[0] || "misc";
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey).push({ name: varName, value: rawVal });
    decl.value = `var(${varName})`;
    stats.countDyn++;
  });

  // Second alias pass
  root.walkDecls(decl => {
    const newVal = applyAlias(decl.value, aliasMap);
    if (newVal !== decl.value) { decl.value = newVal; stats.countAlias++; }
  });

  const colorsCss = buildColorsVars(themeColorBlocks, groupMap);
  const dynamicCss = root.toResult({ map: false }).css;
  const contrastCss = generateContrastRules();

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post colors */\n\n${dynamicCss}`
  );
  await fs.writeFile(
    path.join(outputDir, FILES.DEFAULT_COLOR),
    `/* ${FILES.DEFAULT_COLOR} - Default color variables */\n\n/* NOTE: Inline SVG with fixed colors requires manual override */\n\n${colorsCss}`
  );
  await fs.writeFile(
    path.join(outputDir, FILES.CONTRAST_DYN),
    `/* ${FILES.CONTRAST_DYN} - Dynamic contrast rules */\n\n${contrastCss}`
  );

  return { stats };
}
