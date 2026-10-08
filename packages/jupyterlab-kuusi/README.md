# jupyterlab-kuusi

JupyterLab extension: **Kuusi View** for `.ipynb` and `.md` — **Article**, **Slides**, and **Mind Map**. The mind map uses native Jupyter cell renderers.

See the [repository README](../../README.md) for full installation, requirements, and usage.

## Install

```bash
pip install jupyterlab-kuusi
jupyter lab
```

Upgrade:

```bash
pip install -U jupyterlab-kuusi
```

For local development from a clone of this monorepo:

```bash
npm run jlab:install
jupyter lab
```

Open a notebook or Markdown file → toolbar **Kuusi View**, then switch **Article / Mind Map / Slides**. Or **Open With** a specific Kuusi factory.

Kuusi chrome follows the JupyterLab language. Simplified Chinese ships as domain `jupyterlab_kuusi` (`jupyterlab_kuusi/locale/zh_CN/`).

## 0.2.x scope (PyPI)

**0.2.x** PyPI activates **core** only: Mind Map plus **Launcher → Kuusi → Settings**. Article, Slides, and export ship in the package but stay inactive on PyPI until **0.3.0**. This source tree already has those views — enable them locally with the full-tier override. Live PDF / Image / TeX / Voice / transfer-speed / ZIP live in `Life_OS/academic-toolkit/` (detached). Details: [What’s in 0.2.x (core tier)](../../README.md#whats-in-02x-core-tier).

LaTeX/PDF (full tier from 0.3.0): install TeX on the server (`pdflatex`, `xelatex`, `synctex` on PATH). See the [repository README — LaTeX / PDF](../../README.md#latex--pdf-optional-full-tier-from-030).
