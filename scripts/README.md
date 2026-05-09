# Scripts

Utility scripts for the BootstrapDyn build pipeline.

## Scripts

| Script | Purpose | npm alias |
|--------|---------|-----------|
| [`build.mjs`](build.mjs) | Full build: runs the extractor pipeline followed by the bundler | `npm run build` |
| [`bundle.mjs`](bundle.mjs) | Bundler: concatenates CSS modules into a single minified file | `npm run bundle` |

## Usage

### Full build (recommended)

Runs the extractor pipeline and generates the bundle in one step:

```bash
npm run build

# Custom input/output
node scripts/build.mjs my-bootstrap.css output/
```

### Bundle only

Use when `dist/` already contains the extracted modules and you only need to regenerate the bundle:

```bash
npm run bundle

# Custom input/output
node scripts/bundle.mjs my-theme/ output/

# Exclude modules
node scripts/bundle.mjs dist dist --exclude "contrast-dyn.css,-grid.css"
```

The bundler discovers files by canonical suffix (`*-color.css`, `*-typography.css`, etc.) as defined in [`.specify/theme-spec.md`](../.specify/theme-spec.md), so it works with any theme directory.

#### Excluding modules

The `--exclude` flag accepts a comma-separated list of suffixes or fixed filenames to omit from the bundle:

```bash
# Exclude by suffix
node scripts/bundle.mjs --exclude "-grid.css"

# Exclude multiple
node scripts/bundle.mjs --exclude "contrast-dyn.css,-grid.css,-motion.css"
```

Excluded modules are listed in the output and skipped during concatenation.

## Output

Both scripts produce:
- `bootstrap-dyn-bundle.css` — concatenated bundle
- `bootstrap-dyn-bundle.min.css` — minified version

## See Also

- [`.specify/theme-spec.md`](../.specify/theme-spec.md) — Theme file naming convention and load order
- [`extractor/README.md`](../extractor/README.md) — Extractor pipeline documentation
