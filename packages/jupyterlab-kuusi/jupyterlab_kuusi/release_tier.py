"""Release tier: 0.2.x ships core (mind map + settings); 0.3+ enables full Kuusi."""

from __future__ import annotations

import os

from ._version import __version__


def _tier_from_version(version: str) -> str:
    parts = version.split(".")
    try:
        minor = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        minor = 0
    return "full" if minor >= 3 else "core"


def get_release_tier() -> str:
    override = os.environ.get("KUUSI_RELEASE_TIER", "").strip().lower()
    if override in ("core", "full"):
        return override
    return _tier_from_version(__version__)


def is_full_release() -> bool:
    return get_release_tier() == "full"
