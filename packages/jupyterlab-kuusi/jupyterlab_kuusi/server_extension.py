"""Jupyter Server extension for Kuusi TeX compile."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from typing import Any, Literal

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

COMPILE_TIMEOUT_SECONDS = 120
COMPILE_PASSES = 2
LOG_TAIL_CHARS = 50_000
ALLOWED_ENGINES = frozenset({"auto", "pdflatex", "xelatex"})
EngineName = Literal["pdflatex", "xelatex"]
SYNCTEX_TIMEOUT_SECONDS = 15

_XELATEX_MARKERS = (
    "fontspec",
    "xelatex",
    "xecjk",
    "ctexart",
    "ctexbook",
    "ctexrep",
    "ctexbeamer",
    "documentclass{ctex",
    "\\usepackage{ctex",
    "\\usepackage[fontset",
)


def _load_jupyter_server_extension(serverapp) -> None:
    from .release_tier import is_full_release

    web_app = serverapp.web_app

    if not is_full_release():
        serverapp.log.info(
            "jupyterlab-kuusi: full-tier server APIs disabled (release tier: core)"
        )
        return

    setup_handlers(web_app)
    from .channel_monitor.jupyter_handlers import setup_channel_monitor_handlers

    setup_channel_monitor_handlers(web_app)
    serverapp.log.info("jupyterlab-kuusi: channel monitor API enabled")

    from .compress.handlers import setup_compress_handlers

    setup_compress_handlers(web_app)
    serverapp.log.info("jupyterlab-kuusi: compress API enabled")


def _resolve_project_path(contents_manager, path: str, suffix: str) -> tuple[str, str]:
    if not path or not isinstance(path, str):
        raise ValueError(f"Missing {suffix} path")

    normalized = path.strip("/")
    if not normalized.lower().endswith(suffix):
        raise ValueError(f"Path must be a {suffix} file")

    if ".." in normalized.split("/"):
        raise ValueError("Invalid path")

    root_dir = os.path.abspath(contents_manager.root_dir)
    abs_path = os.path.abspath(os.path.join(root_dir, normalized))

    if not abs_path.startswith(root_dir + os.sep) and abs_path != root_dir:
        raise ValueError("Path is outside the server root")

    if not os.path.isfile(abs_path):
        raise ValueError(f"{suffix} file not found")

    return normalized, abs_path


def _resolve_tex_path(contents_manager, path: str) -> tuple[str, str]:
    return _resolve_project_path(contents_manager, path, ".tex")


def _resolve_pdf_path(contents_manager, path: str) -> tuple[str, str]:
    return _resolve_project_path(contents_manager, path, ".pdf")


def _relativize_input_path(contents_manager, input_path: str) -> str | None:
    root_dir = os.path.abspath(contents_manager.root_dir)
    abs_input = os.path.abspath(input_path)

    if abs_input != root_dir and not abs_input.startswith(root_dir + os.sep):
        return None

    return os.path.relpath(abs_input, root_dir)


def _detect_engine(abs_path: str) -> EngineName:
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as handle:
            content = handle.read(12000).lower()
    except OSError:
        return "pdflatex"

    for marker in _XELATEX_MARKERS:
        if marker in content:
            return "xelatex"

    if re.search(r"\\documentclass\s*(\[[^\]]*\])?\s*\{ctex", content):
        return "xelatex"

    return "pdflatex"


def _resolve_engine(requested: str, abs_path: str) -> EngineName:
    engine = (requested or "auto").strip().lower()
    if engine not in ALLOWED_ENGINES:
        raise ValueError(f"Unsupported engine: {requested}")

    if engine == "auto":
        return _detect_engine(abs_path)

    return engine  # type: ignore[return-value]


def _compile_tex(abs_path: str, engine: EngineName) -> dict[str, Any]:
    binary = shutil.which(engine)
    if not binary:
        return {
            "ok": False,
            "exitCode": 127,
            "engine": engine,
            "log": f"{engine} was not found on the Jupyter server PATH.",
            "pdfPath": None,
            "error": f"{engine} not found",
        }

    work_dir = os.path.dirname(abs_path)
    tex_name = os.path.basename(abs_path)
    logs: list[str] = []
    exit_code = 0

    for run in range(COMPILE_PASSES):
        try:
            proc = subprocess.run(
                [binary, "-interaction=nonstopmode", "-synctex=1", tex_name],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=COMPILE_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "exitCode": 124,
                "engine": engine,
                "log": f"{engine} timed out after {COMPILE_TIMEOUT_SECONDS}s.",
                "pdfPath": None,
                "error": "compile timeout",
            }

        logs.append(f"=== {engine} pass {run + 1} ===\n{proc.stdout}\n{proc.stderr}")
        exit_code = proc.returncode
        if exit_code != 0:
            break

    log_path = abs_path[:-4] + ".log"
    combined_log = "\n".join(logs)
    if os.path.isfile(log_path):
        with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
            combined_log = handle.read()

    if len(combined_log) > LOG_TAIL_CHARS:
        combined_log = combined_log[-LOG_TAIL_CHARS:]

    pdf_abs = abs_path[:-4] + ".pdf"
    ok = exit_code == 0 and os.path.isfile(pdf_abs)

    return {
        "ok": ok,
        "exitCode": exit_code,
        "engine": engine,
        "log": combined_log,
        "pdfPath": None,
        "error": None if ok else f"{engine} failed",
    }


def _run_synctex(args: list[str]) -> tuple[bool, str]:
    binary = shutil.which("synctex")
    if not binary:
        return False, "synctex was not found on the Jupyter server PATH."

    try:
        proc = subprocess.run(
            [binary, *args],
            capture_output=True,
            text=True,
            timeout=SYNCTEX_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, "synctex timed out."

    if proc.returncode != 0:
        return False, proc.stderr.strip() or proc.stdout.strip() or "synctex failed."

    return True, proc.stdout


def _parse_synctex_blocks(output: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    current: dict[str, str] = {}

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if ":" not in line:
            continue

        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()

        if key == "Output" and current:
            blocks.append(current)
            current = {}

        current[key] = value

    if current:
        blocks.append(current)

    return blocks


def _synctex_float(block: dict[str, str], *keys: str) -> float | None:
    for key in keys:
        value = block.get(key)

        if value is None:
            continue

        try:
            return float(value)
        except ValueError:
            continue

    return None


def _pick_synctex_view_block(
    blocks: list[dict[str, str]], column: int
) -> dict[str, str]:
    if len(blocks) == 1:
        return blocks[0]

    if column <= 1:
        return blocks[0]

    def sort_key(block: dict[str, str]) -> float:
        point_x = _synctex_float(block, "x", "h")
        return point_x if point_x is not None else 0.0

    return max(blocks, key=sort_key)


def _synctex_view(tex_abs: str, pdf_abs: str, line: int, column: int) -> dict[str, Any]:
    ok, output = _run_synctex(["view", "-i", f"{line}:{column}:{tex_abs}", "-o", pdf_abs])

    if not ok:
        return {"ok": False, "error": output}

    blocks = _parse_synctex_blocks(output)

    if not blocks:
        return {"ok": False, "error": "No SyncTeX match for this line."}

    block = _pick_synctex_view_block(blocks, column)

    try:
        result: dict[str, Any] = {
            "ok": True,
            "page": int(float(block["Page"])),
            "h": float(block["h"]),
            "v": float(block["v"]),
            "width": float(block["W"]),
            "height": float(block["H"]),
        }

        point_x = _synctex_float(block, "x")
        point_y = _synctex_float(block, "y")

        if point_x is not None:
            result["x"] = point_x

        if point_y is not None:
            result["y"] = point_y

        return result
    except (KeyError, ValueError):
        return {"ok": False, "error": "Could not parse SyncTeX output."}


def _synctex_edit(pdf_abs: str, page: int, h: float, v: float) -> dict[str, Any]:
    ok, output = _run_synctex(["edit", "-o", f"{page}:{h}:{v}:{pdf_abs}"])

    if not ok:
        return {"ok": False, "error": output}

    blocks = _parse_synctex_blocks(output)

    if not blocks or "Input" not in blocks[0]:
        return {"ok": False, "error": "No SyncTeX match for this position."}

    block = blocks[0]

    try:
        line = int(float(block["Line"]))
    except (KeyError, ValueError):
        return {"ok": False, "error": "Could not parse SyncTeX output."}

    try:
        column = int(float(block.get("Column", "-1")))
    except ValueError:
        column = -1

    return {
        "ok": True,
        "input": block["Input"],
        "line": max(line, 1),
        "column": column,
    }


class SyncTexViewHandler(APIHandler):
    """Forward SyncTeX: source line -> PDF position."""

    @tornado.web.authenticated
    async def post(self) -> None:
        body = self.get_json_body() or {}
        path = body.get("path", "")
        line = body.get("line")
        column = body.get("column", 1)

        try:
            _, abs_path = _resolve_tex_path(self.contents_manager, path)
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": str(exc)}))
            return

        if not isinstance(line, int) or line < 1:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": "Missing or invalid line"}))
            return

        column_int = column if isinstance(column, int) else 1
        pdf_abs = abs_path[:-4] + ".pdf"
        synctex_abs = abs_path[:-4] + ".synctex.gz"

        if not os.path.isfile(pdf_abs) or not os.path.isfile(synctex_abs):
            self.finish(
                json.dumps(
                    {
                        "ok": False,
                        "error": "No SyncTeX data yet. Compile the document first.",
                    }
                )
            )
            return

        loop = tornado.ioloop.IOLoop.current()
        result = await loop.run_in_executor(
            None, _synctex_view, abs_path, pdf_abs, line, column_int
        )
        self.finish(json.dumps(result))


class SyncTexEditHandler(APIHandler):
    """Backward SyncTeX: PDF position -> source line."""

    @tornado.web.authenticated
    async def post(self) -> None:
        body = self.get_json_body() or {}
        path = body.get("path", "")
        page = body.get("page")
        h = body.get("h")
        v = body.get("v")

        try:
            _, pdf_abs = _resolve_pdf_path(self.contents_manager, path)
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": str(exc)}))
            return

        if (
            not isinstance(page, int)
            or page < 1
            or not isinstance(h, (int, float))
            or not isinstance(v, (int, float))
        ):
            self.set_status(400)
            self.finish(
                json.dumps({"ok": False, "error": "Missing or invalid page/h/v"})
            )
            return

        synctex_abs = pdf_abs[:-4] + ".synctex.gz"

        if not os.path.isfile(synctex_abs):
            self.finish(
                json.dumps(
                    {
                        "ok": False,
                        "error": "No SyncTeX data yet. Compile the document first.",
                    }
                )
            )
            return

        loop = tornado.ioloop.IOLoop.current()
        result = await loop.run_in_executor(
            None, _synctex_edit, pdf_abs, page, float(h), float(v)
        )

        if result.get("ok"):
            input_path = result.pop("input")
            rel = _relativize_input_path(self.contents_manager, input_path)

            if rel is None:
                result = {
                    "ok": False,
                    "error": "SyncTeX source path is outside the server root.",
                }
            else:
                result["path"] = rel

        self.finish(json.dumps(result))


class TexCompileHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        body = self.get_json_body() or {}
        path = body.get("path", "")
        requested_engine = body.get("engine", "auto")

        try:
            rel_path, abs_path = _resolve_tex_path(self.contents_manager, path)
            engine = _resolve_engine(requested_engine, abs_path)
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"ok": False, "error": str(exc), "log": str(exc)}))
            return

        loop = tornado.ioloop.IOLoop.current()
        result = await loop.run_in_executor(None, _compile_tex, abs_path, engine)

        if result.get("ok"):
            result["pdfPath"] = rel_path[:-4] + ".pdf"

        self.finish(json.dumps(result))


def setup_handlers(web_app) -> None:
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]
    compile_route = url_path_join(base_url, "jupyterlab-kuusi", "tex", "compile")
    synctex_view_route = url_path_join(
        base_url, "jupyterlab-kuusi", "tex", "synctex", "view"
    )
    synctex_edit_route = url_path_join(
        base_url, "jupyterlab-kuusi", "tex", "synctex", "edit"
    )
    web_app.add_handlers(
        host_pattern,
        [
            (compile_route, TexCompileHandler),
            (synctex_view_route, SyncTexViewHandler),
            (synctex_edit_route, SyncTexEditHandler),
        ],
    )
