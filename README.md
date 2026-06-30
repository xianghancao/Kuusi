# Lumen

Structured knowledge tree editor with instant-render rich nodes. Open mind maps in the browser or inside JupyterLab.

## Repository layout

```
packages/
  lumen-kernel/       # block tree, layout, file format, notebook adapters
  jupyterlab-lumen/   # JupyterLab extension
src/                  # standalone Vite prototype app
examples/             # sample .lumen.json files
```

## Quick start (standalone app)

```bash
npm install
npm run dev
```

## JupyterLab extension (development)

```bash
npm install
npm run build:extension
pip install -e packages/jupyterlab-lumen
jupyter lab build
jupyter lab
```

Open a `.lumen.json` or `.mindmap.json` file in JupyterLab to use the mind map editor.

## File formats

- `.lumen.json` / `.mindmap.json` — native Lumen mind map (v1.1 schema)
- `.ipynb` — notebook import/export (MVP adapter in `lumen-kernel`)

## Architecture

See [unified-kernel-architecture.md](./unified-kernel-architecture.md) for product goals and evolution roadmap.

## License

BSD-3-Clause (extension). Standalone app: ISC.
