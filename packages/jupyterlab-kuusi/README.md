# jupyterlab-kuusi

JupyterLab extension: open `.ipynb` notebooks in the **Kuusi Mind Map** view using native Jupyter cell renderers.

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

Open a notebook → toolbar **Kuusi** button, or **Open With → Kuusi Mind Map**.

## 0.2.x scope (PyPI)

**0.2.x** releases activate **core** only: Mind Map plus **Launcher → Kuusi → Settings**. Other Kuusi features (Live PDF, TeX, Markdown preview, Image, Voice, transfer-speed monitor, ZIP compress) are included in the package but stay inactive until **0.3.0**. Details: [What’s in 0.2.x (core tier)](../../README.md#whats-in-02x-core-tier).

LaTeX/PDF (full tier from 0.3.0): install TeX on the server (`pdflatex`, `xelatex`, `synctex` on PATH). See the [repository README — LaTeX / PDF](../../README.md#latex--pdf-optional-full-tier-from-030).
