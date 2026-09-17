#!/usr/bin/env bash
# Shared helpers for Kuusi JupyterLab install/dev scripts.

_kuusi_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$_kuusi_lib_dir/../kuusi-env.sh" ]]; then
  # shellcheck source=../kuusi-env.sh
  source "$_kuusi_lib_dir/../kuusi-env.sh"
fi

kuusi_resolve_python() {
  if [[ -n "${KUUSI_PYTHON:-}" ]]; then
    printf '%s\n' "$KUUSI_PYTHON"
    return 0
  fi

  if [[ -n "${CONDA_PYTHON:-}" ]]; then
    printf '%s\n' "$CONDA_PYTHON"
    return 0
  fi

  command -v python3 2>/dev/null || command -v python 2>/dev/null
}

kuusi_resolve_jupyter() {
  if [[ -n "${KUUSI_JUPYTER:-}" ]]; then
    printf '%s\n' "$KUUSI_JUPYTER"
    return 0
  fi

  if [[ -n "${CONDA_JUPYTER:-}" ]]; then
    printf '%s\n' "$CONDA_JUPYTER"
    return 0
  fi

  command -v jupyter 2>/dev/null
}

kuusi_require_commands() {
  KUUSI_JUPYTER="$(kuusi_resolve_jupyter)"

  # Prefer the Python that runs `jupyter` so pip list matches the Lab you start.
  if [[ -z "${KUUSI_PYTHON:-}" && -n "$KUUSI_JUPYTER" && -x "$KUUSI_JUPYTER" ]]; then
    KUUSI_PYTHON="$("$KUUSI_JUPYTER" -c 'import sys; print(sys.executable)' 2>/dev/null || true)"
  fi

  if [[ -z "${KUUSI_PYTHON:-}" ]]; then
    KUUSI_PYTHON="$(kuusi_resolve_python)"
  fi

  if [[ -z "$KUUSI_PYTHON" || ! -x "$KUUSI_PYTHON" ]]; then
    echo "ERROR: python not found. Activate your environment or set KUUSI_PYTHON." >&2
    exit 1
  fi

  if [[ -z "$KUUSI_JUPYTER" || ! -x "$KUUSI_JUPYTER" ]]; then
    echo "ERROR: jupyter not found. Install JupyterLab or set KUUSI_JUPYTER." >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm not found. Install Node.js to build the extension." >&2
    exit 1
  fi
}

kuusi_remove_stale_labextension_symlink() {
  local python="$1"
  local prefix labext_dir

  prefix="$("$python" -c 'import sys; print(sys.prefix)')"

  for labext_dir in \
    "$prefix/share/jupyter/labextensions/jupyterlab-kuusi" \
    "$prefix/share/jupyter/labextensions/jupyterlab-lumen"; do
    if [[ -L "$labext_dir" ]]; then
      echo "==> Removing stale labextension symlink: $labext_dir"
      rm -f "$labext_dir"
    fi
  done
}
