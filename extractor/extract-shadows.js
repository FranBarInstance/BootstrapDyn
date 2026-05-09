import postcss from "postcss";
import fs from "fs/promises";
import path from "path";
import {
  SKIP_VALUES, isThemeRule, selectorToSlug, propToSlug,
  makeVarName, buildModuleCss
} from "./core.js";
import { FILES } from "./constants.js";

const SHADOW_PROPS = new Set(["box-shadow", "text-shadow"]);

const SHADOW_PREFIXES = [
  "--bs-box-shadow",
  "--bs-btn-box-shadow",
  "--bs-btn-active-shadow",
  "--bs-btn-focus-box-shadow",
  "--bs-focus-ring",
  "--bs-accordion-btn-focus-box-shadow",
];

function isShadowProp(prop) {
  if (SHADOW_PROPS.has(prop)) return true;
  if (!prop.startsWith("--")) return false;
  if (SHADOW_PREFIXES.some(pre => prop.startsWith(pre))) return true;
  return prop.includes("shadow");
}

function isShadowLiteral(value) {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (SKIP_VALUES.has(v) || SKIP_VALUES.has(v.toLowerCase())) return false;
  if (v === "none") return true;
  return /(inset|rgba?\(|#|\d+px|\d+rem|\d+em)/.test(v);
}

function normalizeShadowTokenValue(selector, prop, value) {
  const v = value.trim();
  if (v === "") return "none";
  // Keep button base shadow opt-in by default for theming flexibility.
  if (selector === ".btn" && prop === "--bs-btn-box-shadow") return "none";
  return v;
}

export async function processShadows(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const root = postcss.parse(rawCss);

  const lightVars = new Map();
  const darkVars = new Map();

  root.each(node => {
    if (!isThemeRule(node)) return;
    const isDark = node.selectors.some(s => s.includes('[data-bs-theme="dark"]'));
    node.each(decl => {
      if (!isShadowProp(decl.prop)) return;
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
    if (!isShadowProp(decl.prop)) return;
    if (rawVal.startsWith("var(")) return;
    let rule = decl.parent;
    while (rule && rule.type !== "rule") rule = rule.parent;
    if (!rule || !rule.selectors || !rule.selectors[0]) return;
    const selector = rule.selectors[0].trim();
    const normalizedVal = normalizeShadowTokenValue(selector, decl.prop, rawVal);

    if (!isShadowLiteral(normalizedVal)) {
      if (SKIP_VALUES.has(rawVal) || SKIP_VALUES.has(rawVal.toLowerCase())) stats.countSkipped++;
      return;
    }

    const name = makeVarName(selector, decl.prop, usedNames);
    dynVars.set(name, normalizedVal);
    decl.value = `var(${name})`;
    stats.countLiteralReplaced++;
  });

  // Bootstrap defines --bs-btn-box-shadow on .btn but does not apply box-shadow
  // on the base state. Add it so theme overrides can enable visible default shadows.
  root.walkRules(rule => {
    if (rule.selector !== ".btn") return;
    let hasBtnShadowVar = false;
    let hasBoxShadowDecl = false;
    rule.walkDecls(decl => {
      if (decl.prop === "--bs-btn-box-shadow") hasBtnShadowVar = true;
      if (decl.prop === "box-shadow") hasBoxShadowDecl = true;
    });
    if (hasBtnShadowVar && !hasBoxShadowDecl) {
      rule.append({ prop: "box-shadow", value: "var(--bs-btn-box-shadow)" });
    }
  });

  // Likewise, Bootstrap defines --bs-card-box-shadow on .card but does not apply
  // box-shadow on the base state. Add it so theme overrides can enable card shadows.
  root.walkRules(rule => {
    if (rule.selector !== ".card") return;
    let hasCardShadowVar = false;
    let hasBoxShadowDecl = false;
    rule.walkDecls(decl => {
      if (decl.prop === "--bs-card-box-shadow") hasCardShadowVar = true;
      if (decl.prop === "box-shadow") hasBoxShadowDecl = true;
    });
    if (hasCardShadowVar && !hasBoxShadowDecl) {
      rule.append({ prop: "box-shadow", value: "var(--bs-card-box-shadow)" });
    }
  });

  // Bootstrap does not define a --bs-table-box-shadow variable. Inject one so
  // tables can receive configurable shadows via theme overrides, same as cards.
  root.walkRules(rule => {
    if (rule.selector !== ".table") return;
    let hasBoxShadowDecl = false;
    let hasTableShadowVar = false;
    rule.walkDecls(decl => {
      if (decl.prop === "box-shadow") hasBoxShadowDecl = true;
      if (decl.prop === "--bs-table-box-shadow") hasTableShadowVar = true;
    });
    if (!hasBoxShadowDecl) {
      if (!hasTableShadowVar) {
        const varName = makeVarName(".table", "box-shadow", usedNames);
        dynVars.set(varName, "none");
        rule.append({ prop: "--bs-table-box-shadow", value: `var(${varName})` });
      }
      rule.append({ prop: "box-shadow", value: "var(--bs-table-box-shadow)" });
    }
  });

  // Helper: inject a box-shadow variable and declaration on a selector that
  // Bootstrap does not provide one for. Enables per-element shadow theming.
  function injectBoxShadow(selector) {
    root.walkRules(rule => {
      if (rule.selector !== selector) return;
      const varProp = `--bs-${selector.slice(1)}-box-shadow`;
      let hasBoxShadowDecl = false;
      let hasShadowVar = false;
      rule.walkDecls(decl => {
        if (decl.prop === "box-shadow") hasBoxShadowDecl = true;
        if (decl.prop === varProp) hasShadowVar = true;
      });
      if (!hasBoxShadowDecl) {
        if (!hasShadowVar) {
          const varName = makeVarName(selector, "box-shadow", usedNames);
          dynVars.set(varName, "none");
          rule.append({ prop: varProp, value: `var(${varName})` });
        }
        rule.append({ prop: "box-shadow", value: `var(${varProp})` });
      }
    });
  }

  const SHADOWABLE_ELEMENTS = [
    ".navbar",
    ".alert",
    ".img-thumbnail",
    ".accordion-item",
    ".badge",
    ".list-group",
    ".breadcrumb",
  ];

  for (const sel of SHADOWABLE_ELEMENTS) {
    injectBoxShadow(sel);
  }

  const shadowsCss = buildModuleCss(
    "/* Default shadow variables */",
    lightVars,
    darkVars,
    dynVars
  );
  stats.countThemeVars = lightVars.size + darkVars.size;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, FILES.BOOTSTRAP_DYN),
    `/* ${FILES.BOOTSTRAP_DYN} - Post shadows */\n\n${root.toResult({ map: false }).css}`
  );
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_SHADOWS), shadowsCss);

  return { stats };
}
