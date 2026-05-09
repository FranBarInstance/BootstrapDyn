---
name: extractor-change-workflow
description: Safely implement changes under extractor/ with required tests, dist/theme/demo synchronization, and visual verification steps.
---

# Extractor Change Workflow

Use this skill for any task that modifies files in `extractor/`, `extractor/constants.js`, or extractor pipeline behavior.

## Sources of Truth

Read and follow:
1. `.specify/spec.md`
2. `.specify/theme-spec.md`
3. `examples/demo/README.md`
4. Current tests in `tests/extractor.test.js`

If there is conflict, `.specify/spec.md` wins.

## Mandatory Impact Scan

Before editing:
1. Identify which stage(s) are affected in pipeline order.
2. Map expected outputs impacted in `dist/`.
3. Identify whether docs or demos require updates.
4. Check if naming rules (SDD Section 6) are affected.

## Implementation Rules

- Preserve pipeline sequence contract.
- Keep output contract to canonical 14 files unless explicitly requested otherwise.
- Do not change variable namespaces unless SDD Section 6.3 conditions are met.
- Keep `extractor/constants.js` as canonical output filename registry.
- Avoid hidden behavior: if output semantics change, update docs.

## Regeneration and Reproducibility

After extractor changes, run the full build (pipeline + bundler) followed by tests:

```bash
npm run build
npm test
```

Or run steps individually if only the pipeline output is needed:

```bash
node extractor/main.js bootstrap/dist/css/bootstrap.css dist
npm test
```

If tests include reproducibility assertions, ensure generated `dist/` matches expected outputs.

## Demo Synchronization Duties

When output modules change, ensure demo consistency:
1. `examples/demo/dyn.html` remains aligned with recommended default module load model.
2. `examples/demo/theme.html` loads module substitutes correctly (theme file instead of matching default file).
3. `examples/demo/bundle.html` loads the single-file bundle (`dist/bootstrap-dyn-bundle.min.css`). Regenerate with `npm run bundle` after pipeline changes.
4. `examples/demo/theme/*.css` stays synchronized with generated `dist/default-*.css` contracts.

For `theme/` synchronization:
- Rebase affected theme files from updated `dist/default-*.css` when needed.
- Re-apply intentional theme value customizations only.
- Keep exception policy from SDD 10.1 for typography external fonts.

## Visual Verification Requirement

If the change can affect rendered output (most extractor changes do):
- If browser tooling is available, perform visual checks using:
  - `examples/demo/org.html`
  - `examples/demo/dyn.html`
  - `examples/demo/theme.html`
  - `examples/demo/bundle.html`
- If browser tooling is unavailable, explicitly ask user to perform this pass and provide exact pages/checklist.

Minimum visual intent checks:
1. `dyn.html` ≈ `org.html` (parity)
2. `theme.html` clearly differs from `dyn.html` (theme effect)
3. `bundle.html` ≈ `dyn.html` (bundle parity)
4. No obvious regressions in navbars, forms, tables, modals, dropdowns, tooltips/popovers

## Required Documentation Updates

Update docs whenever relevant:
- `.specify/spec.md` for architectural/contract changes
- `.specify/theme-spec.md` for theme naming, load order, or bundler changes
- `README.md` and/or `examples/demo/README.md` for workflow or demo behavior changes
- `docs/modules/*.md` for optional behavioral modules

## Completion Checklist

Before declaring done, verify all:
1. `npm test` passes.
2. Extractor output regenerates successfully.
3. Any changed `dist/default-*.css` contract is reflected in `examples/demo/theme/*.css`.
4. Demo load order/substitution remains valid.
5. Visual verification done, or user explicitly asked to run it.
6. No undocumented exceptions introduced.

## Failure Handling

If any of these happen, stop and report clearly:
- Mismatch between theme module vars and corresponding `dist/default-*.css`
- Contract-breaking naming changes
- Need for demo markup changes beyond routine stylesheet links
- Visual regression detected in parity/themed comparisons
