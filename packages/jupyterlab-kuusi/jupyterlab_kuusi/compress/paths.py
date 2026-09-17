"""Resolve paths under the Jupyter contents manager root."""

from __future__ import annotations

import os


def normalize_relative(path: str) -> str:
    if not path or not isinstance(path, str):
        raise ValueError("Missing path")
    normalized = path.strip().strip("/")
    if not normalized:
        raise ValueError("Missing path")
    if ".." in normalized.split("/"):
        raise ValueError("Invalid path")
    return normalized


def resolve_path(contents_manager, path: str) -> tuple[str, str]:
    rel = normalize_relative(path)
    root_dir = os.path.abspath(contents_manager.root_dir)
    abs_path = os.path.abspath(os.path.join(root_dir, rel))
    if abs_path != root_dir and not abs_path.startswith(root_dir + os.sep):
        raise ValueError("Path is outside the server root")
    if not os.path.exists(abs_path):
        raise ValueError("Path not found")
    return rel, abs_path


def resolve_paths(contents_manager, paths: list[str]) -> list[tuple[str, str]]:
    if not paths:
        raise ValueError("No paths selected")
    return [resolve_path(contents_manager, p) for p in paths]


def relative_from_abs(contents_manager, abs_path: str) -> str:
    root_dir = os.path.abspath(contents_manager.root_dir)
    abs_path = os.path.abspath(abs_path)
    if abs_path != root_dir and not abs_path.startswith(root_dir + os.sep):
        raise ValueError("Path is outside the server root")
    return os.path.relpath(abs_path, root_dir).replace("\\", "/")
