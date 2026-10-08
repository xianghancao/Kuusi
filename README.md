# Kuusi

*Kuusi* (Finnish for spruce) — Jupyter-native **Article**, **Slides**, and **Mind Map** for `.ipynb` and `.md`. The mind map rearranges cells on a spatial canvas by heading hierarchy, using **Jupyter's own cell renderers** (CodeCell / MarkdownCell — not a custom rich-text editor). PyPI **0.2.x** still ships **core** (Mind Map); the views below are in this source tree.

  
<p align="center">
  <img src="docs/assets/0.2.6/kuusi-overview-light.png" alt="Kuusi mind map overview (light)" width="720"/>
</p>

<p align="center"><em>Overview — headings become branches; code and markdown cells attach as nodes</em></p>

<p align="center">
  <img src="docs/assets/0.2.6/kuusi-overview-dark.png" alt="Kuusi mind map overview (dark)" width="720"/>
</p>

<p align="center"><em>Same notebook on a dark canvas with glass toolbars</em></p>

<p align="center">
  <img src="docs/assets/0.2.6/kuusi-launcher-core.png" alt="Kuusi Launcher (core tier)" width="720"/>
</p>

<p align="center"><em>Launcher → Kuusi on 0.2.6 PyPI (Mind Map + Settings). Current source shows Settings only; extra tiles stay hidden until 0.3.0.</em></p>

## Version

| Component | Version |
|-----------|---------|
| **Kuusi** | `0.2.7` |
| `kuusi-kernel` | `0.2.7` |
| `jupyterlab-kuusi` | `0.2.7` |

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## What’s in 0.2.x (core tier)

`pip install jupyterlab-kuusi` at **0.2.x** turns on **core** features only:

| Active on core | Description |
|----------------|-------------|
| **Mind Map** | Open `.ipynb` files in the Kuusi canvas (**Open With → Kuusi Mind Map**, or toolbar **Kuusi** on the 0.2.6 wheel). |
| **Launcher → Kuusi** | **0.2.6 wheel:** Mind Map (new notebook) and Settings. **Current source:** Settings only (other tiles stay registered but hidden). Settings: version, PyPI update check, community links, repository, about, and default openers. |
| **Page header (row 2)** | Left **mind map icon** opens the **keyboard shortcuts** guide; appearance and format toolbars behave as in earlier 0.2 releases. |

The same wheel also **bundles** Article / Slides views, export, and Markdown preview. Those plugins **do not register** on PyPI **0.2.x** until **0.3.0** (full tier). The **source tree already has them** — use the override below. Live PDF, Image hub, TeX compile, Voice, transfer-speed monitor, and ZIP live outside Kuusi in `~/Documents/GoogleDrive/Life_OS/academic-toolkit/`.

**Maintainers / QA (full tier locally):** in the browser console, run `localStorage.setItem('jupyterlab-kuusi:release-tier-override', 'full')` and reload JupyterLab. Remove the key or set `'core'` to return to PyPI behavior.

## Links
* Feedback: [Discourse](https://discourse.jupyter.org/t/kuusi-jupyterlab-notebook-mind-map-feedback-welcome/38802) 
* Community: [X.com @KussiMindMap](https://x.com/KussiMindMap)
* PyPI: [pypi.org/project/jupyterlab-kuusi/](https://pypi.org/project/jupyterlab-kuusi/)
* Github: [github.com/xianghancao/kuusi/](https://github.com/xianghancao/kuusi/) 
* Changelog: [Kuusi/CHANGELOG](https://github.com/xianghancao/kuusi/blob/main/CHANGELOG.md)

## Features

- **Kuusi View** — editor plus a render pane for `.ipynb` and `.md`: **Article**, **Slides**, and **Mind Map** (full tier / source)
- **Article** — reading page with Theme / Page / Header & footer / Text / Paragraph / Headings / Code / Image capsules; scroll or paged paper; export PDF and images
- **Slides** — live deck from the same source (headings or `---`); overflow paginates; same typography and Image capsules
- **Native Jupyter cells** on a pannable, zoomable mind-map canvas
- **Heading-driven tree** — `#`–`###` roots/branches, nesting to depth 20 (levels 4+ keep Body chrome via metadata), other cells attach as Body under the current frame
- **Edit & structure** — Tab/Enter insert nodes, drag-and-drop reorder; editor ↔ view position sync when both panes are open
- **Appearance** — shared Text / Paragraph / Headings / Code / Image capsules on all three views; mind map also has Theme / Line / Node / Background
- **Format toolbar** (edit mode) — headings, inline styles, lists, tables, images, links
- **Shortcuts, zoom, fullscreen** — XMind-style navigation; shortcuts from the page-header mind map icon; version and community links in **Launcher → Kuusi → Settings**
- **Language** — Kuusi chrome follows JupyterLab (`jupyterlab_kuusi` catalogs; Simplified Chinese included)

## Installation

### Requirements

| Component | Minimum |
|-----------|---------|
| **JupyterLab** | 4.x |
| **Python** | 3.9+ |

### Install with pip

```bash
pip install jupyterlab-kuusi
jupyter lab
```

Upgrade to the latest release:

```bash
pip install -U jupyterlab-kuusi
```

No Node.js is required for the PyPI install.

### LaTeX / PDF (optional, full tier from 0.3.0)

On **0.2.x PyPI**, TeX compile and Live PDF are **bundled but inactive** (see [What’s in 0.2.x](#whats-in-02x-core-tier)). From **0.3.0** onward, Kuusi can compile `.tex` files and preview PDFs with SyncTeX jumps. **`pip install jupyterlab-kuusi` never includes a TeX distribution** — install these on the machine that runs `jupyter lab`:

| Tool | Used for |
|------|----------|
| `pdflatex` | Default LaTeX → PDF compile |
| `xelatex` | Chinese / `fontspec` / `ctex` documents |
| `synctex` | PDF ↔ source line jumps |

**macOS** — [MacTeX](https://tug.org/mactex/) or `brew install --cask mactex-no-gui`

**Windows** — [MiKTeX](https://miktex.org/download) or [TeX Live](https://tug.org/texlive/)

**Linux** — e.g. `sudo apt install texlive-latex-extra texlive-xetex`

After installing TeX, restart JupyterLab. In a `.tex` editor, click **Help** in the Kuusi toolbar for platform-specific steps and PATH checks.

### Verify

```bash
jupyter labextension list | grep -i kuusi
```

You should see `jupyterlab-kuusi` enabled.

### Uninstall

```bash
pip uninstall jupyterlab-kuusi
```

### Open Kuusi

Open any `.ipynb` (try [`examples/example.ipynb`](examples/example.ipynb)) or `.md` (try [`examples/slides-deck.md`](examples/slides-deck.md)), then either:

- Click **Kuusi View** in the editor toolbar, or
- **Right-click the file → Open With** a Kuusi factory (Article, Slides, Mind Map)

The editor stays on the left. The render pane switches with **Article / Mind Map / Slides**. You can keep the classic notebook and a Kuusi view open on the same file side by side.

### Feedback

Questions, bugs, and feature ideas: [Jupyter Discourse topic](https://discourse.jupyter.org/t/kuusi-jupyterlab-notebook-mind-map-feedback-welcome/38802). Updates: [X @KussiMindMap](https://x.com/KussiMindMap). Clear reproducible bugs are also welcome on [GitHub Issues](https://github.com/xianghancao/kuusi/issues).

### Install from source (developers)

For local development or contributing, you need **Node.js ≥ 20**, **npm ≥ 10**, and **Git**. Clone the repo, activate the Python environment where JupyterLab is installed, then run:

```bash
git clone https://github.com/xianghancao/Kuusi.git
cd Kuusi
npm run jlab:install
jupyter lab
```

`npm run jlab:install` builds the extension, installs it with pip, and rebuilds JupyterLab.

This repo’s `scripts/kuusi-env.sh` pins **Anaconda** for install/dev (`KUUSI_PYTHON` / `KUUSI_JUPYTER`), so `pip list` matches the JupyterLab you start. Edit that file if your conda path changes.

Override for one command:

```bash
KUUSI_PYTHON=/path/to/python KUUSI_JUPYTER=/path/to/jupyter npm run jlab:install
```

Manual steps:

```bash
git clone https://github.com/xianghancao/Kuusi.git
cd Kuusi
npm install
npm run build:extension
pip install -e packages/jupyterlab-kuusi
jupyter lab
```

Run these from the **repository root** so the `kuusi-kernel` workspace package is available. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## Quick start

If you already installed Kuusi:

```bash
jupyter lab
```

Then open `examples/example.ipynb` or `examples/slides-deck.md` and click **Kuusi View** as described above.

## Using Kuusi

### Views (Article, Slides, Mind Map)

Full tier / source only. After **Kuusi View**, the switcher picks the render:

| View | Notebook (`.ipynb`) | Markdown (`.md`) |
|------|---------------------|------------------|
| **Article** | Cells flattened into one reading page | Markdown preview |
| **Slides** | Same source as a live deck | Split on headings or `---` |
| **Mind Map** | Heading tree on the canvas | Heading tree on the canvas |

Moving the editor caret (or the notebook’s active cell) scrolls or pages an open view. Clicking Article, changing slide, or selecting a mind-map node moves the editor to the matching place.

**Shared capsules** (Article / Slides / Mind Map): Text · Paragraph · Headings · Code · Image. Article / Slides also have Theme · Page · Header & footer. Mind Map keeps Tree · Layout · Theme · Line · Node · Background.

| Capsule | What it does |
|---------|----------------|
| **Theme** | Reading / deck presets |
| **Page** | Article: scroll vs paged paper, size, column, padding, background. Slides: ratio, split, align, padding |
| **Header & footer** | Running title / page numbers (Article paged; Slides stage chrome) |
| **Text / Paragraph / Headings / Code** | Shared typography |
| **Image** | Align (left / center / right), wrap (block, left + wrap, right + wrap), size (natural / wide / full), border (style, color, weight, corner) |

**Article paged** (Page → Layout → Paged): paper sheets with a gap. Headings stay with the next block; paragraphs avoid orphan/widow lines; long code, tables, and lists split across pages (tables repeat the header). Images and display math do not split.

**Export** (view toolbar): PDF, PNG, JPEG, WebP, Print / Vector PDF, HTML, or download the source file.

Mind Map appearance and shortcuts follow.

### Mind Map — Header (row 1)

Jupyter document toolbar: save, insert, cut/copy/paste, run, kernel, cell type, etc.

### Mind Map — Header (row 2)

| Area | Controls |
|------|----------|
| **Left** | **+**, **Mind map icon** (shortcuts), **Tree**, **Layout**, **Theme**, **Text**, **Paragraph**, **Headings**, **Code**, **Image**, **Line**, **Node**, **Background** |
| **Right** | Markdown **format** toolbar (visible in edit mode), see below |

#### Left toolbar

| Control | What it does |
|---------|----------------|
| **+** | Create a new notebook in the same folder and open it as a mind map |
| **Mind map icon** | Opens the **keyboard shortcuts** guide (navigation, formatting, notes) |
| **Tree** | Layout direction: ↓ ↑ → ← |
| **Layout** | Node spacing: Compact / Normal / Loose |
| **Theme** | Presets that stamp Line / Node / Background / Text: Notebook, Soft, Outline, Paper, Board, Black, Minimal |
| **Text** | Body-node font, size, color, tracking, leading. **Edit** / **Link** tabs keep the source-edit font (unify + match notebook) |
| **Paragraph** | Spacing, indent, alignment, and links inside a card |
| **Headings** | H1–H3 tree frames; H4–H6 titles inside a card |
| **Code / Image** | Same capsules as Article / Slides, applied inside a node |
| **Line** | Connector line style, width, color |
| **Node** | Width (equal width switch), fill, border, corner, hover glow, selection glow |
| **Background** | Canvas pattern and color (including Ink for Black theme) |

All of the above (except zoom and fullscreen) are **saved automatically** and restored on refresh.

**Version, PyPI update badge, GitHub / PyPI links, Community (Discourse + X), install command, and default file openers** — **Launcher → Kuusi → Settings** (not the mind map page header).

#### Right format toolbar (edit mode, markdown cells)

| Control | What it does |
|---------|----------------|
| **Heading** | Outline heading level H1–H6 (changes mind map structure) |
| **Aa** | Bold, italic, underline, strikethrough, inline code, highlight, block quote, code block, clear formatting |
| **List** | Bulleted, dashed, numbered, check list |
| **Table** | Grid picker to insert a Markdown table |
| **Image** | Insert image via Markdown or HTML syntax |
| **Link** | Insert link via Markdown or HTML syntax |
| **Font color** | Preset swatches, custom color, remove color |

> **Heading** changes the outline tree. **Aa** and inline styles affect cell content only, not structure.

### Canvas

| Action | Behavior |
|--------|----------|
| **Single click** | Select node (persistent highlight) |
| **Double click** | Edit cell |
| **F2** | Enter edit mode |
| **Escape** | Exit edit mode |
| **Drag handle** (left edge) | Reorder in the outline tree |
| **Wheel** | Pan |
| **Ctrl/Cmd + wheel** | Zoom |
| **Bottom-right** | Node count, **Zoom: N%** (click to open slider with 20% ticks, 20%–200%), **Fullscreen** |

### Outline rules

1. The first `#` heading in the notebook becomes a **root** node.
2. Deeper headings nest under the nearest higher-level heading.
3. Non-heading cells belong to the current heading context.
4. Content before the first `#` (or orphan `##+` without an H1 parent) is ignored in the map.
5. **Tab** inserts a child node; **Enter** inserts a sibling. New empty nodes keep the correct tree level even without a `#` heading in the source yet.

## Architecture

```
.ipynb / .md
    → Kuusi View: Article | Slides | Mind Map
    → kuusi-kernel: heading outline + dagre (mind map)
    → jupyterlab-kuusi: Article / Slides render + canvas with native cell widgets
```

No Tiptap, React Flow, or separate JSON sidecar in this line.

## Roadmap

Planned work after `0.2.6`. Source already has the View stack; PyPI still ships core until `0.3.0`.

### `0.3.0`

#### Full tier

Ship the View stack that is already in source (Article / Slides / Mind Map, export, paged Article) for all PyPI installs (today they stay off on 0.2.x — see [What’s in 0.2.x](#whats-in-02x-core-tier)). Restore the extra **Launcher → Kuusi** tiles. Live PDF / Image / TeX / Voice / channel monitor / ZIP stay outside Kuusi (`Life_OS/academic-toolkit`).

#### Collapse branches

Core mind map capability. Much of the kernel and widget plumbing already exists (`collapsedIds` in layout, edges, and navigation); the remaining work is mostly UI and polish.

- Chevron on parent nodes to fold / unfold a branch
- Keyboard shortcut (e.g. Space on a selected topic)
- Badge showing hidden child count when collapsed
- Relayout after collapse so hidden subtrees free space
- Optional: collapse all / expand all / collapse to level N

#### Style themes

Theme presets now compose Line / Node / Background / Font settings (Notebook, Soft, Outline, Paper, Board, Black, Minimal). Optional next step: preview swatches in the Theme menu.

### Later — Mind Map export extras

Article and Slides already export PDF / PNG / JPEG / WebP. Optional mind-map-only extras:

- **SVG** — structure-only export (titles + connectors from layout data)
- Viewport vs entire-map PNG for very large canvases

## Development

Requires the [installation requirements](#requirements) above. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

```bash
# Kernel unit tests + extension TypeScript build check + version sync
npm run test

# Production labextension build (requires JupyterLab)
npm run test:release-build

# JupyterLab smoke E2E (requires: npm run jlab:install + Playwright Chromium)
npm run test:e2e
```

From the repository root:

```bash
# One-shot build + install into the active Python environment
npm run jlab:install

# Watch mode (separate terminal)
npm run jlab:dev
jupyter lab
```

Build individual packages:

```bash
npm run build:kernel
npm run build:extension:lib
npm run build:extension      # dev labextension (local install)
npm run build:release        # production labextension (PyPI / release)
```

Verify the extension:

```bash
npm run jlab:verify
```

## Publishing to PyPI

Releases use [Trusted Publishing](https://docs.pypi.org/trusted-publishers/) — push a version tag and GitHub Actions uploads `jupyterlab-kuusi` to PyPI. No API token in the repo.

### One-time setup

1. On [pypi.org](https://pypi.org) → **Publishing** → add a **pending publisher** (or create it on the project after the first upload):
   - **PyPI project name:** `jupyterlab-kuusi`
   - **Owner:** `xianghancao`
   - **Repository:** `Kuusi`
   - **Workflow name:** `publish-pypi.yml`
   - **Environment name:** `pypi`
2. In GitHub → **Settings → Environments** → create environment **`pypi`** (optional: require reviewers).

### Release steps

```bash
# 1. Bump every version string to the same X.Y.Z
npm run check:versions

# 2. Update CHANGELOG.md / README version table, commit
git add -A && git commit -m "Release X.Y.Z …"

# 3. Tag and push (triggers .github/workflows/publish-pypi.yml)
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

You can also run the workflow manually via **Actions → Publish PyPI → Run workflow**.

After it succeeds:

```bash
pip install -U jupyterlab-kuusi
```

## Repository layout

```
packages/
  kuusi-kernel/         # outline tree, layout, navigation
  jupyterlab-kuusi/     # JupyterLab extension + UI
docs/
  assets/               # Versioned README screenshots (e.g. 0.2.6/)
examples/
  example.ipynb         # notebook tour (Article / Slides / Mind Map)
  slides-deck.md        # Markdown slides fixture
scripts/
CHANGELOG.md
CONTRIBUTING.md
```

## Contributing

Bug reports and feature ideas are welcome via [Issues](https://github.com/xianghancao/Kuusi/issues). **External pull requests are not accepted** before 1.0 — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

BSD-3-Clause (`jupyterlab-kuusi`, `kuusi-kernel`)
