# Contributing to Kuusi

## Policy (pre-1.0)

Kuusi welcomes **bug reports, feature ideas, and feedback**.

Until **1.0.0**, development is **maintainer-only**:

- Please open a [GitHub Issue](https://github.com/xianghancao/kuusi/issues) for bugs or ideas
- **External pull requests and code contributions are not accepted**
- A workflow closes external PRs automatically and points here

You may still fork the repo for personal use under the project license (BSD-3-Clause).

## Reporting bugs

Include:

- JupyterLab version (`jupyter lab --version`)
- Kuusi version (**Launcher → Kuusi → Settings**)
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
git clone https://github.com/xianghancao/kuusi.git
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

### Menu grouping rule

Capsule menus with a left-hand list of tabs (Article, Mind Map, Book, …) follow one rule, implemented in `packages/jupyterlab-kuusi/src/secondaryMenu.ts`:

1. Tabs of one concern form a **group**, announced by a small caption (LAYOUT, SURFACE, LINE, …).
2. A **rule** is drawn between two groups. The first group has none above it.
3. Tab labels stay short; the caption provides the context. Do not prefix labels with their group (`Line · Width`).
4. A menu with a single group needs no caption.

Declare groups with `sections[].group` in `mountSecondaryMenu`, or `groups[].label` in `mountComposedSecondaryMenu` (one capsule button merging several menus; a group without a label continues the previous one). Both render the caption and the rule, so do not hand-roll separators in a menu.

Capsule overflow: the page capsule (`src/pageToolbar.ts`, shared by Article, Book, Slides and Mind Map) folds capsules of the `appearance` group into a trailing "…" menu, last first, when the header is too narrow. Put new menus in that group and they get this for free; pass `menuRoot` (and `reserveRight` if something sits at the header's right edge) to `createPageToolbar`.

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
packages/jupyterlab-kuusi/  # JupyterLab extension: View, Article, Slides, Mind Map
examples/example.ipynb      # notebook tour (Article / Slides / Mind Map)
examples/slides-deck.md     # Markdown slides fixture
docs/assets/                # Versioned README screenshots
e2e/                        # Playwright smoke E2E
scripts/
```

Keep kernel logic free of JupyterLab imports.

### Code notes

- Match surrounding style; prefer the smallest correct diff
- New UI labels go through `kuusiI18n.ts` as `trans.__("literal")` (variables are not extractable). Add the English → 简体中文 row in `packages/jupyterlab-kuusi/scripts/build_zh_cn_locale.py` and run that script to refresh `jupyterlab_kuusi/locale/` and `src/locale/zhCN.ts`. Kuusi follows the JupyterLab language via domain `jupyterlab_kuusi`.
- Settings belong in `schema/` (`plugin.json` mind map, `article.json`, `markdown-slides.json`, `default-openers.json`) and the matching `*Settings.ts` files
- Update `examples/example.ipynb`, `examples/slides-deck.md`, `README.md`, and `CHANGELOG.md` for user-facing changes
- Screenshots: `docs/assets/<version>/`

## Publishing a release

See [Publishing to PyPI](./README.md#publishing-to-pypi) in the README. Short version: bump versions → update changelog → tag `vX.Y.Z` → push. Workflow `.github/workflows/publish-pypi.yml` builds the production wheel and uploads via Trusted Publishing.

## License

Released packages use **BSD-3-Clause**. External code contributions are not accepted; there is no contributor license agreement because outside patches are not merged.
