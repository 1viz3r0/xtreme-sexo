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
    page_files = {
        "/": "index.html",
        "/dashboard": "dashboard.html",
        "/shipments/lookup": "shipments.html",
        "/operations/status": "operations.html",
        "/help": "help.html",
        "/changes": "changes.html",
    }
    # The native bundle intentionally carries only the fixed server and landing
    # page. Keep deterministic route copies here as a fallback; Docker also
    # ships the richer files in pages/ for direct target builds.
    embedded_pages = {
        "/dashboard": "<p class='eyebrow'>ROOM 01 / OBSERVATION</p><h1>Shift dashboard</h1><p class='lead'>A quiet handoff board can still reveal how a dispatch system is assembled.</p><div class='grid'><section class='card'><span class='label'>HANDOFFS</span><strong>129</strong><p>scheduled shipments</p></section><section class='card'><span class='label'>WATCH LIST</span><strong class='amber'>07</strong><p>awaiting operator review</p></section><section class='card'><span class='label'>RELEASE</span><strong>4.2</strong><p>current console build</p></section></div><section class='panel'><span class='label'>OPERATOR NOTE</span><p>Support moved deployment exports after the last release. Older artifacts should be removed before a public cutover.</p></section>",
        "/shipments/lookup": "<p class='eyebrow'>ROOM 01 / MANIFEST</p><h1>Shipment lookup</h1><p class='lead'>Read-only references used by the receiving desk.</p><section class='panel'><table><tr><th>Reference</th><th>Berth</th><th>State</th></tr><tr><td>HL-4821</td><td>North 03</td><td class='ok'>In transit</td></tr><tr><td>HL-4837</td><td>Quay 07</td><td class='amber'>Review</td></tr><tr><td>HL-4850</td><td>East 02</td><td class='ok'>Received</td></tr></table></section><p class='hint'>The lookup surface is read-only. Use release and crawler metadata to continue the investigation.</p>",
        "/operations/status": "<p class='eyebrow'>ROOM 01 / OPERATIONS</p><h1>Operations status</h1><p class='lead'>Service notes from the local freight coordination desk.</p><div class='grid'><section class='card'><span class='label'>QUAY CONTROL</span><strong class='ok'>NOMINAL</strong><p>handoff queue responding</p></section><section class='card'><span class='label'>CARRIER EXCHANGE</span><strong class='ok'>NOMINAL</strong><p>last sync within window</p></section><section class='card'><span class='label'>COLD-CHAIN</span><strong class='amber'>WATCH</strong><p>operator confirmation needed</p></section></div><section class='panel'><span class='label'>SHIFT MESSAGE</span><p>Do not attach deployment artifacts to external support tickets. The current release notes describe the migration.</p></section>",
        "/help": "<p class='eyebrow'>ROOM 01 / SUPPORT</p><h1>Help center</h1><p class='lead'>Short procedures for a dispatcher working a normal shift.</p><div class='grid'><section class='card'><span class='label'>MISSING MANIFEST</span><p>Record its reference, berth, and last known handoff before escalating.</p></section><section class='card'><span class='label'>RELEASE ISSUE</span><p>Check the current change notes and deployment record before opening a ticket.</p></section></div><section class='panel'><span class='label'>SECURITY CONTACT</span><p>This console is read-only. Report exposed operational artifacts through the published security contact.</p></section>",
        "/changes": "<p class='eyebrow'>ROOM 01 / RELEASES</p><h1>Change notes</h1><p class='lead'>Release history for the dispatch console.</p><section class='panel'><h2>4.2 / Current</h2><p>Updated berth labels and moved support deployment exports during release.</p><h2>4.1</h2><p>Added the operations status board and dispatcher help center.</p><h2>4.0</h2><p>Rebuilt the local handoff console for the new carrier exchange.</p></section><p class='hint'>The release metadata names the deployment export used by support.</p>",
    }
    routes = {}
    for path, filename in page_files.items():
        page_path = (root / filename) if path == "/" else root / "pages" / filename
        if page_path.is_file():
            routes[path] = ("text/html; charset=utf-8", page_path.read_bytes())
    for path, body in embedded_pages.items():
        if path not in routes:
            shell = """<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>NET0ZE Labs | Harborline Dispatch</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1117;color:#d7e0e5;font:15px ui-monospace,SFMono-Regular,Menlo,monospace}header,main,footer{max-width:1120px;margin:auto}header{padding:28px 28px 20px;border-bottom:1px solid #263541}header small{display:block;color:#8ed0d0;font-size:11px;letter-spacing:.16em;margin-bottom:12px}header strong{color:#f0b35a;letter-spacing:.08em}nav{display:flex;flex-wrap:wrap;gap:18px;margin-top:22px}nav a{color:#91c8d2;text-decoration:none}nav a:hover{color:#f0b35a}main{padding:54px 28px;min-height:620px;background:#101820}.eyebrow,.label{color:#7f9aa5;font-size:11px;letter-spacing:.14em}.eyebrow{color:#f0b35a}h1{font:700 clamp(36px,6vw,72px) Georgia,serif;letter-spacing:-.04em;margin:12px 0 18px;color:#f3f5f5}.lead{max-width:650px;color:#aab9c1;font:20px/1.55 Georgia,serif}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:30px 0}.card,.panel{border:1px solid #2b3d48;background:#121e27;padding:22px}.card strong{display:block;margin-top:18px;font:700 34px Georgia,serif;color:#f3f5f5}.card p,.panel p{color:#9eafb7;line-height:1.6}.ok{color:#80c7a5!important}.amber{color:#f0b35a!important}.hint{border-left:3px solid #f0b35a;padding:12px 16px;color:#aab9c1;max-width:680px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #293944}th{color:#7f9aa5;font-size:11px;letter-spacing:.1em}footer{padding:20px 28px;color:#71848d;font-size:11px;border-top:1px solid #263541}</style></head><body><header><small>NET0ZE LABS / WEB EXPOSURE</small><strong>HARBORLINE / DISPATCH</strong><nav><a href='/'>Console</a><a href='/dashboard'>Dashboard</a><a href='/shipments/lookup'>Shipment lookup</a><a href='/operations/status'>Operations</a><a href='/help'>Help center</a><a href='/changes'>Change notes</a></nav></header><main>{body}</main><footer>NET0ZE Labs · BUILD 4.2 · READ-ONLY SURFACE</footer></body></html>"""
            routes[path] = ("text/html; charset=utf-8", shell.replace("{body}", body).encode())
    routes.update({
        "/health": ("application/json", b'{"healthy":true}'),
        "/api/room": ("application/json", json.dumps({"id": "harborline-dispatch", "name": "Harborline Dispatch", "mode": "read-only", "difficulty": "beginner", "objective": "Trace public deployment clues to the exposed support export.", "flag_disclosed": False}).encode("utf-8")),
        "/api/challenge": ("application/json", json.dumps({"id": "web-exposure-chain", "version": "1", "stages": [
            {"id": "surface", "title": "Map the public surface", "requires": ["home", "dashboard", "shipment lookup"]},
            {"id": "metadata", "title": "Read deployment metadata", "requires": ["robots.txt", "site-map.txt", "api/releases"]},
            {"id": "artifact", "title": "Recover the support artifact", "requires": ["support export directory", "JSON backup or ZIP export"]},
            {"id": "submit", "title": "Submit the recovered value", "requires": ["server-validated flag"]},
        ], "hints": ["Start with response headers and links.", "Follow references named by the application itself.", "Inspect downloaded artifacts locally."], "answer_included": False}).encode("utf-8")),
        "/robots.txt": ("text/plain; charset=utf-8", b"User-agent: *\nDisallow: /support/exports/\nDisallow: /api/\nSitemap: /site-map.txt\n"),
        "/site-map.txt": ("text/plain; charset=utf-8", b"/\n/dashboard\n/shipments/lookup\n/operations/status\n/help\n/changes\n"),
        "/site.webmanifest": ("application/manifest+json", b'{"name":"Harborline Dispatch","short_name":"Harborline","start_url":"/dashboard","display":"standalone","theme_color":"#123047"}'),
        "/security.txt": ("text/plain; charset=utf-8", b"Contact: mailto:security@harborline.invalid\nPolicy: /help\n"),
        "/api/releases": ("application/json", b'{"application":"Harborline Dispatch","version":"4.2","release_notes":"/changes","deployment_export":"harborline-4.2.zip","config_backup":"deployment-config.json.bak","export_directory":"/support/exports/"}'),
        "/support/exports/": ("text/html; charset=utf-8", b'<html><head><title>Support exports</title></head><body><h1>Support exports</h1><a href="harborline-4.2.zip">harborline-4.2.zip</a><br><a href="deployment-config.json.bak">deployment-config.json.bak</a></body></html>'),
        "/support/exports/deployment-config.json.bak": ("application/json", json.dumps(config, indent=2).encode("utf-8")),
        "/support/exports/harborline-4.2.zip": ("application/zip", archive.getvalue()),
    })

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
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.send_error(405, "Read-only deployment")

        def log_message(self, *args):
            pass  # Request inputs and recovered flags never enter runtime logs.

    return Handler


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), make_handler(Path(__file__).resolve().parent)).serve_forever()
