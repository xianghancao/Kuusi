#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/jupyter-tools.sh
source "$ROOT_DIR/scripts/lib/jupyter-tools.sh"

kuusi_require_commands

if "$KUUSI_JUPYTER" labextension list 2>&1 | grep -qi 'jupyterlab-lumen'; then
  echo "WARNING: jupyterlab-lumen is still installed (old brand name)." >&2
  echo "         Run: npm run jlab:install   (uninstalls lumen and installs kuusi)" >&2
fi

"$KUUSI_JUPYTER" labextension list 2>&1 | grep -i kuusi || {
  echo "jupyterlab-kuusi not found" >&2
  exit 1
}
