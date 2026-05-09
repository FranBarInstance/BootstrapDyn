# BootstrapDyn – Modular & Dynamic Bootstrap 5

BootstrapDyn splits the original Bootstrap 5.3 CSS into **separate, modular CSS variable files** so you can theme colors, typography, or any future concern independently — without touching the component CSS.

## Visual Parity and Compatibility

A core principle of this project is **strict visual fidelity**. The files generated in `dist/` are designed to produce the exact same visual result as the original Bootstrap CSS when using the default variables. This ensures that:
1. Your project starts with the 100% standard Bootstrap "look and feel".
2. **Zero HTML changes**: You don't need to modify your templates, component structures, or Bootstrap classes. Compatibility is maintained purely at the CSS layer.
3. All Bootstrap components behave and render identically.
4. You only deviate from the original design when you explicitly choose to replace default modules with theme modules.

### Single-file bundle

For production deployments that prefer a single HTTP request, use the build script to run the extractor pipeline and bundler in one step:

```bash
npm run build
```

This runs `extractor/main.js` followed by `scripts/bundle.mjs`, producing the 14 individual files plus `dist/bootstrap-dyn-bundle.css` and `dist/bootstrap-dyn-bundle.min.css`. Load the minified bundle instead of the 14 individual files:

```html
<link rel="stylesheet" href="dist/bootstrap-dyn-bundle.min.css">
```

The bundle contains all modules in the canonical load order defined in [`.specify/theme-spec.md`](.specify/theme-spec.md). The bundler discovers files by canonical suffix (`*-color.css`, `*-typography.css`, etc.), so it works with any theme directory, not just `dist/`. See [`examples/demo/bundle.html`](examples/demo/bundle.html) for a complete demo page.

## How `contrast-dyn.css` works (optional)

A common challenge in Bootstrap 5+ is handling accessibility and contrast dynamically without bloating the HTML with `data-bs-theme` attributes.

### The standard (static) approach

In standard Bootstrap, developers must explicitly define the contrast mode for each container. If you have a dark background, you add `data-bs-theme="dark"` to make the child elements (text, links, buttons) visible.

```html
<!-- You must know IN ADVANCE that bg-primary is dark -->
<header class="bg-primary" data-bs-theme="dark">
    <a class="nav-link" href="#">Static Link</a>
</header>
```

**The limitation:** This approach is hardcoded into your HTML. If you change your theme to a light version at runtime, the `data-bs-theme="dark"` attribute will remain, making the text unreadable (white text on a light background).

### The BootstrapDyn (dynamic) approach

BootstrapDyn handles contrast at the CSS variable level. Each color theme defines its own contrast variables (`--bs-primary-contrast`, `--bs-secondary-contrast`, etc.) inside `default-color.css` (or your custom color theme). `contrast-dyn.css` only consumes those variables — it does not define them.

This means if you create a custom color theme, you must provide the matching `*-contrast` variables alongside your palette so that `contrast-dyn.css` can resolve the correct text colors.

```html
<!-- Clean, agnostic HTML -->
<header class="bg-primary">
    <a class="nav-link" href="#">Automatic Dynamic Link</a>
</header>
```

The `text-reset` class is recommended when you want child links to inherit the computed contrast color rather than Bootstrap's default link color.

**Zero HTML changes:** Switch from a dark professional theme to a light pastel style, and your menus, cards, and links automatically adapt their colors instantly. The contrast rules handle both `bg-*` background utilities and `btn-outline-*` hover/active states.

### Do you need it?

If you want the original Bootstrap behavior, **do not load** `contrast-dyn.css`. You will keep the default link colors and Bootstrap's own `data-bs-theme` approach. The file is completely optional.

For more details on how it changes Bootstrap's behavior, see [Contrast Dynamic Documentation](docs/modules/contrast-dyn.md).

## Theme customization

Copy any `default-*.css` file to a theme file (e.g. copy `dist/default-color.css` to `theme/color.css`) and edit the values you want to change. Then load the theme file **instead of** the matching default file.

This allows fully modular theming: you can swap fonts without touching colors, or change the color palette without affecting typography.

## Versioning Policy

BootstrapDyn follows a **synchronized versioning** scheme with Bootstrap for its first two digits:

- **Major & Minor**: Synchronized with Bootstrap (e.g., `5.3.x` is for Bootstrap `v5.3`).
- **Patch**: Represents the revision of the BootstrapDyn extraction tool and modules.

| BootstrapDyn Version | Target Bootstrap | Status |
|----------------------|------------------|--------|
| **5.3.0**            | **5.3.8**        | Current |

This ensures that you always know which Bootstrap family is supported by a specific version of BootstrapDyn.

## Contributing

If you want to modify the pipeline, add new modules, or upgrade the Bootstrap source, see [`extractor/README.md`](extractor/README.md) for developer documentation.

---

## Acknowledgments

This project is based on and uses [Bootstrap](https://github.com/twbs/bootstrap). BootstrapDyn extends Bootstrap's modular CSS architecture to provide dynamic theming capabilities while maintaining full compatibility with the original framework.

*Designed for Bootstrap 5.3.8 – Modular and extensible theme system.*
