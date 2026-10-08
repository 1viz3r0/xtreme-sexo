"""Original read-only HTTP target. The exposed backup is the actual challenge.

No command execution, proxying, authentication, file selection, or write routes.
Container deployment binds inside its private network; NET0ZE forwards only
the host's ephemeral loopback port. Standalone tests bind loopback explicitly.
"""
import io
import json
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def make_handler(root):
    config = json.loads((root / "config.json").read_text(encoding="utf-8"))
    if not isinstance(config.get("flag"), str) or not config["flag"].startswith("NET0ZE{"):
        raise ValueError("per-run deployment config is required")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as backup:
        backup.writestr("deployment/config.json", json.dumps(config, indent=2))
        backup.writestr("README.txt", "Harborline support deployment export. Remove public backups before release.\n")
    routes = {
        "/": ("text/html; charset=utf-8", (root / "index.html").read_bytes()),
        "/health": ("application/json", b'{"healthy":true}'),
        "/robots.txt": ("text/plain; charset=utf-8", b"User-agent: *\nDisallow: /support/exports/\n"),
        "/api/releases": ("application/json", b'{"application":"Harborline Dispatch","version":"4.2","deployment_export":"harborline-4.2.zip","config_backup":"deployment-config.json.bak","export_directory":"/support/exports/"}'),
        "/support/exports/": ("text/html; charset=utf-8", b'<html><head><title>Support exports</title></head><body><h1>Support exports</h1><a href="harborline-4.2.zip">harborline-4.2.zip</a><br><a href="deployment-config.json.bak">deployment-config.json.bak</a></body></html>'),
        "/support/exports/deployment-config.json.bak": ("application/json", json.dumps(config, indent=2).encode("utf-8")),
        "/support/exports/harborline-4.2.zip": ("application/zip", archive.getvalue()),
    }

    class Handler(BaseHTTPRequestHandler):
        server_version = "HarborlineHTTP/4.2"
        sys_version = ""

        def setup(self):
            super().setup()
            self.connection.settimeout(2)

        def do_GET(self):
            path = urlsplit(self.path).path
            content_type, body = routes.get(path, ("text/plain; charset=utf-8", b"Not found\n"))
            self.send_response(200 if path in routes else 404)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.send_error(405, "Read-only deployment")

        def log_message(self, *args):
            pass  # Request inputs and recovered flags never enter runtime logs.

    return Handler


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), make_handler(Path(__file__).resolve().parent)).serve_forever()
