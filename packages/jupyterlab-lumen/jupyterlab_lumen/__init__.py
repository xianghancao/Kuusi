# Copyright (c) Lumen contributors.
# Distributed under the terms of the Modified BSD License.

__all__ = ["__version__"]
__version__ = "0.1.0"

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "jupyterlab-lumen"
    }]
