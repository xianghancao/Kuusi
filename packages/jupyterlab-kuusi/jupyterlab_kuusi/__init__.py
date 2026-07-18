# Copyright (c) Kuusi contributors.
# Distributed under the terms of the Modified BSD License.

__all__ = ["__version__"]
__version__ = "0.2.2"

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "jupyterlab-kuusi"
    }]
