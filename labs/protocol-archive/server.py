"""Copperline Protocol Archive: fixed HTTP/TCP surfaces for a safe Hard room."""

import base64
import json
import os
import secrets
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def load_config(root: Path):
    data = json.loads((root / "config.json").read_text(encoding="utf-8"))
    # The runtime may inject a flag into the generated config.  For a direct
    # Docker/Python run, generate an in-memory flag instead of shipping a
    # predictable answer in the room directory.
    flag = data.get("flag") or os.environ.get("NET0ZE_FLAG")
    if flag is None:
        flag = "NET0ZE{protocol-archive-" + secrets.token_hex(16) + "}"
    data["flag"] = flag
    if not isinstance(flag, str) or not flag.startswith("NET0ZE{") or not flag.endswith("}") or len(flag) > 256:
        raise ValueError("per-run deployment config is required")
    return data


def make_handler(root: Path, config=None):
    config = config or load_config(root)
    encoded = base64.b64encode(config["flag"].encode()).decode()
    routes = {
        "/health": ("application/json; charset=utf-8", b'{"healthy":true,"mode":"read-only"}'),
        "/": ("text/html; charset=utf-8", b"<!doctype html><title>Copperline Archive</title><h1>Copperline protocol archive</h1><p>Read-only index for a retired interchange.</p><a href='/catalog'>catalog</a> <a href='/robots.txt'>crawler policy</a>"),
        "/robots.txt": ("text/plain; charset=utf-8", b"User-agent: *\nDisallow: /archive/\nSitemap: /catalog\n"),
        "/catalog": ("application/json; charset=utf-8", b'{"collection":"copperline","revision":"7.3","next":"tcp/9000","hint":"The console records the archive retrieval sequence."}'),
        "/archive/index.json": ("application/json; charset=utf-8", b'{"records":["manifest.json","ledger.part"],"encoding":"base64","order":"manifest then ledger"}'),
        "/archive/manifest.json": ("application/json; charset=utf-8", b'{"record":"ledger.part","content_type":"text/plain","integrity":"copperline-signed","note":"Decode the ledger part only after the console gives its marker."}'),
        "/archive/ledger.part": ("text/plain; charset=utf-8", ("MARKER=CPL-7\nPAYLOAD=" + encoded + "\n").encode()),
    }

    class Handler(BaseHTTPRequestHandler):
        server_version = "CopperlineHTTP/7.3"; sys_version = ""

        def do_GET(self):
            request = urlsplit(self.path)
            if request.path == "/verify":
                supplied = parse_qs(request.query, keep_blank_values=True).get("flag", [""])[0]
                accepted = supplied == config["flag"]
                body = json.dumps({"valid": accepted, "message": "accepted" if accepted else "rejected"}).encode()
                content_type, status = "application/json; charset=utf-8", 200
            else:
                content_type, body = routes.get(request.path, ("text/plain; charset=utf-8", b"Not found\n"))
                status = 200 if request.path in routes else 404
            self.send_response(status); self.send_header("Content-Type", content_type); self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store"); self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'"); self.end_headers(); self.wfile.write(body)

        def do_POST(self):
            self.send_error(405, "Read-only target")

        def log_message(self, *_args):
            pass

    return Handler


TCP_RESPONSES = {
    "HELP": "Commands: HELP STATUS CATALOG TRANSCRIPT QUIT\n",
    "STATUS": "copperline-http:8000=ready; archive=read-only; sequence=required\n",
    "CATALOG": "HTTP /archive/index.json is the fixed record index.\n",
    "TRANSCRIPT": "MARKER=CPL-7; retrieve /archive/ledger.part after reading manifest.json.\n",
}


def serve_tcp(root: Path, host: str, port: int, ready: threading.Event, stop: threading.Event, config=None):
    config = config or load_config(root)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); listener.bind((host, port)); listener.listen(8); listener.settimeout(0.2); ready.set()
        while not stop.is_set():
            try: connection, _ = listener.accept()
            except socket.timeout: continue
            with connection:
                connection.settimeout(2); connection.sendall(b"COPPERLINE console/7.3\nFixed read-only protocol.\n")
                while not stop.is_set():
                    try: raw = connection.recv(256)
                    except socket.timeout: break
                    if not raw: break
                    command = raw.decode("ascii", "ignore").strip().upper()
                    if command == "QUIT": connection.sendall(b"Goodbye.\n"); break
                    connection.sendall(TCP_RESPONSES.get(command, "Unknown command. Type HELP.\n").encode())


def run():
    root = Path(__file__).resolve().parent; host = os.environ.get("BIND_HOST", "0.0.0.0")
    config = load_config(root)
    http = ThreadingHTTPServer((host, int(os.environ.get("HTTP_PORT", "8000"))), make_handler(root, config))
    stop, ready = threading.Event(), threading.Event(); tcp_port = int(os.environ.get("TCP_PORT", "9000"))
    thread = threading.Thread(target=serve_tcp, args=(root, host, tcp_port, ready, stop, config), daemon=True); thread.start(); ready.wait(2)
    try: http.serve_forever()
    finally: stop.set(); http.shutdown(); http.server_close(); thread.join(timeout=2)


if __name__ == "__main__":
    run()
