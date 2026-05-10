# Software Design Document (SDD) — BootstrapDyn

## Abstract

BootstrapDyn aims to decompose compiled Bootstrap 5 CSS into functional modules so themes can be changed dynamically without editing component rules. The project separates design concerns (currently colors and typography) into dedicated CSS files and rewrites Bootstrap component styles to consume variables instead of fixed literals.

A core principle of this project is **strict visual fidelity**. The files generated in `dist/` are designed to produce the exact same visual result as the original Bootstrap CSS when using the default variables. This ensures that:
1. Your project starts with the 100% standard Bootstrap "look and feel".
2. **Zero HTML changes**: You don't need to modify your templates, component structures, or Bootstrap classes. Compatibility is maintained purely at the CSS layer.
3. All Bootstrap components behave and render identically.
4. You only deviate from the original design when you explicitly choose to replace default modules with theme modules.

When Bootstrap does not provide a reusable variable for a value, BootstrapDyn generates a `--bs-dyn-*` variable so that value can still be themed consistently. The result is a modular CSS architecture where color, typography, and future concern-specific modules can be swapped or overridden independently while keeping compatibility with Bootstrap’s class system.

## 1. Document Status and Scope

This SDD supersedes the previous draft in this file. It is grounded in the current implementation under `extractor/`, current tests under `tests/`, and the generated artifacts in `dist/`.

Target baseline:
- Bootstrap source: `bootstrap/dist/css/bootstrap.css` (currently aligned with Bootstrap `v5.3.8`)
- Versioning: `Major.Minor` synchronized with Bootstrap; `Patch` is BootstrapDyn revision.
- Documentation: The `README.md` must maintain a "Versioning Policy" section with a **cumulative history table**. This table must preserve records of all previous versions and their target Bootstrap versions (e.g. `5.3.0` -> `5.3.8`) for user reference.
- Runtime: Node.js (ESM)
- Parser/transformer: PostCSS

## 2. Product Purpose

BootstrapDyn converts compiled Bootstrap CSS into a dynamic theming architecture by splitting concerns into generated modules and variable layers:
- Grid module extracted from Bootstrap grid distribution
- Color variables and derived color formulas
- Typography variables and derived typography formulas
- Optional contrast behavior rules
- Component CSS rewritten to consume variables

Primary objective:
- **Visual Fidelity**: Maintain 100% visual parity with original Bootstrap CSS when using default variables. The transformation from literals to variables must be lossless regarding the final rendered output. **No changes to HTML templates or Bootstrap class names are required to maintain this parity.**
- Enable independent theming per concern (e.g. color theme changes without touching typography, and vice versa).
- Preserve Bootstrap semantics (`--bs-*`) where possible, and introduce generated variables (`--bs-dyn-*`) only when needed.
- Keep component CSS stable while moving theme control to modular variable files.

The system does not modify Bootstrap Sass sources; it transforms compiled CSS.

## 3. Canonical Output Contract (`dist/`)

The pipeline generates exactly these canonical files:

1. `dist/bootstrap-dyn.css`
2. `dist/default-grid.css`
3. `dist/default-color.css`
4. `dist/default-spacing.css`
5. `dist/default-corners.css`
6. `dist/default-shadows.css`
7. `dist/default-borders.css`
8. `dist/default-forms.css`
9. `dist/default-motion.css`
10. `dist/default-sizing.css`
11. `dist/default-layers.css`
12. `dist/default-layout.css`
13. `dist/default-typography.css`
14. `dist/contrast-dyn.css`

`extractor/constants.js` defines these names and all modules must use them.

## 4. Architecture Overview

BootstrapDyn is a sequential pipeline.

Execution order:
1. `extract-base.js` creates `bootstrap-dyn.css`, extracts grid rules from it, and writes `default-grid.css`.
2. `extract-colors.js` rewrites color usage and generates color/contrast outputs.
3. `extract-spacing.js` rewrites spacing usage and generates spacing output.
4. `extract-corners.js` rewrites corner/radius usage and generates corners output.
5. `extract-shadows.js` rewrites shadow usage and generates shadows output.
6. `extract-borders.js` rewrites border usage and generates borders output.
7. `extract-forms.js` rewrites form usage and generates forms output.
8. `extract-motion.js` rewrites transition/animation usage and generates motion output.
9. `extract-sizing.js` rewrites sizing usage and generates sizing output.
10. `extract-layers.js` rewrites z-index usage and generates layers output.
11. `extract-layout.js` extracts breakpoint/container tokens and generates layout output.
12. `extract-typography.js` rewrites typography usage and generates typography output.
13. `extract-finalize.js` cleans final `bootstrap-dyn.css` pipeline markers.

Entry point:
- `extractor/main.js`

Default CLI behavior:
- Input default: `bootstrap/dist/css/bootstrap.css`
- Output default: `dist/`

## 5. Module Design

### 5.1 `extractor/main.js` (orchestrator)

Responsibilities:
- Resolve CLI arguments.
- Execute the extraction modules in order.
- Log execution summary and module stats.

CLI signature (current behavior):
- `node extractor/main.js [inputCssPath] [outputDir]`

### 5.2 `extractor/extract-base.js`

Responsibilities:
- Read source CSS.
- Create output directory if needed.
- Copy `bootstrap-grid.css` into `default-grid.css`.
- Remove grid rules from `bootstrap-dyn.css` so grid is sourced only from `default-grid.css`.

Current extraction strategy:
- Parse source CSS and grid CSS with PostCSS.
- Match grid rules by normalized selector + at-rule context (with exact signature as additional match path).
- Remove matched rules from the main CSS and clean empty at-rule containers.

### 5.3 `extractor/extract-colors.js`

Responsibilities:
- Parse `bootstrap-dyn.css` with PostCSS.
- Detect theme rules (`:root`, `[data-bs-theme=...]`) via `isThemeRule`.
- Extract color declarations from theme rules into `default-color.css`.
- Remove extracted declarations from `bootstrap-dyn.css` theme blocks.
- Replace color literals/usages in remaining CSS with `var(...)` references.
- Generate derived dynamic variables (including `color-mix(...)`).
- Generate `contrast-dyn.css` (rules only; no contrast variable definitions).

Main internal behaviors:
- Color property detection via explicit set + CSS variable prefix filtering.
- Semantic aliasing map from base palette vars to semantic vars (e.g. `--bs-blue` -> `--bs-primary` when values match).
- Known RGB conversion for rgba/rgb forms to `rgb(var(--bs-*-rgb))`.
- Domain-specific dynamic derivation for:
  1. `.table-*` variants
  2. Form focus/thumb variables
  3. `.btn-*` hover/active variables
  4. Fallback dynamic variable extraction for remaining color literals
- Appends contrast variables in color theme blocks (`--bs-*-contrast`).

Writes:
- `bootstrap-dyn.css` (post-color stage)
- `default-color.css`
- `contrast-dyn.css`

### 5.3.1 Dynamic Color Derivation with `color-mix()`

**Problem:** Bootstrap's compiled CSS contains many derived colors produced by Sass functions (e.g., `rgba()`, `mix()`, `tint-shade`). These are static values baked into the CSS. When BootstrapDyn replaces base colors with CSS custom properties, the derived values must remain correct even when the base variables change at runtime.

**Solution:** Use CSS `color-mix()` to express derived colors as dynamic formulas referencing theme variables.

**Rules:**

1. **Prefer `color-mix()` over static derived values** whenever a derived color can be expressed as a mix of a theme variable plus a known color (usually white, black, or transparent).
2. **Use `in srgb` as the default color space** unless a specific perceptual requirement justifies another space.
3. **Do not generate `--bs-dyn-*` variables for simple `color-mix()` expressions** that can be written inline; keep component CSS readable and themable.
4. **Document the intended Bootstrap equivalent** in comments when the derivation replaces a known Sass computation.
5. **`color-mix()` must be contained in `bootstrap-dyn.css` or `contrast-dyn.css`**; theme variable files (`default-*.css`) define the base colors, not the mix formulas.

**Examples:**
- Navbar normal text on dark bg: `color-mix(in srgb, var(--bs-primary-contrast), transparent 45%)` replaces the Sass-derived semitransparent white.
- Table hover tint: `color-mix(in srgb, var(--bs-primary), transparent 95%)` replaces a static `rgba(..., 0.05)`.

**Rationale:** This preserves strict visual fidelity with the original Bootstrap output when using default variables, while keeping the result fully dynamic for theming.

### 5.4 `extractor/extract-typography.js`

Responsibilities:
- Parse post-color `bootstrap-dyn.css`.
- Extract typography declarations from theme rules.
- Rename extracted Bootstrap typography vars from `--bs-*` to `--bs-typo-*`.
- Replace references in all CSS values from `var(--bs-...)` to `var(--bs-typo-...)` when the referenced var is a known typography var.
- Convert remaining typography literals into generated dynamic vars.

Typography detection sources:
- Standard CSS typography properties (`font-size`, `line-height`, etc.)
- Bootstrap custom property prefixes (e.g. `--bs-font`, `--bs-body-font`, etc.)
- Keyword-based detection for custom properties containing typography keywords

Writes:
- `bootstrap-dyn.css` (post-typography stage, final)
- `default-typography.css`

### 5.5 `extractor/extract-spacing.js`

Responsibilities:
- Parse post-color `bootstrap-dyn.css`.
- Detect spacing properties and spacing-related Bootstrap custom properties.
- Convert spacing literals to generated `--bs-dyn-*` variables.
- Generate `default-spacing.css`.

Writes:
- `bootstrap-dyn.css` (post-spacing stage)
- `default-spacing.css`

### 5.6 Concern extractors

These modules follow the same sequential contract: read the current `bootstrap-dyn.css`, extract or generate concern-specific variables, rewrite matching declarations to consume variables, write the matching `default-*.css` file, and overwrite `bootstrap-dyn.css`.

Modules:
- `extract-corners.js` -> `default-corners.css`
- `extract-shadows.js` -> `default-shadows.css`
- `extract-borders.js` -> `default-borders.css`
- `extract-forms.js` -> `default-forms.css`
- `extract-motion.js` -> `default-motion.css`
- `extract-sizing.js` -> `default-sizing.css`
- `extract-layers.js` -> `default-layers.css`
- `extract-layout.js` -> `default-layout.css`

### 5.7 `extractor/extract-finalize.js`

Responsibilities:
- Run after all extraction modules.
- Remove accumulated pipeline marker comments from `bootstrap-dyn.css`.
- Keep final cleanup centralized instead of distributing final-only behavior across extractors.

Writes:
- `bootstrap-dyn.css` (final cleaned output)

### 5.8 `extractor/core.js` (shared primitives)

Shared responsibilities:
- Constant regex/sets for skip values and color formats
- Theme rule detection
- Slug generation from selectors/properties
- Dynamic variable name generation
- RGB known replacement
- Alias application and alias-map construction

### 5.9 `extractor/constants.js`

Defines canonical output filenames used by all modules.

## 6. CSS Variable Naming Specification (Mandatory)

This convention is mandatory until superseded by an updated SDD.

### 6.1 Prefixes

- `--bs-*`
  - Meaning: original Bootstrap variables (preserved or aliased).
  - Default namespace for all extracted module variables unless renaming is required (see §6.3).
  - Example: `--bs-primary`, `--bs-blue`, `--bs-border-radius`, `--bs-box-shadow`, `--bs-spacer`

- `--bs-typo-*`
  - Meaning: typography variables extracted and renamed into the typography module.
  - Renaming is justified for this module (see §6.3).
  - Example: `--bs-typo-font-sans-serif`, `--bs-typo-body-font-family`

- `--bs-dyn-*`
  - Meaning: generated dynamic variables produced from literal values found outside theme rules.
  - Example: `--bs-dyn-h1-font-size`, `--bs-dyn-table-primary-table-border-color`

- `--bs-*-contrast`
  - Meaning: contrast variables consumed by `contrast-dyn.css`.
  - Ownership: defined in `default-color.css`; not generated by `contrast-dyn.css`.

### 6.2 Rules

1. Original Bootstrap variables keep `--bs-*` unless renaming is strictly required (see §6.3).
2. Typography module uses `--bs-typo-*` for extracted typography variables because renaming is required (see §6.3).
3. Pipeline-invented/generated variables always use `--bs-dyn-*`.
4. `--bs-dyn-*` must never be used for original Bootstrap variables.
5. Contrast rules file consumes `--bs-*-contrast` but does not define them.
6. Future modules **must not rename** extracted variables to a new namespace unless they satisfy the criteria in §6.3.

### 6.3 Variable Renaming Policy

Renaming extracted variables from `--bs-*` to a module-specific namespace is **only justified** when both of the following conditions are met simultaneously:

**Condition A — Namespace collision risk:**
The module's variables share prefixes with another module's detection heuristic in a way that cannot be resolved by adding entries to a static exclusion list. Specifically, this applies when `isColorProp()` in `extract-colors.js` would capture the module's variables under its open-ended `--bs-*` fallback, and the number of conflicting prefixes makes exclusion-list maintenance impractical or error-prone.

**Condition B — Reference rewriting is already required:**
The module must already rewrite all `var(--bs-original)` references in `bootstrap-dyn.css` for other reasons (e.g. to redirect component consumption to the module file). If references must be rewritten anyway, the cost of renaming is zero. If no reference rewriting is needed, renaming imposes extra complexity with no benefit.

**Typography satisfies both conditions:**
- Typography variables (`--bs-font-*`, `--bs-body-font-*`, `--bs-heading-*`, etc.) are numerous and partially overlap with `isColorProp()`'s open-ended `--bs-*` fallback (e.g. `--bs-heading-color`). The exclusion list in `NON_COLOR_PREFIXES` is already long and must be kept in sync manually.
- The module must rewrite all `var(--bs-body-font-family)` references in component CSS to point to the extracted file, so renaming adds no extra cost.

**Spacing, corners, and shadows do NOT satisfy these conditions:**
- Their variable prefixes (`--bs-border-radius-*`, `--bs-box-shadow-*`, `--bs-spacer-*`) are unambiguous and already present in `NON_COLOR_PREFIXES` with a small, stable set of entries.
- Component CSS already uses `var(--bs-border-radius)` etc., so no reference rewriting is needed; variables can be extracted under the same name with no change to consuming rules.
- Therefore these modules keep the original `--bs-*` names in their output files.

**Decision rule for future modules:**
Before introducing a new module namespace (e.g. `--bs-border-*`, `--bs-form-*`), verify explicitly that both Condition A and Condition B are met. If only one condition holds, keep `--bs-*` and update `NON_COLOR_PREFIXES` if necessary.

## 7. Theme Rule Semantics

A node is considered a theme rule only if:
- Node type is `rule`
- All selectors are either `:root` or `[data-bs-theme=...]`
- Rule contains at least one declaration

Only those rules are extraction sources for theme variables in color and typography modules.

## 8. Detailed Data Flow

1. Input CSS is copied to working output (`bootstrap-dyn.css`).
2. Color module extracts color declarations from theme rules.
3. Color module rewrites color usage and emits derived color vars.
4. Color module writes optional contrast behavior CSS.
5. Spacing, corners, shadows, borders, forms, motion, sizing, layers, and layout modules progressively extract their concerns and rewrite matching declarations.
6. Layout module extracts breakpoint vars and container max-widths. Media query thresholds remain static because CSS custom properties are not valid in media query conditions.
7. Typography module extracts and renames typography vars.
8. Typography module rewrites typography references and literals.
9. Finalize module removes accumulated pipeline markers.
10. Final rewritten component CSS remains in `bootstrap-dyn.css`.

## 9. Expected Output Characteristics

### 9.1 `default-color.css`

Expected content types:
- Theme blocks for light and dark where present
- Original color semantic/palette vars
- RGB vars and other color custom properties
- `--bs-*-contrast` definitions
- Derived dynamic color vars under `--bs-dyn-*`

Must not include:
- `--bs-typo-*` variables

### 9.2 `default-grid.css`

Expected content types:
- Bootstrap grid selectors (`.container*`, `.row`, `.col-*`, `.row-cols-*`, `.offset-*`, gutter utilities)
- Grid media-query variants (`sm` to `xxl`)

Must not include:
- Color or typography extraction artifacts

### 9.3 `default-typography.css`

Expected content types:
- Extracted typography vars renamed to `--bs-typo-*`
- Optional dark theme typography overrides when present
- Derived typography dynamic vars `--bs-dyn-*`

Must not include:
- Color semantic vars such as `--bs-primary`, `--bs-blue`

### 9.4 `default-spacing.css`

Expected content types:
- Derived spacing variables using `--bs-dyn-*`
- Extracted spacing tokens when found in theme rules

### 9.5 `default-corners.css`

Expected content types:
- Extracted corner/radius theme tokens (e.g. `--bs-border-radius*`)
- Derived corner variables using `--bs-dyn-*`

### 9.6 `default-shadows.css`

Expected content types:
- Extracted shadow theme tokens (e.g. `--bs-box-shadow*`)
- Derived shadow variables using `--bs-dyn-*`

### 9.7 `default-borders.css`

Expected content types:
- Extracted border theme tokens (e.g. `--bs-border-width`, `--bs-border-color`)
- Derived border variables using `--bs-dyn-*`
- Side-specific border declarations

### 9.8 `default-forms.css`

Expected content types:
- Extracted form theme tokens (e.g. `--bs-form-*`, `--bs-input-*`)
- Derived form variables using `--bs-dyn-*` (e.g. control heights, floating label offsets)

### 9.9 `default-layers.css`

Expected content types:
- Extracted layer theme tokens (e.g. `--bs-dropdown-zindex`, `--bs-modal-zindex`)
- Derived layer variables using `--bs-dyn-*`

### 9.10 `default-motion.css`

Expected content types:
- Derived motion variables using `--bs-dyn-*` (transitions and animations)

### 9.11 `default-sizing.css`

Expected content types:
- Derived sizing variables using `--bs-dyn-*` (width, height, min/max dimensions)

### 9.12 `default-layout.css`

Expected content types:
- Extracted breakpoint theme tokens (e.g. `--bs-breakpoint-sm`, `--bs-breakpoint-md`)
- Derived layout variables using `--bs-dyn-*` (container max-widths)

### 9.13 `contrast-dyn.css`

Expected content types:
- `.bg-*` contrast color rules
- Contrast text rules for selected nested components
- `.text-reset` compatibility rules
- `.btn-outline-*` hover/active contrast behavior
- `color-mix(...)` derived contrast colors where transparency is required (e.g., navbar link states); see §5.3.1

Must not include:
- Contrast variable definitions (`--bs-*-contrast`)

### 9.14 `bootstrap-dyn.css`

Expected content types:
- Bootstrap component rules rewritten to `var(...)` references
- Non-extracted declarations retained

Must not include:
- Extracted theme variables moved to `default-color.css` and `default-typography.css`
- Base grid selectors extracted to `default-grid.css` (e.g. `.row`, `.row > *`, `.col-*`, `.offset-*`)
- Extracted breakpoint definitions moved to `default-layout.css`
- Container max-width literals (replaced with `--bs-dyn-*` vars)

Media query threshold literals should remain static. CSS custom properties are not valid in media query conditions, so breakpoint variables are exported in `default-layout.css` for reference/theme contracts but are not consumed by `@media` params.

## 10. Theme Specification

Theme file naming conventions, load order, substitute model, creation procedure, and bundler integration are defined in [`.specify/theme-spec.md`](theme-spec.md). All theme-related documentation is centralized there.

## 11. Test Coverage and Verification

Current automated tests: `tests/extractor.test.js` using Node test runner.

Validated behaviors:
1. All 14 output files are generated.
2. `default-grid.css` contains key grid selectors.
3. `default-color.css` contains key color vars and excludes typography vars.
4. `default-spacing.css` contains spacing-derived dynamic variables.
5. `default-corners.css` contains corner tokens and derived radius variables.
6. `default-shadows.css` contains shadow tokens and derived shadow variables.
7. `default-borders.css` contains border tokens and derived border variables.
8. `default-forms.css` contains derived form sizing variables.
9. `default-motion.css` contains transition-related variables.
10. `default-sizing.css` contains width/height-related variables.
11. `default-layers.css` contains z-index variables.
12. `default-layout.css` contains breakpoint variables and container max-width variables.
13. `default-typography.css` contains key typography vars and excludes core color vars/literals.
14. `contrast-dyn.css` contains background and outline-button contrast rules.
15. `bootstrap-dyn.css` removes extracted definitions, removes base grid selectors, and uses variable references.

Run command:
- `npm test`

## 12. Constraints and Compatibility

- Current extraction logic is tuned to Bootstrap 5.3.x compiled CSS structure.
- **Strict Visual Parity**: All transformations must be validated against the source Bootstrap to ensure no visual regressions are introduced during extraction.
- `color-mix(...)` support is required for full derived-color behavior; usage rules are defined in §5.3.1.
- Inline SVG or hardcoded embedded color values may require manual override (explicitly documented by the color module output header).

## 13. Evolution Guidelines

When adding future modules (spacing, radius, grid, etc.):
1. Preserve sequential pipeline contract.
2. Read previous `bootstrap-dyn.css`, then overwrite it after transformation.
3. Do not break naming semantics in Section 6.
4. Keep `extractor/constants.js` as canonical output registry.
5. Extend tests with contract assertions for new output behavior.
6. **Optional Behavioral Modules**: Any module that introduces new functionality or modifies the default visual/behavioral contract of Bootstrap must be optional. These modules must be explicitly documented in a dedicated file within `docs/modules/`, explaining exactly what behavior they change or add (e.g., `contrast-dyn.css` documented in `docs/modules/contrast-dyn.md`).

## 14. Non-Goals (Current)

- Sass-level transformations
- Runtime JS theming engine
- Cross-version Bootstrap abstraction beyond current parser assumptions
- Automatic migration for legacy custom themes

## 14.1 Known Visual Issues (Pending Review)

The following issues are accepted for the current iteration and require follow-up:

1. Dropdown hover contrast in themed contexts
- Symptom: hover state is visible but low-contrast in some `dyn/theme` combinations.
- Scope: mainly dropdown menu interaction colors under custom theme overrides.
- Status: pending visual tuning pass.

2. Modal footer spacing/alignment parity (`org` vs `dyn/theme`)
- Symptom: minor spacing/alignment differences for action buttons in modal footer snapshots.
- Scope: `modal-footer` layout and spacing token interaction with spacing/shadow overrides.
- Status: pending component-level review and normalization.

## 15. Implementation Roadmap (Task List)

Status legend:
- `[ ]` Pending
- `[~]` In progress
- `[x]` Completed

None
