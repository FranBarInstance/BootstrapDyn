// extract-base.js - Creates bootstrap-dyn.css and extracts grid into default-grid.css
import fs from "fs/promises";
import path from "path";
import postcss from "postcss";
import { FILES } from "./constants.js";

function normalizeDeclValue(value) {
  return value.replace(/\s+/g, " ").trim();
}

function buildAtRuleChain(rule) {
  const chain = [];
  let p = rule.parent;
  while (p) {
    if (p.type === "atrule") {
      chain.push(`@${p.name} ${p.params}`.trim());
    }
    p = p.parent;
  }
  return chain.reverse().join(" | ");
}

function normalizeSelectorList(selector) {
  return selector
    .split(",")
    .map(s => s.trim().replace(/\s+/g, " "))
    .sort()
    .join(", ");
}

function ruleSelectorKey(rule) {
  const chain = buildAtRuleChain(rule);
  const selector = normalizeSelectorList(rule.selector);
  return `${chain} || ${selector}`;
}

function ruleSignature(rule) {
  const chain = buildAtRuleChain(rule);
  const decls = [];
  rule.walkDecls(d => {
    decls.push(`${d.prop}:${normalizeDeclValue(d.value)}`);
  });
  const declPart = decls.join(";");
  return `${chain} || ${rule.selector} || ${declPart}`;
}

function cleanupEmptyContainers(root) {
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules(at => {
      if (at.nodes && at.nodes.length === 0) {
        at.remove();
        changed = true;
      }
    });
  }
}

export async function generateBaseCss(inputCssPath, outputDir = "./dist") {
  const rawCss = await fs.readFile(inputCssPath, "utf8");
  const gridCssPath = path.join(path.dirname(inputCssPath), "bootstrap-grid.css");
  const gridCss = await fs.readFile(gridCssPath, "utf8");

  const mainRoot = postcss.parse(rawCss);
  const gridRoot = postcss.parse(gridCss);

  const gridRuleSignatures = new Set();
  const gridSelectorKeys = new Set();
  gridRoot.walkRules(rule => {
    gridRuleSignatures.add(ruleSignature(rule));
    gridSelectorKeys.add(ruleSelectorKey(rule));
  });

  mainRoot.walkRules(rule => {
    const exact = gridRuleSignatures.has(ruleSignature(rule));
    const bySelector = gridSelectorKeys.has(ruleSelectorKey(rule));
    if (exact || bySelector) {
      rule.remove();
    }
  });

  cleanupEmptyContainers(mainRoot);

  const dynamicCss = mainRoot.toResult({ map: false }).css;
  const outPath = path.join(outputDir, FILES.BOOTSTRAP_DYN);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outPath, dynamicCss, "utf8");
  await fs.writeFile(path.join(outputDir, FILES.DEFAULT_GRID), gridCss, "utf8");
  return outPath;
}
