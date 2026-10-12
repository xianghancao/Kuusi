# Changelog

All notable changes to Kuusi are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.7] - 2026-10-08

**Mind Map** is the default Kuusi view. **Article**, **Book** and **Slides** ship in the package but are switched off by default while they are in testing (turn them on under **Settings → Default files**; they carry a Beta / Experimental tag there). Release-tier gating is no longer applied to plugins, and the Live PDF, TeX, voice recorder, image hub, channel monitor, and ZIP tools are gone from this package (see **Removed**).

### Added

- **Kuusi View** for notebooks and Markdown: editor plus a render pane, switched with **Article / Mind Map / Slides**.
- **Article** reading view: Theme, Page (scroll or paged paper), Header & footer, Text, Paragraph, Headings, Code, and **Image** capsules.
- **Article paged layout**: paper sheets with a desk gap; headings stay with the next block; orphan/widow lines; tall code, tables, and lists split across pages (tables repeat the header; numbered lists keep counting). Images and display math stay intact. Running header, footer, and page numbers on each sheet.
- **Slides** view (Markdown and notebook): the same typography capsules as Article, plus page ratio / split / header & footer.
- **Image** capsule (Article and Slides): alignment (left / center / right), wrap (block, left + wrap, right + wrap), size (natural / wide / full), and border (style, color, weight, corner).
- **Export** on every render view: PDF, PNG, JPEG, WebP, print / vector PDF, HTML, and download of the source file.
- **Editor ↔ view position sync**: moving the caret or active cell scrolls or pages an open Article / Slides / Mind Map; clicking the view (or changing slide) moves the editor without stealing focus.
- Markdown **mind map**: drop an image onto a node; the file is saved next to the document.
- Mind Map uses the same **Text / Paragraph / Elements** capsules as Article and Slides. Body cards take **Text → Body**; H1–H3 tree frames take **Text → H1–H3**; H4–H6 style titles inside a card. The source-edit font is under **Elements → Text**.
- **Simplified Chinese UI**: domain `jupyterlab_kuusi` with zh_CN gettext catalogs. The chrome follows the JupyterLab language; a frontend map fills strings if the official locale loader misses the pack.
- Theme menu: **Restore theme defaults** — reapplies this theme’s page, background, and appearance. Text and Headings stay as you left them.
- **View menu settings** (Settings → Default files): choose which views appear in the view menu — Article, Book, Mind Map, Slides — and their left-to-right order. Article and Mind Map are on by default; the first enabled view opens by default.
- **Capsule menus**: Esc closes an open menu and returns focus to its button; Up / Down / Home / End move between tabs; opening a menu moves focus into it; hover waits a moment before switching tabs; menu scroll position and focus survive a rebuild; open menus follow their button when the panel is resized and scroll when taller than the window.
- **Page menus** group their long tab list (Layout · Surface · Header & footer · Display).
- **Customized dot** on the Theme, Page, and (Mind Map) Layout buttons when settings differ from the theme defaults, plus **Reset page settings** at the bottom of those menus.
- **Theme hover preview**: rest on a theme to see it on the canvas; moving away restores it, clicking applies it. Previews are never saved.
- **Text → Apply text style to all views** copies font, colors, tracking, paragraph spacing / indent / alignment, link style, and heading font / color / alignment to the other views (sizes and line height stay per view).
- **Option legends**: small diagrams on menu choices that are hard to picture from a label — page layout, paper size and orientation, columns, page-number format / start / position, text and paragraph alignment, image alignment / wrap / size / border, link style, list spacing, table style, quote and rule weight. The Text, Paragraph and Elements menus are shared, so Slides and Mind Map get them too.
- **Mind Map — node levels**: Node → **Levels** sets fill, border color / width, and corner radius separately for the root, level 1, level 2, and deeper nodes. A node's own fill still wins; text contrast follows the level fill.
- **Mind Map — lines**: Line → **Taper** makes connectors thinner with depth (minimum width configurable); **Branch colors** (rainbow / pastel / mono) colors each first-level branch, and arrows follow the branch color.
- **Mind Map — node padding**: Node → **Padding** sets horizontal and vertical card insets.
- **Mind Map — fit to window**: ⤢ button beside the zoom controls and **Shift+1** fit the whole map in view.
- **Mind Map — View** (Layout → View): zoom range (minimum 5–100%, maximum 100–800%), mouse wheel behavior (pans, or zooms with Shift to pan) and zoom speed, and what happens on open (center selected node, center root, fit whole map, restore last view per file).
- **Mind Map — touch**: two-finger pinch zoom and pan; a card needs a short press before it drags (a swipe pans the canvas); larger resize and zoom targets on coarse pointers.
- Mind Map canvas respects **prefers-reduced-motion**, and controls show keyboard focus rings.
- **Article — contents page**: Page → Contents inserts a table of contents (dot leaders and page numbers that follow the page-number start) before the text; depth H1–H1…H4 and an optional title. The text after it starts on a new page.
- **Article — heading numbers**: Page → Chapters numbers headings `1`, `1.1`, `1.1.1` or `第一章`, `1.1`; the numbers appear in the contents and the PDF bookmarks.
- **Article — chapter page break**: start every Heading 1 (or Heading 1–2) on a new page.
- **Article — PDF bookmarks**: exported PDFs carry a nested outline (one entry per heading, linked to its page) and the document title.
- **Article — Chinese fonts**: 宋体, 黑体, 楷体 and 仿宋 under a new Chinese group in every font menu.
- **Article — more paper**: A3, A5, B5 and Legal beside A4 and Letter; the PDF and print page size follow.
- **Article — header & footer**: `{chapter}` and `{date}` placeholders, a rule line under the header and above the footer, and a different (empty) first page.
- **Article — table headers**: Page → Layout → **Repeat table headers** turns header repetition on long tables on or off.
- **Article — margins**: Page → Margins sets top, bottom, left and right margins in mm (Auto follows Padding) plus a binding gutter.
- **Article — typesetting**: Page → Typesetting adds line-spacing presets (1 / 1.15 / 1.5 / 2), orphan / widow lines, hyphenation, and a first-line indent in characters for Chinese paragraphs.
- **Article — cover page and watermark**: an optional title page (document name and date) before the contents, and diagonal watermark text on every page.
- **Article — blocks**: code line numbers and tab width, image captions (“Figure N. alt text”), link footnotes (numbered links with an address list at the end), table text size and banded-row color.
- **Article — PDF export**: Page → PDF export turns bookmarks on or off and picks image quality; mirrored header / footer alignment on even pages for bound documents.

### Changed

- **Body font size is shown and entered in points** (Article, Book, Slides, Mind Map): 12 pt is the same size as Word's 12 pt (16 px). Stored values stay in px, so existing settings look the same; the default 14 px now reads 10.5 pt, and the range is 6–28 pt.
- **Launcher → Kuusi** shows **Mind Map**, **Article** and **Settings**. **Book** and **Slides** tiles appear only once you turn those views on under **Settings → Default files**.
- Article image width moved from Page → Images into the **Image** capsule.
- **Article → Page**: Padding now reaches 8 rem (≈ 34 mm; it stopped at 17 mm) and shows its printed size in mm; leading starts at 0.9 (0.5 made lines overlap); Measure explains that it only applies to the scrolling layout, Paper that it switches to the paged layout, and Header / Footer list their placeholders. The Page menu is taller to fit its grouped tabs.
- Export trigger matches the view-switcher pill (fully rounded).
- Dark / light Jupyter themes: Article and Slides page colors follow the Lab theme so body text stays readable.
- Slides settings (theme, type, page chrome) update CSS and header/footer in place. The deck rebuilds only when **split mode** changes.
- Kuusi UI strings no longer stay forced to English; they use the `jupyterlab_kuusi` catalog (and the zh_CN fallback).
- Theme menus have **Restore theme defaults**. Picking a theme does not change fonts or heading styles.
- Release tier gating (`core` / `full`) is no longer applied to plugins; there is no 0.3.0 switch to wait for.
- Article, Book, and Slides share one capsule-header implementation and one Theme menu implementation.
- **Article paged layout** (single column) now lets the browser break pages natively (`column-height`, Chromium 145+) — about 5× faster on a 300-page document and the same page packing — and falls back to the JS paginator elsewhere. Set `localStorage["jupyterlab-kuusi:article-pagination"]` to `"js"` to force the fallback. Code blocks wrap in paged Article (a scrolling block cannot be split across pages).
- Article source ↔ view position sync reads block boundaries from the `marked` lexer instead of a hand-written scanner (exact line ranges; front matter, setext headings and HTML blocks line up).
- **Text** and **Headings** are one capsule on every view: the **Text** menu has **Body** (font, size, colors, tracking, leading) and **H1–H6**. On Mind Map, the node-editing font moved from Text to **Elements → Text**, so each view has one capsule fewer.
- Kuusi Settings strings, the Mind Map cut / copy / paste tooltips, and the view-order panel are translated (zh_CN).
- Mind Map: Cut moves focus to the neighbouring topic and re-seeds the root if the map empties; pasting code cells into a Markdown mind map keeps them as fenced Markdown instead of dropping them on save; **Ctrl/⌘+C** copies selected text inside a card instead of the whole subtree; clicking empty space in the capsule closes open menus.

### Fixed

- Close-tab leaks: Markdown mind-map model-sync handlers, default-opener toolbar subscriptions, and portaled format / Article / Slides menus now disconnect or restore on dispose.
- Mind Map drag: a cancelled pointer (touch takeover, window blur) no longer drops the node; **Esc** cancels a drag; right / middle click no longer starts one; multi-selections from different parents all close their gaps; a failed drop re-syncs the canvas.
- Markdown mind map: opening a file no longer rewrites it (blank-line runs, CRLF, missing final newline) or marks it modified; saving from a hidden mind map can no longer overwrite edits made in the source editor; every edit no longer triggers an extra full reload.
- Mind Map opened in a background tab now centers when it is first shown.
- Article paged layout: code blocks no longer run up to 8 px into the bottom margin when split; a heading is no longer left alone at the bottom of a page when its paragraph or table moves on; the JS paginator no longer rebuilds the block list on every step (a 300-page document took ~1.5 s, now ~0.5 s) and cannot loop on a block that will not settle; a very long article is no longer silently left unpaged after 4000 steps.
- Article stays smooth while you drag the split divider: the pane-fit zoom follows the pane continuously instead of jumping in 10% steps, and moving the divider (or changing only the zoom) no longer re-paginates the whole article every frame (a 78-page document dropped from ~56 ms to ~17 ms per frame).
- Settings schemas documented the wrong units for letter spacing, paragraph spacing and first-line indent (they are pt, not em). Article's schema defaults (background pattern, leading, paragraph spacing, code size) now equal the code defaults, so a fresh install no longer shows the Theme / Page "customized" dot. `npm run bench:article:defaults` guards this.
- Article images and files with a literal `%` in the path (`50%.png`) resolve instead of failing.
- Article source map no longer drifts: on a 1100-block document the old scanner lost 7 blocks and misaligned 413.
- Mind Map Markdown toolbar paste no longer drops pasted code cells.

### Removed

- **Live PDF** (SyncTeX) and the **TeX compile** workspace (TeX / Live PDF now live in academic-toolkit), the **voice recorder**, the **image hub** viewer, the Jupyter **channel monitor**, and workspace **Compress / extract ZIP**, along with their server endpoints and settings schemas. They shipped inactive in 0.2.6.

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

[Unreleased]: https://github.com/xianghancao/kuusi/compare/v0.2.7...HEAD
[0.2.7]: https://github.com/xianghancao/kuusi/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/xianghancao/kuusi/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/xianghancao/kuusi/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/xianghancao/kuusi/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/xianghancao/kuusi/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/xianghancao/kuusi/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/xianghancao/kuusi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/xianghancao/kuusi/releases/tag/v0.2.0
