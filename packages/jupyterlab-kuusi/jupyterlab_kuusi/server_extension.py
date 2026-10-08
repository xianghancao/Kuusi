"""Jupyter Server extension entry for Kuusi.

TeX compile / SyncTeX handlers moved to Life_OS/academic-toolkit
(`server/tex_compile/`). This stub keeps the extension point registered so
existing installs do not error on load.
"""

from __future__ import annotations


def _load_jupyter_server_extension(serverapp) -> None:
    serverapp.log.info(
        "jupyterlab-kuusi: server extension loaded "
        "(TeX compile API lives in academic-toolkit)"
    )
