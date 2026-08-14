# Contributing to Kuusi

## Policy (pre-1.0)

Kuusi welcomes **bug reports, feature ideas, and feedback**.

Until **1.0.0**, development is **maintainer-only**:

- Please open a [GitHub Issue](https://github.com/xianghancao/Kuusi/issues) for bugs or ideas
- **External pull requests and code contributions are not accepted**
- A workflow closes external PRs automatically and points here

You may still fork the repo for personal use under the project license (BSD-3-Clause).

## Reporting bugs

Include:

- JupyterLab version (`jupyter lab --version`)
- Kuusi version (from the **Kuusi** menu → Current)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or a short screen recording if UI-related

## Feedback channels

- GitHub Issues (preferred for actionable bugs and feature requests)
- [Discourse topic](https://discourse.jupyter.org/t/kuusi-jupyterlab-notebook-mind-map-feedback-welcome/38802)
- [X @KussiMindMap](https://x.com/KussiMindMap)

## Maintainer development

These notes are for the maintainer (and anyone exploring a personal fork).

### Prerequisites

| Tool | Version |
|------|---------|
| JupyterLab | 4.x |
| Python | 3.9+ |
| Node.js + npm | Node **≥ 20**, npm **≥ 10** (CI uses Node 24) |
| Git | any recent version |

Use **npm** for JavaScript dependencies (`package-lock.json`). Do not commit Yarn lockfiles.

```bash
npm run clean:deps   # removes node_modules, yarn.lock, .yarn
npm run reinstall    # clean:deps + npm install
```

### Clone and install

```bash
git clone https://github.com/xianghancao/Kuusi.git
cd Kuusi
npm run jlab:install
jupyter lab
```

### Day-to-day workflow

```bash
npm run jlab:dev   # watch TypeScript
jupyter lab        # separate terminal
```

```bash
npm run build:kernel
npm run build:extension:lib
npm run build:extension
npm run jlab:verify
```

### Tests

```bash
npm run test
npm run test:release-build
npm run test:e2e
```

Bump versions together in:

- `package.json` (root)
- `packages/kuusi-kernel/package.json`
- `packages/jupyterlab-kuusi/package.json`
- `packages/jupyterlab-kuusi/src/version.ts`
- `packages/jupyterlab-kuusi/jupyterlab_kuusi/_version.py`
- `jupyterlab-kuusi` dependency on `kuusi-kernel`

Then run `npm run check:versions`.

### Project layout

```
packages/kuusi-kernel/      # outline tree, dagre layout, navigation (no Jupyter deps)
packages/jupyterlab-kuusi/  # JupyterLab extension, toolbars, widget
examples/example.ipynb      # manual feature tour
docs/assets/                # Versioned README screenshots
e2e/                        # Playwright smoke E2E
scripts/
```

Keep kernel logic free of JupyterLab imports.

### Code notes

- Match surrounding style; prefer the smallest correct diff
- New UI labels go through `kuusiI18n.ts` / `TranslationBundle`
- Settings belong in `schema/plugin.json` and `mindMapSettings.ts`
- Update `examples/example.ipynb`, `README.md`, and `CHANGELOG.md` for user-facing changes
- Screenshots: `docs/assets/<version>/`

## Publishing a release

See [Publishing to PyPI](./README.md#publishing-to-pypi) in the README. Short version: bump versions → update changelog → tag `vX.Y.Z` → push. Workflow `.github/workflows/publish-pypi.yml` builds the production wheel and uploads via Trusted Publishing.

## License

Released packages use **BSD-3-Clause**. External code contributions are not accepted; there is no contributor license agreement because outside patches are not merged.
