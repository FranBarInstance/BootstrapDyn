# Contrast Dynamic Module (`contrast-dyn.css`)

> **Primary Goal**: Enable dynamic theme switching across light and dark palettes **without modifying HTML templates**.

This is an **optional behavioral module**. It modifies the default Bootstrap behavior to provide automatic contrast management for background utilities and buttons.

## What it does

In standard Bootstrap, classes like `.bg-primary` only apply the background color. You are responsible for ensuring the text inside is readable, usually by adding `data-bs-theme="dark"` or `text-white` to the container.

`contrast-dyn.css` changes this by:
1. **Paired Colors**: It applies both the background color AND a matching contrast text color automatically.
2. **Variable-Based**: It uses the `--bs-*-contrast` variables defined in your color theme (e.g., `default-color.css`).
3. **Dynamic Swapping (Zero HTML Changes)**: This is the core goal. If you change your theme (e.g., from a "Midnight" dark theme to a "Snowy" light theme), the contrast colors for all `bg-*` classes update automatically at the CSS level. You don't need to add or remove `data-bs-theme` attributes or text-color helper classes in your HTML templates.

## Targeted Components

The module currently provides contrast rules for:
- **Background Utilities**: `.bg-primary`, `.bg-secondary`, `.bg-success`, `.bg-danger`, `.bg-warning`, `.bg-info`, `.bg-light`, `.bg-dark`, and `.bg-body-emphasis`.
- **Outline Buttons**: `.btn-outline-*` (hover and active states).
- **Nested Links**: Ensures links inside these backgrounds maintain proper visibility via `.text-reset` compatibility.

## Usage

To use this behavior, include the file in your HTML **after** the selected theme/default modules and after `bootstrap-dyn.css`:

```html
<link rel="stylesheet" href="dist/default-color.css">
<!-- Load the remaining default-*.css files, or theme substitutes, here. -->
<link rel="stylesheet" href="dist/bootstrap-dyn.css">
<link rel="stylesheet" href="dist/contrast-dyn.css">
```

Custom color theme files replace `dist/default-color.css`. They must define the `--bs-*-contrast` variables they need and should be loaded before `bootstrap-dyn.css`.

### HTML Implementation Example

**Standard Bootstrap (Manual):**
```html
<div class="bg-primary" data-bs-theme="dark">
  <p>Text is white because of data-bs-theme.</p>
</div>
```

**BootstrapDyn with Contrast Module (Automatic):**
```html
<div class="bg-primary">
  <p>Text automatically uses --bs-primary-contrast.</p>
</div>
```

## Why it is optional

This module **deviates** from standard Bootstrap behavior by forcing a text color onto background utility classes. If you prefer Bootstrap's native `data-bs-theme` approach or have complex nested layouts that require manual contrast control, you should not load this file.
