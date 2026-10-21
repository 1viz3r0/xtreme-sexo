"""First Contact: a tiny, read-only HTTP CTF for first-time learners."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent

def load_config():
    data = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    flag = data.get("flag")
    if not isinstance(flag, str) or not flag.startswith("NET0ZE{") or not flag.endswith("}"):
        raise ValueError("per-run deployment config is required")
    return data

def handler():
    config = load_config()
    landing_page = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>First Contact // beginner lab</title>
  <style>
    :root { color-scheme: dark; --ink: #e7edf2; --muted: #9aa7b2; --line: #34424c; --panel: #111a20; --green: #7ee787; --gold: #f2cc60; }
    * { box-sizing: border-box; } body { margin: 0; background: #050708; color: var(--ink); font: 16px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    main { width: min(860px, calc(100% - 32px)); margin: auto; padding: 42px 0 64px; } .prompt { color: var(--green); }
    .eyebrow { color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; }
    h1 { font-size: clamp(2rem, 6vw, 3.4rem); line-height: 1.05; margin: 10px 0 14px; } h2 { color: var(--gold); font-size: 1rem; margin-top: 30px; }
    .start { border: 1px solid var(--green); background: #0d1c13; padding: 18px 20px; margin: 28px 0; } .start strong { color: var(--green); font-size: 1.1rem; }
    .path { display: grid; gap: 12px; } .step { background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; }
    .step b { color: var(--green); } a { color: var(--ink); text-decoration-color: var(--green); text-underline-offset: 3px; } code { color: var(--gold); }
    footer { color: var(--muted); border-top: 1px solid var(--line); margin-top: 30px; padding-top: 18px; font-size: .85rem; }
  </style>
</head>
<body><main>
  <div class="eyebrow"><span class="prompt">first-contact@training-range:~$</span> orientation channel</div>
  <h1>First Contact</h1>
  <p>Welcome to your first tiny web investigation. This target is intentionally simple: learn to read a clue, request the next route, and keep your notes organized.</p>
  <section class="start"><strong>START HERE</strong><br>Open <a href="/clue">/clue</a>. It is the first breadcrumb and tells you which plain-text route to inspect next.</section>
  <h2>NUMBERED CLUE PATH</h2>
  <div class="path">
    <div class="step"><b>01 //</b> Request <a href="/health">/health</a> to confirm the target is ready.</div>
    <div class="step"><b>02 //</b> Read <a href="/clue">/clue</a>. Treat the <code>next</code> field as your route, not a guess.</div>
    <div class="step"><b>03 //</b> Visit <a href="/welcome.txt">/welcome.txt</a> and identify the training value in the note.</div>
    <div class="step"><b>04 //</b> Submit your recovered value to <code>/verify?flag=...</code> when you are ready.</div>
  </div>
  <h2>ROUTE CARDS</h2>
  <div class="path">
    <div class="step"><a href="/health">/health</a> — readiness signal</div>
    <div class="step"><a href="/clue">/clue</a> — the first JSON hint</div>
    <div class="step"><a href="/welcome.txt">/welcome.txt</a> — plain-text evidence</div>
  </div>
  <footer>MODE: read-only · LEVEL: beginner · TIP: inspect response content and status codes before moving on.</footer>
</main></body></html>""".encode("utf-8")
    routes = {
        "/health": ("application/json", b'{"healthy":true,"mode":"read-only"}'),
        "/": ("text/html; charset=utf-8", landing_page),
        "/clue": ("application/json", json.dumps({"step": 1, "next": "/welcome.txt", "hint": "A plain-text welcome note contains the training value."}).encode()),
        "/welcome.txt": ("text/plain; charset=utf-8", ("Welcome to NET0ZE beginner practice.\nTraining flag: " + config["flag"] + "\n").encode()),
    }
    class Handler(BaseHTTPRequestHandler):
        server_version = "FirstContactHTTP/1.0"; sys_version = ""
        def do_GET(self):
            request = urlsplit(self.path)
            if request.path == "/verify":
                supplied = parse_qs(request.query, keep_blank_values=True).get("flag", [""])[0]
                body = json.dumps({"valid": supplied == config["flag"], "message": "accepted" if supplied == config["flag"] else "rejected"}).encode()
                kind, status = "application/json", 200
            else:
                kind, body = routes.get(request.path, ("text/plain", b"Not found\n")); status = 200 if request.path in routes else 404
            self.send_response(status); self.send_header("Content-Type", kind); self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)
        def do_POST(self): self.send_error(405, "Read-only target")
        def log_message(self, *_args): pass
    return Handler

if __name__ == "__main__":
    ThreadingHTTPServer((os.environ.get("BIND_HOST", "127.0.0.1"), int(os.environ.get("HTTP_PORT", "8000"))), handler()).serve_forever()
