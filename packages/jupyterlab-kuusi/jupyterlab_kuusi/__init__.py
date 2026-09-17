# Copyright (c) Kuusi contributors.
# Distributed under the terms of the Modified BSD License.

__all__ = ["__version__"]
__version__ = "0.2.6"


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "jupyterlab-kuusi"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "jupyterlab_kuusi.server_extension",
        "name": "jupyterlab_kuusi",
    }]
