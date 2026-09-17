"""Jupyter Server API for Kuusi Compress."""

from __future__ import annotations

import json
import os

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

from .paths import relative_from_abs, resolve_path, resolve_paths
from .service import (
    job_snapshot,
    plan_compress,
    plan_extract_dest,
    start_compress_thread,
    start_extract_thread,
)


class CompressJobHandler(APIHandler):
    @tornado.web.authenticated
    async def get(self) -> None:
        self.finish(json.dumps(job_snapshot()))


class CompressStartHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        body = self.get_json_body() or {}
        raw_paths = body.get("paths") or []
        if not isinstance(raw_paths, list):
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": "paths must be a list"}))
            return

        dest_dir = str(body.get("destDir") or "").strip()
        dest_name = body.get("destName")
        if dest_name is not None:
            dest_name = str(dest_name).strip()

        try:
            resolved = resolve_paths(self.contents_manager, [str(p) for p in raw_paths])
            abs_paths = [abs_path for _, abs_path in resolved]
            if dest_dir:
                _, dest_dir_abs = resolve_path(self.contents_manager, dest_dir)
            else:
                dest_dir_abs = os.path.dirname(abs_paths[0])
            dest_zip_abs = plan_compress(abs_paths, dest_dir_abs, dest_name)
            out = start_compress_thread(abs_paths, dest_zip_abs)
            if out.get("ok"):
                out["destPath"] = relative_from_abs(self.contents_manager, dest_zip_abs)
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": str(exc)}))
            return

        self.finish(json.dumps(out))


class ExtractStartHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        body = self.get_json_body() or {}
        path = str(body.get("path") or "").strip()
        dest_dir = str(body.get("destDir") or "").strip()

        try:
            _, zip_abs = resolve_path(self.contents_manager, path)
            if not zip_abs.lower().endswith(".zip"):
                raise ValueError("Path must be a .zip file")
            if not os.path.isfile(zip_abs):
                raise ValueError("Archive file not found")
            if dest_dir:
                _, dest_dir_abs = resolve_path(self.contents_manager, dest_dir)
                if not os.path.isdir(dest_dir_abs):
                    raise ValueError("Extract destination must be a folder")
            else:
                dest_dir_abs = plan_extract_dest(zip_abs)
            out = start_extract_thread(zip_abs, dest_dir_abs)
            if out.get("ok"):
                out["destPath"] = relative_from_abs(self.contents_manager, dest_dir_abs)
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": str(exc)}))
            return

        self.finish(json.dumps(out))


def setup_compress_handlers(web_app) -> None:
    host_pattern = ".*$"
    base = web_app.settings["base_url"]
    prefix = url_path_join(base, "jupyterlab-kuusi", "compress")
    web_app.add_handlers(
        host_pattern,
        [
            (url_path_join(prefix, "job"), CompressJobHandler),
            (url_path_join(prefix, "start"), CompressStartHandler),
            (url_path_join(prefix, "extract"), ExtractStartHandler),
        ],
    )
