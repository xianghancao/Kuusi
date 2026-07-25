# Contributing to Kuusi

Thank you for your interest in contributing. Kuusi is a monorepo with a TypeScript kernel and a JupyterLab 4 extension.

## What to work on

- Bug fixes and regressions in mind-map layout, notebook sync, or cell rendering
- UX improvements to toolbars, keyboard shortcuts, and settings
- Documentation, examples, and screenshots
- Tests and CI — see [Tests](#tests) below

Open an issue first for large features or architectural changes so we can align on scope.

## Development setup

### Prerequisites

| Tool | Version |
|------|---------|
| JupyterLab | 4.x |
| Python | 3.9+ |
| Node.js + npm | Node **≥ 20**, npm **≥ 10** (CI uses Node 24) |
| Git | any recent version |

Use **npm** for JavaScript dependencies (`package-lock.json`). Do not commit Yarn lockfiles.

`jupyter labextension build` may create a local `.yarn/` cache (gitignored). Clear dependency clutter with:

```bash
npm run clean:deps   # removes node_modules, yarn.lock, .yarn
npm run reinstall    # clean:deps + npm install
```

### Clone and install

```bash
git clone https://github.com/xianghancao/kuusi.git
cd kuusi
npm run jlab:install
jupyter lab
```

`npm run jlab:install` builds `kuusi-kernel`, compiles `jupyterlab-kuusi`, installs the Python package in editable mode, and rebuilds JupyterLab.

### Day-to-day workflow

In one terminal (watch TypeScript):

```bash
npm run jlab:dev
```

In another terminal:

```bash
jupyter lab
```

Rebuild a single package when needed:

```bash
npm run build:kernel
npm run build:extension:lib
npm run build:extension
```

Verify the extension is enabled:

```bash
npm run jlab:verify
```

### Tests

```bash
# Kernel unit tests + extension TypeScript build check + version sync
npm run test

# Production labextension build (requires JupyterLab)
npm run test:release-build

# JupyterLab smoke E2E (requires installed extension + Playwright Chromium)
npm run test:e2e
```

`npm run test:e2e` starts a temporary JupyterLab server, opens `examples/example.ipynb` via the **Kuusi** toolbar button, and asserts that the mind map renders.

Bump versions together in:

- `package.json` (root)
- `packages/kuusi-kernel/package.json`
- `packages/jupyterlab-kuusi/package.json`
- `packages/jupyterlab-kuusi/src/version.ts`
- `packages/jupyterlab-kuusi/jupyterlab_kuusi/_version.py`
- `jupyterlab-kuusi` dependency on `kuusi-kernel`

Then run `npm run check:versions` before opening a PR.

### Project layout

```
packages/kuusi-kernel/      # outline tree, dagre layout, navigation (no Jupyter deps)
packages/jupyterlab-kuusi/  # JupyterLab extension, toolbars, widget
examples/example.ipynb      # manual feature tour — update when adding user-facing behavior
docs/assets/                # Versioned README screenshots (e.g. 0.2.4/)
e2e/                        # JupyterLab smoke E2E (Playwright)
scripts/                    # install, verify, build/release checks
```

| Package | Responsibility |
|---------|----------------|
| `kuusi-kernel` | Pure logic: `buildNotebookOutline`, layout, drag target resolution, keyboard navigation helpers |
| `jupyterlab-kuusi` | UI: `NotebookMindMapWidget`, toolbars, settings persistence, JupyterLab plugin entry |

Keep kernel logic free of JupyterLab imports so it stays testable in isolation.

## Making changes

### Code style

- Match the surrounding file: naming, imports, and comment density
- Prefer the smallest correct diff — do not refactor unrelated code in the same PR
- TypeScript strict mode is enabled; `npm run build:extension:lib` must pass before submitting

### User-facing strings

New UI labels should go through `packages/jupyterlab-kuusi/src/kuusiI18n.ts` and JupyterLab's `TranslationBundle` (`trans.__("…")`).

### Settings

Persistent preferences belong in `packages/jupyterlab-kuusi/schema/plugin.json` and `mindMapSettings.ts`. Add schema properties with defaults; do not store settings only in widget memory.

### Example notebook

When you add or change user-visible behavior, update `examples/example.ipynb` so newcomers can try it without reading source code.

### Documentation

Update `README.md` for installation or feature changes. Add a bullet to `CHANGELOG.md` under `[Unreleased]` (or the appropriate version section).

### Screenshots

Place release screenshots in `docs/assets/<version>/` (e.g. `0.2.4/`) and link them from the root README. No demo GIF is required.

## Submitting a pull request

1. Fork the repository and create a feature branch from `main`
2. Make your changes and ensure the build passes:

   ```bash
   npm run build:kernel
   npm run build:extension:lib
   ```

3. Manually test in JupyterLab with `examples/example.ipynb`
4. Update docs / changelog / example notebook as appropriate
5. Open a PR with:
   - **Summary** — what changed and why
   - **Test plan** — steps you ran to verify the change

## Publishing a release

See [Publishing to PyPI](./README.md#publishing-to-pypi) in the README. Short version: bump versions → update changelog → tag `vX.Y.Z` → push. Workflow `.github/workflows/publish-pypi.yml` builds the production wheel and uploads via Trusted Publishing.

## Reporting bugs

Include:

- JupyterLab version (`jupyter lab --version`)
- Kuusi version (from the **Kuusi** menu → Current)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or a short screen recording if UI-related

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (BSD-3-Clause for the extension).
