"""Signal Kiosk: a bounded, read-only HTTP/TCP discovery target."""

import json
import os
import secrets
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def load_config(root: Path, flag: str | None = None):
    data = json.loads((root / "config.json").read_text(encoding="utf-8"))
    configured_flag = flag if flag is not None else data.get("flag")
    if configured_flag in (None, "NET0ZE{replace-per-run}"):
        configured_flag = f"NET0ZE{{header-trail-{secrets.token_hex(12)}}}"
    if (not isinstance(configured_flag, str) or not configured_flag.startswith("NET0ZE{")
            or not configured_flag.endswith("}") or len(configured_flag) > 256):
        raise ValueError("per-run flag is invalid")
    data["flag"] = configured_flag
    return data


def make_handler(root: Path, config=None):
    config = config or load_config(root)
    landing_page = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signal Kiosk // beginner trail</title>
  <style>
    :root { color-scheme: dark; --ink: #e6edf3; --muted: #9aa7b2; --line: #31404b; --panel: #101820; --accent: #7ee787; --amber: #f2cc60; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #050708; color: var(--ink); font: 16px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 64px; }
    .prompt { color: var(--accent); } .eyebrow { color: var(--muted); letter-spacing: .12em; text-transform: uppercase; font-size: .78rem; }
    h1 { margin: 8px 0 14px; font-size: clamp(1.8rem, 5vw, 3.1rem); line-height: 1.1; } h2 { font-size: 1rem; color: var(--amber); }
    p { max-width: 72ch; } .start { border: 1px solid var(--accent); background: #0c1b12; padding: 18px 20px; margin: 28px 0; }
    .start strong { color: var(--accent); font-size: 1.1rem; } .path, .routes { display: grid; gap: 12px; margin: 12px 0 28px; }
    .card { border: 1px solid var(--line); background: var(--panel); padding: 14px 16px; } .card b { color: var(--accent); }
    a { color: var(--ink); text-decoration-color: var(--accent); text-underline-offset: 3px; } code { color: var(--amber); }
    footer { color: var(--muted); border-top: 1px solid var(--line); padding-top: 18px; font-size: .85rem; }
  </style>
</head>
<body><main>
  <div class="eyebrow"><span class="prompt">signal-kiosk@north-terminal:~$</span> beginner investigation</div>
  <h1>Signal Kiosk</h1>
  <p>A small read-only target for practicing the habit that matters most in a CTF: follow the evidence, one clue at a time.</p>
  <section class="start"><strong>START HERE</strong><br>Read the route clues below. You can use a browser, <code>curl</code>, or any HTTP client. Nothing needs to be changed on the target.</section>
  <h2>NUMBERED CLUE PATH</h2>
  <div class="path">
    <div class="card"><b>01 //</b> Check <a href="/status">/status</a> to identify the service and its console.</div>
    <div class="card"><b>02 //</b> Read <a href="/robots.txt">/robots.txt</a>; crawler rules can reveal an overlooked route.</div>
    <div class="card"><b>03 //</b> Follow the bulletin trail: <a href="/bulletin/release.json">release.json</a>, then <a href="/bulletin/check.json">check.json</a>.</div>
    <div class="card"><b>04 //</b> The TCP console on port 9000 gives the same breadcrumb in a different protocol.</div>
  </div>
  <h2>ROUTE CARDS</h2>
  <div class="routes">
    <div class="card"><a href="/health">/health</a> — service heartbeat</div>
    <div class="card"><a href="/status">/status</a> — public status clue</div>
    <div class="card"><a href="/robots.txt">/robots.txt</a> — crawler policy</div>
  </div>
  <footer>MODE: read-only · SCOPE: one bounded target · TIP: save each clue before moving to the next.</footer>
</main></body></html>""".encode("utf-8")
    routes = {
        "/health": ("application/json; charset=utf-8", b'{"healthy":true,"mode":"read-only"}'),
        "/": ("text/html; charset=utf-8", landing_page),
        "/status": ("application/json; charset=utf-8", b'{"service":"signal-kiosk","state":"nominal","console":"tcp/9000","mode":"read-only"}'),
        "/robots.txt": ("text/plain; charset=utf-8", b"User-agent: *\nDisallow: /bulletin/\n"),
        "/bulletin/release.json": ("application/json; charset=utf-8", json.dumps({"release": "2.7.1", "operator": "north-terminal", "notice": "The console can identify the signed bulletin."}).encode()),
        "/bulletin/check.json": ("application/json; charset=utf-8", json.dumps({"channel": "training", "integrity": "verified", "flag": config["flag"]}).encode()),
    }

    class Handler(BaseHTTPRequestHandler):
        server_version = "SignalKioskHTTP/2.7"
        sys_version = ""

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
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.send_error(405, "Read-only target")

        def log_message(self, *_args):
            pass

    return Handler


TCP_RESPONSES = {
    "HELP": "Commands: HELP INFO BULLETIN QUIT\n",
    "INFO": "Signal Kiosk console; the release bulletin is on signal-http.\n",
    "BULLETIN": "Fetch /bulletin/release.json, then inspect /bulletin/check.json.\n",
}


def serve_tcp(root: Path, host: str, port: int, ready: threading.Event, stop: threading.Event, config=None):
    config = config or load_config(root)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((host, port))
        listener.listen(8)
        listener.settimeout(0.2)
        ready.set()
        while not stop.is_set():
            try:
                connection, _ = listener.accept()
            except socket.timeout:
                continue
            with connection:
                connection.settimeout(2)
                connection.sendall(b"SIGNAL-KIOSK console/2.7\nType HELP for fixed read-only commands.\n")
                while not stop.is_set():
                    try:
                        raw = connection.recv(256)
                    except socket.timeout:
                        break
                    if not raw:
                        break
                    command = raw.decode("ascii", "ignore").strip().upper()
                    if command == "QUIT":
                        connection.sendall(b"Goodbye.\n")
                        break
                    connection.sendall(TCP_RESPONSES.get(command, "Unknown command. Type HELP.\n").encode())


def run():
    root = Path(__file__).resolve().parent
    # Direct execution stays loopback-only; the container image overrides this
    # for the owning runner's private container network.
    host = os.environ.get("BIND_HOST", "127.0.0.1")
    config = load_config(root)
    http = ThreadingHTTPServer((host, int(os.environ.get("HTTP_PORT", "8000"))), make_handler(root, config))
    stop, ready = threading.Event(), threading.Event()
    tcp_port = int(os.environ.get("TCP_PORT", "9000"))
    thread = threading.Thread(target=serve_tcp, args=(root, host, tcp_port, ready, stop, config), daemon=True)
    thread.start()
    ready.wait(2)
    try:
        http.serve_forever()
    finally:
        stop.set(); http.shutdown(); http.server_close(); thread.join(timeout=2)


if __name__ == "__main__":
    run()
