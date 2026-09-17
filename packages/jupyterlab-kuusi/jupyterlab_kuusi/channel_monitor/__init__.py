"""Kuusi Channel Monitor — transfer speed and link diagnostics."""

from .legacy_server import ensure_legacy_server, main as run_standalone

__all__ = ["ensure_legacy_server", "run_standalone"]
