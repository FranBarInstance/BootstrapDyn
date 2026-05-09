# Developer Documentation

This document is for contributors and maintainers working on BootstrapDyn itself. If you are a user looking to integrate BootstrapDyn into your project, see the root `README.md`.

## Architecture

BootstrapDyn is a **sequential pipeline** of independent modules. Each module reads the output of the previous one, extracts a specific concern (colors, typography, spacing, etc.), and progressively transforms `bootstrap-dyn.css`.

```
bootstrap.css
     │
     ▼
┌───────────────────┐
│  extract-base.js  │
│  → default-*.css  │ (eg. default-grid.css, ...)
└───────────────────┘
     │
     ▼
┌───────────────────┐
│   extract-*.js    │
│  → default-*.css  │
└───────────────────┘
     │
      ▼
┌──────────────────────┐
│  extract-finalize.js │
│  → clean markers     │
└──────────────────────┘
      │
      ▼
    final bootstrap-dyn.css (all variables externalised)
```

### Pipeline order (13 modules)

| #  | Module              | Output file(s)                          |
|----|---------------------|-----------------------------------------|
| 1  | `extract-base`      | `default-grid.css`                      |
| 2  | `extract-colors`    | `default-color.css`, `contrast-dyn.css` |
| 3  | `extract-spacing`   | `default-spacing.css`                   |
| 4  | `extract-corners`   | `default-corners.css`                   |
| 5  | `extract-shadows`   | `default-shadows.css`                   |
| 6  | `extract-borders`   | `default-borders.css`                   |
| 7  | `extract-forms`     | `default-forms.css`                     |
| 8  | `extract-motion`    | `default-motion.css`                    |
| 9  | `extract-sizing`    | `default-sizing.css`                    |
| 10 | `extract-layers`    | `default-layers.css`                    |
| 11 | `extract-layout`    | `default-layout.css`                    |
| 12 | `extract-typography`| `default-typography.css`                |
| 13 | `extract-finalize`  | _(cleans `bootstrap-dyn.css`)_          |

### Output file summary (14 files)

| File                  | Purpose                                             |
|-----------------------|-----------------------------------------------------|
| `bootstrap-dyn.css`   | Final CSS — all values replaced with `var()` refs   |
| `default-grid.css`    | Grid system rules (`.container`, `.row`, `.col-*`)  |
| `default-color.css`   | Color palette + light/dark theme variables           |
| `contrast-dyn.css`    | `.bg-*` & `.btn-outline-*` contrast colour rules    |
| `default-spacing.css` | Margin, padding, gap, and positioning tokens         |
| `default-corners.css` | `border-radius` values                              |
| `default-shadows.css` | `box-shadow` values + elevation utilities           |
| `default-borders.css` | `border-width`, `border-style` values               |
| `default-forms.css`   | Form control sizing and dimensions                   |
| `default-motion.css`  | Transition and animation properties                  |
| `default-sizing.css`  | Width / height utility tokens                        |
| `default-layers.css`  | Z-index values for stacked components               |
| `default-layout.css`  | Breakpoints and container max-widths                 |
| `default-typography.css`| Font families, sizes, weights, line heights        |

## Pipeline entry point

`main.js` wires the modules together. It is used **only during development** — for example, when upgrading to a new Bootstrap version or modifying the extraction logic. Running it on a stable release is unnecessary and risks changing the output.

```bash
node extractor/main.js                          # uses bootstrap.css by default
node extractor/main.js path/to/bootstrap.css    # custom input path
node extractor/main.js path/to/bootstrap.css path/to/output  # custom output dir
```

The default input is `bootstrap/dist/css/bootstrap.css`, and the default output is `dist/`.

## Philosophy and Scope

The extractor is a **development-time utility**, not part of the runtime application. Its goal is to automate the modularization of a specific version of compiled Bootstrap CSS.

### 1. Focus on Output Quality
The primary metric for success is the **visual fidelity** of the files in `dist/`. If the generated CSS produces 100% visual parity with the original Bootstrap using default variables, the tool has succeeded.

### 2. Version Dependency
The logic in these modules (heuristics, regex, property sets) is tuned to the internal structure of **Bootstrap 5.3.x**.
- **Disposable Logic**: When a new major version of Bootstrap (e.g., v6) is released, the extractor may require significant refactoring. This is expected and accepted.
- **Heuristics over Perfection**: Some modules use heuristics (like `isColorProp`) to identify targets. These are designed to handle current Bootstrap patterns, not to be a universal CSS parser.

### 3. Maintenance Caveats
Since the tool uses a progressive extraction pipeline, modules must be aware of each other:
- **Blacklists**: Some modules (like `extract-colors.js`) use manual lists (e.g., `NON_COLOR_PREFIXES`) to avoid misidentifying variables belonging to other modules. When adding new non-color modules, update these lists first.
- **Sequence Matters**: The order defined in `main.js` is critical. Changes in one module can affect the input of all subsequent ones. Typography must run last because it uses `var(--bs-*)` references produced by earlier modules.

### 4. Module Naming Convention
Each module produces a `default-{concern}.css` file containing the extracted default values. The pipeline reads the previous `bootstrap-dyn.css`, replaces literal values with `var(--bs-dyn-*)` references, and writes the defaults alongside the updated `bootstrap-dyn.css`.

## Common pitfalls

- **`extract-typography.js` must run last** because it replaces `var()` references that earlier modules might have introduced. Running colour extraction after typography could leave `--bs-font-sans-serif` in `bootstrap-dyn.css`.
- **Adding a new module**: Update `constants.js` with the output filename, add the module to `main.js` in the correct position, and add test assertions in `tests/extractor.test.js`.

## Rules for creating a new module

- Your module must export a function `processX(inputCssPath, outputDir)` where:
  - `inputCssPath` is the path to the `bootstrap-dyn.css` generated by the previous module.
  - `outputDir` is the folder where the files will be written.
- It must **read** that file, **transform** it by replacing literal values with CSS variables (`var(--bs-something-...)`), and **overwrite** `bootstrap-dyn.css` in the same `outputDir`.
- It may **generate** a variables file (e.g. `default-{concern}.css`) with the default values.
- It **must not interfere** with variables already introduced by previous modules (respect existing `var(...)`).

## Modules

### `extract-base.js`

The **first module in the chain**. It copies the original Bootstrap CSS as `bootstrap-dyn.css`, extracts grid rules (`.container`, `.row`, `.col-*`, `.offset-*`, `.g-*`, gutters) to `default-grid.css`, and removes them from `bootstrap-dyn.css`.

Being first, all other modules inherit those changes.

### `extract-colors.js`

Replaces literal colour values with CSS variables. Generates:
- `default-color.css` — colour palette, RGB values, derived colours, and contrast variables for both `:root`/`[data-bs-theme=light]` and `[data-bs-theme=dark]`.
- `contrast-dyn.css` — optional rules that apply `--bs-*-contrast` to `.bg-*` and `.btn-outline-*` classes.

### `extract-spacing.js`

Replaces spacing literals (margin, padding, gap, positioning) and spacing custom properties with CSS variables. Generates:
- `default-spacing.css` — spacing tokens and derived dynamic variables.

### `extract-corners.js`

Replaces `border-radius` literal values with CSS variables. Generates:
- `default-corners.css` — radius theme variables and derived corner utilities.

### `extract-shadows.js`

Replaces `box-shadow` literal values and focus-ring properties with CSS variables. Generates:
- `default-shadows.css` — shadow theme variables, focus-ring tokens, derived elevation utilities (`--bs-dyn-shadow-1` through `--bs-dyn-shadow-10`).

### `extract-borders.js`

Replaces `border-width` and `border-style` literals with CSS variables. Generates:
- `default-borders.css` — border theme variables and derived border utilities.

### `extract-forms.js`

Replaces form control dimension literals (min-height, width, height of inputs, checks, switches, range) with CSS variables. Generates:
- `default-forms.css` — form sizing derived variables.

### `extract-motion.js`

Replaces `transition` and `animation` property literals with CSS variables. Generates:
- `default-motion.css` — transition and animation derived variables.

### `extract-sizing.js`

Replaces sizing utility literals (width, height of viewport utilities, placeholders, icons) with CSS variables. Generates:
- `default-sizing.css` — sizing derived variables.

### `extract-layers.js`

Replaces z-index literal values with CSS variables. Generates:
- `default-layers.css` — z-index theme variables and derived layer utilities.

### `extract-layout.js`

Replaces breakpoint and container max-width literals with CSS variables. Generates:
- `default-layout.css` — breakpoint variables and derived container max-widths.

### `extract-typography.js`

**Must run last among extraction modules.** Replaces typography literals and references with CSS variables. Generates:
- `default-typography.css` — font family, sizes, weights, line heights, and derived typography variables for all components.

### `extract-finalize.js`

**Post-processing step. Must run after all extraction modules.** It does NOT generate a new output file; it performs finalization tasks on `bootstrap-dyn.css` after all other modules have finished writing.

This is the designated module for any operation that must execute at the very end of the pipeline. Instead of scattering cleanup, optimization, or post-processing logic across other modules, add it here.

Current responsibilities:
- **Pipeline marker removal**: Each extraction module prepends a `/* bootstrap-dyn.css - Post {module} */` comment when writing `bootstrap-dyn.css`. Since each module reads and writes the same file, these comments accumulate across pipeline steps. This module strips all such markers and collapses consecutive blank lines left behind.

Guidelines for extending this module:
- Add new functions for each post-processing task and call them from the exported `finalize()` function.
- Return aggregated stats so `main.js` can log a summary.
- Keep tasks focused on the final `bootstrap-dyn.css` output (e.g., minification, dead-code removal, integrity checks).

## Constants (`constants.js`)

Central registry of canonical output filenames used by all modules and tests:

```js
export const FILES = {
  BOOTSTRAP_DYN: "bootstrap-dyn.css",
  DEFAULT_GRID: "default-grid.css",
  DEFAULT_COLOR: "default-color.css",
  DEFAULT_SPACING: "default-spacing.css",
  DEFAULT_CORNERS: "default-corners.css",
  DEFAULT_SHADOWS: "default-shadows.css",
  DEFAULT_BORDERS: "default-borders.css",
  DEFAULT_FORMS: "default-forms.css",
  DEFAULT_MOTION: "default-motion.css",
  DEFAULT_SIZING: "default-sizing.css",
  DEFAULT_LAYERS: "default-layers.css",
  DEFAULT_LAYOUT: "default-layout.css",
  DEFAULT_TYPOGRAPHY: "default-typography.css",
  CONTRAST_DYN: "contrast-dyn.css",
};
```

## Tests

```bash
npm test
```

The test suite runs the full 13-module pipeline in a temporary directory and verifies:

- **All 14 output files** are generated (`bootstrap-dyn.css`, `default-grid.css`, `default-color.css`, `default-spacing.css`, `default-corners.css`, `default-shadows.css`, `default-borders.css`, `default-forms.css`, `default-motion.css`, `default-sizing.css`, `default-layers.css`, `default-layout.css`, `default-typography.css`, `contrast-dyn.css`).
- **`default-grid.css`** contains `.container`, `.row`, `.row > *`, `.col-12` selectors.
- **`default-color.css`** contains essential colour variables, light/dark theme blocks, and no typography vars.
- **`default-typography.css`** contains font-family, body-font-size, h1-font-size, btn-btn-font-size, and no colour literals.
- **`default-spacing.css`** contains dynamic spacing vars including body-margin and nav-link-padding-y.
- **`default-corners.css`** contains `--bs-border-radius` and derived vars.
- **`default-shadows.css`** contains box-shadow theme variables and derived dynamic vars.
- **`default-borders.css`** contains `--bs-border-width`, `--bs-border-style`, and derived vars.
- **`default-forms.css`** contains dynamic form sizing vars.
- **`default-motion.css`** contains transition-related dynamic vars.
- **`default-sizing.css`** contains width/height-related dynamic vars.
- **`default-layers.css`** contains all z-index theme variables and derived layer vars.
- **`default-layout.css`** contains all breakpoint variables and derived container max-widths.
- **`contrast-dyn.css`** has `.bg-primary` contrast rules and `.btn-outline-*` hover selectors, and does not define `--bs-*-contrast` variables.
- **`bootstrap-dyn.css`** no longer defines any extracted variables, uses `var()` references, and no longer contains grid selectors.
- **Module isolation**: `default-color.css` and `default-typography.css` share no overlapping variable names.
- **No remaining definitions**: All 13 module theme variables are verified absent from `bootstrap-dyn.css`.

## Shared utilities (`core.js`)

Common helpers used across modules:
- `isThemeRule(node)` — detects `:root` and `[data-bs-theme=...]` selectors.
- `selectorToSlug(sel)` / `propToSlug(prop)` — sanitizes names for CSS variable generation.
- `makeVarName(selector, prop, usedNames)` — generates unique `--bs-dyn-...` names.
- `replaceKnownRgba(value, knownRgbMap)` — replaces `rgb()` / `rgba()` with `rgb(var(--bs-...))`.
- `applyAlias(value, aliasMap)` — replaces `var(--bs-x)` with aliased names.
- `buildAliasMap(themeNodes, isColorValue, semanticPairs)` — builds semantic aliases (e.g. `--bs-blue` → `--bs-primary`).
- `buildModuleCss(header, lightVars, darkVars, dynVars)` — standardizes the generation of output CSS files with theme support.
