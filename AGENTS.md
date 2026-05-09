# Agent Notes

## Specification Reference

Use [`.specify/spec.md`](.specify/spec.md) as the single source of truth for project architecture, pipeline behavior, output contracts, and CSS variable naming conventions.

Mandatory reference sections:
- `Section 6: CSS Variable Naming Specification (Mandatory)`
- `Section 10: Theme Specification` — delegates to [`.specify/theme-spec.md`](.specify/theme-spec.md) for file naming convention, load order, and bundler integration.

If this file and the SDD differ, the SDD takes precedence.

## Visual Verification

If you are an AI agent with browser automation capabilities, use the demo pages for visual verification of BootstrapDyn output:

- [`examples/demo/README.md`](examples/demo/README.md) — explains the purpose of each demo page and how to visually verify compatibility.
- [`examples/demo/dyn.html`](examples/demo/dyn.html) — BootstrapDyn with default values (should match original Bootstrap).
- [`examples/demo/org.html`](examples/demo/org.html) — original Bootstrap CSS (reference).
- [`examples/demo/theme.html`](examples/demo/theme.html) — BootstrapDyn with custom theme applied.
- [`examples/demo/bundle.html`](examples/demo/bundle.html) — BootstrapDyn single-file bundle (should match `dyn.html`).

If the agent has browser tooling, it can open these pages directly to compare `dyn.html` vs `org.html` (visual parity), `theme.html` vs `dyn.html` (theme effect), and `bundle.html` vs `dyn.html` (bundle parity).

## Skills (`.agents/skills/`)

| Skill | When to use |
|-------|-------------|
| [`commit`](.agents/skills/commit/SKILL.md) | When the user explicitly requests a commit. Groups changes into semantic commits (`feat`, `fix`, `docs`, `test`, etc.), runs safety checks, and never pushes. |
| [`extractor-change-workflow`](.agents/skills/extractor-change-workflow/SKILL.md) | When modifying any file under `extractor/`. Requires pipeline regeneration (`node extractor/main.js`), test verification (`npm test`), demo synchronization, and visual verification. |
| [`theme-creation`](.agents/skills/theme-creation/SKILL.md) | When creating or editing theme files that substitute `dist/default-*.css`. Themes are built by copying defaults and editing values. `dist/bootstrap-dyn.css` and `dist/contrast-dyn.css` are never part of a theme.
