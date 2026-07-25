# Changelog

All notable changes to Kuusi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.4] - 2026-07-25

### Added

- Branch **collapse / expand** on parent nodes (chevron + hidden-count badge); **Space** toggles
- Opening Kuusi **centers** the notebook’s current / active cell (one-shot; expands collapsed ancestors if needed)
- Node **width** slider, **Equal width** switch, and **right-edge drag** to resize cards
- Appearance → **Node**: map fill, selected-node fill, border controls, selection glow
- Theme presets: **Notebook** / **Soft** / **Outline** / **Paper** / **Board** / **Black** / **Minimal** (stamp Line + Node + Background + Font)
- Background color **Ink** (used by Black theme)
- Kuusi menu **Community** tab: Discourse feedback topic + X (@KussiMindMap)
- Subtree **Delete** / **Copy** / **Cut** / **Paste**; paste external plain text as child topics
- Line / Node color pickers: **White** swatch

### Changed

- Appearance **Border** → **Node**; page toolbar **Style** → **Theme**; format **Title** → **Heading**
- Page toolbars are frosted-glass capsules; menus use a shared **secondary sidebar** shell
- Kuusi menu: **About** · **Version** · **Repository** · **Community** · **Install** · **Shortcut**
- Font: **Edit** / **Display** tabs; size scale **XXS→XXL** (7 steps)
- Zoom UI: click-to-reveal vertical **20%–200%** slider; pinch / Ctrl+wheel roughly **2×** faster
- Boolean controls use a pill switch; choice rows stay as tiles
- README screenshots under `docs/assets/0.2.4/` (no demo GIF)

### Fixed

- Opening Kuusi from the notebook toolbar no longer crashes
- Selected nodes keep an opaque card fill under JupyterLab selection styles
- Toolbar dropdowns open reliably; narrow header stacks the Aa capsule vertically
- Secondary / product menu text readable in Jupyter Light and Dark
- Enter / Tab insert opens edit mode immediately; Enter on **H1 root** inserts a child (not a floating H1)
- Display font/size changes remeasure and relayout (no overlapping cards)
- Board (and other explicit fills) auto-contrast node text on Jupyter Dark
- Glass capsules use lower fill opacity so backdrop blur is visible
- Zoom slider stays open while dragging; Aa font-color swatches compacted

## [0.2.3] - 2026-07-18

### Added

- Red update badge on the Kuusi logo when the installed version is behind the latest release
- GitHub Actions workflow to publish `jupyterlab-kuusi` to PyPI on `v*` tags (Trusted Publishing)

### Changed

- Install docs lead with `pip install jupyterlab-kuusi` (PyPI); source install is for developers
- Edge arrow markers use SVG user-space units so arrows stay attached to connectors under zoom/pan

### Fixed

- Arrowheads detaching from connector lines (wrong start `refX` + `strokeWidth` markers with CSS `pt` widths)
- Labextension CI build failing on Yarn immutable lockfile checks

## [0.2.2] - 2026-07-18

### Added

- Independent **background pattern** (`plain` / `grid` / `dots` / `gradient`) separate from background color themes
- Edge **arrow direction** and **arrow style** (replaces line cap)
- Node **border corner** modes (`sharp` / `rounded` / `ellipse`) with adjustable radius
- Extra line / border width presets (up to 10pt)
- Soft **hover glow** on non-selected nodes

### Changed

- Rebranded from **Lumen** to **Kuusi** (Finnish for spruce): packages `kuusi-kernel` / `jupyterlab-kuusi`, UI classes `jp-Kuusi*`, document factory **Kuusi Mind Map**
- Parent–child layout gap maximum raised to **200**
- Trackpad pinch / Ctrl+wheel zoom uses exponential scaling with a balanced sensitivity
- Tab inserts a new child **after the current subtree** (at the bottom of siblings)
- Title (heading) button writes markdown `#` markers so structure changes are visible in the notebook
- Fullscreen button targets the document DOM node (avoids federated `instanceof` failures) and uses the Fullscreen API with vendor prefixes
- Status bar z-index and fullscreen hit target improved
- `build:lib` cleans `lib/` first to avoid stale incremental TypeScript output
- Install script uninstalls leftover `jupyterlab-lumen`
- Version sync check (`npm run check:versions`) and production release build check (`npm run test:release-build`)
- Standardized on **npm** only (`package-lock.json`); removed Yarn lockfile and config
- Local install keeps dev labextension build; release/PyPI path uses production `build:labextension`
- Consolidated Playwright smoke test under `e2e/jupyterlab-smoke.mjs`

### Fixed

- Fullscreen control no longer silently no-ops under JupyterLab module federation
- Typing in the classic notebook no longer flashes split-view (in-place cell measure instead of off-screen remount)

### Removed

- Ad-hoc debug Playwright scripts under `scripts/debug-*.mjs` and `scripts/test-*.mjs`
- Stale archived prototype references from README (directory already absent from the repo)

## [0.2.0] - 2026-07-03

First public release of the Jupyter-native mind map stack (`kuusi-kernel` + `jupyterlab-kuusi`). Replaces the archived React/Tiptap prototype.

### Added

- **Kuusi Mind Map** document factory for `.ipynb` files in JupyterLab 4
- **Heading-driven outline tree** in `kuusi-kernel` (`#` = root, nested `##`–`######`, content cells attach to current heading)
- **Spatial canvas** with native Jupyter CodeCell / MarkdownCell widgets (not a custom editor)
- **Pan and zoom** (10%–200% presets, Ctrl/Cmd + wheel), fullscreen toggle
- **Drag-and-drop** node reordering with before / inside / after drop zones
- **Two-way notebook sync** — structural edits update the shared `INotebookModel`
- **Notebook ↔ Kuusi focus sync** — selecting a cell in the classic editor pans to the matching node
- **Tree direction** toolbar: TB, BT, LR, RL
- **Style** themes: Classic, Soft, Contrast
- **Line / Border** appearance controls (style, width, color)
- **Font** toolbar (notebook default + sans-serif and serif families)
- **Layout** density: Compact, Normal, Loose (XMind-style spacing)
- **Background** presets: Default, Plain (dark), Grid, Dots, Gradient, Business Blue, Eye Care, Newspaper
- **Markdown format toolbar** (edit mode): Title H1–H6, Aa styles, lists, table grid, image/link (Markdown + HTML), font color
- **Guide** dropdown with mind-map and formatting keyboard shortcuts
- **Product menu** (Kuusi logo): current version, latest version check, GitHub repository link
- **Empty node insertion** via Tab (child) / Enter (sibling) with correct outline hierarchy via `metadata.kuusi.headingLevel`
- **Persistent user settings** (theme, font, layout, tree direction, background, appearance) via JupyterLab `ISettingRegistry`
- **Offline-friendly version check** with `localStorage` cache and graceful fallback
- **i18n groundwork** — UI strings routed through JupyterLab `TranslationBundle`
- Example notebook at `examples/example.ipynb`
- **Automated tests**: kernel unit tests (`npm run test:kernel`), extension build check (`npm run test:build`), JupyterLab smoke E2E (`npm run test:e2e`), GitHub Actions CI

### Changed

- Logo uses gold gradient with the Jupyter UI font (no cursive/webfont)
- Empty nodes show a blank title instead of `markdown cell N`

### Removed

- Dependency on the archived React/Tiptap prototype stack (Tiptap, React Flow, legacy JSON sidecar)

## [0.1.x and earlier]

Pre-0.2.0 prototypes are not part of this changelog.

[Unreleased]: https://github.com/xianghancao/kuusi/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/xianghancao/kuusi/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/xianghancao/kuusi/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/xianghancao/kuusi/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/xianghancao/kuusi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/xianghancao/kuusi/releases/tag/v0.2.0
