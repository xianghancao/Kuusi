"""Jupyter Server routes for Channel Monitor (phase B)."""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

from .core import STATIC_DIR
from .http_dispatch import dispatch_get, dispatch_post
from .legacy_server import ensure_legacy_server


def _inject_page_meta(html: bytes, api_base: str, xsrf: str) -> bytes:
    text = html.decode("utf-8")
    block = (
        f'<meta name="channel-api-base" content="{api_base}">\n'
        f'  <meta name="channel-xsrf" content="{xsrf}">\n'
    )
    if 'name="channel-api-base"' in text:
        return html
    text = text.replace("<head>", "<head>\n  " + block, 1)
    return text.encode("utf-8")


class ChannelMonitorPageHandler(APIHandler):
    @tornado.web.authenticated
    async def get(self) -> None:
        ensure_legacy_server()
        api_base = url_path_join(self.base_url, "jupyterlab-kuusi", "channel-monitor")
        html = (_STATIC_DIR / "index.html").read_bytes()
        body = _inject_page_meta(html, api_base, self.xsrf_token)
        self.set_header("Content-Type", "text/html; charset=utf-8")
        self.set_header("Cache-Control", "no-store")
        self.finish(body)


class ChannelMonitorLegacyEnsureHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        ok = ensure_legacy_server()
        self.set_header("Content-Type", "application/json")
        self.finish(json.dumps({"ok": ok, "port": 8767}))


class ChannelMonitorApiHandler(APIHandler):
    @tornado.web.authenticated
    async def get(self, subpath: str) -> None:
        ensure_legacy_server()
        path = f"/api/{subpath}"
        parsed = urlparse(self.request.uri)
        query = parse_qs(parsed.query)
        response = dispatch_get(
            path,
            query,
            dict(self.request.headers),
            self.request.remote_ip or "127.0.0.1",
            local_gate=False,
            serve_index=False,
        )
        self.set_status(response.status)
        self.set_header("Content-Type", response.content_type)
        self.set_header("Cache-Control", "no-store")
        self.finish(response.body)

    @tornado.web.authenticated
    async def post(self, subpath: str) -> None:
        ensure_legacy_server()
        path = f"/api/{subpath}"
        parsed = urlparse(self.request.uri)
        query = parse_qs(parsed.query)
        body = self.request.body or b""
        response = dispatch_post(
            path,
            query,
            dict(self.request.headers),
            body,
            self.request.remote_ip or "127.0.0.1",
            local_gate=False,
        )
        self.set_status(response.status)
        self.set_header("Content-Type", response.content_type)
        self.set_header("Cache-Control", "no-store")
        self.finish(response.body)


def setup_channel_monitor_handlers(web_app) -> None:
    host_pattern = ".*$"
    base = web_app.settings["base_url"]
    root = url_path_join(base, "jupyterlab-kuusi", "channel-monitor")
    page_route = url_path_join(root, "")
    page_route_html = url_path_join(root, "index.html")
    api_route = url_path_join(root, "api", "(.*)")
    legacy_route = url_path_join(root, "legacy", "ensure")

    web_app.add_handlers(
        host_pattern,
        [
            (page_route, ChannelMonitorPageHandler),
            (page_route_html, ChannelMonitorPageHandler),
            (legacy_route, ChannelMonitorLegacyEnsureHandler),
            (api_route, ChannelMonitorApiHandler),
        ],
    )
