---
name: theme-creation
description: Create and maintain BootstrapDyn themes as strict module substitutions for `dist/default-*.css`, following SDD contracts.
---

# Theme Creation Workflow

Use this skill when the task is to create, update, or validate a BootstrapDyn theme in any destination directory (e.g., `my-project/theme/`, `examples/demo/theme/`).

## Sources of Truth

Read and follow, in this order:
1. `.specify/spec.md` (especially Section 6 — CSS Variable Naming)
2. `.specify/theme-spec.md` (file naming convention, load order, substitute model, bundler integration)
3. `examples/demo/README.md` (reference example of the theme concept)

If there is any conflict, `.specify/spec.md` wins.

## Core Contract

- Theme files are **substitutes** for `dist/default-*.css`. They replace the defaults; they are never loaded alongside them.
- A theme file must be built by copying the matching `dist/default-<concern>.css` and editing values only.
- **Never copy or modify `dist/bootstrap-dyn.css` or `dist/contrast-dyn.css`.** These are generated artifacts loaded as-is from `dist/`.
- Theme file naming must follow the `<theme>-<concern>.css` convention (e.g. `dark-color.css`, `mytheme-typography.css`). The prefix is the theme name and the suffix must be one of the canonical concern suffixes (`-color`, `-typography`, `-spacing`, `-corners`, `-shadows`, `-borders`, `-forms`, `-layers`, `-layout`, `-motion`, `-sizing`, `-grid`).
- Only one theme file per suffix is allowed per directory. If multiple files share the same suffix, the first match alphabetically is used.
- The HTML page must load files in this order:
  1. Theme files for each concern (substituting the corresponding `dist/default-*.css`)
  2. `dist/bootstrap-dyn.css` (component rules, never modified)
  3. `dist/contrast-dyn.css` (optional contrast rules, never modified)
- Keep variable naming contract:
  - Original extracted vars: `--bs-*`
  - Typography extracted vars: `--bs-typo-*`
  - Generated vars: `--bs-dyn-*`
- Do not introduce non-typography component overrides in theme modules.

## Allowed Exception — Web Fonts

Typography theme files may include external web font imports (e.g. `@import` from Google Fonts) as a showcase choice. This exception applies to any theme directory the user requests, but never to `dist/` (the pipeline defaults never include external fonts).

Constraints that always apply:
- Must continue to define all canonical typography variables (`--bs-typo-*`) and related required dynamic variables (`--bs-dyn-*`) consumed by `bootstrap-dyn.css`.
- Must include robust local fallback font stacks so rendering remains functional when external font requests fail.
- Must not introduce non-typography component overrides.

## Standard Procedure

1. **Create the theme directory** (e.g. `mkdir -p <destination>`).

2. **Copy the 12 canonical modules from `dist/`.** For each canonical suffix, copy the corresponding default file to the theme directory. Use a file copying tool; only read the files relevant to your task.
   ```
   dist/default-color.css      → <destination>/<theme>-color.css
   dist/default-typography.css → <destination>/<theme>-typography.css
   dist/default-spacing.css    → <destination>/<theme>-spacing.css
   dist/default-corners.css    → <destination>/<theme>-corners.css
   dist/default-shadows.css    → <destination>/<theme>-shadows.css
   dist/default-borders.css    → <destination>/<theme>-borders.css
   dist/default-forms.css      → <destination>/<theme>-forms.css
   dist/default-layers.css     → <destination>/<theme>-layers.css
   dist/default-layout.css     → <destination>/<theme>-layout.css
   dist/default-motion.css     → <destination>/<theme>-motion.css
   dist/default-sizing.css     → <destination>/<theme>-sizing.css
   dist/default-grid.css       → <destination>/<theme>-grid.css
   ```

   **All 12 modules must exist in the theme directory.** Modules that do not need customization are left as exact verbatim copies of their `dist/default-*.css` counterparts. Variables must never be removed; they are baseline defaults and all of them are required for correct substitution. If a variable's value should remain the same as the default, keep it unchanged.

   This is especially critical for `dist/default-grid.css`, which contains structural selectors (containers, rows, columns, offsets, gutters, and all breakpoint variants); omitting or altering selectors will break the page layout.

3. **Identify which modules to customize.** The 12 canonical suffixes are: `color`, `typography`, `spacing`, `corners`, `shadows`, `borders`, `forms`, `layers`, `layout`, `motion`, `sizing`, `grid`.

   - Modules like `color`, `typography`, `spacing`, `corners`, `shadows`, `borders`, `forms`, `sizing` are usually customized because they define the visual identity.
   - **The following modules require an explicit user request before editing them. Do not change their values unless the user explicitly asks for it or the feature inherently requires it:**
     - `grid` — only edit if the user asks for gutter sizes, container widths, or grid modifications
     - `layers` — only edit if the user mentions z-index, stacking order, or layer behavior
     - `layout` — only edit if the user mentions breakpoints or container widths
     - `motion` — only edit if the user asks for animation, transition, or motion changes

4. **Edit values only.** For each module selected in step 3, edit **only the values** of CSS custom properties in the copied file. Keep selectors/structure compatible with the generated module contract. Do not add component-level overrides.

5. **HTML demo page (optional).** If the user has **explicitly** requested a visual preview:
   - Copy `examples/demo/theme.html` to the destination directory.
   - Change only the `<link rel="stylesheet">` entries in `<head>` to point to the theme files.
   - Do not modify the HTML markup structure or demo styles.

   The page must load **theme files first**, then the fixed pipeline outputs:
   ```html
   <link rel="stylesheet" href="./theme/color.css">
   <link rel="stylesheet" href="./theme/typography.css">
   <link rel="stylesheet" href="./theme/spacing.css">
   <link rel="stylesheet" href="./theme/corners.css">
   <link rel="stylesheet" href="./theme/shadows.css">
   <link rel="stylesheet" href="./theme/borders.css">
   <link rel="stylesheet" href="./theme/forms.css">
   <link rel="stylesheet" href="./theme/layers.css">
   <link rel="stylesheet" href="./theme/layout.css">
   <link rel="stylesheet" href="./theme/motion.css">
   <link rel="stylesheet" href="./theme/sizing.css">
   <link rel="stylesheet" href="./theme/grid.css">
   <link rel="stylesheet" href="../../dist/bootstrap-dyn.css">
   <link rel="stylesheet" href="../../dist/contrast-dyn.css"> <!-- optional -->
   ```
   **Critical:** `bootstrap-dyn.css` and `contrast-dyn.css` must come **after** all theme files so that `var(...)` references in component rules resolve against the theme-defined variables. Do NOT load both `dist/default-*.css` and a theme file for the same concern.

## Required Validation

Run these checks after changes:

```bash
npm test
```

Variable coverage sanity check (per concern):
- Confirm `<destination>/<theme>-<concern>.css` contains **all** variables from `dist/default-<concern>.css`. No variable may be removed; only values may change.
- If extras exist, they must be justified and must not break substitution semantics.

```bash
grep -oP '--[\w-]*(?=\s*:)' dist/default-<concern>.css | sort -u > /tmp/default-vars.txt
grep -oP '--[\w-]*(?=\s*:)' <destination>/<theme>-<concern>.css | sort -u > /tmp/theme-vars.txt
diff /tmp/default-vars.txt /tmp/theme-vars.txt  # Should produce no output for removed vars
```

## Visual Verification

If an HTML demo page was created, compare it against `examples/demo/org.html` (original Bootstrap reference). The theme should produce **visually striking, immediately noticeable differences**. If browser tooling is not available, explicitly ask the user to perform visual verification using the checklist from `examples/demo/README.md`.

## Guardrails

- Do not edit HTML markup structure unless user explicitly requests it.
- Routine HTML changes should be limited to `<link rel="stylesheet">` load entries.
- Do not hide regressions by adding component-level overrides in theme modules.
- Preserve strong visual distinctiveness of theme as stress test.
- **Never copy, edit, or include `dist/bootstrap-dyn.css` or `dist/contrast-dyn.css`** as part of a theme. They live in `dist/` and are loaded from there.
- Each theme file must provide **all** variables required for its concern. Missing variables will cause runtime CSS breakage when the default is not also loaded.
- One theme file per canonical suffix per directory. The bundler scans for `*-<concern>.css`; duplicate suffixes emit a warning and use the first alphabetically.

## Definition of Done

A theme task is done only if all are true:

1. Theme files in the destination directory follow the `<theme>-<concern>.css` naming convention and match a canonical suffix.
2. Each theme file contains **all** variables defined in the corresponding `dist/default-<concern>.css`.
3. Theme files are loaded **before** `dist/bootstrap-dyn.css` and `dist/contrast-dyn.css` in the HTML.
4. No `dist/default-*.css` and theme file for the same concern are loaded simultaneously.
5. `npm test` passes.
6. Visual verification completed (or explicitly delegated to user with checklist from `examples/demo/README.md`).
7. If web font imports are used, the typography module includes robust local fallback font stacks.
