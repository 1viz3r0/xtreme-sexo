"""Service Signals: a bounded, read-only HTTP inventory exercise."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
ROOT = Path(__file__).resolve().parent
def load_config():
    data = json.loads((ROOT / "config.json").read_text(encoding="utf-8")); flag = data.get("flag")
    if not isinstance(flag, str) or not flag.startswith("NET0ZE{") or not flag.endswith("}"): raise ValueError("per-run deployment config is required")
    return data
def handler():
    config = load_config()
    landing_page = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service Signals // inventory lab</title>
  <style>
    :root { color-scheme: dark; --ink: #e7edf2; --muted: #9aa7b2; --line: #34424c; --panel: #111a20; --green: #7ee787; --gold: #f2cc60; }
    * { box-sizing: border-box; } body { margin: 0; background: #050708; color: var(--ink); font: 16px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    main { width: min(900px, calc(100% - 32px)); margin: auto; padding: 42px 0 64px; } .prompt { color: var(--green); }
    .eyebrow { color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; } h1 { font-size: clamp(2rem, 6vw, 3.4rem); line-height: 1.05; margin: 10px 0 14px; }
    h2 { color: var(--gold); font-size: 1rem; margin-top: 30px; } .start { border: 1px solid var(--green); background: #0d1c13; padding: 18px 20px; margin: 28px 0; } .start strong { color: var(--green); font-size: 1.1rem; }
    .path, .routes { display: grid; gap: 12px; } .card { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; } .card b { color: var(--green); }
    a { color: var(--ink); text-decoration-color: var(--green); text-underline-offset: 3px; } code { color: var(--gold); } footer { color: var(--muted); border-top: 1px solid var(--line); margin-top: 30px; padding-top: 18px; font-size: .85rem; }
  </style>
</head>
<body><main>
  <div class="eyebrow"><span class="prompt">signal-check@inventory-range:~$</span> service enumeration</div>
  <h1>Service Signals</h1>
  <p>Practice turning small status responses into a useful inventory. Every step is read-only, and each route tells you where to look next.</p>
  <section class="start"><strong>START HERE</strong><br>Open <a href="/status">/status</a>, record the <code>next</code> route, and follow the chain without skipping evidence.</section>
  <h2>NUMBERED CLUE PATH</h2>
  <div class="path">
    <div class="card"><b>01 //</b> Check <a href="/health">/health</a> so you know the service is responding.</div>
    <div class="card"><b>02 //</b> Read <a href="/status">/status</a> and note the next API route.</div>
    <div class="card"><b>03 //</b> Inspect <a href="/api/inventory">/api/inventory</a>; turn its two service entries into your mini inventory.</div>
    <div class="card"><b>04 //</b> Follow the inventory's <code>next</code> value to <a href="/maintenance.txt">/maintenance.txt</a>, then verify the value you find.</div>
  </div>
  <h2>ROUTE CARDS</h2>
  <div class="routes">
    <div class="card"><a href="/health">/health</a> — readiness signal</div>
    <div class="card"><a href="/status">/status</a> — service clue</div>
    <div class="card"><a href="/api/inventory">/api/inventory</a> — two-entry inventory</div>
    <div class="card"><a href="/maintenance.txt">/maintenance.txt</a> — final note</div>
  </div>
  <footer>MODE: read-only · LEVEL: beginner · TIP: write down service, protocol, and port separately.</footer>
</main></body></html>""".encode("utf-8")
    routes = {"/health": ("application/json", b'{"healthy":true,"mode":"read-only"}'), "/": ("text/html", landing_page), "/status": ("application/json", b'{"service":"signal-check","state":"nominal","next":"/api/inventory"}'), "/api/inventory": ("application/json", json.dumps({"services":[{"name":"web","protocol":"http","port":8000},{"name":"training-check","protocol":"http","port":8080}], "next":"/maintenance.txt"}).encode()), "/maintenance.txt": ("text/plain", ("Maintenance note\nowner=training\nvalidation=" + config["flag"] + "\n").encode())}
    class Handler(BaseHTTPRequestHandler):
        server_version = "ServiceSignalsHTTP/1.0"; sys_version = ""
        def do_GET(self):
            request = urlsplit(self.path)
            if request.path == "/api/inventory":
                body = routes[request.path][1]
                kind, status = routes[request.path][0], 200
            elif request.path == "/verify":
                supplied = parse_qs(request.query, keep_blank_values=True).get("flag", [""])[0]; body = json.dumps({"valid": supplied == config["flag"], "message": "accepted" if supplied == config["flag"] else "rejected"}).encode(); kind, status = "application/json", 200
            else:
                kind, body = routes.get(request.path, ("text/plain", b"Not found\n")); status = 200 if request.path in routes else 404
            self.send_response(status); self.send_header("Content-Type", kind); self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)
        def do_POST(self): self.send_error(405, "Read-only target")
        def log_message(self, *_args): pass
    return Handler
if __name__ == "__main__": ThreadingHTTPServer((os.environ.get("BIND_HOST", "127.0.0.1"), int(os.environ.get("HTTP_PORT", "8000"))), handler()).serve_forever()
