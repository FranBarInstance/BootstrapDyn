import postcss from "postcss";

export const SKIP_VALUES = new Set(["transparent", "currentcolor", "currentColor", "inherit", "initial"]);
export const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
export const RGBA_RE = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g;
export const PURE_THEME_RE = /^(:root|\[data-bs-theme=[^\]]+\])$/;

export function isThemeRule(node) {
  if (node.type !== "rule") return false;
  if (!node.selectors || !Array.isArray(node.selectors)) return false;
  if (!node.selectors.every(s => PURE_THEME_RE.test(s.trim()))) return false;
  return node.nodes && node.nodes.some(n => n.type === "decl");
}

export function selectorToSlug(sel) {
  return sel
    .replace(/\[data-bs-theme=([^\]]+)\]/g, "theme-$1")
    .replace(/[.#:[\]()=~^$*|>+,\s]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
}

export function propToSlug(prop) {
  return prop
    .replace(/^--bs-/, "")
    .replace(/^--/, "")
    .replace("background-color", "bg-color")
    .replace("background", "bg")
    .replace("text-decoration-color", "text-deco-color");
}

export function makeVarName(selector, prop, usedNames) {
  const base = `--bs-dyn-${selectorToSlug(selector)}-${propToSlug(prop)}`;
  let name = base;
  let i = 2;
  while (usedNames.has(name)) name = `${base}-${i++}`;
  usedNames.add(name);
  return name;
}

export function replaceKnownRgba(value, knownRgbMap) {
  let changed = false;
  const result = value.replace(RGBA_RE, (match, r, g, b, a) => {
    const key = `${r},${g},${b}`;
    const varName = knownRgbMap[key];
    if (!varName) return match;
    changed = true;
    return a !== undefined ? `rgba(var(${varName}), ${a})` : `rgb(var(${varName}))`;
  });
  return changed ? result : null;
}

export function applyAlias(value, aliasMap) {
  if (!value.includes("var(--")) return value;
  for (const [from, to] of aliasMap.entries()) {
    const regex = new RegExp(`var\\(${from.replace(/-/g, '\\-')}\\)`, 'g');
    value = value.replace(regex, `var(${to})`);
  }
  return value;
}

export function buildAliasMap(themeNodes, isColorValue, semanticPairs) {
  const aliasMap = new Map();
  const lightNode = themeNodes.find(n =>
    n.selectors && n.selectors.some(s => s.includes(":root") && !s.includes("[data-bs-theme=dark]"))
  );
  if (!lightNode) return aliasMap;

  const varValues = new Map();
  lightNode.walkDecls(d => {
    if (d.prop.startsWith("--bs-") && isColorValue(d.value)) {
      varValues.set(d.prop, d.value.trim());
    }
  });

  for (const { semantic, bases } of semanticPairs) {
    const semValue = varValues.get(semantic);
    if (!semValue) continue;
    for (const base of bases) {
      const baseValue = varValues.get(base);
      if (baseValue && baseValue === semValue) {
        aliasMap.set(base, semantic);
        const baseRgb = base + "-rgb";
        const semRgb = semantic + "-rgb";
        if (varValues.has(baseRgb) && varValues.has(semRgb) && varValues.get(baseRgb) === varValues.get(semRgb)) {
          aliasMap.set(baseRgb, semRgb);
        }
        break;
      }
    }
  }
  return aliasMap;
}

/**
 * Builds a standardized CSS block for a module (e.g. default-spacing.css)
 * @param {string} header Comment header for the file
 * @param {Map} lightVars Variables for light theme/root
 * @param {Map} darkVars Variables for dark theme
 * @param {Map} dynVars Dynamic variables generated from literals
 * @returns {string} The final CSS string
 */
export function buildModuleCss(header, lightVars, darkVars, dynVars) {
  let css = `${header}\n\n`;

  if (lightVars && lightVars.size > 0) {
    css += ":root {\n";
    for (const [prop, value] of lightVars) css += `  ${prop}: ${value};\n`;
    css += "}\n";
  }

  if (darkVars && darkVars.size > 0) {
    css += '\n[data-bs-theme="dark"] {\n';
    for (const [prop, value] of darkVars) css += `  ${prop}: ${value};\n`;
    css += "}\n";
  }

  if (dynVars && dynVars.size > 0) {
    css += "\n/* Derived variables (dynamic) */\n:root {\n";
    for (const [name, value] of dynVars) css += `  ${name}: ${value};\n`;
    css += "}\n";
  }

  return css;
}
