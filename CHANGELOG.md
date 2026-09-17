# Changelog

All notable changes to Kuusi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.6] - 2026-09-17

### Added

- **Release tier (core vs full)**: PyPI **0.2.x** activates **core** only — notebook **Mind Map** plus Launcher **Kuusi → Mind Map** and **Settings**. Live PDF, TeX workspace, Markdown preview, Image viewer, Voice recorder, **Transfer speed** (channel monitor), and **Compress** (ZIP) ship in the labextension but stay inactive until **0.3.0** (semver `minor >= 3` → **full** tier). Matching server APIs (TeX compile, channel monitor, compress) are disabled on core as well.
- Kuusi **Settings** (Launcher → **Settings**): card layout with tabs for default file openers, **About** / version (local + PyPI latest), community, and repository; gear badge when a newer PyPI release exists.
- **Launcher → Kuusi** section: **Mind Map** (new notebook in the current folder) and **Settings** on core; additional tiles appear on full tier only.
- Mind Map page toolbar: **mind map icon** (left) opens the **keyboard shortcuts** guide (mind map, formatting, and notes); version, install command, and community links live under **Settings**, not in the page header.
- **Full tier (bundled, inactive on 0.2.x PyPI)**: Live PDF + SyncTeX, TeX compile workspace, Kuusi Markdown preview, image hub, voice recorder, Jupyter **channel monitor** (`jupyterlab-kuusi/channel-monitor/` and standalone `python -m jupyterlab_kuusi.channel_monitor`), workspace **Compress / extract ZIP** (context menu, command palette, launcher tile).

### Changed

- Default openers on **core**: only **Notebooks → Kuusi Mind Map** is configurable; other Kuusi default viewers are ignored until full tier.
- Appearance → **Node**: **Hover glow width** control; **Selection glow width** uses the same presets and preview as border width; status bar timestamp and node/zoom labels follow mind-map chrome font tokens.

### Developer notes

- Local full-tier QA: `localStorage.setItem('jupyterlab-kuusi:release-tier-override', 'full')` then reload JupyterLab.

## [0.2.5] - 2026-08-14

### Added

- Node → Width **Fit content**: card width follows content (capped by Node / Max width); with Equal width, all cards share the widest content width (still capped); measure uses unwrapped content width so short titles do not wrap to two lines; same-parent siblings share a parent-facing edge (left-aligned for LR)
- Empty / untitled notebooks auto-seed an **H1 root** when opened in Kuusi (blank code cell is promoted), so the canvas is never empty
- Page toolbar **Undo / Redo** controls (between Add and Tree), wired to notebook history with stack-aware enable state
- Font size slider labels show approximate px next to the step (e.g. `M · 18px`)
- Format toolbar **Math** menu (after List): secondary tabs for Wrap / Templates / Greek / Symbols (`$`/`$$`, formula tiles, letters, symbols)
- External Markdown paste maps ATX headings into a child outline under the selection (nesting to depth 20; levels beyond H3 keep Body chrome); plain lines without `#` stay flat topics; consecutive **list** items stay in one Body node
- Dropping on a card’s **rear** (bottom for LR/RL, trailing side for TB/BT) nests as a **child**; sibling “after” uses the gap between cards
- Child-drop preview: translucent placeholder sits in the **child lane** behind the target (where the node will land), not on top of the parent; empty space behind a card also counts as nest-as-child
- Format toolbar **Heading**: H1–H3 + Body; trigger shows current level (`H2` / `Body`); nesting deeper than H3 persists with Body chrome (to depth 20); drag-reorder remaps outline levels automatically
- Format toolbar **Heading → Body**: clear outline heading (`#` + metadata) for plain body text

### Fixed

- Kuusi window fullscreen: reparent into a dedicated shell again so Lumino dock absolute positioning no longer breaks the layout
- After a successful node drag, keep selection on the dragged node(s) and leave the viewport pan unchanged
- Opening Kuusi reliably centers the notebook’s active cell (waits for split pane size; re-centers while docking settles)
- Background Pattern: **Grid dense** and **Dots dense** (finer spacing than Grid / Dots)
- Notebook ↔ Kuusi selection sync **centers** the target node (open and clicking a notebook cell)

### Changed

- Theme menu lists each preset **vertically** with a right-side thumbnail (canvas + nodes)
- Status bar fullscreen is two controls: **JupyterLab fullscreen** (jupyter icon) and **Kuusi window fullscreen** (expand)
- Clicking **Kuusi** opens a left/right split (notebook | mind map) instead of replacing the tab; fullscreen stays manual
- Visual outline chrome is **H1–H3**; structural nesting persists to depth **20** via `metadata.kuusi.outlineLevel` (levels 4–20 keep Body chrome and round-trip on reopen)
- Collapse / expand control uses the node border color for its stroke and glyph; fill is that color at 30% opacity
- ⌘/Ctrl+click multi-selects nodes; dragging any selected node moves the whole selection with the same drop logic
- Drag any part of a node card to reorder (except collapse control and right-edge resize)
- Sibling drop preview: cards slide apart to open a slot (iOS-style) instead of top/bottom blue bars; “inside” still shows a ring
- Sibling insert preview: the near side of B/C stays put; the far side slides a full slot (pointer below → upper moves up; pointer above → lower moves down)
- Drag placeholder keeps connectors: edges follow the translucent card and preview the link to the drop parent
- Dragging into the gap between two siblings opens space on both sides (neighbors each move half a slot)
- Dropping far above the top sibling or far below the bottom sibling still counts as insert at first/last
- Layout packs sibling subtrees (no overlap) and centers them on the parent; edges use orthogonal gutters so lines do not cut through nodes
- Secondary dropdown menus max width **460px** (was 560px)
- Collapse control border radius follows Node → Corner
- Sibling gap **0** packs sibling cards flush (no extra layout padding / density floor)
- Line → **Route**: Straight / Curve / Orthogonal / Rounded orthogonal connector paths
- Font → **Link**: toggles to unify edit/display fonts, and to match notebook (ipynb) fonts (both off by default)

### Fixed

- After markdown render / card resize, connectors retarget to the live card center (warm layouts also run one correction measure pass)
- Toolbar secondary menus (Tree / Line / Node / Font / …) clamp and shift to stay inside a narrow Kuusi panel instead of being clipped off-screen
- Large maps: sibling packing no longer leaves nodes in negative coordinates, which clipped SVG connectors out of the viewBox
- External plain-text paste prefers the OS clipboard over stale in-app cell data; Kuusi copy/cut also mirrors cells to the system clipboard
- Kuusi UI strings stay **English** (no Jupyter language-pack mix) until a dedicated locale pack exists
- Copied topic subtrees paste as **children** of the selected node (not siblings); heading levels remap under the target
- Document click handlers for toolbar menus are registered once per mind-map widget and removed on dispose (no longer accumulate after reopen)
- Settings updates write only changed keys and apply once; non-geometry changes (line style, theme colors, background) skip full remeasure/layout
- Selecting nodes syncs Appearance → Node → Fill in place instead of remounting the Line/Node dropdown shells
- Layout/drag/keyboard paths use lightweight cell snapshots (source + kuusi metadata) instead of full notebook `toJSON()`, with an outline cache; warm layouts skip remeasure passes and only hide newly collapsed nodes
- Math format menu opens left-aligned (`right: 0`) so it is not clipped off the right edge of the format cluster
- Drop bands for LR/RL trees: top/bottom = sibling, center = child
- Double-click-to-edit after whole-card drag: delay pointer capture until drag starts, and detect double-tap on pointerup (capture was retargeting dblclick to the viewport)
- Collapse control on trackpads: light tap no longer starts width resize (collapse hit target wins over the right-edge handle)
- Clicking canvas blank while editing reliably renders Markdown and exits edit mode (edit-entry guard no longer blocks user commit)
- After render, node cursor shows grab/pointer instead of staying as a text (I-beam) caret
- Manual pan / node drag no longer triggers stray viewport re-centering when the pointer is released
- JupyterLab ¶ heading anchor links hidden on mind-map nodes (CSS + post-render strip)
- Vertical format toolbar: Aa / Math sub-menus open to the left and stay inside the panel when the header wraps

### Changed

- Format toolbar **Aa** menu uses the same symbol chip grid as Math (B, I, U, …)
- Collapse control shows a hover glow using the node border color
- Removed the left ⋮⋮ drag handle; the whole card remains draggable (except collapse and resize zones)

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

[Unreleased]: https://github.com/xianghancao/kuusi/compare/v0.2.6...HEAD
[0.2.6]: https://github.com/xianghancao/kuusi/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/xianghancao/kuusi/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/xianghancao/kuusi/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/xianghancao/kuusi/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/xianghancao/kuusi/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/xianghancao/kuusi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/xianghancao/kuusi/releases/tag/v0.2.0
