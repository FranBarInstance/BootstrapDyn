import { describe, it, before } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import path from "path";
import os from "os";
import postcss from "postcss";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "url";
import { generateBaseCss } from "../extractor/extract-base.js";
import { processColors } from "../extractor/extract-colors.js";
import { processSpacing } from "../extractor/extract-spacing.js";
import { processCorners } from "../extractor/extract-corners.js";
import { processShadows } from "../extractor/extract-shadows.js";
import { processBorders } from "../extractor/extract-borders.js";
import { processForms } from "../extractor/extract-forms.js";
import { processMotion } from "../extractor/extract-motion.js";
import { processSizing } from "../extractor/extract-sizing.js";
import { processLayers } from "../extractor/extract-layers.js";
import { processLayout } from "../extractor/extract-layout.js";
import { processTypography } from "../extractor/extract-typography.js";
import { finalize } from "../extractor/extract-finalize.js";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const INPUT_CSS = path.resolve(__dirname, "../bootstrap/dist/css/bootstrap.css");
const EXPECTED_DIST_DIR = path.resolve(__dirname, "../dist");

const GENERATED_FILES = [
  "bootstrap-dyn.css",
  "default-grid.css",
  "default-color.css",
  "default-spacing.css",
  "default-corners.css",
  "default-shadows.css",
  "default-borders.css",
  "default-forms.css",
  "default-motion.css",
  "default-sizing.css",
  "default-layers.css",
  "default-layout.css",
  "default-typography.css",
  "contrast-dyn.css",
];

function hasBalancedParentheses(content) {
  let depth = 0;

  for (const char of content) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0;
}

describe("extractor pipeline", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrapdyn-test-"));
    await generateBaseCss(INPUT_CSS, tmpDir);
    await processColors(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processSpacing(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processCorners(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processShadows(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processBorders(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processForms(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processMotion(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processSizing(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processLayers(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processLayout(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await processTypography(path.join(tmpDir, "bootstrap-dyn.css"), tmpDir);
    await finalize(tmpDir);
  });

  it("generates the output files", async () => {
    const files = await fs.readdir(tmpDir);
    for (const file of GENERATED_FILES) {
      assert(files.includes(file), `missing ${file}`);
    }
  });

  it("reproduces committed dist output from extractor/main.js", async () => {
    const cliOutputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrapdyn-dist-repro-"));

    await execFileAsync("node", ["extractor/main.js", "bootstrap/dist/css/bootstrap.css", cliOutputDir], {
      cwd: ROOT_DIR,
    });

    for (const file of GENERATED_FILES) {
      const generated = await fs.readFile(path.join(cliOutputDir, file), "utf8");
      const committed = await fs.readFile(path.join(EXPECTED_DIST_DIR, file), "utf8");
      assert.strictEqual(generated, committed, `dist mismatch for ${file}`);
    }
  });

  describe("generated CSS syntax", () => {
    it("parses all generated files with PostCSS", async () => {
      for (const file of GENERATED_FILES) {
        const content = await fs.readFile(path.join(tmpDir, file), "utf8");
        assert.doesNotThrow(() => postcss.parse(content), `invalid CSS in ${file}`);
      }
    });

    it("contains no malformed var() fallback patterns", async () => {
      const malformedVarPatterns = [
        /var\([^)]*,\s*\)/g,
        /var\([^)]*,,/g,
        /var\([^)]*\(\s*\)/g,
      ];

      for (const file of GENERATED_FILES) {
        const content = await fs.readFile(path.join(tmpDir, file), "utf8");

        for (const pattern of malformedVarPatterns) {
          assert(!pattern.test(content), `malformed var() pattern in ${file}: ${pattern}`);
        }
      }
    });

    it("keeps parentheses balanced in generated CSS", async () => {
      for (const file of GENERATED_FILES) {
        const content = await fs.readFile(path.join(tmpDir, file), "utf8");
        assert(hasBalancedParentheses(content), `unbalanced parentheses found in ${file}`);
      }
    });
  });

  describe("default-grid.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-grid.css"), "utf8");
    });

    it("contains essential grid selectors", () => {
      assert(content.includes(".container"), "missing .container");
      assert(content.includes(".row {"), "missing .row");
      assert(content.includes(".row > *"), "missing .row > *");
      assert(content.includes(".col-12"), "missing .col-12");
    });
  });

  describe("default-color.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-color.css"), "utf8");
    });

    it("contains essential color variables", () => {
      assert(content.includes("--bs-blue:"), "missing --bs-blue");
      assert(content.includes("--bs-primary:"), "missing --bs-primary");
      assert(content.includes("--bs-body-color:"), "missing --bs-body-color");
      assert(content.includes("--bs-body-bg:"), "missing --bs-body-bg");
      assert(content.includes("--bs-primary-contrast:"), "missing --bs-primary-contrast");
    });

    it("has blocks for light and dark themes", () => {
      assert(
        content.includes(":root, [data-bs-theme=light]") || content.includes(":root"),
        "missing light block"
      );
      assert(content.includes("[data-bs-theme=dark]"), "missing dark block");
    });

    it("does not contain typography variables", () => {
      assert(!content.includes("--bs-typo-"), "contains typo prefix");
      assert(!content.includes("--bs-font-sans-serif:"), "contains font-sans-serif");
      assert(!content.includes("--bs-body-font-family:"), "contains body-font-family");
    });
  });

  describe("default-typography.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-typography.css"), "utf8");
    });

    it("contains essential typography variables", () => {
      assert(content.includes("--bs-typo-font-sans-serif:"), "missing font-sans-serif");
      assert(content.includes("--bs-typo-body-font-family:"), "missing body-font-family");
      assert(content.includes("--bs-typo-body-font-size:"), "missing body-font-size");
      assert(content.includes("--bs-typo-body-line-height:"), "missing body-line-height");
    });

    it("has derived dynamic variables", () => {
      assert(content.includes("--bs-dyn-h1-font-size:"), "missing h1-font-size");
      assert(content.includes("--bs-dyn-btn-btn-font-size:"), "missing btn-font-size");
    });

    it("does not contain pure color variables", () => {
      assert(!content.includes("--bs-primary:"), "contains --bs-primary");
      assert(!content.includes("#0d6efd"), "contains literal blue hex");
      assert(!content.includes("--bs-blue:"), "contains --bs-blue");
    });
  });

  describe("default-spacing.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-spacing.css"), "utf8");
    });

    it("contains derived spacing variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic spacing vars");
      assert(content.includes("--bs-dyn-body-margin:"), "missing body margin dyn var");
      assert(content.includes("--bs-dyn-nav-nav-link-padding-y:"), "missing nav-link padding dyn var");
    });
  });

  describe("default-corners.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-corners.css"), "utf8");
    });

    it("contains essential corner variables", () => {
      assert(content.includes("--bs-border-radius:"), "missing --bs-border-radius");
      assert(content.includes("--bs-border-radius-lg:"), "missing --bs-border-radius-lg");
    });

    it("contains derived corner variables", () => {
      assert(content.includes("--bs-dyn-rounded-0-border-radius:"), "missing rounded dyn var");
    });
  });

  describe("default-shadows.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-shadows.css"), "utf8");
    });

    it("contains essential shadow variables", () => {
      assert(content.includes("--bs-box-shadow:"), "missing --bs-box-shadow");
      assert(content.includes("--bs-box-shadow-sm:"), "missing --bs-box-shadow-sm");
      assert(content.includes("--bs-box-shadow-lg:"), "missing --bs-box-shadow-lg");
    });

    it("contains derived shadow variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic shadow vars");
    });

    it("does not extract Bootstrap's internal table accent paint shadow", () => {
      assert(
        !content.includes("--bs-dyn-table-not-caption-box-shadow"),
        "table accent paint shadow should remain in bootstrap-dyn.css"
      );
    });
  });

  describe("default-borders.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-borders.css"), "utf8");
    });

    it("contains essential border variables", () => {
      assert(content.includes("--bs-border-width:"), "missing --bs-border-width");
      assert(content.includes("--bs-border-style:"), "missing --bs-border-style");
    });

    it("contains derived border variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic border vars");
    });
  });

  describe("default-forms.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-forms.css"), "utf8");
    });

    it("contains derived form variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic form vars");
    });
  });

  describe("default-motion.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-motion.css"), "utf8");
    });

    it("contains derived motion variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic motion vars");
      assert(content.includes("-transition"), "missing transition-related vars");
    });
  });

  describe("default-sizing.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-sizing.css"), "utf8");
    });

    it("contains derived sizing variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic sizing vars");
      assert(content.includes("-width"), "missing width-related vars");
    });
  });

  describe("default-layers.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-layers.css"), "utf8");
    });

    it("contains essential layer variables", () => {
      assert(content.includes("--bs-dropdown-zindex:"), "missing --bs-dropdown-zindex");
      assert(content.includes("--bs-modal-zindex:"), "missing --bs-modal-zindex");
      assert(content.includes("--bs-backdrop-zindex:"), "missing --bs-backdrop-zindex");
      assert(content.includes("--bs-tooltip-zindex:"), "missing --bs-tooltip-zindex");
      assert(content.includes("--bs-popover-zindex:"), "missing --bs-popover-zindex");
      assert(content.includes("--bs-offcanvas-zindex:"), "missing --bs-offcanvas-zindex");
    });

    it("contains derived layer variables", () => {
      assert(content.includes("--bs-dyn-"), "missing dynamic layer vars");
      assert(content.includes("-z-index"), "missing z-index-related vars");
    });
  });

  describe("default-layout.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "default-layout.css"), "utf8");
    });

    it("contains essential breakpoint variables", () => {
      assert(content.includes("--bs-breakpoint-xs:"), "missing --bs-breakpoint-xs");
      assert(content.includes("--bs-breakpoint-sm:"), "missing --bs-breakpoint-sm");
      assert(content.includes("--bs-breakpoint-md:"), "missing --bs-breakpoint-md");
      assert(content.includes("--bs-breakpoint-lg:"), "missing --bs-breakpoint-lg");
      assert(content.includes("--bs-breakpoint-xl:"), "missing --bs-breakpoint-xl");
      assert(content.includes("--bs-breakpoint-xxl:"), "missing --bs-breakpoint-xxl");
    });

    it("contains derived layout variables", () => {
      // Container max-widths are tokenized as --bs-dyn-* variables
      assert(content.includes("--bs-dyn-"), "missing dynamic layout vars");
    });
  });

  describe("contrast-dyn.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "contrast-dyn.css"), "utf8");
    });

    it("contains contrast rules for backgrounds", () => {
      assert(
        content.includes(".bg-primary { color: var(--bs-primary-contrast); }"),
        "missing bg-primary contrast"
      );
    });

    it("contains contrast rules for outline buttons", () => {
      assert(
        content.includes(".btn-outline-primary:hover,"),
        "missing btn-outline-primary selector"
      );
      assert(
        content.includes("color: var(--bs-primary-contrast);"),
        "missing primary-contrast usage"
      );
    });

    it("does not define any --bs-*-contrast variables", () => {
      // Contrast variables must be defined in default-color.css, not here
      assert(!content.includes("--bs-primary-contrast:"), "should not define primary-contrast");
      assert(!content.includes("--bs-secondary-contrast:"), "should not define secondary-contrast");
    });
  });

  describe("bootstrap-dyn.css", () => {
    let content;

    before(async () => {
      content = await fs.readFile(path.join(tmpDir, "bootstrap-dyn.css"), "utf8");
    });

    it("does not define original variables that were extracted", () => {
      // Color and typography variables were moved to their own files
      assert(!content.includes("--bs-blue:"), "still defines --bs-blue");
      assert(!content.includes("--bs-primary:"), "still defines --bs-primary");
      assert(!content.includes("--bs-font-sans-serif:"), "still defines --bs-font-sans-serif");
      assert(!content.includes("--bs-body-font-family:"), "still defines --bs-body-font-family");
    });

    it("uses var() references instead of literal color values", () => {
      assert(content.includes("var(--bs-primary)"), "does not use var(--bs-primary)");
    });

    it("does not contain base grid selectors extracted to default-grid.css", () => {
      assert(!content.includes(".row {"), "still contains .row");
      assert(!content.includes(".row > *"), "still contains .row > *");
      assert(!content.includes(".col-12"), "still contains .col-12");
      assert(!content.includes(".offset-1"), "still contains .offset-1");
    });

    it("replaces common spacing literals with var() references", () => {
      assert(content.includes("margin: var(--bs-dyn-body-margin);"), "body margin not tokenized");
    });

    it("does not define extracted corner variables", () => {
      assert(!content.includes("--bs-border-radius:"), "still defines --bs-border-radius");
    });

    it("does not define extracted shadow variables", () => {
      assert(!content.includes("--bs-box-shadow:"), "still defines --bs-box-shadow");
    });

    it("does not define extracted border variables", () => {
      assert(!content.includes("--bs-border-width:"), "still defines --bs-border-width");
    });

    it("does not define extracted form variables", () => {
      assert(!content.includes("--bs-form-control-height:"), "still defines --bs-form-control-height");
    });

    it("does not define extracted motion variables", () => {
      assert(!content.includes("transition: all 0.2s ease-in-out;"), "still defines literal transition");
    });

    it("does not define extracted sizing variables", () => {
      assert(!content.includes(".w-25 { width: 25%"), "still defines literal width in .w-25");
    });

    it("does not define extracted layer variables", () => {
      assert(!content.includes("--bs-dropdown-zindex:"), "still defines --bs-dropdown-zindex");
      assert(!content.includes("--bs-modal-zindex:"), "still defines --bs-modal-zindex");
      assert(!content.includes("--bs-backdrop-zindex:"), "still defines --bs-backdrop-zindex");
      assert(!content.includes("--bs-tooltip-zindex:"), "still defines --bs-tooltip-zindex");
      assert(!content.includes("--bs-popover-zindex:"), "still defines --bs-popover-zindex");
      assert(!content.includes("--bs-offcanvas-zindex:"), "still defines --bs-offcanvas-zindex");
    });

    it("does not define extracted layout variables", () => {
      assert(!content.includes("--bs-breakpoint-xs:"), "still defines --bs-breakpoint-xs");
      assert(!content.includes("--bs-breakpoint-sm:"), "still defines --bs-breakpoint-sm");
      assert(!content.includes("--bs-breakpoint-md:"), "still defines --bs-breakpoint-md");
      assert(!content.includes("--bs-breakpoint-lg:"), "still defines --bs-breakpoint-lg");
      assert(!content.includes("--bs-breakpoint-xl:"), "still defines --bs-breakpoint-xl");
      assert(!content.includes("--bs-breakpoint-xxl:"), "still defines --bs-breakpoint-xxl");
    });

    it("contains no pipeline marker comments", () => {
      assert(!content.includes("Post typography"), "pipeline marker not cleaned");
      assert(!content.includes("Post layout"), "pipeline marker not cleaned");
      assert(!content.includes("Post layers"), "pipeline marker not cleaned");
      assert(!content.includes("Post sizing"), "pipeline marker not cleaned");
      assert(!content.includes("Post motion"), "pipeline marker not cleaned");
      assert(!content.includes("Post forms"), "pipeline marker not cleaned");
      assert(!content.includes("Post borders"), "pipeline marker not cleaned");
      assert(!content.includes("Post shadows"), "pipeline marker not cleaned");
      assert(!content.includes("Post corners"), "pipeline marker not cleaned");
      assert(!content.includes("Post spacing"), "pipeline marker not cleaned");
      assert(!content.includes("Post colors"), "pipeline marker not cleaned");
    });

    it("keeps border-radius var fallbacks syntactically valid", () => {
      assert(
        content.includes("border-top-left-radius: var(--bs-border-radius-top-left, var(--bs-dropdown-item-border-radius, 0));"),
        "dropdown item border radius fallback was not preserved"
      );
      assert(
        !content.includes("var(--bs-dropdown-item-border-radius,)"),
        "border-radius fallback was split into malformed CSS"
      );
      assert(
        !content.includes("border-top-right-radius: var(--bs-border-radius-top-right, 0));"),
        "border-radius fallback has an extra closing parenthesis"
      );
    });

    it("keeps table striped, active, and hover paint behavior inline", () => {
      assert(
        content.includes("box-shadow: inset 0 0 0 9999px var(--bs-table-bg-state, var(--bs-table-bg-type, var(--bs-table-accent-bg)));"),
        "table accent paint shadow was tokenized"
      );
      assert(
        content.includes("--bs-table-bg-type: var(--bs-table-striped-bg);"),
        "missing striped table background state"
      );
      assert(
        content.includes("--bs-table-bg-state: var(--bs-table-hover-bg);"),
        "missing hover table background state"
      );
    });
  });

  describe("module isolation and sequence", () => {
    it("ensures default-color.css and default-typography.css have no overlapping variable names", async () => {
      const colors = await fs.readFile(path.join(tmpDir, "default-color.css"), "utf8");
      const typo = await fs.readFile(path.join(tmpDir, "default-typography.css"), "utf8");

      const colorVars = new Set([...colors.matchAll(/--bs-[\w-]+:/g)].map(m => m[0]));
      const typoVars = new Set([...typo.matchAll(/--bs-[\w-]+:/g)].map(m => m[0]));

      for (const v of colorVars) {
        assert(!typoVars.has(v), `variable ${v} found in both color and typography files`);
      }
    });

    it("ensures no extracted theme variables remain in bootstrap-dyn.css", async () => {
      const content = await fs.readFile(path.join(tmpDir, "bootstrap-dyn.css"), "utf8");
      // Check for presence of variable DEFINITIONS (not usage)
      assert(!content.includes("--bs-primary:"), "color var definition remained");
      assert(!content.includes("--bs-border-radius:"), "corner var definition remained");
      assert(!content.includes("--bs-box-shadow:"), "shadow var definition remained");
      assert(!content.includes("--bs-border-width:"), "border var definition remained");
      assert(!content.includes("--bs-form-control-bg:"), "form var definition remained");
      assert(!content.includes("--bs-typo-body-font-family:"), "typo var definition remained");
      assert(!content.includes("--bs-dropdown-zindex:"), "layer var definition remained");
      assert(!content.includes("--bs-modal-zindex:"), "layer var definition remained");
      assert(!content.includes("--bs-breakpoint-xs:"), "layout var definition remained");
      assert(!content.includes("--bs-breakpoint-sm:"), "layout var definition remained");
      assert(!content.includes("--bs-breakpoint-md:"), "layout var definition remained");
      assert(!content.includes("--bs-breakpoint-lg:"), "layout var definition remained");
      assert(!content.includes("--bs-breakpoint-xl:"), "layout var definition remained");
      assert(!content.includes("--bs-breakpoint-xxl:"), "layout var definition remained");
    });
  });
});
