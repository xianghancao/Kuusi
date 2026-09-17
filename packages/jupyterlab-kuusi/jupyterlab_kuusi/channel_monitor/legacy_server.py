"""Standalone Channel Monitor on port 8767 (phase A / peer HTTP)."""

from __future__ import annotations

import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .http_dispatch import dispatch_get, dispatch_post

LEGACY_PORT = 8767
_server: ThreadingHTTPServer | None = None
_server_lock = threading.Lock()


class _LegacyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _emit(self, response) -> None:
        self.send_response(response.status)
        self.send_header("Content-Type", response.content_type)
        self.send_header("Content-Length", str(len(response.body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response.body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        response = dispatch_get(
            parsed.path,
            parse_qs(parsed.query),
            dict(self.headers),
            self.client_address[0],
            local_gate=True,
            serve_index=True,
        )
        self._emit(response)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        n = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(n) if n else b""
        response = dispatch_post(
            parsed.path,
            parse_qs(parsed.query),
            dict(self.headers),
            body,
            self.client_address[0],
            local_gate=True,
        )
        self._emit(response)


def _port_listening(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def ensure_legacy_server() -> bool:
    """Start 8767 in a daemon thread if nothing is listening yet."""
    global _server
    with _server_lock:
        if _port_listening(LEGACY_PORT):
            return True
        if _server is not None:
            return True
        httpd = ThreadingHTTPServer(("0.0.0.0", LEGACY_PORT), _LegacyHandler)
        _server = httpd
        thread = threading.Thread(
            target=httpd.serve_forever,
            daemon=True,
            name="kuusi-channel-8767",
        )
        thread.start()
        return True


def main() -> None:
    global _server
    url = f"http://127.0.0.1:{LEGACY_PORT}/"
    if _port_listening(LEGACY_PORT):
        print(f"Already listening on {url}")
        try:
            webbrowser.open(url)
        except OSError:
            pass
        return

    httpd = ThreadingHTTPServer(("0.0.0.0", LEGACY_PORT), _LegacyHandler)
    _server = httpd
    print(f"{url}  (Ctrl-C)")
    try:
        webbrowser.open(url)
    except OSError:
        pass
    httpd.serve_forever()


if __name__ == "__main__":
    main()
