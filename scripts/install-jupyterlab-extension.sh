#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/jupyter-tools.sh
source "$ROOT_DIR/scripts/lib/jupyter-tools.sh"

kuusi_require_commands

echo "==> Kuusi JupyterLab extension installer"
echo "    repo:   $ROOT_DIR"
echo "    python: $KUUSI_PYTHON"
echo "    jupyter: $KUUSI_JUPYTER"

cd "$ROOT_DIR"

kuusi_remove_stale_labextension_symlink "$KUUSI_PYTHON"

npm install
npm run build:extension

for pkg in jupyterlab-kuusi jupyterlab-lumen; do
  if "$KUUSI_PYTHON" -m pip show "$pkg" >/dev/null 2>&1; then
    echo "==> Uninstalling previous $pkg"
    "$KUUSI_PYTHON" -m pip uninstall -y "$pkg"
  fi
done

# Also drop a leftover labextension folder if pip did not remove it.
prefix="$("$KUUSI_PYTHON" -c 'import sys; print(sys.prefix)')"
rm -rf "$prefix/share/jupyter/labextensions/jupyterlab-lumen"

"$KUUSI_PYTHON" -m pip install -e packages/jupyterlab-kuusi
"$KUUSI_JUPYTER" lab build

echo "Done. Start JupyterLab: $KUUSI_JUPYTER lab"
echo "Open examples/example.ipynb → Open With → Kuusi Mind Map"
