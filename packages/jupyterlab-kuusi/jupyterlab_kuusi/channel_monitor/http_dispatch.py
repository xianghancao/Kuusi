"""Shared HTTP routing for standalone (8767) and Jupyter Server handlers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import parse_qs, urlparse

from .core import (
    LANGS,
    LANG_LABELS,
    STATIC_DIR,
    allowed,
    client_allowed,
    connect_auto,
    hello,
    job_status,
    list_dir,
    mkdir_local,
    peers,
    remote_ls,
    set_lang,
    smb_tune,
    start_copy,
    stats,
    toggle,
)
from .i18n import STRINGS, lang, t


@dataclass
class HttpResponse:
    status: int
    body: bytes
    content_type: str = "application/json"

    @classmethod
    def json(cls, status: int, obj: dict) -> HttpResponse:
        return cls(status, json.dumps(obj).encode(), "application/json")

    @classmethod
    def text(cls, status: int, text: str) -> HttpResponse:
        return cls(status, text.encode(), "text/plain; charset=utf-8")

    @classmethod
    def bytes(cls, status: int, data: bytes, content_type: str) -> HttpResponse:
        return cls(status, data, content_type)


def apply_lang(
    query: Mapping[str, list[str]] | None,
    headers: Mapping[str, str] | None,
    payload: dict | None = None,
) -> None:
    chosen = ""
    if query and query.get("lang"):
        chosen = query["lang"][0]
    if not chosen and headers:
        chosen = headers.get("X-Lang") or headers.get("x-lang") or ""
    if payload and isinstance(payload, dict) and payload.get("lang"):
        chosen = str(payload.get("lang"))
    set_lang(chosen)


def check_client(client_ip: str, *, local_gate: bool) -> HttpResponse | None:
    if not local_gate:
        return None
    if client_allowed(client_ip):
        return None
    return HttpResponse.json(403, {"ok": False, "error": t("err.local_tb_only")})


def normalize_api_path(path: str) -> str:
    """Accept `/api/stats` or `/jupyterlab-kuusi/channel-monitor/api/stats`."""
    if "/api/" in path:
        path = path[path.index("/api/") :]
    if not path.startswith("/"):
        path = "/" + path
    return path


def dispatch_get(
    path: str,
    query: Mapping[str, list[str]],
    headers: Mapping[str, str],
    client_ip: str,
    *,
    local_gate: bool,
    serve_index: bool = True,
) -> HttpResponse:
    denied = check_client(client_ip, local_gate=local_gate)
    if denied:
        return denied

    apply_lang(query, headers)
    path = normalize_api_path(path)

    if serve_index and path in {"/", "/index.html"}:
        html_path = STATIC_DIR / "index.html"
        return HttpResponse.bytes(200, html_path.read_bytes(), "text/html; charset=utf-8")

    if path == "/api/i18n":
        return HttpResponse.json(
            200,
            {
                "lang": lang(),
                "langs": [{"id": k, "label": LANG_LABELS[k]} for k in LANGS],
                "strings": STRINGS,
            },
        )
    if path == "/api/hello":
        return HttpResponse.json(200, hello())
    if path == "/api/stats":
        return HttpResponse.json(200, stats())
    if path == "/api/ls":
        raw = (query.get("path") or [""])[0]
        return HttpResponse.json(200, list_dir(raw))
    if path == "/api/remote-ls":
        raw = (query.get("path") or [""])[0]
        return HttpResponse.json(200, remote_ls(raw))
    if path == "/api/blob":
        raw = (query.get("path") or [""])[0]
        p = Path(raw).expanduser()
        if not raw or not allowed(p):
            return HttpResponse.json(400, {"ok": False, "error": t("err.bad_path_short")})
        p = p.resolve()
        if not p.is_file():
            return HttpResponse.json(400, {"ok": False, "error": t("err.not_file")})
        return HttpResponse.bytes(200, p.read_bytes(), "application/octet-stream")
    if path == "/api/peers":
        return HttpResponse.json(200, peers())
    if path == "/api/transfer":
        return HttpResponse.json(200, job_status())

    return HttpResponse.text(404, "not found")


def dispatch_post(
    path: str,
    query: Mapping[str, list[str]],
    headers: Mapping[str, str],
    body: bytes,
    client_ip: str,
    *,
    local_gate: bool,
) -> HttpResponse:
    denied = check_client(client_ip, local_gate=local_gate)
    if denied:
        return denied

    apply_lang(query, headers)
    path = normalize_api_path(path)

    if path == "/api/blob":
        raw = (query.get("path") or [""])[0]
        p = Path(raw).expanduser()
        if not raw or not allowed(p):
            return HttpResponse.json(400, {"ok": False, "error": t("err.bad_path_short")})
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(body)
        return HttpResponse.json(200, {"ok": True, "path": str(p.resolve())})

    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        return HttpResponse.json(400, {"ok": False, "error": t("err.bad_json")})

    apply_lang(query, headers, payload)

    if path == "/api/mkdir":
        return HttpResponse.json(200, mkdir_local(str(payload.get("path") or "")))
    if path == "/api/toggle":
        return HttpResponse.json(
            200,
            toggle(str(payload.get("id", "")), str(payload.get("action", ""))),
        )
    if path == "/api/connect":
        return HttpResponse.json(200, connect_auto(payload))
    if path == "/api/copy":
        return HttpResponse.json(200, start_copy(payload))
    if path == "/api/smb":
        return HttpResponse.json(200, smb_tune())

    return HttpResponse.text(404, "not found")
