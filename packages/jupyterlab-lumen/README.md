# jupyterlab-lumen

JupyterLab extension for opening Lumen mind map files (`.lumen.json`, `.mindmap.json`) and experimenting with notebook-to-mind-map conversion.

## What works in this scaffold

- Open `.lumen.json` / `.mindmap.json` as a native JupyterLab document
- Edit nodes in a React Flow mind map canvas
- Auto-save changes back to the file model
- Shared `lumen-kernel` package for file format, layout, markdown parsing, and notebook adapters

## Monorepo layout

```
packages/
  lumen-kernel/       # block tree, layout, file I/O, ipynb adapter
  jupyterlab-lumen/   # JupyterLab frontend + Python packaging
```

The standalone Vite app at the repository root remains available for rapid UI experiments.

## Development install

Prerequisites:

- Node.js 18+
- Python 3.9+
- JupyterLab 4.x

From the repository root:

```bash
npm install
npm run build:kernel
npm run build:extension
pip install -e packages/jupyterlab-lumen
jupyter lab build
jupyter lab
```

Or use the helper scripts from the repository root:

```bash
npm run jlab:install
jupyter lab
```

## Try it

1. Launch JupyterLab.
2. Create or open a `.lumen.json` file.
3. Double-click it to open the Lumen mind map editor.

## Next steps

- Wire `notebookToMindMapSheet()` into a real `.ipynb` import command
- Add markdown/document projection view inside JupyterLab
- Share more UI code between the standalone app and the extension
